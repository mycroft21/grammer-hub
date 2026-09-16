import "server-only";
import { CloudProvider, type CorrectionProvider, type ProviderId } from "@grammer-hub/core";
import { env } from "./env";

const cache = new Map<ProviderId, CorrectionProvider>();

export function getProvider(id: ProviderId | null | undefined): CorrectionProvider {
  const pid = id ?? env.defaultProvider;
  const hit = cache.get(pid);
  if (hit) return hit;
  let p: CorrectionProvider;
  if (pid === "cloud") p = new CloudProvider();
  else throw new Error("local provider는 WBS 7에서 연결됩니다");
  cache.set(pid, p);
  return p;
}
