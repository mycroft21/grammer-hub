import { getUser } from "@/lib/db";
import { disconnectJira, jiraStatus } from "@/lib/jira-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 내 Jira 연결 상태(토큰·계정 정보 없음). */
export async function GET(): Promise<Response> {
  return Response.json(jiraStatus((await getUser()).id));
}

/** 연결 끊기: 저장한 토큰을 지운다. Atlassian 쪽 앱 접근은 사용자가 계정 설정에서 해제한다(폐기 API 없음). */
export async function DELETE(): Promise<Response> {
  const user = await getUser();
  disconnectJira(user.id);
  return Response.json({ ok: true, ...jiraStatus(user.id) });
}
