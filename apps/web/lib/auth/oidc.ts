import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "@/lib/env";
import { serverLog } from "@/lib/log";
import { signValue, verifyValue } from "./session";

/**
 * OIDC 인가 코드 흐름(+PKCE). 라이브러리 없이 discovery → authorize → token → id_token 검증(jose)만 한다.
 * 구글 워크스페이스·Okta·Azure AD·Keycloak처럼 discovery 문서를 주는 IdP면 설정 세 줄로 붙는다.
 */
export const OIDC_COOKIE = "gh_oidc";
interface Discovery { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string }
interface Transient { state: string; verifier: string; nonce: string; next: string; exp: number }

let cached: { issuer: string; meta: Discovery; jwks: ReturnType<typeof createRemoteJWKSet>; at: number } | null = null;
async function discover(): Promise<Discovery & { jwks: ReturnType<typeof createRemoteJWKSet> }> {
  const issuer = env.oidcIssuer;
  if (cached && cached.issuer === issuer && Date.now() - cached.at < 3600_000) return { ...cached.meta, jwks: cached.jwks };
  const res = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`IdP discovery 실패 (${res.status})`);
  const meta = (await res.json()) as Partial<Discovery>;
  if (!meta.issuer || !meta.authorization_endpoint || !meta.token_endpoint || !meta.jwks_uri) throw new Error("IdP discovery 문서에 필수 항목이 없습니다");
  const jwks = createRemoteJWKSet(new URL(meta.jwks_uri));
  cached = { issuer, meta: meta as Discovery, jwks, at: Date.now() };
  return { ...(meta as Discovery), jwks };
}
const b64u = (b: Buffer) => b.toString("base64url");
export const redirectUri = (origin: string) => `${env.appUrl || origin}/api/auth/callback`;

/** 1단계: IdP로 보낼 URL과, 콜백에서 대조할 임시 쿠키 값(10분). */
export async function beginLogin(origin: string, next: string): Promise<{ url: string; cookie: string; maxAge: number }> {
  const d = await discover();
  const state = b64u(randomBytes(24)), verifier = b64u(randomBytes(32)), nonce = b64u(randomBytes(16));
  const challenge = b64u(createHash("sha256").update(verifier).digest());
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", env.oidcClientId);
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("nonce", nonce);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  const maxAge = 600;
  const cookie = await signValue({ state, verifier, nonce, next, exp: Date.now() + maxAge * 1000 } satisfies Transient, env.authSecret);
  return { url: u.toString(), cookie, maxAge };
}

export type LoginResult = { ok: true; email: string; name: string | null; next: string } | { ok: false; code: "state" | "exchange" | "token" | "no_email"; detail: string };
/** 2단계: 콜백. state 대조 → 코드 교환 → id_token 서명·iss·aud·nonce 검증 → 이메일. */
export async function completeLogin(origin: string, params: URLSearchParams, transientCookie: string | null): Promise<LoginResult> {
  const t = await verifyValue<Transient>(transientCookie, env.authSecret);
  const state = params.get("state"), code = params.get("code");
  if (!t || !state || state !== t.state || !code) return { ok: false, code: "state", detail: params.get("error_description") ?? params.get("error") ?? "state 불일치 또는 만료" };
  const d = await discover();
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin), client_id: env.oidcClientId, client_secret: env.oidcClientSecret, code_verifier: t.verifier });
  let idToken: string;
  try {
    const res = await fetch(d.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body, signal: AbortSignal.timeout(15_000) });
    const json = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
    if (!res.ok || !json.id_token) return { ok: false, code: "exchange", detail: json.error_description ?? json.error ?? `토큰 교환 실패 (${res.status})` };
    idToken = json.id_token;
  } catch (e) { return { ok: false, code: "exchange", detail: (e as Error).message }; }
  let claims: JWTPayload & { email?: string; email_verified?: boolean; name?: string; preferred_username?: string; nonce?: string };
  try { claims = (await jwtVerify(idToken, d.jwks, { issuer: d.issuer, audience: env.oidcClientId })).payload; }
  catch (e) { return { ok: false, code: "token", detail: `id_token 검증 실패: ${(e as Error).message}` }; }
  if (claims.nonce !== t.nonce) return { ok: false, code: "token", detail: "nonce 불일치" };
  // Azure AD 등은 email 대신 preferred_username에 주소를 준다
  const email = (claims.email ?? (claims.preferred_username?.includes("@") ? claims.preferred_username : undefined))?.trim().toLowerCase();
  if (!email) return { ok: false, code: "no_email", detail: "id_token에 이메일이 없습니다(scope에 email이 있는지, IdP가 이메일 클레임을 주는지 확인)" };
  if (claims.email_verified === false) return { ok: false, code: "no_email", detail: "확인되지 않은 이메일입니다" };
  serverLog("auth", "로그인 성공", { verified: claims.email_verified !== undefined });
  return { ok: true, email, name: typeof claims.name === "string" ? claims.name : null, next: t.next };
}
