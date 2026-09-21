import { applyEdits, buildDoc, nfc, resolveAll } from "../anchor";
import { mask, PiiBlockedError, type MaskResult } from "../pii";
import { mapRange, unmask } from "../pii/unmask";
import { buildPrompt } from "../prompt/build";
import { PartialCorrectionParser } from "../providers/partial";
import type { CorrectionProvider, ProviderUsage } from "../providers/types";
import { CorrectionOutput, CorrectionOutputStrict, LlmEdit, type Level, type LlmRewrite, type Suggestion, type Category } from "../schema/correction";
import { toOutputJsonSchema } from "../schema/json-schema";
import type { ErrorCode, SseEvent, Usage } from "../schema/events";
import type { SituationProfile } from "../schema/profile";
import type { DictionaryEntry, StyleRule } from "../schema/rules";
import type { PiiKind } from "../pii/types";

export interface CorrectPipelineInput {
  runId: string;
  text: string;
  level: Level;
  profile: SituationProfile;
  rules: ReadonlyArray<StyleRule>;
  rulesVersionId: string | null;
  dictionary: ReadonlyArray<DictionaryEntry>;
  mutedCategories: ReadonlyArray<Category>;
  provider: CorrectionProvider;
  piiBlock: ReadonlyArray<PiiKind>;
  signal?: AbortSignal;
  now?: () => number;
}

export interface CorrectPipelineResult {
  textNfc: string;
  masked: MaskResult;
  edits: Suggestion[];
  rewrites: (LlmRewrite & { index: number })[];
  dropped: { id: string; reason: string }[];
  correctedText: string | null;
  readerView: string | null;
  usage: Usage | null;
  promptVersion: string;
  error: { code: ErrorCode; message: string } | null;
}

const OUTPUT_SCHEMA = toOutputJsonSchema(CorrectionOutput);

/**
 * 교정 파이프라인. SSE 이벤트를 yield하고, 마지막에 `return`으로 저장용 결과를 넘긴다.
 * 오프셋: 앵커 해소는 마스킹된 텍스트에서 하고, 이벤트로 나갈 때 원문 오프셋으로 되돌린다.
 */
export async function* runCorrection(input: CorrectPipelineInput): AsyncGenerator<SseEvent, CorrectPipelineResult> {
  const now = input.now ?? (() => Date.now());
  const t0 = now();
  const textNfc = nfc(input.text);

  // 1. 마스킹 (요청 거부 정책 포함)
  let masked: MaskResult;
  try {
    masked = mask(textNfc, {
      dictionary: input.dictionary.filter((d) => d.mask).map((d) => ({ term: d.term })),
      block: [...input.piiBlock],
      style: "natural",
    });
  } catch (e) {
    if (e instanceof PiiBlockedError) {
      const err = { code: "pii_blocked" as const, message: `차단 대상 정보 감지: ${e.kinds.join(", ")}` };
      yield { event: "error", data: err };
      return emptyResult(textNfc, null, input, err);
    }
    throw e;
  }

  // 2. 문장 분할 + 프롬프트
  const doc = buildDoc(masked.masked);
  const omitCorrectedText = input.provider.id === "local";
  const maxRewrites = input.level !== "L3" ? 0 : input.provider.id === "local" ? 1 : 3;
  const prompt = buildPrompt({
    profile: input.profile, rules: input.rules, rulesVersionId: input.rulesVersionId,
    dictionary: input.dictionary, mutedCategories: input.mutedCategories, level: input.level,
    draft: masked.masked, sentenceCount: doc.sentences.length, omitCorrectedText, maxRewrites,
  });

  yield {
    event: "meta",
    data: {
      runId: input.runId, provider: input.provider.id, model: input.provider.model, profileVersionId: input.rulesVersionId,
      maskedSpans: masked.spans.map((s) => {
        const r = mapRange(s.start, s.end, masked);
        return { start: r.start, end: r.end, kind: s.kind };
      }),
    },
  };

  // 3. provider 스트림 → 부분 파싱 → 앵커 해소(즉시) → edit 이벤트
  let parser = new PartialCorrectionParser();
  const emitted: Suggestion[] = [];
  const dropped: { id: string; reason: string }[] = [];
  const rewrites: (LlmRewrite & { index: number })[] = [];
  let ttfbMs: number | null = null;
  let finalRaw: string | null = null;
  let providerUsage: ProviderUsage | null = null;
  let error: CorrectPipelineResult["error"] = null;

  const toOriginalOffsets = (s: Suggestion): Suggestion => {
    const r = mapRange(s.start, s.end, masked);
    const restored = unmask(s.original, masked);
    const restoredRepl = unmask(s.replacement, masked);
    return { ...s, start: r.start, end: r.end, original: textNfc.slice(r.start, r.end) || restored.text, replacement: restoredRepl.text };
  };

  const handleEdits = function* (edits: LlmEdit[]): Generator<SseEvent> {
    // 부분 단계에서는 corrected_text가 없으므로 diff 폴백 없이 해소한다. 실패분은 최종 단계에서 재시도.
    const r = resolveAll(edits, doc, null);
    for (const s of r.resolved) {
      if (emitted.some((e) => s.start < e.end && e.start < s.end)) { dropped.push({ id: s.id, reason: "overlap" }); continue; }
      emitted.push(s);
      yield { event: "edit", data: toOriginalOffsets(s) };
    }
    pendingUnresolved.push(...edits.filter((e) => r.dropped.some((d) => d.id === e.id)));
  };
  const pendingUnresolved: LlmEdit[] = [];

  for await (const ev of input.provider.correct({ system: prompt.system, user: prompt.user, level: input.level, schema: OUTPUT_SCHEMA, ...(input.signal ? { signal: input.signal } : {}) })) {
    if (ev.type === "status") {
      yield { event: "progress", data: { stage: ev.stage } };
    } else if (ev.type === "restart") {
      // provider가 처음부터 다시 쓴다. 부분 파서만 초기화한다(이미 보낸 카드는 최종 단계의 겹침 검사로 정리된다).
      parser = new PartialCorrectionParser();
      yield { event: "progress", data: { stage: "writing" } };
    } else if (ev.type === "delta") {
      if (ttfbMs === null) ttfbMs = now() - t0;
      const got = parser.push(ev.text);
      yield* handleEdits(got.edits);
      for (const rw of got.rewrites) { const item = { ...rw, index: rewrites.length }; rewrites.push(item); yield { event: "rewrite", data: unmaskRewrite(item, masked) }; }
    } else if (ev.type === "final") {
      finalRaw = ev.raw; providerUsage = ev.usage;
    } else if (ev.type === "error") {
      error = { code: ev.code === "max_tokens" ? "schema_invalid" : ev.code, message: ev.message };
      break;
    }
  }

  if (error) {
    yield { event: "error", data: error };
    return emptyResult(textNfc, masked, input, error, prompt.promptVersion);
  }

  // 4. 최종 파싱·검증
  const tail = parser.finish();
  yield* handleEdits(tail.edits);
  for (const rw of tail.rewrites) { const item = { ...rw, index: rewrites.length }; rewrites.push(item); yield { event: "rewrite", data: unmaskRewrite(item, masked) }; }

  let output: CorrectionOutput | null = null;
  try {
    const parsed = CorrectionOutputStrict.safeParse(JSON.parse(finalRaw ?? parser.text));
    if (parsed.success) output = parsed.data;
    else {
      const loose = CorrectionOutput.safeParse(JSON.parse(finalRaw ?? parser.text));
      output = loose.success ? loose.data : null;
    }
  } catch { output = null; }

  if (!output) {
    error = { code: "schema_invalid", message: "모델 출력이 스키마와 맞지 않습니다." };
    yield { event: "error", data: error };
    return emptyResult(textNfc, masked, input, error, prompt.promptVersion);
  }

  // 미해소 edit은 corrected_text diff로 재시도
  if (pendingUnresolved.length > 0) {
    const r = resolveAll(pendingUnresolved, doc, output.corrected_text);
    for (const s of r.resolved) {
      if (emitted.some((e) => s.start < e.end && e.start < s.end)) { dropped.push({ id: s.id, reason: "overlap" }); continue; }
      emitted.push(s);
      yield { event: "edit", data: toOriginalOffsets(s) };
    }
    for (const d of r.dropped) { dropped.push(d); yield { event: "edit_dropped", data: d }; }
  }

  // 5. 교정문: 모델 것이 있으면 복원, 없으면(로컬) edits 적용으로 합성
  const correctedMasked = output.corrected_text ?? applyEdits(masked.masked, emitted);
  const restored = unmask(correctedMasked, masked);
  const readerView = output.reader_view ? unmask(output.reader_view, masked).text : null;
  if (restored.lost.length > 0) dropped.push({ id: "corrected_text", reason: `pii_token_lost:${restored.lost.length}` });
  yield { event: "text", data: { corrected_text: restored.text, reader_view: readerView } };

  const latencyMs = now() - t0;
  const pu = providerUsage ?? { inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
  const usage: Usage = { ...pu, costUsd: input.provider.cost(pu), latencyMs, ttfbMs: ttfbMs ?? latencyMs };
  yield { event: "usage", data: usage };
  yield { event: "done", data: {} };

  return {
    textNfc, masked, edits: emitted.map(toOriginalOffsets), rewrites: rewrites.map((r) => unmaskRewrite(r, masked)), dropped,
    correctedText: restored.text, readerView, usage, promptVersion: prompt.promptVersion, error: null,
  };
}

function unmaskRewrite<T extends LlmRewrite>(rw: T, masked: MaskResult): T {
  return { ...rw, text: unmask(rw.text, masked).text };
}

function emptyResult(textNfc: string, masked: MaskResult | null, input: CorrectPipelineInput, error: CorrectPipelineResult["error"], promptVersion = "0.0.0"): CorrectPipelineResult {
  return {
    textNfc, masked: masked ?? { masked: textNfc, spans: [], map: new Map() }, edits: [], rewrites: [], dropped: [],
    correctedText: null, readerView: null, usage: null, promptVersion, error,
  };
}
