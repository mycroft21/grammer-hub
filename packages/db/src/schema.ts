import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = () => Date.now();

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: integer("created_at").notNull().$defaultFn(now),
});

export const situationProfiles = sqliteTable("situation_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  audience: text("audience").notNull(),
  channel: text("channel").notNull(),
  lang: text("lang").notNull(),
  honorific: text("honorific").notNull(),
  formality: integer("formality").notNull(),
  length: text("length").notNull(),
  intent: text("intent").notNull(),
  tone: text("tone").notNull(),
  notes: text("notes"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
});

export const styleRules = sqliteTable("style_rules", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  scope: text("scope", { mode: "json" }).notNull().$type<Record<string, string>>().default({}),
  alpha: real("alpha").notNull().default(1),
  beta: real("beta").notNull().default(1),
  confidence: real("confidence").notNull().default(0.5),
  status: text("status").notNull().default("active"),
  evidenceIds: text("evidence_ids", { mode: "json" }).notNull().$type<string[]>().default([]),
  createdBy: text("created_by").notNull().default("user"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
}, (t) => [index("style_rules_user_status").on(t.userId, t.status)]);

export const profileVersions = sqliteTable("profile_versions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  snapshot: text("snapshot", { mode: "json" }).notNull().$type<unknown>(),
  hash: text("hash").notNull(),
  activatedAt: integer("activated_at"),
});

export const personalDictionary = sqliteTable("personal_dictionary", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  term: text("term").notNull(),
  note: text("note"),
  mask: integer("mask", { mode: "boolean" }).notNull().default(false),
});

export const drafts = sqliteTable("drafts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  profileId: text("profile_id").notNull(),
  textNfc: text("text_nfc"),
  textMasked: text("text_masked"),
  maskMap: text("mask_map", { mode: "json" }).$type<Record<string, string>>(),
  textHash: text("text_hash").notNull(),
  lang: text("lang").notNull(),
  createdAt: integer("created_at").notNull().$defaultFn(now),
});

export const correctionRuns = sqliteTable("correction_runs", {
  id: text("id").primaryKey(),
  draftId: text("draft_id").notNull().references(() => drafts.id),
  level: text("level").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  profileVersionId: text("profile_version_id"),
  inputTokens: integer("input_tokens").notNull().default(0),
  cachedTokens: integer("cached_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  ttfbMs: integer("ttfb_ms"),
  latencyMs: integer("latency_ms"),
  status: text("status").notNull().default("running"),
  errorCode: text("error_code"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
}, (t) => [index("correction_runs_created").on(t.createdAt)]);

export const suggestions = sqliteTable("suggestions", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => correctionRuns.id),
  kind: text("kind").notNull(), // edit | rewrite
  start: integer("start"),
  end: integer("end"),
  original: text("original"),
  replacement: text("replacement").notNull(),
  category: text("category"),
  severity: text("severity"),
  reason: text("reason"),
  ruleRef: text("rule_ref"),
  confidence: real("confidence"),
  altIndex: integer("alt_index"),
  altLabel: text("alt_label"),
  resolveMethod: text("resolve_method"),
  dropped: integer("dropped", { mode: "boolean" }).notNull().default(false),
  dropReason: text("drop_reason"),
}, (t) => [index("suggestions_run").on(t.runId)]);

export const feedbackEvents = sqliteTable("feedback_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => correctionRuns.id),
  suggestionId: text("suggestion_id"),
  action: text("action").notNull(), // accept | reject | edit | prefer | mute
  finalText: text("final_text"),
  chosenIndex: integer("chosen_index"),
  rejectedIndexes: text("rejected_indexes", { mode: "json" }).$type<number[]>(),
  createdAt: integer("created_at").notNull().$defaultFn(now),
}, (t) => [index("feedback_events_run").on(t.runId)]);

export const runFinals = sqliteTable("run_finals", {
  runId: text("run_id").primaryKey().references(() => correctionRuns.id),
  finalText: text("final_text").notNull(),
  copiedAt: integer("copied_at").notNull().$defaultFn(now),
});

/** 사용자가 직접 넣은 "내 글" 샘플. Phase 2 규칙 증류·예시 검색의 시드. */
export const writingSamples = sqliteTable("writing_samples", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  chars: integer("chars").notNull(),
  channel: text("channel"),
  audience: text("audience"),
  note: text("note"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
});

// ─────────────────────────── 프롬프트 스튜디오 ───────────────────────────
/** 보관함의 프롬프트 한 건. 실제 내용은 버전에 있고, 여기엔 식별·분류·현재 버전만. */
export const prompts = sqliteTable("prompts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  purpose: text("purpose").notNull(),            // investigate | plan | build | review | general
  subtype: text("subtype"),
  language: text("language").notNull().default("ko"), // 프롬프트 본문 언어(ko | en)
  goal: text("goal").notNull(),                  // 사용자가 입력한 목표 문장(마스킹 해제본)
  ticketKey: text("ticket_key"),                 // 티켓에서 만들었으면 이슈 키(EP-1174)
  currentVersionId: text("current_version_id"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
}, (t) => [index("prompts_user_updated").on(t.userId, t.updatedAt)]);

/** 스펙·렌더 결과의 불변 스냅샷. 블록 재생성·직접 수정마다 새 버전. */
export const promptVersions = sqliteTable("prompt_versions", {
  id: text("id").primaryKey(),
  promptId: text("prompt_id").notNull().references(() => prompts.id),
  versionNo: integer("version_no").notNull(),
  spec: text("spec", { mode: "json" }).notNull().$type<Record<string, unknown>>(),
  rendered: text("rendered", { mode: "json" }).notNull().$type<Record<string, unknown>>(),
  checks: text("checks", { mode: "json" }).notNull().$type<unknown[]>(),
  source: text("source").notNull(),              // generate | regenerate | edit
  slot: text("slot"),                            // regenerate/edit 대상 슬롯
  studioVersion: text("studio_version").notNull(),
  provider: text("provider"),
  model: text("model"),
  inputTokens: integer("input_tokens").notNull().default(0),
  cachedTokens: integer("cached_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  latencyMs: integer("latency_ms"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
}, (t) => [index("prompt_versions_prompt").on(t.promptId, t.versionNo)]);

/** 사용 신호. 어떤 프롬프트가 실제로 복사·채워 쓰이는지, 어느 슬롯을 자주 고치는지. */
export const promptEvents = sqliteTable("prompt_events", {
  id: text("id").primaryKey(),
  promptId: text("prompt_id").notNull().references(() => prompts.id),
  versionId: text("version_id"),
  action: text("action").notNull(),              // copy | fill | regenerate | edit | archive
  slot: text("slot"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at").notNull().$defaultFn(now),
}, (t) => [index("prompt_events_prompt").on(t.promptId)]);
