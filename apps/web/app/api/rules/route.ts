import { StyleRule } from "@grammer-hub/core";
import { listRules, upsertRule } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { parseBody } from "@/lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(listRules(getDb(), getUser().id));
}

export async function POST(req: Request): Promise<Response> {
  const user = getUser();
  const body = await parseBody(req, StyleRule.omit({ userId: true, id: true }).partial().extend({ text: StyleRule.shape.text }));
  if (!body.ok) return body.res;
  return Response.json(upsertRule(getDb(), { ...body.data, userId: user.id }));
}
