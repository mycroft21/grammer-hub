import { describe, expect, it } from "vitest";
import { normalizeSite, pickAccessibleSite, probeJiraOauth, refreshFailure } from "../jira-oauth";

const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("jira oauth", () => {
  it("matches the configured site regardless of case, path and trailing slash", () => {
    expect(normalizeSite("https://Eximbay.atlassian.net/")).toBe("https://eximbay.atlassian.net");
    expect(normalizeSite("not a url")).toBeNull();
    const list = [{ id: "a", url: "https://other.atlassian.net" }, { id: "b", url: "https://eximbay.atlassian.net" }];
    expect(pickAccessibleSite(list, "https://EXIMBAY.atlassian.net/jira")?.id).toBe("b");
    expect(pickAccessibleSite([{ id: "a", url: "https://other.atlassian.net" }], "https://eximbay.atlassian.net")).toBeNull();
    expect(pickAccessibleSite({ error: "x" }, "https://eximbay.atlassian.net")).toBeNull();
  });

  it("refresh failures: only invalid_grant drops the connection (rate limits, outages and a mistyped app secret keep it)", () => {
    expect(refreshFailure("invalid_grant")).toBe("reconnect");
    for (const e of ["access_denied", "invalid_client", "unauthorized_client", "", null, undefined]) expect(refreshFailure(e)).toBe("temporary");
  });

  it("admin probe judges the app by a deliberately wrong code and never echoes the secret", async () => {
    const cfg = { authUrl: "https://auth.example", clientId: "cid", clientSecret: "s3cret-value", callbackUrl: "https://app/api/me/jira/callback", siteUrl: "https://x.atlassian.net", authSecretSet: true };
    const ok = await probeJiraOauth(cfg, async () => res(403, { error: "invalid_grant" }));
    expect(ok.ok).toBe(true);
    expect(ok.steps.map((s) => s.label)).toEqual(["콜백 URL", "앱"]);
    const bad = await probeJiraOauth(cfg, async () => res(401, { error: "access_denied" }));
    expect(bad.ok).toBe(false);
    const unknown = await probeJiraOauth(cfg, async () => res(500, {}));
    expect(unknown.steps.at(-1)!.state).toBe("warn");
    const noKey = await probeJiraOauth({ ...cfg, authSecretSet: false, siteUrl: "" }, async () => res(403, { error: "invalid_grant" }));
    expect(noKey.ok).toBe(false);
    expect(JSON.stringify([ok, bad, unknown, noKey])).not.toContain("s3cret-value");
  });
});
