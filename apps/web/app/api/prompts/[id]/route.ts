import { z } from "zod";
import { deletePrompt, getPrompt, listVersions, recordPromptEvent, renamePrompt, setArchived } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { bad, parseBody } from "@/lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const db = getDb(); const user = getUser();
  const prompt = getPrompt(db, user.id, id);
  if (!prompt) return bad("프롬프트를 찾을 수 없습니다", 404);
  return Response.json({ prompt, versions: listVersions(db, id) });
}

const Patch = z.object({ title: z.string().min(1).max(80).optional(), archived: z.boolean().optional() });

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const body = await parseBody(req, Patch);
  if (!body.ok) return body.res;
  const db = getDb(); const user = getUser();
  if (body.data.title !== undefined && !renamePrompt(db, user.id, id, body.data.title)) return bad("프롬프트를 찾을 수 없습니다", 404);
  if (body.data.archived !== undefined) {
    if (!setArchived(db, user.id, id, body.data.archived)) return bad("프롬프트를 찾을 수 없습니다", 404);
    recordPromptEvent(db, { promptId: id, action: body.data.archived ? "archive" : "unarchive" });
  }
  return Response.json(getPrompt(db, user.id, id));
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!deletePrompt(getDb(), getUser().id, id)) return bad("프롬프트를 찾을 수 없습니다", 404);
  return Response.json({ ok: true });
}
