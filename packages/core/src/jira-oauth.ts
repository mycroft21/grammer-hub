import { probeResult, type ProbeResult, type ProbeStep } from "./probe";

/**
 * Atlassian OAuth 2.0(3LO) 판정 조각. 네트워크·저장은 웹 쪽(lib/jira-oauth.ts)이 하고, 여기서는 순수 판정만 한다(단위 테스트 대상).
 * 문서: https://developer.atlassian.com/cloud/oauth/getting-started/implementing-oauth-3lo/
 */
export const JIRA_OAUTH_SCOPES = ["read:jira-work", "read:jira-user", "offline_access"] as const;

/** 사이트 주소 비교용: 소문자 origin(경로·끝 슬래시 버림). 주소가 아니면 null. */
export function normalizeSite(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try { const u = new URL(url.trim()); return `${u.protocol}//${u.host}`.toLowerCase(); } catch { return null; }
}

export interface AccessibleResource { id: string; url: string; name?: string; scopes?: string[] }
/** accessible-resources 응답에서 설정한 Jira 사이트(JIRA_BASE_URL)를 찾는다. 동의 화면에서 다른 사이트를 골랐으면 null. */
export function pickAccessibleSite(resources: unknown, baseUrl: string): AccessibleResource | null {
  const want = normalizeSite(baseUrl);
  if (!want || !Array.isArray(resources)) return null;
  for (const r of resources as Partial<AccessibleResource>[]) {
    if (typeof r?.id === "string" && typeof r.url === "string" && normalizeSite(r.url) === want) return { id: r.id, url: r.url, ...(r.name ? { name: r.name } : {}), ...(r.scopes ? { scopes: r.scopes } : {}) };
  }
  return null;
}

/**
 * refresh 실패 처리. invalid_grant(동의 철회·90일 비활동·백업 복원으로 남은 옛 rotating 토큰)만 다시 연결해야 하므로 저장한 연결을 지운다.
 * 그 밖의 실패(429·5xx·네트워크, 관리자가 앱 시크릿을 잘못 넣어 생긴 access_denied/invalid_client)는 연결을 남긴다 —
 * 지우면 앱 설정을 고친 뒤에도 모두가 다시 연결해야 한다.
 */
export function refreshFailure(error: string | null | undefined): "reconnect" | "temporary" {
  return error === "invalid_grant" ? "reconnect" : "temporary";
}

/**
 * 관리자 '연결 확인'(OAuth 앱): (1) 앱에 등록할 콜백 URL (2) 일부러 틀린 코드로 토큰 엔드포인트를 불러 ID·시크릿 판정.
 * invalid_grant면 통과로 본다(OIDC와 같은 방식). Atlassian의 오류 문구는 문서에 다 나와 있지 않아 그 밖의 응답은 경고로 두고
 * 실제 연결(내 설정 › Jira 연결)로 확인하게 한다.
 */
export async function probeJiraOauth(cfg: { authUrl: string; clientId: string; clientSecret: string; callbackUrl: string; siteUrl: string; authSecretSet: boolean }, f: typeof fetch = fetch): Promise<ProbeResult> {
  const steps: ProbeStep[] = [];
  if (!normalizeSite(cfg.siteUrl)) steps.push({ label: "사이트", state: "fail", detail: "Jira 주소(JIRA_BASE_URL)가 필요합니다. 예: https://xxx.atlassian.net" });
  if (!cfg.authSecretSet) steps.push({ label: "암호화 키", state: "fail", detail: "AUTH_SECRET을 따로 정해야 사람별 Jira 토큰을 저장할 수 있습니다(OIDC 시크릿으로 대신하면 IdP 시크릿 교체 때 모든 연결이 깨집니다)" });
  steps.push({ label: "콜백 URL", state: "ok", detail: `앱의 Authorization › Callback URL: ${cfg.callbackUrl}` });
  if (!cfg.clientId || !cfg.clientSecret) { steps.push({ label: "앱", state: "fail", detail: "OAuth 앱의 Client ID와 Secret이 모두 있어야 합니다" }); return probeResult(steps); }
  try {
    const res = await f(`${cfg.authUrl.replace(/\/+$/, "")}/oauth/token`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ grant_type: "authorization_code", client_id: cfg.clientId, client_secret: cfg.clientSecret, code: "gh-probe-invalid-code", redirect_uri: cfg.callbackUrl }),
    });
    const err = ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "";
    if (err === "invalid_grant") steps.push({ label: "앱", state: "ok", detail: "Client ID·Secret 인증 통과(일부러 틀린 코드로 확인)" });
    else if (err === "invalid_client" || err === "unauthorized_client" || err === "access_denied") steps.push({ label: "앱", state: "fail", detail: `Client ID 또는 Secret이 틀렸습니다(${err})` });
    else steps.push({ label: "앱", state: "warn", detail: `판정하지 못했습니다(응답 ${res.status}${err ? ` ${err}` : ""}). 내 설정 › Jira 연결로 실제 확인하세요` });
  } catch (e) { steps.push({ label: "앱", state: "fail", detail: `Atlassian 토큰 엔드포인트에 연결하지 못했습니다(${e instanceof Error ? e.message : String(e)})` }); }
  return probeResult(steps);
}
