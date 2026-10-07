/**
 * 설정 화면 '연결 확인'의 판정. 외부 호출은 주입한 fetch로 해서 단위 테스트가 응답을 흉내 낼 수 있다.
 * 결과에는 비밀값을 넣지 않는다(토큰·시크릿은 요청에만 쓰고 응답 문구에 옮기지 않는다).
 */
export type ProbeState = "ok" | "fail" | "warn";
export interface ProbeStep { label: string; state: ProbeState; detail: string }
export interface ProbeResult { ok: boolean; summary: string; steps: ProbeStep[] }
type Fetch = typeof fetch;

/** 단계들 → 결과. 실패가 하나라도 있으면 실패, 요약은 첫 실패(없으면 첫 경고, 그것도 없으면 마지막 단계) 문구. */
export function probeResult(steps: ProbeStep[]): ProbeResult {
  const pick = steps.find((s) => s.state === "fail") ?? steps.find((s) => s.state === "warn") ?? steps.at(-1);
  return { ok: steps.every((s) => s.state !== "fail"), summary: pick ? `${pick.label}: ${pick.detail}` : "", steps };
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Jira: /rest/api/3/myself로 주소·인증을 한 번에 본다. 성공하면 연결된 계정을 보여 준다. */
export async function probeJira(cfg: { baseUrl: string; email: string; token: string }, f: Fetch = fetch): Promise<ProbeResult> {
  if (!cfg.baseUrl || !cfg.email || !cfg.token) return probeResult([{ label: "설정", state: "fail", detail: "Jira 주소·이메일·API 토큰 셋 다 있어야 합니다" }]);
  const base = cfg.baseUrl.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await f(`${base}/rest/api/3/myself`, { headers: { Accept: "application/json", Authorization: `Basic ${btoa(`${cfg.email}:${cfg.token}`)}` }, signal: AbortSignal.timeout(15_000) });
  } catch (e) { return probeResult([{ label: "연결", state: "fail", detail: `${base}에 연결하지 못했습니다(${msg(e)}). 주소를 확인하세요` }]); }
  if (res.status === 401 || res.status === 403) return probeResult([{ label: "인증", state: "fail", detail: `Jira가 인증을 거부했습니다(${res.status}). 이메일과 API 토큰을 확인하세요` }]);
  if (res.status === 404) return probeResult([{ label: "주소", state: "fail", detail: "Jira API를 찾지 못했습니다(404). 주소가 https://xxx.atlassian.net 형태인지 확인하세요" }]);
  if (!res.ok) return probeResult([{ label: "응답", state: "fail", detail: `Jira 응답 ${res.status}` }]);
  const me = (await res.json().catch(() => null)) as { displayName?: string; emailAddress?: string; accountId?: string; name?: string } | null;
  // fetch는 리다이렉트를 따라가므로 SSO 로그인 페이지·다른 사이트의 HTML 200도 여기로 온다 → 계정 필드가 없으면 실패
  if (!me || !(me.accountId || me.name || me.displayName)) return probeResult([{ label: "응답", state: "fail", detail: "Jira 계정 응답이 아닙니다(로그인 페이지로 이동했거나 Jira 주소가 아닙니다). 주소와 토큰을 확인하세요" }]);
  return probeResult([{ label: "계정", state: "ok", detail: `연결됨 · ${me.displayName ?? "이름 없음"}${me.emailAddress ? ` (${me.emailAddress})` : ""}` }]);
}

/**
 * OIDC: (1) issuer의 discovery 문서와 issuer 일치 (2) IdP에 등록할 콜백 URL (3) 클라이언트 ID·시크릿.
 * (3)은 일부러 틀린 인가 코드로 토큰 엔드포인트를 불러 본다: invalid_grant면 ID·시크릿은 통과, invalid_client면 틀림,
 * redirect_uri_mismatch면 콜백이 등록되지 않음. 그 밖의 응답은 판정하지 않고 경고로 둔다.
 */
export async function probeOidc(cfg: { issuer: string; clientId: string; clientSecret: string; callbackUrl: string; appUrlSet: boolean }, f: Fetch = fetch): Promise<ProbeResult> {
  const steps: ProbeStep[] = [];
  const issuer = cfg.issuer.replace(/\/+$/, "");
  if (!issuer) return probeResult([{ label: "발급자", state: "fail", detail: "IdP 발급자(issuer) 주소가 비어 있습니다" }]);
  let tokenEndpoint: string | null = null;   // 발급자 확인을 통과했을 때만
  type Meta = { issuer?: string; token_endpoint?: string; authorization_endpoint?: string; jwks_uri?: string };
  let meta = null as Meta | null;   // try 안에서 채운다(선언 타입으로 두면 TS가 null로 좁힌다)
  try {
    const res = await f(`${issuer}/.well-known/openid-configuration`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) steps.push({ label: "발급자", state: "fail", detail: `discovery 문서를 받지 못했습니다(${res.status}). 경로 없이 발급자 주소만 적습니다(예: https://accounts.google.com)` });
    else {
      meta = (await res.json().catch(() => null)) as Meta | null;
      if (!meta) steps.push({ label: "발급자", state: "fail", detail: "응답이 discovery 문서(JSON)가 아닙니다. 웹사이트가 아니라 IdP 발급자 주소를 적습니다" });
    }
  } catch (e) { steps.push({ label: "발급자", state: "fail", detail: `${issuer}에 연결하지 못했습니다(${msg(e)})` }); }
  if (meta) {
    const docIssuer = (meta.issuer ?? "").replace(/\/+$/, "");
    if (!meta.token_endpoint || !meta.authorization_endpoint || !meta.jwks_uri) steps.push({ label: "발급자", state: "fail", detail: "discovery 문서에 필수 항목(authorization·token·jwks)이 없습니다" });
    else if (docIssuer !== issuer) steps.push({ label: "발급자", state: "fail", detail: `문서의 issuer는 ${docIssuer || "(없음)"}입니다. 설정값을 이 주소로 바꾸세요(지금: ${issuer})` });
    else { steps.push({ label: "발급자", state: "ok", detail: "discovery 문서를 받았고 issuer가 일치합니다" }); tokenEndpoint = meta.token_endpoint; }
  }
  steps.push({ label: "콜백 URL", state: cfg.appUrlSet ? "ok" : "warn", detail: `IdP에 등록할 주소: ${cfg.callbackUrl}${cfg.appUrlSet ? "" : " — 외부 접속 주소(APP_URL)가 비어 있어 이 요청의 주소로 만들었습니다. 프록시 뒤라면 APP_URL을 적으세요"}` });
  if (!tokenEndpoint) return probeResult(steps);
  if (!cfg.clientId || !cfg.clientSecret) { steps.push({ label: "클라이언트", state: "fail", detail: "클라이언트 ID와 시크릿이 모두 있어야 합니다" }); return probeResult(steps); }
  try {
    const body = new URLSearchParams({ grant_type: "authorization_code", code: "grammer-hub-probe-invalid-code", redirect_uri: cfg.callbackUrl, client_id: cfg.clientId, client_secret: cfg.clientSecret });
    const res = await f(tokenEndpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body, signal: AbortSignal.timeout(10_000) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    const err = j.error ?? "";
    if (err === "invalid_grant") steps.push({ label: "클라이언트", state: "ok", detail: "ID·시크릿 인증 통과(일부러 틀린 코드로 확인)" });
    else if (err === "invalid_client" || err === "unauthorized_client") steps.push({ label: "클라이언트", state: "fail", detail: "클라이언트 ID 또는 시크릿이 틀렸습니다" });
    else if (err === "redirect_uri_mismatch") steps.push({ label: "클라이언트", state: "fail", detail: "콜백 URL이 IdP에 등록되어 있지 않습니다(위 주소를 IdP의 승인된 리디렉션 URI에 추가)" });
    else steps.push({ label: "클라이언트", state: "warn", detail: `판정하지 못했습니다(응답 ${res.status}${err ? ` ${err}` : ""}). 실제 로그인으로 확인하세요` });
  } catch (e) { steps.push({ label: "클라이언트", state: "fail", detail: `토큰 엔드포인트에 연결하지 못했습니다(${msg(e)})` }); }
  return probeResult(steps);
}
