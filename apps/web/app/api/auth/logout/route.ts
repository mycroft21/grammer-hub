import { SESSION_COOKIE, clearCookieHeader } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 세션 쿠키만 지운다(IdP 세션은 그대로). 클라이언트가 /login 으로 이동한다. */
export async function POST(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json", "set-cookie": clearCookieHeader(SESSION_COOKIE) } });
}
