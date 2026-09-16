import type { CorrectionProvider, ProviderEvent, ProviderInput } from "./types";

/**
 * 개발·E2E 전용 결정적 provider. API 키 없이 전체 UI 흐름을 확인한다.
 * 규칙표 기반이며 실제 품질과 무관하다. 절대 운영 기본값으로 쓰지 않는다.
 */
const RULES: Array<{ re: RegExp; to: string; category: string; reason: string; severity: string }> = [
  { re: /드릴께요/g, to: "드릴게요", category: "SPELLING", reason: "'-ㄹ게요'가 표준 표기입니다(한글 맞춤법 제53항).", severity: "error" },
  { re: /할수있/g, to: "할 수 있", category: "SPACING", reason: "의존명사 '수'는 띄어 씁니다.", severity: "error" },
  { re: /나오셨습니다/g, to: "나왔습니다", category: "HONORIFIC", reason: "사물(커피)에 '-시-'를 쓰는 것은 과잉 존대입니다.", severity: "error" },
  { re: /\s*ㅎㅎ+/g, to: "", category: "REGISTER", reason: "상급자 채널 격식 기준으로 이모티콘성 표현을 제거합니다.", severity: "style" },
  { re: /부탁드리겟습니다|부탁드리겠습니다/g, to: "부탁드립니다", category: "CONCISENESS", reason: "'-겠-'은 불필요한 완곡 표현입니다.", severity: "style" },
];

export class FakeProvider implements CorrectionProvider {
  readonly id = "cloud" as const; // UI 관점에서는 cloud 자리를 대신한다
  readonly model = "fake-dev";
  constructor(private readonly delayMs = 60) {}

  async *correct(input: ProviderInput): AsyncIterable<ProviderEvent> {
    const draft = /<draft[^>]*>\n([\s\S]*?)\n<\/draft>/.exec(input.user)?.[1] ?? "";
    const level = input.level;
    const edits: unknown[] = [];
    let corrected = draft;
    let n = 0;
    for (const r of RULES) {
      if (level === "L1" && !["SPELLING", "SPACING", "GRAMMAR", "PUNCTUATION"].includes(r.category)) continue;
      for (const m of draft.matchAll(r.re)) {
        n++;
        const idx = m.index ?? 0;
        edits.push({
          id: `e${n}`, sentence_index: 0, original: m[0], context_before: draft.slice(Math.max(0, idx - 6), idx),
          context_after: draft.slice(idx + m[0].length, idx + m[0].length + 6), replacement: m[0].replace(r.re, r.to),
          category: r.category, severity: r.severity, reason_ko: r.reason, rule_ref: null, confidence: 0.9,
        });
      }
      corrected = corrected.replace(r.re, r.to);
    }
    const rewrites = level === "L3" ? [
      { label: "더 정중", text: corrected.replace(/게요/g, "겠습니다"), rationale: "하십시오체로 통일" },
      { label: "더 간결", text: corrected.split(/(?<=\.)\s+/)[0] ?? corrected, rationale: "첫 문장만 남김" },
      { label: "더 친근", text: corrected + " 😊", rationale: "이모지 추가" },
    ] : [];
    const out = { corrected_text: corrected, edits, rewrites, reader_view: n > 0 ? "수신자는 시점 정보가 없어 재질문할 수 있습니다." : null, preserved_facts_check: { numbers: true, dates: true, commitments: true } };
    const json = JSON.stringify(out);
    for (let i = 0; i < json.length; i += 40) {
      await new Promise((r) => setTimeout(r, this.delayMs));
      if (input.signal?.aborted) return;
      yield { type: "delta", text: json.slice(i, i + 40) };
    }
    yield { type: "final", raw: json, usage: { inputTokens: 2500 + draft.length, cachedTokens: 2400, cacheWriteTokens: 0, outputTokens: Math.ceil(json.length / 3) }, stopReason: "end_turn" };
  }
  async health() { return { ok: true }; }
  cost() { return 0; }
}
