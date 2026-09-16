import { z } from "zod";

export const Category = z.enum([
  "SPACING", "SPELLING", "GRAMMAR", "PUNCTUATION", "HONORIFIC",
  "REGISTER", "WORD_CHOICE", "CLARITY", "CONCISENESS", "TONE",
]);
export type Category = z.infer<typeof Category>;
export const Severity = z.enum(["error", "warning", "style"]);
export type Severity = z.infer<typeof Severity>;
export const Level = z.enum(["L1", "L2", "L3"]);
export type Level = z.infer<typeof Level>;
export const ProviderId = z.enum(["cloud", "local"]);
export type ProviderId = z.infer<typeof ProviderId>;

/**
 * LLM이 내는 edit. 오프셋 없음: 원문 스팬을 그대로 인용한 앵커만 낸다.
 * 구조화 출력 API가 min/max/pattern 제약을 지원하지 않으므로 이 스키마에는 제약을 두지 않고,
 * 검증은 `LlmEditStrict`로 서버에서 한다.
 */
export const LlmEdit = z.object({
  id: z.string(),
  sentence_index: z.number().int(),
  original: z.string(),
  context_before: z.string(),
  context_after: z.string(),
  replacement: z.string(),
  category: Category,
  severity: Severity,
  reason_ko: z.string(),
  rule_ref: z.string().nullable(),
  confidence: z.number(),
});
export type LlmEdit = z.infer<typeof LlmEdit>;

export const LlmRewrite = z.object({
  label: z.string(),
  text: z.string(),
  rationale: z.string(),
});
export type LlmRewrite = z.infer<typeof LlmRewrite>;

export const PreservedFactsCheck = z.object({
  numbers: z.boolean(),
  dates: z.boolean(),
  commitments: z.boolean(),
});

/** 모델 출력 전체. `corrected_text`는 로컬 provider에서 생략 가능(서버가 합성). */
export const CorrectionOutput = z.object({
  corrected_text: z.string().nullable(),
  edits: z.array(LlmEdit),
  rewrites: z.array(LlmRewrite),
  reader_view: z.string().nullable(),
  preserved_facts_check: PreservedFactsCheck,
});
export type CorrectionOutput = z.infer<typeof CorrectionOutput>;

/** 서버측 엄격 검증 (구조화 출력 스키마에는 넣지 않는 제약). */
export const LlmEditStrict = LlmEdit.extend({
  original: z.string().min(1),
  reason_ko: z.string().min(1).max(400),
  confidence: z.number().min(0).max(1),
  sentence_index: z.number().int().min(0),
});
export const CorrectionOutputStrict = CorrectionOutput.extend({
  edits: z.array(LlmEditStrict).max(60),
  rewrites: z.array(LlmRewrite).max(3),
});

export const ResolveMethod = z.enum(["exact", "context", "fuzzy", "diff"]);
export type ResolveMethod = z.infer<typeof ResolveMethod>;

/** 앵커 해소 후 UI로 가는 제안. start/end는 NFC 원문(마스킹 해제 후)의 UTF-16 오프셋. */
export const Suggestion = LlmEdit.extend({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  resolveMethod: ResolveMethod,
});
export type Suggestion = z.infer<typeof Suggestion>;

export const CorrectRequest = z.object({
  text: z.string().min(1).max(4000),
  profileId: z.string().min(1),
  level: Level,
  provider: ProviderId.nullable().optional(),
  clientRequestId: z.string().uuid().optional(),
});
export type CorrectRequest = z.infer<typeof CorrectRequest>;

export const FeedbackAction = z.enum(["accept", "reject", "edit", "prefer", "mute"]);
export const FeedbackRequest = z.object({
  runId: z.string().min(1),
  suggestionId: z.string().min(1).optional(),
  action: FeedbackAction,
  finalText: z.string().optional(),
  chosenIndex: z.number().int().min(0).optional(),
  rejectedIndexes: z.array(z.number().int().min(0)).optional(),
});
export type FeedbackRequest = z.infer<typeof FeedbackRequest>;
