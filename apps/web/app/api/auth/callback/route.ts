import { ensureUser, seedDefaultProfiles } from "@grammer-hub/db";
import { isAllowedEmail, requestOrigin, safeNext } from "@/lib/auth/access";
import { OIDC_COOKIE, completeLogin } from "@/lib/auth/oidc";
import { SESSION_COOKIE, SESSION_DAYS, clearCookieHeader, cookieHeader, cookieValue, newSession, signValue } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { serverLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** IdP에서 돌아오는 곳. 검증이 끝나면 세션 쿠키를 굽고 원래 가려던 곳으로. 실패는 /login?error=… 로(이메일은 URL에 싣지 않는다). */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url), origin = requestOrigin(req);
  if (!env.authEnabled) return Response.redirect(new URL("/", origin), 302);
  const fail = (code: string, detail?: string) => {
    serverLog("auth", `로그인 실패 ${code}`, { detail: detail?.slice(0, 120) });
    return new Response(null, { status: 302, headers: { location: new URL(`/login?error=${code}`, origin).toString(), "set-cookie": clearCookieHeader(OIDC_COOKIE) } });
  };
  const r = await completeLogin(origin, url.searchParams, cookieValue(req.headers.get("cookie"), OIDC_COOKIE));
  if (!r.ok) return fail(r.code, r.detail);
  if (!isAllowedEmail(r.email)) return fail("not_allowed");
  const db = getDb();
  const u = ensureUser(db, r.email);
  seedDefaultProfiles(db, u.id);
  const token = await signValue(newSession(r.email, r.name), env.authSecret);
  const headers = new Headers({ location: new URL(safeNext(r.next), origin).toString() });
  headers.append("set-cookie", cookieHeader(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400, secure: origin.startsWith("https:") }));
  headers.append("set-cookie", clearCookieHeader(OIDC_COOKIE));
  return new Response(null, { status: 302, headers });
}
