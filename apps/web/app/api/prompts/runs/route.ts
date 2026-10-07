import { listPromptRuns } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 내 스튜디오 실행 기록(본인 것만, 최근 100건). 원문은 테이블에 없다. */
export async function GET(): Promise<Response> {
  const user = await getUser();
  return Response.json(listPromptRuns(getDb(), user.id, 100));
}
