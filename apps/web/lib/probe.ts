import "server-only";
import { probeJira, probeOidc, probeResult, type ProbeResult } from "@grammer-hub/core";
import { ClaudeCliProvider } from "@grammer-hub/core/node";
import { redirectUri } from "./auth/oidc";
import { env } from "./env";
import { getProvider } from "./providers";

export type ProbeTarget = "cloud" | "local" | "jira" | "oidc";

/** 설정 화면의 대상별 연결 확인. 저장된 설정으로 확인한다(저장 전 입력값은 보지 않는다). */
export async function runProbe(target: ProbeTarget, origin: string): Promise<ProbeResult> {
  if (target === "cloud") {
    const p = getProvider("cloud");
    if (p instanceof ClaudeCliProvider) {
      // --version은 설치만 본다. 로그인·토큰까지 보려면 실제로 한 번 불러야 한다(구독 사용량이 조금 든다)
      const r = await p.probe();
      return probeResult([{ label: "claude-cli", state: r.ok ? "ok" : "fail", detail: r.detail }]);
    }
    if (!env.fakeProvider && !env.hasAnthropicKey) return probeResult([{ label: "API 키", state: "fail", detail: "ANTHROPIC_API_KEY가 비어 있습니다" }]);
    const h = await p.health().catch((e: unknown) => ({ ok: false, detail: String(e) }));
    return probeResult([{ label: env.fakeProvider ? "가짜 모델" : "API", state: h.ok ? "ok" : "fail", detail: h.ok ? `모델 ${p.model} 확인` : h.detail ?? "응답 없음" }]);
  }
  if (target === "local") {
    const h = await getProvider("local").health().catch((e: unknown) => ({ ok: false, detail: String(e) }));
    return probeResult([{ label: "로컬 LLM", state: h.ok ? "ok" : "fail", detail: h.ok ? `${env.localLlmUrl} 응답함` : `${env.localLlmUrl} — ${h.detail ?? "응답 없음"}` }]);
  }
  if (target === "jira") return probeJira({ baseUrl: env.jiraBaseUrl, email: env.jiraEmail, token: env.jiraApiToken });
  return probeOidc({ issuer: env.oidcIssuer, clientId: env.oidcClientId, clientSecret: env.oidcClientSecret, callbackUrl: redirectUri(origin), appUrlSet: Boolean(env.appUrl) });
}
