import { z } from "zod";
import { recordFinal } from "@grammer-hub/db";
import { getDb } from "@/lib/db";
import { parseBody } from "@/lib/json";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const body = await parseBody(req, z.object({ finalText: z.string().max(20000) }));
  if (!body.ok) return body.res;
  recordFinal(getDb(), id, body.data.finalText);
  return Response.json({ ok: true });
}
