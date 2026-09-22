import { z } from "zod";

/**
 * 대분류(Domain) = 범용 목적 6종. 중분류(Purpose) = 대분류 안의 작업 종류.
 * 개발 대분류의 중분류는 생애주기 단계(조사 → 계획 → 구현 → 검토)이며 각 단계의 출력이 다음 단계의 입력(handoff)이 된다.
 */
export const Domain = z.enum(["dev", "research", "analysis", "planning", "writing", "decision"]);
export type Domain = z.infer<typeof Domain>;

export const Purpose = z.enum([
  // 개발 생애주기
  "investigate", "plan", "build", "review",
  // 리서치
  "research_survey", "research_compare", "research_verify",
  // 분석
  "analyze_data", "analyze_cause", "analyze_impact",
  // 기획
  "plan_proposal", "plan_options", "plan_roadmap",
  // 글쓰기
  "write_business", "write_explain", "write_transform",
  // 의사결정
  "decide_choose", "decide_premortem",
]);
export type Purpose = z.infer<typeof Purpose>;

export const PromptLength = z.enum(["short", "standard", "detailed"]);
export type PromptLength = z.infer<typeof PromptLength>;

export const ClarifyPolicy = z.enum(["ask_first", "assume_and_state", "never_ask"]);
export type ClarifyPolicy = z.infer<typeof ClarifyPolicy>;

export const OutputFormat = z.enum(["markdown", "json", "table", "code", "prose", "diff"]);

/**
 * 프롬프트 본문 언어. en이면 모델에게 주는 지시문은 영어로 쓰되(영어 최적화가 잘 돼 있음),
 * 답변은 사용자 언어(한국어)로 하라는 규칙을 렌더가 항상 넣는다. UI용 텍스트(title, label, rationale)는 언제나 한국어.
 */
export const PromptLanguage = z.enum(["ko", "en"]);
export type PromptLanguage = z.infer<typeof PromptLanguage>;

/**
 * 실행 환경. claude_code / codex = 코딩 에이전트가 저장소·파일·셸에 직접 접근한다(코드 붙여넣기 없이 시작점만 준다).
 * chat = 채팅창에 자료를 붙여넣어 쓴다(입력 변수로 받는다). 개발 대분류 기본은 claude_code.
 * 두 에이전트의 차이는 렌더 형태만이다: Claude Code는 system/user를 나눌 수 있고, Codex CLI는 한 덩어리 프롬프트만 받는다(저장소 규칙은 AGENTS.md).
 */
export const Runtime = z.enum(["claude_code", "codex", "chat"]);
export type Runtime = z.infer<typeof Runtime>;
export const AGENT_RUNTIMES: readonly Runtime[] = ["claude_code", "codex"];
/** 코딩 에이전트 환경인가(저장소를 직접 읽는다). 슬롯 규칙·점검·렌더가 이 구분으로 분기한다. */
export const isAgentRuntime = (r: Runtime | null | undefined): boolean => r === "claude_code" || r === "codex";

/** 프롬프트가 받을 입력 변수. 렌더 결과에 `{{name}}`으로 들어가고 보관함에서 폼으로 채운다. */
export const InputVar = z.object({
  name: z.string(),          // 영문 snake_case
  label: z.string(),         // 한국어 표시명
  description: z.string(),
  required: z.boolean(),
  multiline: z.boolean(),
  placeholder: z.string(),
});
export type InputVar = z.infer<typeof InputVar>;

/**
 * PromptSpec: LLM이 채우는 슬롯. 텍스트 조립은 코드(render)가 한다.
 * 구조화 출력 스키마로 쓰므로 여기에는 길이·패턴 제약을 두지 않는다(엄격 검증은 PromptSpecStrict).
 */
export const PromptSpec = z.object({
  language: PromptLanguage,
  runtime: Runtime,
  title: z.string(),
  role: z.string(),
  goal: z.string(),
  success_criteria: z.array(z.string()),
  inputs: z.array(InputVar),
  /** claude_code일 때 탐색 시작점(URL·경로·심볼·키워드). chat이면 빈 배열. */
  starting_points: z.array(z.string()),
  context: z.string().nullable(),
  hard_rules: z.array(z.string()),
  process: z.array(z.string()).nullable(),
  output_contract: z.object({
    format: OutputFormat,
    structure: z.string(),
    length: z.string(),
  }),
  self_check: z.array(z.string()),
  failure_guards: z.array(z.string()),
  clarify_policy: ClarifyPolicy,
  examples: z.array(z.object({ input: z.string(), output: z.string() })).nullable(),
  rationale: z.object({
    role: z.string(), goal: z.string(), success_criteria: z.string(), inputs: z.string(), starting_points: z.string(), context: z.string(),
    hard_rules: z.string(), process: z.string(), output_contract: z.string(), self_check: z.string(), failure_guards: z.string(), examples: z.string(),
  }),
});
export type PromptSpec = z.infer<typeof PromptSpec>;

export const PromptSpecStrict = PromptSpec.extend({
  title: z.string().min(2).max(60),
  role: z.string().min(10).max(400),
  goal: z.string().min(10).max(600),
  success_criteria: z.array(z.string().min(5).max(200)).min(2).max(7),
  inputs: z.array(InputVar).max(8),
  starting_points: z.array(z.string().min(2).max(300)).max(8),
  hard_rules: z.array(z.string().min(3).max(200)).max(7),
  process: z.array(z.string().min(3).max(200)).max(8).nullable(),
  self_check: z.array(z.string().min(3).max(200)).min(2).max(8),
  failure_guards: z.array(z.string().min(3).max(200)).max(6),
  examples: z.array(z.object({ input: z.string().max(1500), output: z.string().max(1500) })).max(2).nullable(),
});

/** 슬롯 이름(스트리밍 이벤트·블록 재생성 단위). rationale은 별도 취급. */
export const SLOT_KEYS = ["title", "role", "goal", "success_criteria", "inputs", "starting_points", "context", "hard_rules", "process", "output_contract", "self_check", "failure_guards", "clarify_policy", "examples"] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];
export const SLOT_KO: Record<SlotKey, string> = {
  title: "제목", role: "역할", goal: "목표", success_criteria: "성공 기준", inputs: "입력", starting_points: "시작점", context: "맥락",
  hard_rules: "절대 규칙", process: "과정", output_contract: "출력 형식", self_check: "자기 점검",
  failure_guards: "방어 지침", clarify_policy: "모호할 때", examples: "예시",
};

/**
 * 필요 정보 장부(needs ledger). "무엇을 물을지"를 모델의 재량에 맡기지 않고, 항목마다 네 상태 중 하나를 고르게 한다.
 * - filled: 목표 문장·티켓에 답이 있다 → value
 * - agent_can_find: 저장소를 읽으면 알 수 있다(코드값·구현 위치·호출부·현재 동작) → 묻지 않고 프롬프트의 '확인할 것'이 된다
 * - assume: 관례적 기본값이 있고 틀려도 한 줄만 고치면 된다 → value = 가정
 * - ask: 사람만 답할 수 있고 답에 따라 결과물이 달라진다 → options + 못 물을 때의 기본값(value)
 * 질문·가정·확인 목록은 이 장부에서 코드가 만든다. 같은 항목이 질문과 가정에 동시에 나오는 일이 구조적으로 없다.
 */
export const NeedStatus = z.enum(["filled", "ask", "assume", "agent_can_find"]);
export type NeedStatus = z.infer<typeof NeedStatus>;
export const Need = z.object({
  id: z.string(),                 // where | deliverable | done | scope | external | policy | (세부 유형의 mustKnow id)
  label: z.string(),              // 한국어 짧은 이름
  status: NeedStatus,
  value: z.string().nullable(),   // filled/assume: 값·가정. agent_can_find: 무엇을 확인할지. ask: 못 물을 때 쓸 기본값
  options: z.array(z.string()),   // ask일 때 선택지 2~4개(없으면 빈 배열)
  question: z.string().nullable(), // ask일 때 사용자에게 보일 질문 한 문장. 다른 상태면 null
  why: z.string(),                // 이 상태로 둔 이유 한 문장(UI에 표시)
});
export type Need = z.infer<typeof Need>;
/** 질문 수 상한. 프롬프트는 스타터다: 둘을 넘으면 묻는 대신 가정하고 사용자가 검토 화면에서 고친다. */
export const MAX_QUESTIONS = 2;

/** 의도 정리 단계의 출력: 바로 발행 가능(ready)하거나 선택형 질문(ask). */
export const PlanQuestion = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.object({ value: z.string(), label: z.string() })),
  allow_other: z.boolean(),
  why: z.string(),
});
export type PlanQuestion = z.infer<typeof PlanQuestion>;

/** 모델이 내는 것(장부까지만). 질문·가정은 코드가 파생한다. */
export const PlanRaw = z.object({
  summary: z.string(),                         // 모델이 이해한 목표 한 문장
  subtype: z.string().nullable(),              // 분류 체계의 세부 유형 id(추정)
  needs: z.array(Need),
});
export type PlanRaw = z.infer<typeof PlanRaw>;

export const PlanResult = PlanRaw.extend({
  mode: z.enum(["ready", "ask"]),
  assumptions: z.array(z.string()),            // assume 항목 + 상한 초과로 내려간 ask 항목
  questions: z.array(PlanQuestion),            // ask 항목, 최대 MAX_QUESTIONS
  verify_in_repo: z.array(z.string()),         // agent_can_find 항목: 프롬프트에서 모델이 코드로 확인할 것
  repos: z.array(z.string()),                  // 확정된 대상 저장소(where가 filled일 때)
});
export type PlanResult = z.infer<typeof PlanResult>;

/** 만들기 요청 */
export const StudioRequest = z.object({
  purpose: Purpose,
  subtype: z.string().nullable().optional(),
  goal: z.string().min(4).max(2000),
  length: PromptLength.default("standard"),
  clarify: ClarifyPolicy.default("ask_first"),
  promptLanguage: PromptLanguage.default("ko"),               // en = 지시문 영어, 답변은 한국어
  runtime: Runtime.nullable().optional(),                      // 비우면 대분류 기본(개발=claude_code, 그 외=chat)
  ticket: z.string().max(200).nullable().optional(),           // 이슈 키(EP-1174) 또는 URL. 서버가 가져와 <ticket>으로 넣는다
  /** 사용자가 검토 화면에서 확정한 시작점·맥락·대상 저장소·코드에서 확인할 것. 그대로 반영된다 */
  hints: z.object({
    startingPoints: z.array(z.string().max(300)).max(10).optional(),
    context: z.string().max(3000).optional(),
    repos: z.array(z.string().max(80)).max(6).optional(),
    verifyInRepo: z.array(z.string().max(300)).max(10).optional(),
  }).nullable().optional(),
  answers: z.record(z.string(), z.string()).optional(),   // 질문 id → 선택값(또는 직접 입력)
  assumptions: z.array(z.string()).optional(),            // 사용자가 수정한 가정
  includeStyleRules: z.boolean().default(false),          // 기본 꺼짐 = 중립
  provider: z.enum(["cloud", "local"]).nullable().optional(),
});
export type StudioRequest = z.infer<typeof StudioRequest>;

/** 코드 점검 결과 */
export const CheckResult = z.object({ id: z.string(), label: z.string(), ok: z.boolean(), detail: z.string() });
export type CheckResult = z.infer<typeof CheckResult>;
