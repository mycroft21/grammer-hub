import { z } from "zod";

/**
 * 상위 축 = 개발 생애주기 단계. 조사 → 계획 → 개발 → 검토. 그 밖은 general.
 * 각 단계의 출력은 다음 단계의 입력이 되도록 규격(handoff)을 갖는다.
 */
export const Purpose = z.enum(["investigate", "plan", "build", "review", "general"]);
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
  title: z.string(),
  role: z.string(),
  goal: z.string(),
  success_criteria: z.array(z.string()),
  inputs: z.array(InputVar),
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
    role: z.string(), goal: z.string(), success_criteria: z.string(), inputs: z.string(),
    hard_rules: z.string(), process: z.string(), output_contract: z.string(), self_check: z.string(), failure_guards: z.string(),
  }),
});
export type PromptSpec = z.infer<typeof PromptSpec>;

export const PromptSpecStrict = PromptSpec.extend({
  title: z.string().min(2).max(60),
  role: z.string().min(10).max(400),
  goal: z.string().min(10).max(600),
  success_criteria: z.array(z.string().min(5).max(200)).min(2).max(7),
  inputs: z.array(InputVar).max(8),
  hard_rules: z.array(z.string().min(3).max(200)).max(7),
  process: z.array(z.string().min(3).max(200)).max(8).nullable(),
  self_check: z.array(z.string().min(3).max(200)).min(2).max(8),
  failure_guards: z.array(z.string().min(3).max(200)).max(6),
  examples: z.array(z.object({ input: z.string().max(1500), output: z.string().max(1500) })).max(2).nullable(),
});

/** 슬롯 이름(스트리밍 이벤트·블록 재생성 단위). rationale은 별도 취급. */
export const SLOT_KEYS = ["title", "role", "goal", "success_criteria", "inputs", "context", "hard_rules", "process", "output_contract", "self_check", "failure_guards", "clarify_policy", "examples"] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];
export const SLOT_KO: Record<SlotKey, string> = {
  title: "제목", role: "역할", goal: "목표", success_criteria: "성공 기준", inputs: "입력", context: "맥락",
  hard_rules: "절대 규칙", process: "과정", output_contract: "출력 형식", self_check: "자기 점검",
  failure_guards: "방어 지침", clarify_policy: "모호할 때", examples: "예시",
};

/** 의도 정리 단계의 출력: 바로 발행 가능(ready)하거나 선택형 질문(ask). */
export const PlanQuestion = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.object({ value: z.string(), label: z.string() })),
  allow_other: z.boolean(),
  why: z.string(),
});
export type PlanQuestion = z.infer<typeof PlanQuestion>;

export const PlanResult = z.object({
  mode: z.enum(["ready", "ask"]),
  summary: z.string(),                         // 모델이 이해한 목표 한 문장
  assumptions: z.array(z.string()),            // ready일 때 명시할 가정
  questions: z.array(PlanQuestion),            // ask일 때 최대 3개
  subtype: z.string().nullable(),              // 분류 체계의 세부 유형 id(추정)
});
export type PlanResult = z.infer<typeof PlanResult>;
export const PlanResultStrict = PlanResult.extend({ questions: z.array(PlanQuestion).max(3) });

/** 만들기 요청 */
export const StudioRequest = z.object({
  purpose: Purpose,
  subtype: z.string().nullable().optional(),
  goal: z.string().min(4).max(2000),
  length: PromptLength.default("standard"),
  clarify: ClarifyPolicy.default("ask_first"),
  promptLanguage: PromptLanguage.default("ko"),               // en = 지시문 영어, 답변은 한국어
  answers: z.record(z.string(), z.string()).optional(),   // 질문 id → 선택값(또는 직접 입력)
  assumptions: z.array(z.string()).optional(),            // 사용자가 수정한 가정
  includeStyleRules: z.boolean().default(false),          // 기본 꺼짐 = 중립
  provider: z.enum(["cloud", "local"]).nullable().optional(),
});
export type StudioRequest = z.infer<typeof StudioRequest>;

/** 코드 점검 결과 */
export const CheckResult = z.object({ id: z.string(), label: z.string(), ok: z.boolean(), detail: z.string() });
export type CheckResult = z.infer<typeof CheckResult>;
