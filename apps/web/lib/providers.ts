import "server-only";
import { CloudProvider, FakeProvider, LocalProvider, type CorrectionProvider, type ProviderId } from "@grammer-hub/core";
import { ClaudeCliProvider } from "@grammer-hub/core/node";
import { env } from "./env";
import { serverLog } from "./log";

const cache = new Map<string, CorrectionProvider>();
/** 설정이 바뀌면 다음 호출에서 새 설정으로 다시 만든다(/settings 저장 시). */
export const resetProviders = (): void => cache.clear();

/**
 * cloud | local. cloud 자리는 우선순위대로: FAKE_PROVIDER=1(E2E·데모) → CLOUD_BACKEND=claude-cli(개인 테스트, 구독 로그인) → API 키.
 * model은 단계별 클라우드 모델(STUDIO_PLAN_MODEL·CORRECTION_MODEL). 비면 기본 모델, local·fake에는 적용하지 않는다.
 */
export function getProvider(id: ProviderId | null | undefined, model?: string | null): CorrectionProvider {
  const pid = id ?? env.defaultProvider;
  const m = pid === "cloud" && !env.fakeProvider ? (model ?? null) : null;
  const key = `${pid}:${m ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p: CorrectionProvider =
    pid === "local" ? new LocalProvider({ baseUrl: env.localLlmUrl, model: env.localLlmModel })
    : env.fakeProvider ? new FakeProvider()
    : env.cloudBackend === "claude-cli" ? new ClaudeCliProvider({ bin: env.claudeCliPath, model: m ?? env.claudeCliModel, onLog: (msg) => serverLog("claude-cli", msg) })
    : new CloudProvider(m ? { model: m } : {});
  cache.set(key, p);
  return p;
}
