import type { ClarifyPolicy, Domain, PromptLanguage, PromptLength } from "@grammer-hub/core";

export const LENGTH_KO: Record<PromptLength, string> = { short: "짧게", standard: "보통", detailed: "자세히" };
export const CLARIFY_KO: Record<ClarifyPolicy, string> = { ask_first: "모호하면 먼저 묻기", assume_and_state: "가정을 밝히고 진행", never_ask: "묻지 않기(바로 생성)" };
export const LANG_LABEL: Record<PromptLanguage, string> = { ko: "한국어", en: "영어 지시문" };
export const DOMAIN_COLOR: Record<Domain, string> = { dev: "green", research: "blue", analysis: "geekblue", planning: "purple", writing: "orange", decision: "magenta" };
export const fmtDate = (t: number) => new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
