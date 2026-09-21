import "server-only";
import { CloudProvider, FakeProvider, LocalProvider, type CorrectionProvider, type ProviderId } from "@grammer-hub/core";
import { ClaudeCliProvider } from "@grammer-hub/core/node";
import { env } from "./env";
import { serverLog } from "./log";

const cache = new Map<ProviderId, CorrectionProvider>();

/**
 * cloud | local. cloud 자리는 우선순위대로: FAKE_PROVIDER=1(E2E·데모) → CLOUD_BACKEND=claude-cli(개인 테스트, 구독 로그인) → API 키.
 */
export function getProvider(id: ProviderId | null | undefined): CorrectionProvider {
  const pid = id ?? env.defaultProvider;
  const hit = cache.get(pid);
  if (hit) return hit;
  const p: CorrectionProvider =
    pid === "local" ? new LocalProvider({ baseUrl: env.localLlmUrl, model: env.localLlmModel })
    : env.fakeProvider ? new FakeProvider()
    : env.cloudBackend === "claude-cli" ? new ClaudeCliProvider({ bin: env.claudeCliPath, model: env.claudeCliModel, onLog: (m) => serverLog("claude-cli", m) })
    : new CloudProvider();
  cache.set(pid, p);
  return p;
}
