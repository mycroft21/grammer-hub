import "server-only";
import { randomBytes } from "node:crypto";
import { JIRA_OAUTH_SCOPES, normalizeSite, pickAccessibleSite, refreshFailure } from "@grammer-hub/core";
import { deleteIntegration, getIntegration, saveIntegration, updateIntegrationTokens, type IntegrationRow } from "@grammer-hub/db";
import { signValue, verifyValue } from "./auth/session";
import { getDb } from "./db";
import { env } from "./env";
import { serverLog } from "./log";
import { open, seal } from "./secret-box";

/**
 * Jira 연결 방식.
 * - oauth: 로그인 모드. 사람마다 Atlassian OAuth(3LO)로 연결하고, 그 사람 권한으로 티켓을 본다. 공용 토큰은 쓰지 않는다.
 * - token: 로그인 없는 단일 사용자 모드. .env의 JIRA_EMAIL·JIRA_API_TOKEN(지금까지의 방식).
 * - off: 위 조건이 안 갖춰짐(reason에 이유).
 */
export type JiraMode = "oauth" | "token" | "off";
export function jiraMode(): { mode: JiraMode; reason: string | null } {
  if (env.authEnabled) {
    const missing = [!env.jiraBaseUrl && "Jira 주소", !(env.jiraOauthClientId && env.jiraOauthClientSecret) && "OAuth 앱 ID·시크릿", !env.authSecretExplicit && "AUTH_SECRET"].filter(Boolean);
    return missing.length ? { mode: "off", reason: `관리자 설정에 ${missing.join("·")}이(가) 필요합니다` } : { mode: "oauth", reason: null };
  }
  return env.jiraBaseUrl && env.jiraEmail && env.jiraApiToken ? { mode: "token", reason: null } : { mode: "off", reason: ".env에 JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN이 필요합니다" };
}

export const JIRA_OAUTH_COOKIE = "gh_jira_oauth";
const PURPOSE = "gh:integration:jira";
export const jiraCallbackUrl = (origin: string) => `${env.appUrl || origin}/api/me/jira/callback`;
interface Transient { purpose: "jira"; uid: string; state: string; exp: number }

/** 1단계: Atlassian 동의 화면 URL과, 콜백에서 대조할 서명 쿠키(10분). 쿠키는 로그인용(gh_oidc)과 이름·purpose로 분리한다. */
export async function beginJiraConnect(origin: string, userId: string): Promise<{ url: string; cookie: string; maxAge: number }> {
  const state = randomBytes(24).toString("base64url");
  const u = new URL(`${env.atlassianAuthUrl}/authorize`);
  u.searchParams.set("audience", "api.atlassian.com");
  u.searchParams.set("client_id", env.jiraOauthClientId);
  u.searchParams.set("scope", JIRA_OAUTH_SCOPES.join(" "));
  u.searchParams.set("redirect_uri", jiraCallbackUrl(origin));
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("prompt", "consent");
  const maxAge = 600;
  const cookie = await signValue({ purpose: "jira", uid: userId, state, exp: Date.now() + maxAge * 1000 } satisfies Transient, env.authSecret);
  return { url: u.toString(), cookie, maxAge };
}

interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }
async function tokenCall(body: Record<string, string>): Promise<{ status: number | null; json: TokenResponse }> {
  try {
    const res = await fetch(`${env.atlassianAuthUrl}/oauth/token`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ client_id: env.jiraOauthClientId, client_secret: env.jiraOauthClientSecret, ...body }), signal: AbortSignal.timeout(15_000),
    });
    return { status: res.status, json: ((await res.json().catch(() => ({}))) as TokenResponse) };
  } catch { return { status: null, json: {} }; }
}

function store(userId: string, site: { id: string; url: string }, t: Required<Pick<TokenResponse, "access_token" | "refresh_token">> & TokenResponse): void {
  saveIntegration(getDb(), {
    userId, kind: "jira", siteUrl: normalizeSite(site.url) ?? site.url, cloudId: site.id, scopes: t.scope ?? JIRA_OAUTH_SCOPES.join(" "),
    accessTokenEnc: seal(t.access_token, PURPOSE), accessExpiresAt: Date.now() + (t.expires_in ?? 3600) * 1000, refreshTokenEnc: seal(t.refresh_token, PURPOSE),
  });
}

export type ConnectResult = { ok: true } | { ok: false; code: "state" | "denied" | "exchange" | "offline" | "site" | "resources"; detail: string };
/** 2단계: 콜백. state·purpose·사용자 대조 → 코드 교환 → 설정한 사이트의 cloudId → 암호화해 저장. */
export async function completeJiraConnect(origin: string, params: URLSearchParams, transientCookie: string | null, userId: string): Promise<ConnectResult> {
  const t = await verifyValue<Transient>(transientCookie, env.authSecret);
  const state = params.get("state"), code = params.get("code");
  // 동의 화면에서 취소하면 code 없이 error로 돌아온다
  if (!code && params.get("error") && t && t.purpose === "jira" && state === t.state) return { ok: false, code: "denied", detail: params.get("error") ?? "" };
  // 같은 브라우저에서 계정을 바꿨다면 uid가 달라 남의 행에 저장되지 않는다
  if (!t || t.purpose !== "jira" || t.uid !== userId || !state || state !== t.state || !code) return { ok: false, code: "state", detail: params.get("error_description") ?? params.get("error") ?? "state 불일치 또는 만료" };
  const r = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: jiraCallbackUrl(origin) });
  if (!r.json.access_token) return { ok: false, code: "exchange", detail: r.json.error_description ?? r.json.error ?? `토큰 교환 실패 (${r.status ?? "연결 실패"})` };
  if (!r.json.refresh_token) return { ok: false, code: "offline", detail: "refresh token이 없습니다(앱 권한에 offline_access가 있는지 확인)" };
  let resources: unknown;
  try {
    const res = await fetch(`${env.atlassianApiUrl}/oauth/token/accessible-resources`, { headers: { authorization: `Bearer ${r.json.access_token}`, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ok: false, code: "resources", detail: `사이트 목록 응답 ${res.status}` };
    resources = await res.json();
  } catch (e) { return { ok: false, code: "resources", detail: (e as Error).message }; }
  const site = pickAccessibleSite(resources, env.jiraBaseUrl);
  if (!site) return { ok: false, code: "site", detail: `동의 화면에서 ${normalizeSite(env.jiraBaseUrl) ?? env.jiraBaseUrl} 사이트를 골라 주세요` };
  store(userId, site, { ...r.json, access_token: r.json.access_token, refresh_token: r.json.refresh_token });
  serverLog("jira", "연결됨");
  return { ok: true };
}

/** 지금 설정한 사이트와 같은 연결만 유효. JIRA_BASE_URL이 바뀌었으면 다시 연결해야 한다. */
function currentRow(userId: string): IntegrationRow | null {
  const row = getIntegration(getDb(), userId, "jira");
  return row && row.siteUrl === normalizeSite(env.jiraBaseUrl) ? row : null;
}

// 같은 사람의 동시 갱신 막기(rotating refresh token은 한 번 쓰면 무효). 라우트 번들이 달라도 하나가 되게 globalThis에 둔다
const g = globalThis as unknown as { __ghJiraRefresh?: Map<string, Promise<Access>> };
type Access = { ok: true; token: string; cloudId: string; siteUrl: string } | { ok: false; reason: "not_connected" | "reconnect" | "temporary" };

/** 유효한 access token. 만료 1분 전이면(또는 force) refresh. 4xx 실패는 연결을 지우고 다시 연결하게 한다. */
export async function jiraAccess(userId: string, opts: { force?: boolean } = {}): Promise<Access> {
  const row = currentRow(userId);
  if (!row) return { ok: false, reason: "not_connected" };
  const access = open(row.accessTokenEnc, PURPOSE);
  if (access === null) return { ok: false, reason: "not_connected" };  // AUTH_SECRET이 바뀌었다
  if (!opts.force && row.accessExpiresAt - 60_000 > Date.now()) return { ok: true, token: access, cloudId: row.cloudId, siteUrl: row.siteUrl };
  if (!g.__ghJiraRefresh) g.__ghJiraRefresh = new Map();
  const inflight = g.__ghJiraRefresh.get(userId);
  if (inflight) return inflight;
  const p = (async (): Promise<Access> => {
    const refresh = open(row.refreshTokenEnc, PURPOSE);
    if (refresh === null) return { ok: false, reason: "not_connected" };
    const r = await tokenCall({ grant_type: "refresh_token", refresh_token: refresh });
    if (r.json.access_token && r.json.refresh_token) {
      const saved = updateIntegrationTokens(getDb(), userId, "jira", row.refreshTokenEnc, {
        accessTokenEnc: seal(r.json.access_token, PURPOSE), accessExpiresAt: Date.now() + (r.json.expires_in ?? 3600) * 1000,
        refreshTokenEnc: seal(r.json.refresh_token, PURPOSE), scopes: r.json.scope ?? row.scopes,
      });
      // 갱신하는 사이 끊었거나 다시 연결했다 → 이 결과는 버린다
      if (!saved) return { ok: false, reason: "not_connected" };
      return { ok: true, token: r.json.access_token, cloudId: row.cloudId, siteUrl: row.siteUrl };
    }
    const kind = refreshFailure(r.json.error);
    serverLog("jira", `갱신 실패 → ${kind === "reconnect" ? "연결 삭제" : "유지"}`, { status: r.status ?? undefined, error: r.json.error });
    // 시작할 때의 행일 때만 지운다(그 사이 다시 연결한 새 행은 남긴다)
    if (kind === "reconnect" && getIntegration(getDb(), userId, "jira")?.refreshTokenEnc === row.refreshTokenEnc) deleteIntegration(getDb(), userId, "jira");
    return { ok: false, reason: kind };
  })().finally(() => g.__ghJiraRefresh?.delete(userId));
  g.__ghJiraRefresh.set(userId, p);
  return p;
}

/** 3LO로 Jira REST 호출. 만료 전인데 401이면 한 번 refresh 후 다시(철회 직후 등). */
export async function jiraGet(userId: string, path: string): Promise<{ ok: true; res: Response; siteUrl: string } | { ok: false; reason: "not_connected" | "reconnect" | "temporary"; detail?: string }> {
  let a = await jiraAccess(userId);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!a.ok) return a;
    let res: Response;
    try { res = await fetch(`${env.atlassianApiUrl}/ex/jira/${a.cloudId}${path}`, { headers: { authorization: `Bearer ${a.token}`, accept: "application/json" }, signal: AbortSignal.timeout(15_000) }); }
    catch (e) { return { ok: false, reason: "temporary", detail: (e as Error).message }; }
    if (res.status !== 401 || attempt === 1) return { ok: true, res, siteUrl: a.siteUrl };
    a = await jiraAccess(userId, { force: true });
  }
  return { ok: false, reason: "temporary" };
}

export function disconnectJira(userId: string): boolean {
  const removed = deleteIntegration(getDb(), userId, "jira");
  if (removed) serverLog("jira", "연결 끊음");
  return removed;
}

/** 내 설정 카드용 상태(토큰·계정 정보 없음). */
export function jiraStatus(userId: string) {
  const m = jiraMode();
  const row = m.mode === "oauth" ? getIntegration(getDb(), userId, "jira") : null;
  const valid = row && row.siteUrl === normalizeSite(env.jiraBaseUrl) && open(row.accessTokenEnc, PURPOSE) !== null;
  return {
    mode: m.mode, reason: m.reason, site: normalizeSite(env.jiraBaseUrl),
    connected: m.mode === "token" || Boolean(valid),
    // 행은 있는데 쓸 수 없는 경우(사이트가 바뀜·암호화 키가 바뀜) → 다시 연결 안내
    stale: Boolean(row && !valid),
    connectedAt: valid ? row!.createdAt : null,
  };
}
export type JiraStatus = ReturnType<typeof jiraStatus>;
