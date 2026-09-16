import { SituationProfile } from "@grammer-hub/core";
import { listProfiles, upsertProfile } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { parseBody } from "@/lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = getUser();
  return Response.json(listProfiles(getDb(), user.id));
}

export async function POST(req: Request): Promise<Response> {
  const user = getUser();
  const body = await parseBody(req, SituationProfile.omit({ userId: true }));
  if (!body.ok) return body.res;
  return Response.json(upsertProfile(getDb(), { ...body.data, userId: user.id }));
}
