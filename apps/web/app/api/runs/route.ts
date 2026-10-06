import { listRecentRuns } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 내 실행 기록(팀 서버에서는 본인 것만). */
export async function GET(): Promise<Response> {
  const user = await getUser();
  return Response.json(listRecentRuns(getDb(), 50, user.id));
}
