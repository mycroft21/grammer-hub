/**
 * 단계별 thinking 설정(off | low | medium | high) → 모델이 받는 API 파라미터.
 * 근거(Claude API 문서, 2026-10): Opus 5·Sonnet 5는 `thinking: {type:"disabled"}`를 effort high 이하에서 받는다.
 * Opus 5.5·Sonnet 5.5·Fable은 끌 수 없다(disabled면 400) → off는 가장 낮은 effort로 대신한다.
 * Haiku 4.5는 adaptive thinking·effort를 둘 다 받지 않는다(budget_tokens 방식) → 둘 다 보내지 않는다 = thinking 없이 돈다.
 */
export const THINKING_LEVELS = ["off", "low", "medium", "high"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
export const isThinkingLevel = (v: string): v is ThinkingLevel => (THINKING_LEVELS as readonly string[]).includes(v);

export interface ApiThinking { thinking?: { type: "adaptive" } | { type: "disabled" }; effort?: "low" | "medium" | "high" }
export function apiThinking(model: string, level: ThinkingLevel): ApiThinking {
  if (/^claude-haiku-4-5/.test(model)) return {};
  if (level !== "off") return { thinking: { type: "adaptive" }, effort: level };
  return /^claude-(opus-5-5|sonnet-5-5|fable|mythos)/.test(model) ? { thinking: { type: "adaptive" }, effort: "low" } : { thinking: { type: "disabled" }, effort: "low" };
}
