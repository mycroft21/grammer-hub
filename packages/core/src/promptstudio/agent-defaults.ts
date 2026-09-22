import type { PromptLanguage, Purpose, Runtime, SlotKey } from "./spec";
import { isAgentRuntime } from "./spec";

/**
 * 코딩 에이전트(Claude Code·Codex)용 고정 문장. 모델이 매번 다르게 쓰지 않도록 코드가 렌더에 넣는다.
 * 근거는 docs/11(코딩 에이전트 프롬프트 벤치마크). 요약:
 * - 범위 유지 문장: Claude Code "Avoid over-engineering… only changes directly requested", Codex "ignore unrelated bugs / minimal changes". 두 벤더가 같은 말을 한다.
 * - 보고 형식: 두 벤더 모두 "결과부터, 검증은 실행 결과(명령·출력)로, 못 한 것·가정은 따로" — 주장만으로 끝내지 않게.
 * - 결과물 분량은 목적으로 정해진다(설계안·조사 목록·변경 요약·검토 항목). 프롬프트 분량(short/standard)과는 별개다.
 */
export interface AgentDefaults {
  /** 범위와 제약의 첫 줄. 이 목적에서 에이전트가 하면 안 되는 확장(코드 수정·리팩터링 등)을 한 문장으로 */
  scope: Record<PromptLanguage, string>;
  /** 보고 형식 기본. 모델의 structure가 비었을 때 쓰고, length는 항상 이 값으로 통일한다 */
  report: { structure: Record<PromptLanguage, string>; length: Record<PromptLanguage, string> };
}

export const AGENT_DEFAULTS: Partial<Record<Purpose, AgentDefaults>> = {
  investigate: {
    scope: { ko: "조사만 한다. 코드를 수정하지 않고, 고쳐야 할 곳은 보고에 적는다.", en: "Investigate only. Do not modify code; note what should change in the report." },
    report: {
      structure: { ko: "결론(한 문단) / 확인한 것(파일·메서드 인용) / 제약·부작용 / 미확인과 다음 질문", en: "Conclusion (one paragraph) / What was verified (file and method citations) / Constraints and side effects / Unverified items and open questions" },
      length: { ko: "20~40줄. 목록 위주, 코드는 붙이지 말고 파일·메서드 이름으로 가리킨다", en: "20–40 lines. Lists over prose; point to files and methods instead of pasting code" },
    },
  },
  plan: {
    scope: { ko: "설계안만 낸다. 코드를 수정하지 않고, 확인이 필요한 코드는 읽기만 한다.", en: "Produce the design only. Do not modify code; read what you need to verify." },
    report: {
      structure: { ko: "결정(요약) / 대안 비교(각각 트레이드오프) / 변경 범위(파일·메서드) / 수용 기준과 검증 방법 / 되돌리기 어려운 지점·미결", en: "Decision (summary) / Alternatives with trade-offs / Change scope (files and methods) / Acceptance criteria and verification / Hard-to-reverse points and open items" },
      length: { ko: "1,000~1,500자", en: "600–900 words" },
    },
  },
  build: {
    scope: { ko: "요청된 변경만 한다. 관련 없는 문제나 리팩터링은 고치지 말고 보고의 후속 항목에 적는다. 기존 테스트를 지우거나 통과하도록 고치지 않는다.", en: "Make only the requested change. Do not fix unrelated issues or refactor; list them as follow-ups in the report. Do not delete or alter existing tests to make them pass." },
    report: {
      structure: { ko: "무엇이 바뀌었나(파일·의도) / 검증(실행한 명령과 출력) / 가정·미확인 / 후속 항목", en: "What changed (files and intent) / Verification (commands run and their output) / Assumptions and unverified items / Follow-ups" },
      length: { ko: "10줄 안팎 + 검증 출력. 코드는 diff로 보이므로 다시 붙이지 않는다", en: "About 10 lines plus verification output. Do not paste code the diff already shows" },
    },
  },
  review: {
    scope: { ko: "검토만 한다. 코드를 고치지 않고, 지적마다 위치와 실패 시나리오를 적는다.", en: "Review only. Do not modify code; give each finding a location and a failure scenario." },
    report: {
      structure: { ko: "차단 / 권장 / 참고 (항목마다 위치·실패 시나리오·근거) / 지적이 없으면 '없음'", en: "Blocking / Recommended / Informational (each with location, failure scenario, evidence) / Say 'none' if there are no findings" },
      length: { ko: "항목당 2~3줄. 취향은 취향이라고 표시한다", en: "2–3 lines per finding. Mark taste-based comments as such" },
    },
  },
};

/** 보고 형식 아래 항상 들어가는 한 줄(에이전트 런타임). */
export const AGENT_REPORT_LINE: Record<PromptLanguage, string> = {
  ko: "결과부터 쓴다. 검증은 실행한 명령과 출력으로 보이고 주장으로 끝내지 않는다. 못 한 것·건너뛴 검증·가정은 따로 적는다.",
  en: "Lead with the outcome. Show verification as the commands you ran and their output, not as a claim. List what you left out, skipped or assumed, separately.",
};

/** 시작점 아래 항상 들어가는 한 줄(에이전트 런타임): 위임하되 읽지 않은 것을 단정하지 않게. */
export const AGENT_START_LINE: Record<PromptLanguage, string> = {
  ko: "저장소를 직접 읽는다. 위 시작점부터 따라가되 어떤 파일을 읽고 어떤 명령을 실행할지는 스스로 정한다. 읽지 않은 파일의 동작은 단정하지 않는다.",
  en: "Read the repository directly. Start from the points above, but decide yourself which files to read and which commands to run. Do not assert the behavior of files you have not read.",
};
/** 시작점이 하나도 없을 때(점검은 실패로 표시되지만 렌더는 된다): 위를 가리키는 말 없이. */
export const AGENT_START_LINE_BARE: Record<PromptLanguage, string> = {
  ko: "저장소를 직접 읽고 목표에 나온 이름·화면·키워드로 시작점을 찾는다. 어떤 파일을 읽고 어떤 명령을 실행할지는 스스로 정하고, 읽지 않은 파일의 동작은 단정하지 않는다.",
  en: "Read the repository directly and locate the starting points from the names, screens and keywords in the goal. Decide yourself which files to read and which commands to run; do not assert the behavior of files you have not read.",
};

/** 슬롯 이름은 런타임에 따라 다르게 읽힌다(에이전트: 완료 조건·범위와 제약·보고 형식·검증). 값의 스키마는 같다. */
const AGENT_SLOT_KO: Partial<Record<SlotKey, string>> = { success_criteria: "완료 조건", hard_rules: "범위와 제약", output_contract: "보고 형식", self_check: "검증", process: "진행" };
export function slotLabel(key: SlotKey, runtime: Runtime | null | undefined, base: Record<SlotKey, string>): string {
  return (isAgentRuntime(runtime) ? AGENT_SLOT_KO[key] : undefined) ?? base[key];
}

/** 결과물 분량은 목적으로 정해진다. 에이전트 런타임의 개발 목적이면 표의 값, 아니면 모델 값 그대로. */
export function agentDefaultsFor(purpose: Purpose, runtime: Runtime | null | undefined): AgentDefaults | null {
  return isAgentRuntime(runtime) ? AGENT_DEFAULTS[purpose] ?? null : null;
}
