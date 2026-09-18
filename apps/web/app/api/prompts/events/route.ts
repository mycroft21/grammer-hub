import { z } from "zod";
import { getPrompt, recordPromptEvent } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { bad, parseBody } from "@/lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  promptId: z.string(),
  versionId: z.string().nullable().optional(),
  action: z.enum(["copy", "fill", "view"]),
  slot: z.string().max(40).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** 사용 신호(복사·변수 채움). 어떤 프롬프트가 실제로 쓰이는지 본다. */
export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const db = getDb();
  if (!getPrompt(db, getUser().id, body.data.promptId)) return bad("프롬프트를 찾을 수 없습니다", 404);
  recordPromptEvent(db, { promptId: body.data.promptId, versionId: body.data.versionId ?? null, action: body.data.action, slot: body.data.slot ?? null, payload: body.data.payload ?? null });
  return Response.json({ ok: true });
}
