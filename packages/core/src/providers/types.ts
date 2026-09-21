import type { Level, ProviderId } from "../schema/correction";
import type { SystemBlock } from "../prompt/build";

export interface ProviderUsage {
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

/** 진행 단계. thinking = 모델이 답을 쓰기 전 검토 중, writing = 출력 토큰이 나오기 시작 */
export type ProviderStage = "thinking" | "writing";

export type ProviderEvent =
  | { type: "status"; stage: ProviderStage }
  /** provider가 출력을 처음부터 다시 만든다(구조화 출력 재시도). 앞서 받은 delta는 버리고 부분 파서를 초기화할 것. */
  | { type: "restart" }
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
