import "server-only";
import { PromptLanguage, Purpose, defaultRuntime, renderRulesSnapshot, ticketToText, type StudioContext, type StudioRequest } from "@grammer-hub/core";
import { fetchTicket } from "./jira";
import { listRules } from "@grammer-hub/db";
import { z } from "zod";
import { getDb, getUser } from "./db";
import { env, cloudReady } from "./env";
import { getProvider } from "./providers";

/** 요청 → StudioContext. 어투 규칙은 사용자가 켰을 때만(기본 중립). 티켓 키가 있으면 가져와 <ticket>으로 넣는다. */
export async function toStudioContext(req: StudioRequest): Promise<{ ok: true; ctx: StudioContext } | { ok: false; res: Response }> {
  const ctx = baseContext(req);
  if (req.ticket) {
    const t = await fetchTicket(req.ticket);
    if (!t.ok) return { ok: false, res: Response.json({ error: { code: "ticket_unavailable", message: t.message } }, { status: t.status }) };
    ctx.ticket = ticketToText(t.ticket);
  }
  return { ok: true, ctx };
}

function baseContext(req: StudioRequest): StudioContext {
  const ctx: StudioContext = { purpose: req.purpose, subtype: req.subtype ?? null, goal: req.goal.normalize("NFC"), length: req.length, language: req.promptLanguage, runtime: req.runtime ?? defaultRuntime(req.purpose) };
  if (req.answers) ctx.answers = req.answers;
  if (req.hints) ctx.hints = req.hints;
  if (req.assumptions) ctx.assumptions = req.assumptions;
  if (req.includeStyleRules) {
    const rules = listRules(getDb(), getUser().id);
    if (rules.some((r) => r.status !== "demoted")) ctx.styleRules = renderRulesSnapshot(rules, null);
  }
  return ctx;
}

/** provider 확보. 키 없음/미설정은 503 응답으로. */
export function studioProvider(id: "cloud" | "local" | null | undefined): { ok: true; provider: ReturnType<typeof getProvider> } | { ok: false; res: Response } {
  let provider: ReturnType<typeof getProvider>;
  try { provider = getProvider(id ?? null); }
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
});
