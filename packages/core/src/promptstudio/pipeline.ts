import type { CorrectionProvider, ProviderUsage } from "../providers/types";
import { toOutputJsonSchema } from "../schema/json-schema";
import { mask, unmask, type MaskResult } from "../pii";
import { buildGeneratePrompt, buildPlanPrompt, buildRegeneratePrompt, STUDIO_PROMPT_VERSION, type StudioContext } from "./meta-prompt";
import { PlanRaw, PromptSpec, PromptSpecStrict, SLOT_KEYS, isAgentRuntime, type CheckResult, type PlanResult, type SlotKey } from "./spec";
import { PartialSlotParser } from "./partial";
import { renderClaude, type RenderedPrompt } from "./render/claude";
import { runChecks } from "./checks";
import { DOMAINS, PURPOSES, findSubtype } from "./taxonomy";
import { TicketPlanRaw, buildTicketPlanPrompt, type Ticket, type TicketPlanResult } from "./ticket";
import { UNIVERSAL_NEEDS, deriveNeeds } from "./needs";
import { resolveRepos, type WorkspaceProfile } from "./workspace";
import { agentDefaultsFor } from "./agent-defaults";

const PLAN_SCHEMA = toOutputJsonSchema(PlanRaw);
const TICKET_PLAN_SCHEMA = toOutputJsonSchema(TicketPlanRaw);
const SPEC_SCHEMA = toOutputJsonSchema(PromptSpec);

export interface StudioUsage extends ProviderUsage { costUsd: number; latencyMs: number }

async function collect(provider: CorrectionProvider, system: ReturnType<typeof buildPlanPrompt>["system"], user: string, schema: Record<string, unknown>, onDelta?: (t: string) => void, signal?: AbortSignal) {
  let raw = ""; let usage: ProviderUsage | null = null; let error: { code: string; message: string } | null = null;
  for await (const ev of provider.correct({ system, user, level: "L2", schema, ...(signal ? { signal } : {}) })) {
    if (ev.type === "status") continue;
    if (ev.type === "restart") { raw = ""; continue; }
    if (ev.type === "delta") { raw += ev.text; onDelta?.(ev.text); }
    else if (ev.type === "final") { raw = ev.raw || raw; usage = ev.usage; }
    else if (ev.type === "error") { error = { code: ev.code, message: ev.message }; break; }
  }
  return { raw, usage, error };
}

/** 목표 문장의 PII를 마스킹해 보내고, 결과 텍스트에서 복원한다. */
const SEP = "\n\u241E\n"; // 목표와 티켓을 한 번에 마스킹해 대체어 사전을 공유한다
function maskCtx(ctx: StudioContext): { ctx: StudioContext; m: MaskResult } {
  const joined = ctx.goal.normalize("NFC") + (ctx.ticket ? SEP + ctx.ticket.normalize("NFC") : "");
  const m = mask(joined, { style: "natural" });
  const [goal, ticket] = m.masked.split(SEP);
  return { ctx: { ...ctx, goal: goal ?? m.masked, ...(ctx.ticket ? { ticket: ticket ?? "" } : {}) }, m };
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
  let raw: PlanRaw | null = null;
  try { const j = PlanRaw.safeParse(JSON.parse(r.raw)); raw = j.success ? j.data : null; } catch { raw = null; }
  if (!raw) return { plan: null, usage: null, error: { code: "schema_invalid", message: "의도 정리 결과가 스키마와 맞지 않습니다." } };
  // 세부 유형 검증: 목록에 없으면 기본으로. 장부는 허용된 항목(where + 이 세부 유형의 mustKnow)만 남긴다.
  const sub = findSubtype(ctxIn.purpose, raw.subtype);
  const dev = DOMAINS[PURPOSES[ctxIn.purpose].domain].id === "dev";
  const allowed = [...(dev && ctxIn.profile?.repos.length ? ["where"] : []), ...sub.mustKnow.map((mk) => mk.id)];
  const d = deriveNeeds(raw.needs, { profile: dev ? ctxIn.profile : null, allowedIds: allowed });
  const plan: PlanResult = { summary: raw.summary, subtype: sub.id, needs: d.needs, mode: d.mode, questions: d.questions, assumptions: d.assumptions, verify_in_repo: d.verify_in_repo, repos: d.repos };
  const u = r.usage ?? { inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
  return { plan: unmaskDeep(plan, m), usage: { ...u, costUsd: provider.cost(u), latencyMs: Date.now() - t0 }, error: null };
}

/**
 * 티켓에서 바로 만들기 1단계: 분류·목표·시작점·장부. 프로필이 있으면 대상 저장소를 코드가 먼저 확정한다.
 * `ticketText`는 ticketToText 결과. `ticket`을 주면 제목·라벨로 저장소를 찾는다(텍스트만 있으면 텍스트에서 찾는다).
 */
export async function planFromTicket(provider: CorrectionProvider, ticketText: string, opts: { signal?: AbortSignal; profile?: WorkspaceProfile | null; ticket?: Ticket | null } | AbortSignal = {}): Promise<{ plan: TicketPlanResult | null; usage: StudioUsage | null; error: { code: string; message: string } | null }> {
  const o = opts instanceof AbortSignal ? { signal: opts } : opts;
  const t0 = Date.now();
  const m = mask(ticketText.normalize("NFC"), { style: "natural" });
  const profile = o.profile ?? null;
  const key = o.ticket?.key ?? /키: ([A-Z][A-Z0-9_]+-\d+)/.exec(ticketText)?.[1] ?? null;
  const repoMatches = profile ? resolveRepos(profile, o.ticket ? { title: o.ticket.summary, labels: o.ticket.labels, components: o.ticket.components, body: o.ticket.description } : { body: ticketText }) : [];
  const p = buildTicketPlanPrompt(m.masked, { profile, repoMatches, issueKey: key });
  const r = await collect(provider, p.system, p.user, TICKET_PLAN_SCHEMA, undefined, o.signal);
  if (r.error) return { plan: null, usage: null, error: r.error };
  let raw: TicketPlanRaw | null = null;
  try { const j = TicketPlanRaw.safeParse(JSON.parse(r.raw)); raw = j.success ? j.data : null; } catch { raw = null; }
  if (!raw) return { plan: null, usage: null, error: { code: "schema_invalid", message: "티켓 분류 결과가 스키마와 맞지 않습니다." } };
  const d = deriveNeeds(raw.needs, { profile, repoMatches, allowedIds: UNIVERSAL_NEEDS.map((n) => n.id) });
  const plan: TicketPlanResult = {
    ...raw, subtype: findSubtype(raw.purpose, raw.subtype).id, needs: d.needs,
    mode: d.mode, questions: d.questions, assumptions: d.assumptions, missing_inputs: d.missing_inputs, verify_in_repo: d.verify_in_repo,
    repos: d.repos, repo_evidence: repoMatches.length ? repoMatches.map((x) => `${x.repo.name}: ${x.evidence}`).join("; ") : null,
  };
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
  let parser = new PartialSlotParser(SLOT_KEYS);
  const r = { raw: "", usage: null as ProviderUsage | null, error: null as { code: string; message: string } | null };
  for await (const ev of provider.correct({ system: p.system, user: p.user, level: "L2", schema: SPEC_SCHEMA, ...(signal ? { signal } : {}) })) {
    if (ev.type === "status") yield { event: "progress", data: { stage: ev.stage } };
    else if (ev.type === "restart") { parser = new PartialSlotParser(SLOT_KEYS); r.raw = ""; yield { event: "progress", data: { stage: "writing" } }; }
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
  spec.runtime = ctxIn.runtime;
  if (!isAgentRuntime(spec.runtime)) spec.starting_points = [];
  // short는 길이가 곧 품질이다. 모델이 넘치게 쓰면 앞쪽(중요도 순)만 남긴다.
  if (ctxIn.length === "short") {
    spec.success_criteria = spec.success_criteria.slice(0, 4);
    spec.hard_rules = spec.hard_rules.slice(0, 3);
    spec.process = spec.process && spec.process.length > 4 ? spec.process.slice(0, 4) : spec.process;
    spec.self_check = spec.self_check.slice(0, 3);
    spec.failure_guards = spec.failure_guards.slice(0, 2);
    spec.examples = null;
  }
  spec.inputs = spec.inputs.map((i) => ({ ...i, name: i.name.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "") || "input" }));
  // 결과물 분량은 목적으로 정해진다(설계안·조사 목록·변경 요약·검토 항목). 모델이 매번 다른 분량을 쓰지 않게 표의 값으로 통일한다.
  const ad = agentDefaultsFor(ctxIn.purpose, spec.runtime);
  if (ad) {
    spec.output_contract.length = ad.report.length[spec.language];
    if (spec.output_contract.structure.trim().length < 5) spec.output_contract.structure = ad.report.structure[spec.language];
  }

  const rendered = renderClaude(spec, { purpose: ctxIn.purpose });
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
  return { spec: merged, rendered: renderClaude(merged, { purpose: ctxIn.purpose }), checks: runChecks(merged), error: null };
}
