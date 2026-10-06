import { getStats } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 기록 그래프(본인 것만). */
export async function GET(): Promise<Response> {
  const user = await getUser();
  return Response.json(getStats(getDb(), 8, 30, user.id));
}
