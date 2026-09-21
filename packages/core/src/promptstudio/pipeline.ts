import type { CorrectionProvider, ProviderUsage } from "../providers/types";
import { toOutputJsonSchema } from "../schema/json-schema";
import { mask, unmask, type MaskResult } from "../pii";
import { buildGeneratePrompt, buildPlanPrompt, buildRegeneratePrompt, STUDIO_PROMPT_VERSION, type StudioContext } from "./meta-prompt";
import { PlanResult, PlanResultStrict, PromptSpec, PromptSpecStrict, SLOT_KEYS, type CheckResult, type SlotKey } from "./spec";
import { PartialSlotParser } from "./partial";
import { renderClaude, type RenderedPrompt } from "./render/claude";
import { runChecks } from "./checks";
import { findSubtype } from "./taxonomy";

const PLAN_SCHEMA = toOutputJsonSchema(PlanResult);
const SPEC_SCHEMA = toOutputJsonSchema(PromptSpec);

export interface StudioUsage extends ProviderUsage { costUsd: number; latencyMs: number }

async function collect(provider: CorrectionProvider, system: ReturnType<typeof buildPlanPrompt>["system"], user: string, schema: Record<string, unknown>, onDelta?: (t: string) => void, signal?: AbortSignal) {
  let raw = ""; let usage: ProviderUsage | null = null; let error: { code: string; message: string } | null = null;
  for await (const ev of provider.correct({ system, user, level: "L2", schema, ...(signal ? { signal } : {}) })) {
    if (ev.type === "status") continue;
    if (ev.type === "delta") { raw += ev.text; onDelta?.(ev.text); }
    else if (ev.type === "final") { raw = ev.raw || raw; usage = ev.usage; }
    else if (ev.type === "error") { error = { code: ev.code, message: ev.message }; break; }
  }
  return { raw, usage, error };
}

/** 목표 문장의 PII를 마스킹해 보내고, 결과 텍스트에서 복원한다. */
function maskCtx(ctx: StudioContext): { ctx: StudioContext; m: MaskResult } {
  const m = mask(ctx.goal.normalize("NFC"), { style: "natural" });
  return { ctx: { ...ctx, goal: m.masked }, m };
}
function unmaskDeep<T>(v: T, m: MaskResult): T {
  if (typeof v === "string") return unmask(v, m).text as T;
  if (Array.isArray(v)) return v.map((x) => unmaskDeep(x, m)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, unmaskDeep(x, m)])) as T;
  return v;
}

/** 1단계: 의도 정리 */
export async function planPrompt(provider: CorrectionProvider, ctxIn: StudioContext, signal?: AbortSignal): Promise<{ plan: PlanResult | null; usage: StudioUsage | null; error: { code: string; message: string } | null }> {
  const t0 = Date.now();
  const { ctx, m } = maskCtx(ctxIn);
  const p = buildPlanPrompt(ctx);
  const r = await collect(provider, p.system, p.user, PLAN_SCHEMA, undefined, signal);
  if (r.error) return { plan: null, usage: null, error: r.error };
  let plan: PlanResult | null = null;
  try {
    const j = JSON.parse(r.raw);
    const strict = PlanResultStrict.safeParse(j);
    plan = strict.success ? strict.data : (PlanResult.safeParse(j).success ? { ...(PlanResult.parse(j)), questions: PlanResult.parse(j).questions.slice(0, 3) } : null);
  } catch { plan = null; }
  if (!plan) return { plan: null, usage: null, error: { code: "schema_invalid", message: "의도 정리 결과가 스키마와 맞지 않습니다." } };
  // 세부 유형 검증: 목록에 없으면 기본으로
  plan.subtype = findSubtype(ctxIn.purpose, plan.subtype).id;
  const u = r.usage ?? { inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
  return { plan: unmaskDeep(plan, m), usage: { ...u, costUsd: provider.cost(u), latencyMs: Date.now() - t0 }, error: null };
}

export type StudioEvent =
  | { event: "meta"; data: { promptVersion: string; provider: string; model: string } }
  | { event: "progress"; data: { stage: "requesting" | "thinking" | "writing"; expectedMs?: number | null } }
  | { event: "slot"; data: { key: SlotKey; value: unknown } }
  | { event: "spec"; data: PromptSpec }
  | { event: "rendered"; data: RenderedPrompt }
  | { event: "checks"; data: CheckResult[] }
  | { event: "usage"; data: StudioUsage }
  | { event: "done"; data: Record<string, never> }
  | { event: "error"; data: { code: string; message: string } };

/** 2단계: Spec 생성(슬롯 단위 스트리밍) → 렌더 → 점검 */
export async function* generatePrompt(provider: CorrectionProvider, ctxIn: StudioContext, signal?: AbortSignal): AsyncGenerator<StudioEvent, { spec: PromptSpec | null; rendered: RenderedPrompt | null; checks: CheckResult[]; usage: StudioUsage | null }> {
  const t0 = Date.now();
  const { ctx, m } = maskCtx(ctxIn);
  const p = buildGeneratePrompt(ctx);
  yield { event: "meta", data: { promptVersion: STUDIO_PROMPT_VERSION, provider: provider.id, model: provider.model } };

  // provider 스트림을 직접 돌며 슬롯이 닫힐 때마다 즉시 흘린다(모아서 보내면 진행 표시가 안 된다).
  const parser = new PartialSlotParser(SLOT_KEYS);
  const r = { raw: "", usage: null as ProviderUsage | null, error: null as { code: string; message: string } | null };
  for await (const ev of provider.correct({ system: p.system, user: p.user, level: "L2", schema: SPEC_SCHEMA, ...(signal ? { signal } : {}) })) {
    if (ev.type === "status") yield { event: "progress", data: { stage: ev.stage } };
    else if (ev.type === "delta") {
      r.raw += ev.text;
      for (const s of parser.push(ev.text)) yield { event: "slot", data: { key: s.key as SlotKey, value: unmaskDeep(s.value, m) } };
    } else if (ev.type === "final") { r.raw = ev.raw || r.raw; r.usage = ev.usage; }
    else if (ev.type === "error") { r.error = { code: ev.code, message: ev.message }; break; }
  }
  for (const s of parser.finish()) yield { event: "slot", data: { key: s.key as SlotKey, value: unmaskDeep(s.value, m) } };
  if (r.error) { yield { event: "error", data: r.error }; return { spec: null, rendered: null, checks: [], usage: null }; }

  let spec: PromptSpec | null = null;
  try {
    const j = JSON.parse(r.raw || parser.text);
    const strict = PromptSpecStrict.safeParse(j);
    spec = strict.success ? strict.data : (PromptSpec.safeParse(j).success ? PromptSpec.parse(j) : null);
  } catch { spec = null; }
  if (!spec) { yield { event: "error", data: { code: "schema_invalid", message: "생성 결과가 스키마와 맞지 않습니다." } }; return { spec: null, rendered: null, checks: [], usage: null }; }
  spec = unmaskDeep(spec, m);
  spec.language = ctxIn.language;
  spec.inputs = spec.inputs.map((i) => ({ ...i, name: i.name.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "") || "input" }));

  const rendered = renderClaude(spec);
  const checks = runChecks(spec);
  const u = r.usage ?? { inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
  const usage: StudioUsage = { ...u, costUsd: provider.cost(u), latencyMs: Date.now() - t0 };
  yield { event: "spec", data: spec };
  yield { event: "rendered", data: rendered };
  yield { event: "checks", data: checks };
  yield { event: "usage", data: usage };
  yield { event: "done", data: {} };
  return { spec, rendered, checks, usage };
}

/** 블록 재생성: 한 슬롯만 다시 만들고 전체를 다시 렌더·점검한다. */
export async function regenerateSlot(provider: CorrectionProvider, ctxIn: StudioContext, spec: PromptSpec, slot: SlotKey, instruction: string | null, signal?: AbortSignal) {
  const { ctx, m } = maskCtx(ctxIn);
  const p = buildRegeneratePrompt(ctx, spec, slot, instruction);
  const r = await collect(provider, p.system, p.user, SPEC_SCHEMA, undefined, signal);
  if (r.error) return { spec: null, rendered: null, checks: [] as CheckResult[], error: r.error };
  let next: PromptSpec | null = null;
  try { const j = PromptSpec.safeParse(JSON.parse(r.raw)); next = j.success ? j.data : null; } catch { next = null; }
  if (!next) return { spec: null, rendered: null, checks: [] as CheckResult[], error: { code: "schema_invalid", message: "재생성 결과가 스키마와 맞지 않습니다." } };
  // 고정 슬롯은 원본 유지, 요청한 슬롯과 그 rationale만 채택
  const merged: PromptSpec = { ...spec, [slot]: unmaskDeep(next[slot], m), rationale: { ...spec.rationale, ...(slot in next.rationale ? { [slot]: unmaskDeep((next.rationale as Record<string, string>)[slot] ?? "", m) } : {}) } } as PromptSpec;
  return { spec: merged, rendered: renderClaude(merged), checks: runChecks(merged), error: null };
}
