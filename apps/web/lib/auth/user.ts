import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { isAdminEmail } from "./access";
import { SESSION_COOKIE, verifyValue, type Session } from "./session";

/** 이 요청의 세션(로그인 모드일 때). 쿠키 서명을 다시 확인하므로 proxy를 믿지 않아도 된다. */
export async function currentSession(): Promise<Session | null> {
  if (!env.authEnabled) return null;
  const jar = await cookies();
  const s = await verifyValue<Session>(jar.get(SESSION_COOKIE)?.value, env.authSecret);
  return s && typeof s.email === "string" && s.email ? s : null;
}
/** 설정 라우트의 2차 방어. proxy가 먼저 막지만 라우트도 스스로 확인한다. */
export async function requireAdmin(): Promise<Response | null> {
  if (!env.authEnabled) return null;
  const s = await currentSession();
  if (!s) return Response.json({ error: { code: "unauthorized", message: "로그인이 필요합니다" } }, { status: 401 });
  if (!isAdminEmail(s.email)) return Response.json({ error: { code: "forbidden", message: "설정은 관리자만 바꿀 수 있습니다" } }, { status: 403 });
  return null;
}
