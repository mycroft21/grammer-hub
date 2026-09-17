import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { correctionRuns, drafts, feedbackEvents, suggestions } from "../schema";

export interface RunContext {
  runId: string; draftId: string; profileId: string; level: string; provider: string; model: string; createdAt: number;
  textNfc: string | null; textMasked: string | null; maskMap: Record<string, string> | null;
  suggestions: Array<{ id: string; kind: string; start: number | null; end: number | null; original: string | null; replacement: string; category: string | null; severity: string | null; reason: string | null; confidence: number | null; altIndex: number | null; altLabel: string | null; dropped: boolean }>;
  feedback: Array<{ suggestionId: string | null; action: string; finalText: string | null; chosenIndex: number | null; createdAt: number }>;
}

/** 최종본 비교·데이터셋 내보내기에 쓰는 실행 단위 컨텍스트. */
export function getRunContext(db: Db, runId: string): RunContext | null {
  const run = db.select().from(correctionRuns).where(eq(correctionRuns.id, runId)).get();
  if (!run) return null;
  const draft = db.select().from(drafts).where(eq(drafts.id, run.draftId)).get();
  if (!draft) return null;
  const sug = db.select().from(suggestions).where(eq(suggestions.runId, runId)).all();
  const fb = db.select().from(feedbackEvents).where(eq(feedbackEvents.runId, runId)).all();
  return {
    runId, draftId: draft.id, profileId: draft.profileId, level: run.level, provider: run.provider, model: run.model, createdAt: run.createdAt,
    textNfc: draft.textNfc, textMasked: draft.textMasked, maskMap: draft.maskMap,
    suggestions: sug.map((s) => ({ id: s.id, kind: s.kind, start: s.start, end: s.end, original: s.original, replacement: s.replacement, category: s.category, severity: s.severity, reason: s.reason, confidence: s.confidence, altIndex: s.altIndex, altLabel: s.altLabel, dropped: s.dropped })),
    feedback: fb.map((f) => ({ suggestionId: f.suggestionId, action: f.action, finalText: f.finalText, chosenIndex: f.chosenIndex, createdAt: f.createdAt })),
  };
}

export function listOkRunIds(db: Db, limit = 5000): string[] {
  return db.select({ id: correctionRuns.id }).from(correctionRuns).where(eq(correctionRuns.status, "ok")).limit(limit).all().map((r) => r.id);
}

/** 같은 run에 edit 이벤트가 이미 있으면 갱신, 없으면 추가. */
export function upsertEditFeedback(db: Db, runId: string, finalText: string, id: string): "inserted" | "updated" {
  const rows = db.select().from(feedbackEvents).where(eq(feedbackEvents.runId, runId)).all().filter((r) => r.action === "edit");
  if (rows[0]) { db.update(feedbackEvents).set({ finalText, createdAt: Date.now() }).where(eq(feedbackEvents.id, rows[0].id)).run(); return "updated"; }
  db.insert(feedbackEvents).values({ id, runId, action: "edit", finalText }).run();
  return "inserted";
}
