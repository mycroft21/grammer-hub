import type { ClarifyPolicy, Domain, NeedStatus, PromptLanguage, PromptLength, Runtime } from "@grammer-hub/core";

export const LENGTH_KO: Record<PromptLength, string> = { short: "짧게", standard: "보통", detailed: "자세히" };
export const CLARIFY_KO: Record<ClarifyPolicy, string> = { ask_first: "모호하면 먼저 묻기", assume_and_state: "가정을 밝히고 진행", never_ask: "묻지 않기(바로 생성)" };
export const LANG_LABEL: Record<PromptLanguage, string> = { ko: "한국어", en: "영어 지시문" };
export const RUNTIME_LABEL: Record<Runtime, string> = { claude_code: "Claude Code", codex: "Codex", chat: "채팅" };
export const RUNTIME_LABEL_LONG: Record<Runtime, string> = { claude_code: "Claude Code (저장소 직접 탐색)", codex: "Codex CLI (한 덩어리)", chat: "채팅 (자료 붙여넣기)" };
export const RUNTIME_TAG: Record<Runtime, string | null> = { claude_code: "Claude Code용 · 붙여넣기 없이 실행", codex: "Codex용 · 한 덩어리로 붙여넣기", chat: null };
export const NEED_STATUS_KO: Record<NeedStatus, string> = { filled: "채움", ask: "질문", assume: "가정", agent_can_find: "코드에서 확인" };
export const DOMAIN_COLOR: Record<Domain, string> = { dev: "green", research: "blue", analysis: "geekblue", planning: "purple", writing: "orange", decision: "magenta" };
export const fmtDate = (t: number) => new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
