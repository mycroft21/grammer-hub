import { desc, eq, sql } from "drizzle-orm";
import type { FeedbackRequest, LlmRewrite, Suggestion, Usage } from "@grammer-hub/core";
import type { Db } from "../client";
import { correctionRuns, drafts, feedbackEvents, runFinals, suggestions } from "../schema";
import { newId, sha256 } from "../ids";

export interface CreateDraftInput {
  userId: string; profileId: string; textNfc: string; textMasked: string;
  maskMap: Record<string, string>; lang: string; storeText: boolean;
}

export function createDraft(db: Db, i: CreateDraftInput): string {
  const id = newId();
  db.insert(drafts).values({
    id, userId: i.userId, profileId: i.profileId, lang: i.lang, textHash: sha256(i.textNfc),
    textNfc: i.storeText ? i.textNfc : null,
    textMasked: i.storeText ? i.textMasked : null,
    maskMap: i.storeText ? i.maskMap : null,
  }).run();
  return id;
}

export interface CreateRunInput { draftId: string; level: string; provider: string; model: string; promptVersion: string; profileVersionId: string | null }

export function createRun(db: Db, i: CreateRunInput): string {
  const id = newId();
  db.insert(correctionRuns).values({ id, ...i }).run();
  return id;
}

export function saveSuggestions(db: Db, runId: string, edits: Suggestion[], rewrites: (LlmRewrite & { index: number })[], dropped: { id: string; reason: string }[]): void {
  const rows = [
    ...edits.map((e) => ({
      id: e.id.length >= 8 ? `${runId}:${e.id}` : `${runId}:${e.id}`, runId, kind: "edit", start: e.start, end: e.end,
      original: e.original, replacement: e.replacement, category: e.category, severity: e.severity,
      reason: e.reason_ko, ruleRef: e.rule_ref, confidence: e.confidence, resolveMethod: e.resolveMethod,
    })),
    ...rewrites.map((r) => ({ id: `${runId}:rw${r.index}`, runId, kind: "rewrite", replacement: r.text, altIndex: r.index, altLabel: r.label, reason: r.rationale })),
    ...dropped.map((d) => ({ id: `${runId}:${d.id}`, runId, kind: "edit", replacement: "", dropped: true, dropReason: d.reason })),
  ];
  if (rows.length > 0) db.insert(suggestions).values(rows).run();
}

export function finishRun(db: Db, runId: string, usage: Usage, status: "ok" | "error", errorCode?: string): void {
  db.update(correctionRuns).set({
    inputTokens: usage.inputTokens, cachedTokens: usage.cachedTokens, cacheWriteTokens: usage.cacheWriteTokens,
    outputTokens: usage.outputTokens, costUsd: usage.costUsd, ttfbMs: usage.ttfbMs, latencyMs: usage.latencyMs,
    status, errorCode: errorCode ?? null,
  }).where(eq(correctionRuns.id, runId)).run();
}

export function recordFeedback(db: Db, f: FeedbackRequest): string {
  const id = newId();
  db.insert(feedbackEvents).values({
    id, runId: f.runId, suggestionId: f.suggestionId ?? null, action: f.action,
    finalText: f.finalText ?? null, chosenIndex: f.chosenIndex ?? null, rejectedIndexes: f.rejectedIndexes ?? null,
  }).run();
  return id;
}

export function recordFinal(db: Db, runId: string, finalText: string): void {
  db.insert(runFinals).values({ runId, finalText, copiedAt: Date.now() })
    .onConflictDoUpdate({ target: runFinals.runId, set: { finalText, copiedAt: Date.now() } }).run();
}

export interface RunSummary {
  id: string; createdAt: number; level: string; provider: string; model: string; latencyMs: number | null;
  costUsd: number; cachedTokens: number; status: string; accepted: number; rejected: number; edits: number;
}

export function listRecentRuns(db: Db, limit = 50): RunSummary[] {
  const acc = db.$with("acc").as(
    db.select({
      runId: feedbackEvents.runId,
      accepted: sql<number>`sum(case when ${feedbackEvents.action} = 'accept' then 1 else 0 end)`.as("accepted"),
      rejected: sql<number>`sum(case when ${feedbackEvents.action} = 'reject' then 1 else 0 end)`.as("rejected"),
    }).from(feedbackEvents).groupBy(feedbackEvents.runId),
  );
  const cnt = db.$with("cnt").as(
    db.select({ runId: suggestions.runId, edits: sql<number>`count(*)`.as("edits") })
      .from(suggestions).where(sql`${suggestions.kind} = 'edit' and ${suggestions.dropped} = 0`).groupBy(suggestions.runId),
  );
  return db.with(acc, cnt).select({
    id: correctionRuns.id, createdAt: correctionRuns.createdAt, level: correctionRuns.level, provider: correctionRuns.provider,
    model: correctionRuns.model, latencyMs: correctionRuns.latencyMs, costUsd: correctionRuns.costUsd,
    cachedTokens: correctionRuns.cachedTokens, status: correctionRuns.status,
    accepted: sql<number>`coalesce(${acc.accepted}, 0)`, rejected: sql<number>`coalesce(${acc.rejected}, 0)`,
    edits: sql<number>`coalesce(${cnt.edits}, 0)`,
  }).from(correctionRuns)
    .leftJoin(acc, eq(acc.runId, correctionRuns.id))
    .leftJoin(cnt, eq(cnt.runId, correctionRuns.id))
    .orderBy(desc(correctionRuns.createdAt)).limit(limit).all();
}
