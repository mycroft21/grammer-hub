import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail, isAllowedEmail } from "@/lib/auth/access";
import { sessionFromCookieHeader } from "@/lib/auth/session";
import { env } from "@/lib/env";

/**
 * 요청 게이트(로그인 모드에서만). 세션 쿠키가 없으면 화면은 /login 으로, API는 401.
 * 설정 화면·설정 API·팀 화면은 관리자만. 개인 설정(/me, /api/me)은 본인 것이라 모두.
 * 세션이 살아 있어도 허용 목록에서 빠진 사람은 세션 없음과 같게 본다(세션은 14일 — 그동안 개인 연결·데이터를 계속 쓰지 않게).
 * 라우트는 getUser()에서 쿠키를 다시 검증하므로 여기서 사용자 정보를 넘기지 않는다.
 */
const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/api\/health$/, /^\/icon\.svg$/, /^\/favicon\.ico$/];

export async function proxy(req: NextRequest) {
  if (!env.authEnabled) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  const isApi = pathname.startsWith("/api/");
  const session = await sessionFromCookieHeader(req.headers.get("cookie"), env.authSecret);
  if (!session || !isAllowedEmail(session.email)) {
    if (isApi) return NextResponse.json({ error: { code: "unauthorized", message: "로그인이 필요합니다" } }, { status: 401 });
    const url = req.nextUrl.clone(); url.pathname = "/login"; url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const settingsArea = pathname === "/settings" || pathname.startsWith("/api/settings") || pathname === "/team" || pathname.startsWith("/api/team");
  if (settingsArea && !isAdminEmail(session.email)) {
    if (isApi) return NextResponse.json({ error: { code: "forbidden", message: "설정은 관리자만 바꿀 수 있습니다" } }, { status: 403 });
    const url = req.nextUrl.clone(); url.pathname = "/"; url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
