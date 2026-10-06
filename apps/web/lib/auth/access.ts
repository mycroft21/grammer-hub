import { env } from "@/lib/env";

/**
 * 누가 들어올 수 있고(allowlist) 누가 설정을 만질 수 있는지(admin). 로그인 모드에서만 의미가 있다.
 * 둘 다 비어 있으면 아무도 못 들어온다(닫힌 기본값) — 관리자 이메일은 자동으로 허용된다.
 */
export function isAllowedEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e.includes("@")) return false;
  if (env.authAdminEmails.includes(e) || env.authAllowedEmails.includes(e)) return true;
  const domain = e.slice(e.lastIndexOf("@") + 1);
  return env.authAllowedDomains.includes(domain);
}
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!env.authEnabled) return true;   // 로그인 없는 단일 사용자 모드: 본인이 관리자
  return Boolean(email) && env.authAdminEmails.includes(email!.trim().toLowerCase());
}
/** 로그인 뒤 돌아갈 경로. 같은 사이트 안의 경로만(열린 리다이렉트 방지). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/api/")) return "/";
  return next;
}

/**
 * 요청의 바깥 주소. Next의 req.url은 호스트를 localhost로 바꿔 놓기도 하므로 Host/X-Forwarded-* 헤더로 만든다.
 * 콜백 URL과 쿠키가 같은 호스트에 묶여야 로그인이 이어진다. 리버스 프록시 뒤에서는 APP_URL이 이보다 우선한다(oidc.ts).
 */
export function requestOrigin(req: Request): string {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || u.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || u.protocol.replace(":", "");
  return `${proto}://${host}`;
}
