import type { Level, ProviderId } from "../schema/correction";
import type { SystemBlock } from "../prompt/build";

export interface ProviderUsage {
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export type ProviderEvent =
  | { type: "delta"; text: string }
  | { type: "final"; raw: string; usage: ProviderUsage; stopReason: string }
  | { type: "error"; code: "provider_unavailable" | "refusal" | "timeout" | "max_tokens"; message: string };

export interface ProviderInput {
  system: SystemBlock[];
  user: string;
  level: Level;
  /** 구조화 출력 JSON Schema (toOutputJsonSchema 결과) */
  schema: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface CorrectionProvider {
  readonly id: ProviderId;
  readonly model: string;
  correct(input: ProviderInput): AsyncIterable<ProviderEvent>;
  health(): Promise<{ ok: boolean; detail?: string }>;
  /** $ 비용 계산. 로컬은 0. */
  cost(usage: ProviderUsage): number;
}
