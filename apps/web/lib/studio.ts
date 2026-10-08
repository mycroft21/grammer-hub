import "server-only";
import { PromptLanguage, Purpose, STUDIO_PROMPT_VERSION, defaultRuntime, renderRulesSnapshot, ticketCut, ticketToText, type StudioContext, type StudioRequest } from "@grammer-hub/core";
import { fetchTicket } from "./jira";
import { loadMergedWorkspace } from "./workspace";
import { listRules, recordPromptRun, type PromptRunInput } from "@grammer-hub/db";
import { serverLog } from "./log";
import { z } from "zod";
import { getDb, getUser } from "./db";
import { env, cloudReady } from "./env";
import { getProvider } from "./providers";

/** 요청 → StudioContext. 어투 규칙은 사용자가 켰을 때만(기본 중립). 티켓 키가 있으면 가져와 <ticket>으로 넣는다. */
export async function toStudioContext(req: StudioRequest): Promise<{ ok: true; ctx: StudioContext } | { ok: false; res: Response }> {
  const ctx = await baseContext(req);
  const user = await getUser();
  ctx.profile = loadMergedWorkspace(user.id).profile;
  if (req.ticket) {
    const t = await fetchTicket(req.ticket, user.id);
    if (!t.ok) return { ok: false, res: Response.json({ error: { code: t.code ?? "ticket_unavailable", message: t.message } }, { status: t.status }) };
    ctx.ticket = ticketToText(t.ticket);
    ctx.ticketKey = t.ticket.key;
    const cut = ticketCut(t.ticket);
    if (cut) ctx.ticketCut = cut;
  }
  return { ok: true, ctx };
}

async function baseContext(req: StudioRequest): Promise<StudioContext> {
  const ctx: StudioContext = { purpose: req.purpose, subtype: req.subtype ?? null, goal: req.goal.normalize("NFC"), length: req.length, language: req.promptLanguage, runtime: req.runtime ?? defaultRuntime(req.purpose) };
  if (req.answers) ctx.answers = req.answers;
  if (req.hints) ctx.hints = req.hints;
  if (req.assumptions) ctx.assumptions = req.assumptions;
  if (req.clarify) ctx.clarify = req.clarify;
  if (req.classify) ctx.classify = true;
  if (req.includeStyleRules) {
    const rules = listRules(getDb(), (await getUser()).id);
    if (rules.some((r) => r.status !== "demoted")) ctx.styleRules = renderRulesSnapshot(rules, null);
  }
  return ctx;
}

/** provider 확보. 키 없음/미설정은 503 응답으로. */
export function studioProvider(id: "cloud" | "local" | null | undefined, stage: "plan" | "generate"): { ok: true; provider: ReturnType<typeof getProvider> } | { ok: false; res: Response } {
  let provider: ReturnType<typeof getProvider>;
  // 의도 정리·티켓 분류는 단계 모델·thinking(STUDIO_PLAN_*), 생성·재생성은 기본 모델 + STUDIO_GENERATE_THINKING
  try { provider = getProvider(id ?? null, stage === "plan" ? { model: env.studioPlanModel, thinking: env.studioPlanThinking } : { thinking: env.studioGenerateThinking }); }
  catch (e) { return { ok: false, res: Response.json({ error: { code: "provider_unavailable", message: String(e) } }, { status: 503 }) }; }
  if (provider.id === "cloud" && !cloudReady()) {
    return { ok: false, res: Response.json({ error: { code: "provider_unavailable", message: "ANTHROPIC_API_KEY가 설정되지 않았습니다" } }, { status: 503 }) };
  }
  return { ok: true, provider };
}

/** 보관 요청 본문(클라이언트가 만든 결과를 그대로 저장; 서버는 렌더·점검을 다시 계산한다). */
export const SavePromptBody = z.object({
  purpose: Purpose,
  subtype: z.string().nullable().optional(),
  language: PromptLanguage.default("ko"),
  goal: z.string().min(1).max(4000),
  ticketKey: z.string().max(40).nullable().optional(),
  spec: z.record(z.string(), z.unknown()),
  studioVersion: z.string().max(20),
  provider: z.string().max(20).nullable().optional(),
  model: z.string().max(80).nullable().optional(),
  usage: z.object({ inputTokens: z.number(), cachedTokens: z.number(), outputTokens: z.number(), costUsd: z.number(), latencyMs: z.number() }).nullable().optional(),
  runId: z.string().max(60).nullable().optional(),   // 이 결과를 만든 생성 실행(기록에 보관함 링크를 잇는다)
});

/**
 * 스튜디오 실행 한 건을 기록한다(원문 없이 분류·수치·비용·상태만). 모델을 부른 뒤에만 부른다.
 * 기록이 실패해도 사용자 응답은 막지 않는다 — 실패는 로그에 이름만 남긴다.
 */
export function recordStudioRun(i: Omit<PromptRunInput, "studioVersion">): string | null {
  try { return recordPromptRun(getDb(), { ...i, studioVersion: STUDIO_PROMPT_VERSION }); }
  catch (e) { serverLog("studio", "실행 기록 실패", { kind: i.kind, error: e instanceof Error ? e.name : "unknown" }); return null; }
}

/** 요청에서 실행 기록용 분류 필드만 뽑는다(목표 문장은 넣지 않는다). */
export function runFields(req: StudioRequest, ctx: StudioContext): Pick<PromptRunInput, "purpose" | "subtype" | "ticketKey" | "runtime" | "language"> {
  return { purpose: req.purpose, subtype: req.subtype ?? null, ticketKey: ctx.ticketKey ?? null, runtime: ctx.runtime, language: req.promptLanguage };
}
