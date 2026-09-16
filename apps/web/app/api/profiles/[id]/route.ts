import { SituationProfile } from "@grammer-hub/core";
import { deleteProfile, upsertProfile } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { parseBody } from "@/lib/json";

export const runtime = "nodejs";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const user = getUser();
  const body = await parseBody(req, SituationProfile.omit({ userId: true, id: true }));
  if (!body.ok) return body.res;
  return Response.json(upsertProfile(getDb(), { ...body.data, id, userId: user.id }));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const ok = deleteProfile(getDb(), getUser().id, id);
  return ok ? Response.json({ ok: true }) : Response.json({ error: { code: "not_found" } }, { status: 404 });
}
