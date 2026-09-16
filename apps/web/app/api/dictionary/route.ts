import { DictionaryEntry } from "@grammer-hub/core";
import { listDictionary, upsertDictionary } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { parseBody } from "@/lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(listDictionary(getDb(), getUser().id));
}

export async function POST(req: Request): Promise<Response> {
  const user = getUser();
  const body = await parseBody(req, DictionaryEntry.omit({ userId: true, id: true }).partial().extend({ term: DictionaryEntry.shape.term }));
  if (!body.ok) return body.res;
  return Response.json(upsertDictionary(getDb(), { ...body.data, userId: user.id }));
}
