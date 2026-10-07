import { currentSession } from "@/lib/auth/user";
import { isAdminEmail } from "@/lib/auth/access";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 화면이 쓰는 로그인 상태: 로그인 모드인지, 누구인지, 설정을 만질 수 있는지. */
export async function GET(): Promise<Response> {
  if (!env.authEnabled) return Response.json({ authEnabled: false, email: env.allowedEmail, name: null, admin: true });
  const s = await currentSession();
  if (!s) return Response.json({ error: { code: "unauthorized", message: "로그인이 필요합니다" } }, { status: 401 });
  return Response.json({ authEnabled: true, email: s.email, name: s.name, admin: isAdminEmail(s.email) });
}
