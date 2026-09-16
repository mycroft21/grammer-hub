import "server-only";
import { CloudProvider, FakeProvider, LocalProvider, type CorrectionProvider, type ProviderId } from "@grammer-hub/core";
import { env } from "./env";

const cache = new Map<ProviderId, CorrectionProvider>();

/** cloud | local. `FAKE_PROVIDER=1`이면 cloud 자리에 개발용 결정적 provider를 끼운다(E2E·키 없는 데모 전용). */
export function getProvider(id: ProviderId | null | undefined): CorrectionProvider {
  const pid = id ?? env.defaultProvider;
  const hit = cache.get(pid);
  if (hit) return hit;
  const p: CorrectionProvider =
    pid === "local" ? new LocalProvider({ baseUrl: env.localLlmUrl, model: env.localLlmModel })
    : env.fakeProvider ? new FakeProvider()
    : new CloudProvider();
  cache.set(pid, p);
  return p;
}
