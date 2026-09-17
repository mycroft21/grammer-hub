import { deleteSample } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const ok = deleteSample(getDb(), getUser().id, id);
  return ok ? Response.json({ ok: true }) : Response.json({ error: { code: "not_found" } }, { status: 404 });
}
