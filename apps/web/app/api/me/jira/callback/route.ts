import { requestOrigin } from "@/lib/auth/access";
import { clearCookieHeader, cookieValue } from "@/lib/auth/session";
import { getUser } from "@/lib/db";
import { JIRA_OAUTH_COOKIE, completeJiraConnect, jiraMode } from "@/lib/jira-oauth";
import { serverLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Atlassian에서 돌아오는 곳(로그인 세션이 있어야 한다 — proxy가 막는다). 결과는 내 설정 화면 쿼리로만 알린다(토큰·계정은 URL에 없음). */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url), origin = requestOrigin(req);
  const back = (q: string) => new Response(null, { status: 302, headers: { location: new URL(`/me?${q}`, origin).toString(), "set-cookie": clearCookieHeader(JIRA_OAUTH_COOKIE) } });
  if (jiraMode().mode !== "oauth") return back("jira_error=unavailable");
  const user = await getUser();
  const r = await completeJiraConnect(origin, url.searchParams, cookieValue(req.headers.get("cookie"), JIRA_OAUTH_COOKIE), user.id);
  if (!r.ok) { serverLog("jira", `연결 실패 ${r.code}`, { detail: r.detail.slice(0, 120) }); return back(`jira_error=${r.code}`); }
  return back("jira=connected");
}
