import { describe, expect, it } from "vitest";
import { probeJira, probeOidc } from "../probe";

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
const fake = (route: Route) => (async (input: RequestInfo | URL, init?: RequestInit) => route(String(input), init)) as typeof fetch;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

describe("probeJira", () => {
  const cfg = { baseUrl: "https://x.atlassian.net/", email: "me@x.com", token: "secret-token-1234" };
  it("200이면 연결된 계정을 보여 주고, 토큰은 결과에 없다", async () => {
    let auth = "";
    const r = await probeJira(cfg, fake((u, i) => { auth = String((i?.headers as Record<string, string>).Authorization); expect(u).toBe("https://x.atlassian.net/rest/api/3/myself"); return json({ displayName: "홍길동", emailAddress: "me@x.com" }); }));
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("홍길동");
    expect(auth.startsWith("Basic ")).toBe(true);
    expect(JSON.stringify(r)).not.toContain("secret-token");
  });
  it("401은 인증, 404는 주소, 네트워크 오류는 연결로 구분한다", async () => {
    expect((await probeJira(cfg, fake(() => json({}, 401)))).steps[0]).toMatchObject({ label: "인증", state: "fail" });
    expect((await probeJira(cfg, fake(() => json({}, 404)))).steps[0]).toMatchObject({ label: "주소", state: "fail" });
    expect((await probeJira(cfg, fake(() => { throw new Error("ENOTFOUND"); }))).steps[0]).toMatchObject({ label: "연결", state: "fail" });
    expect((await probeJira({ ...cfg, token: "" }, fake(() => json({})))).steps[0]).toMatchObject({ label: "설정", state: "fail" });
    // 리다이렉트된 로그인 페이지(HTML 200)는 성공이 아니다
    expect((await probeJira(cfg, fake(() => new Response("<html>login</html>", { status: 200 })))).steps[0]).toMatchObject({ label: "응답", state: "fail" });
  });
});

describe("probeOidc", () => {
  const issuer = "https://idp.example.com";
  const cfg = { issuer, clientId: "cid", clientSecret: "csecret-9999", callbackUrl: "https://app.example.com/api/auth/callback", appUrlSet: true };
  const idp = (tokenError: string | null, docIssuer = issuer): Route => (u) => {
    if (u === `${issuer}/.well-known/openid-configuration`) return json({ issuer: docIssuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` });
    if (u === `${issuer}/token`) return json(tokenError ? { error: tokenError } : {}, tokenError === "invalid_client" ? 401 : 400);
    return json({}, 404);
  };
  it("invalid_grant면 ID·시크릿 통과, 세 단계 모두 ok", async () => {
    const r = await probeOidc(cfg, fake(idp("invalid_grant")));
    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => [s.label, s.state])).toEqual([["발급자", "ok"], ["콜백 URL", "ok"], ["클라이언트", "ok"]]);
    expect(r.steps[1]!.detail).toContain(cfg.callbackUrl);
    expect(JSON.stringify(r)).not.toContain("csecret");
  });
  it("invalid_client면 시크릿 오류, redirect_uri_mismatch면 콜백 미등록", async () => {
    expect((await probeOidc(cfg, fake(idp("invalid_client")))).steps[2]).toMatchObject({ state: "fail", detail: expect.stringContaining("시크릿") });
    expect((await probeOidc(cfg, fake(idp("redirect_uri_mismatch")))).steps[2]).toMatchObject({ state: "fail", detail: expect.stringContaining("콜백") });
    expect((await probeOidc(cfg, fake(idp("server_error")))).steps[2]!.state).toBe("warn");
  });
  it("issuer가 문서와 다르면(인가 엔드포인트를 넣은 실수) 첫 단계에서 실패하고 시크릿은 보지 않는다", async () => {
    let tokenHit = false;
    const r = await probeOidc({ ...cfg, issuer: `${issuer}/o/oauth2/auth` }, fake((u) => { if (u.endsWith("/token")) tokenHit = true; return u.startsWith(`${issuer}/o/oauth2/auth/`) ? json({}, 404) : json({}, 404); }));
    expect(r.ok).toBe(false);
    expect(r.steps[0]).toMatchObject({ label: "발급자", state: "fail" });
    expect(tokenHit).toBe(false);
    const html = await probeOidc(cfg, fake(() => new Response("<html></html>", { status: 200 })));
    expect(html.ok).toBe(false);
    expect(html.steps[0]).toMatchObject({ label: "발급자", state: "fail" });
    const mismatch = await probeOidc(cfg, fake(idp("invalid_grant", "https://other.example.com")));
    expect(mismatch.steps[0]!.detail).toContain("https://other.example.com");
  });
  it("APP_URL이 비면 콜백 단계는 경고(실패는 아님)", async () => {
    const r = await probeOidc({ ...cfg, appUrlSet: false }, fake(idp("invalid_grant")));
    expect(r.ok).toBe(true);
    expect(r.steps[1]!.state).toBe("warn");
  });
});
