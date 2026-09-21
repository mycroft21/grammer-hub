import { z } from "zod";
import { planFromTicket, ticketToText } from "@grammer-hub/core";
import { parseBody } from "@/lib/json";
import { fetchTicket, jiraConfigured } from "@/lib/jira";
import { runLogger } from "@/lib/log";
import { studioProvider } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ ticket: z.string().min(2).max(300), provider: z.enum(["cloud", "local"]).nullable().optional() });

/** 티켓에서 바로 만들기 1단계: Jira에서 가져와 분류·목표·시작점·질문을 정리한다. */
export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const t = await fetchTicket(body.data.ticket);
  if (!t.ok) return Response.json({ error: { code: "ticket_unavailable", message: t.message } }, { status: t.status });
  const p = studioProvider(body.data.provider);
  if (!p.ok) return p.res;
  const log = runLogger("ticket", t.ticket.key);
  log("티켓 가져옴", { type: t.ticket.type, descChars: t.ticket.description.length, comments: t.ticket.comments.length, attachments: t.ticket.attachments.length });
  const r = await planFromTicket(p.provider, ticketToText(t.ticket), req.signal);
  if (r.error) { log(`분류 실패 ${r.error.code}`); return Response.json({ error: r.error }, { status: 502 }); }
  log("분류 완료", { purpose: r.plan?.purpose, subtype: r.plan?.subtype, mode: r.plan?.mode, questions: r.plan?.questions.length, latencyMs: r.usage?.latencyMs });
  return Response.json({ ticket: t.ticket, plan: r.plan, usage: r.usage, configured: jiraConfigured() });
}

export async function GET(): Promise<Response> {
  return Response.json({ configured: jiraConfigured() });
}
