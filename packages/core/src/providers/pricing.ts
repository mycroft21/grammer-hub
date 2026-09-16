import type { ProviderUsage } from "./types";

/** $/MTok. 2026-06 공식 가격표. 캐시 읽기 0.1×, 캐시 쓰기(5분) 1.25×. */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-5": { input: 5, output: 25 },
};

export function costUsd(model: string, u: ProviderUsage): number {
  const p = PRICES[model];
  if (!p) return 0;
  return (
    (u.inputTokens * p.input +
      u.cachedTokens * p.input * 0.1 +
      u.cacheWriteTokens * p.input * 1.25 +
      u.outputTokens * p.output) / 1_000_000
  );
}
