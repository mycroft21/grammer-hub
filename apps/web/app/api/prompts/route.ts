import { PromptSpec, STUDIO_PROMPT_VERSION, renderClaude, runChecks } from "@grammer-hub/core";
import { createPrompt, listPrompts, promptStats } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { bad, parseBody } from "@/lib/json";
import { SavePromptBody } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const db = getDb(); const user = getUser();
  const includeArchived = new URL(req.url).searchParams.get("archived") === "1";
  return Response.json({ items: listPrompts(db, user.id, { includeArchived }), stats: promptStats(db, user.id) });
}

/** 보관: 스펙을 받아 서버가 렌더·점검을 다시 계산해 첫 버전으로 저장한다. */
export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, SavePromptBody);
  if (!body.ok) return body.res;
  const spec = PromptSpec.safeParse({ ...body.data.spec, language: body.data.language });
  if (!spec.success) return bad("spec이 스키마와 맞지 않습니다");
  const db = getDb(); const user = getUser();
  const r = createPrompt(db, {
    userId: user.id, purpose: body.data.purpose, subtype: body.data.subtype ?? null, language: body.data.language, goal: body.data.goal, ticketKey: body.data.ticketKey ?? null,
    spec: spec.data, rendered: renderClaude(spec.data), checks: runChecks(spec.data), source: "generate",
    studioVersion: body.data.studioVersion || STUDIO_PROMPT_VERSION, provider: body.data.provider ?? null, model: body.data.model ?? null, usage: body.data.usage ?? null,
  });
  return Response.json(r);
}
