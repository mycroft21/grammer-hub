import { z } from "zod";
import { planFromTicket, ticketToText } from "@grammer-hub/core";
import { env } from "@/lib/env";
import { parseBody } from "@/lib/json";
import { fetchTicket } from "@/lib/jira";
import { jiraStatus } from "@/lib/jira-oauth";
import { getUser } from "@/lib/db";
import { runLogger } from "@/lib/log";
import { recordStudioRun, studioProvider } from "@/lib/studio";
import { loadMergedWorkspace, workspaceStatus } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ ticket: z.string().min(2).max(300), provider: z.enum(["cloud", "local"]).nullable().optional() });

/** 티켓에서 바로 만들기 1단계: Jira에서 가져와 분류·목표·시작점·질문을 정리한다. */
export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const user = await getUser();
  const t = await fetchTicket(body.data.ticket, user.id);
  if (!t.ok) return Response.json({ error: { code: t.code ?? "ticket_unavailable", message: t.message } }, { status: t.status });
  const p = studioProvider(body.data.provider, "plan");
  if (!p.ok) return p.res;
  const log = runLogger("ticket", t.ticket.key);
  const ws = loadMergedWorkspace(user.id);
  log("티켓 가져옴", { type: t.ticket.type, descChars: t.ticket.description.length, comments: t.ticket.comments.length, attachments: t.ticket.attachments.length, redactedPeople: t.ticket.redactedPeople, profile: ws.profile ? "on" : "off" });
  const t0 = Date.now();
  const base = { userId: user.id, kind: "ticket" as const, provider: p.provider.id, model: p.provider.model, ticketKey: t.ticket.key };
  let r: Awaited<ReturnType<typeof planFromTicket>>;
  try { r = await planFromTicket(p.provider, ticketToText(t.ticket), { signal: req.signal, profile: ws.profile, ticket: t.ticket }); }
  catch (e) { recordStudioRun({ ...base, status: "error", errorCode: req.signal.aborted ? "aborted" : "exception", latencyMs: Date.now() - t0 }); throw e; }
  if (r.error) {
    recordStudioRun({ ...base, status: "error", errorCode: req.signal.aborted ? "aborted" : r.error.code, usage: r.usage, latencyMs: Date.now() - t0 });
    log(`분류 실패 ${r.error.code}`); return Response.json({ error: r.error }, { status: 502 });
  }
  recordStudioRun({ ...base, status: "ok", usage: r.usage, purpose: r.plan?.purpose ?? null, subtype: r.plan?.subtype ?? null });
  log("분류 완료", { purpose: r.plan?.purpose, subtype: r.plan?.subtype, mode: r.plan?.mode, questions: r.plan?.questions.length, assumptions: r.plan?.assumptions.length, verify: r.plan?.verify_in_repo.length, repos: r.plan?.repos.join("+") || undefined, latencyMs: r.usage?.latencyMs });
  return Response.json({ ticket: t.ticket, plan: r.plan, usage: r.usage, configured: jiraStatus(user.id).connected, workspace: workspaceStatus(user.id) });
}

/** 연동 상태: 나에게 Jira가 쓸 수 있는지(로그인 모드면 내 연결) + 작업 공간 요약(저장소 이름 목록 포함 — 폼의 선택지로 쓴다). */
export async function GET(): Promise<Response> {
  const user = await getUser();
  const jira = jiraStatus(user.id);
  return Response.json({ configured: jira.connected, jira, workspace: workspaceStatus(user.id) });
}
