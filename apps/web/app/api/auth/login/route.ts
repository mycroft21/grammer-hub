import { requestOrigin, safeNext } from "@/lib/auth/access";
import { OIDC_COOKIE, beginLogin } from "@/lib/auth/oidc";
import { cookieHeader } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { serverLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** IdP로 보낸다. 로그인 모드가 아니면 그냥 홈으로. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url), origin = requestOrigin(req);
  if (!env.authEnabled) return Response.redirect(new URL("/", origin), 302);
  try {
    const r = await beginLogin(origin, safeNext(url.searchParams.get("next")));
    return new Response(null, { status: 302, headers: { location: r.url, "set-cookie": cookieHeader(OIDC_COOKIE, r.cookie, { maxAge: r.maxAge, secure: origin.startsWith("https:") }) } });
  } catch (e) {
    serverLog("auth", `IdP 연결 실패: ${(e as Error).message.slice(0, 120)}`);
    return Response.redirect(new URL("/login?error=idp", origin), 302);
  }
}
