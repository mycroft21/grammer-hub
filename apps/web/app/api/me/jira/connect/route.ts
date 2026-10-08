import { requestOrigin } from "@/lib/auth/access";
import { cookieHeader } from "@/lib/auth/session";
import { getUser } from "@/lib/db";
import { JIRA_OAUTH_COOKIE, beginJiraConnect, jiraMode } from "@/lib/jira-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Atlassian 동의 화면으로 보낸다. OAuth 모드가 아니면 내 설정으로 돌려보낸다. */
export async function GET(req: Request): Promise<Response> {
  const origin = requestOrigin(req);
  if (jiraMode().mode !== "oauth") return Response.redirect(new URL("/me?jira_error=unavailable", origin), 302);
  const user = await getUser();
  const r = await beginJiraConnect(origin, user.id);
  return new Response(null, { status: 302, headers: { location: r.url, "set-cookie": cookieHeader(JIRA_OAUTH_COOKIE, r.cookie, { maxAge: r.maxAge, secure: origin.startsWith("https:") }) } });
}
