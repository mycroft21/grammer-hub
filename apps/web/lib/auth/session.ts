/**
 * 세션 쿠키. 값은 `base64url(JSON).base64url(HMAC-SHA256)` — DB 없이 서명만으로 검증한다.
 * Web Crypto만 쓴다: proxy(요청 게이트)와 라우트 양쪽에서 같은 코드가 돈다.
 * 담는 것은 이메일·표시 이름·만료뿐. 토큰(id_token·access_token)은 저장하지 않는다.
 */
export const SESSION_COOKIE = "gh_session";
export const SESSION_DAYS = 14;

export interface Session { email: string; name: string | null; exp: number }

const enc = new TextEncoder();
const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const utf8b64u = (s: string) => b64u(enc.encode(s));
const b64uUtf8 = (s: string) => new TextDecoder().decode(unb64u(s));

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signValue(payload: unknown, secret: string): Promise<string> {
  const body = utf8b64u(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64u(sig)}`;
}
/** 서명이 맞고 exp가 남아 있으면 payload, 아니면 null. 어떤 입력에도 던지지 않는다. */
export async function verifyValue<T extends { exp: number }>(token: string | null | undefined, secret: string): Promise<T | null> {
  if (!token || !secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64u(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(b64uUtf8(body)) as T;
    if (typeof payload?.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

export const newSession = (email: string, name: string | null): Session => ({ email: email.toLowerCase(), name, exp: Date.now() + SESSION_DAYS * 86400_000 });

/** Cookie 헤더에서 이름으로 값 하나 */
export function cookieValue(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
export async function sessionFromCookieHeader(header: string | null | undefined, secret: string): Promise<Session | null> {
  const s = await verifyValue<Session>(cookieValue(header, SESSION_COOKIE), secret);
  return s && typeof s.email === "string" && s.email ? s : null;
}

/** Set-Cookie 문자열. https 뒤에서는 Secure. */
export function cookieHeader(name: string, value: string, opts: { maxAge: number; secure: boolean }): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${opts.maxAge}${opts.secure ? "; Secure" : ""}`;
}
export const clearCookieHeader = (name: string) => `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
