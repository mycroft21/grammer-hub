import { and, desc, eq, sql } from "drizzle-orm";
import type { CheckResult, PromptSpec, RenderedPrompt } from "@grammer-hub/core";
import type { Db } from "../client";
import { promptEvents, promptVersions, prompts } from "../schema";
import { newId } from "../ids";

export interface PromptRow {
  id: string; userId: string; title: string; purpose: string; subtype: string | null; language: string; goal: string;
  currentVersionId: string | null; archived: boolean; createdAt: number; updatedAt: number;
}
export interface PromptVersionRow {
  id: string; promptId: string; versionNo: number; spec: PromptSpec; rendered: RenderedPrompt; checks: CheckResult[];
  source: string; slot: string | null; studioVersion: string; provider: string | null; model: string | null;
  inputTokens: number; cachedTokens: number; outputTokens: number; costUsd: number; latencyMs: number | null; createdAt: number;
}
export interface PromptSummary extends PromptRow { versionCount: number; passed: number; total: number; variables: string[] }

export interface SaveVersionInput {
  spec: PromptSpec; rendered: RenderedPrompt; checks: CheckResult[]; source: "generate" | "regenerate" | "edit"; slot?: string | null;
  studioVersion: string; provider?: string | null; model?: string | null;
  usage?: { inputTokens: number; cachedTokens: number; outputTokens: number; costUsd: number; latencyMs: number } | null;
}

const toVersion = (r: typeof promptVersions.$inferSelect): PromptVersionRow => ({
  ...r, spec: r.spec as unknown as PromptSpec, rendered: r.rendered as unknown as RenderedPrompt, checks: r.checks as CheckResult[],
});

/** 새 프롬프트 + 첫 버전. */
export function createPrompt(db: Db, i: { userId: string; purpose: string; subtype: string | null; language: string; goal: string } & SaveVersionInput): { prompt: PromptRow; version: PromptVersionRow } {
  const id = newId();
  const t = Date.now();
  db.insert(prompts).values({ id, userId: i.userId, title: i.spec.title, purpose: i.purpose, subtype: i.subtype, language: i.language, goal: i.goal, currentVersionId: null, archived: false, createdAt: t, updatedAt: t }).run();
  const version = addVersion(db, id, i);
  const prompt = getPrompt(db, i.userId, id)!;
  return { prompt, version };
}

/** 버전 추가 + 현재 버전 갱신 + 제목 동기화. */
export function addVersion(db: Db, promptId: string, i: SaveVersionInput): PromptVersionRow {
  const last = db.select({ n: sql<number>`coalesce(max(${promptVersions.versionNo}), 0)` }).from(promptVersions).where(eq(promptVersions.promptId, promptId)).get();
  const row = {
    id: newId(), promptId, versionNo: (last?.n ?? 0) + 1,
    spec: i.spec as unknown as Record<string, unknown>, rendered: i.rendered as unknown as Record<string, unknown>, checks: i.checks as unknown[],
    source: i.source, slot: i.slot ?? null, studioVersion: i.studioVersion, provider: i.provider ?? null, model: i.model ?? null,
    inputTokens: i.usage?.inputTokens ?? 0, cachedTokens: i.usage?.cachedTokens ?? 0, outputTokens: i.usage?.outputTokens ?? 0,
    costUsd: i.usage?.costUsd ?? 0, latencyMs: i.usage?.latencyMs ?? null, createdAt: Date.now(),
  };
  db.insert(promptVersions).values(row).run();
  db.update(prompts).set({ currentVersionId: row.id, title: i.spec.title, language: i.spec.language, updatedAt: Date.now() }).where(eq(prompts.id, promptId)).run();
  return toVersion(row as typeof promptVersions.$inferSelect);
}

export function getPrompt(db: Db, userId: string, id: string): PromptRow | null {
  return db.select().from(prompts).where(and(eq(prompts.userId, userId), eq(prompts.id, id))).get() ?? null;
}

export function getVersion(db: Db, versionId: string): PromptVersionRow | null {
  const r = db.select().from(promptVersions).where(eq(promptVersions.id, versionId)).get();
  return r ? toVersion(r) : null;
}

export function listVersions(db: Db, promptId: string): PromptVersionRow[] {
  return db.select().from(promptVersions).where(eq(promptVersions.promptId, promptId)).orderBy(desc(promptVersions.versionNo)).all().map(toVersion);
}

export function listPrompts(db: Db, userId: string, opts: { includeArchived?: boolean } = {}): PromptSummary[] {
  const rows = db.select().from(prompts).where(opts.includeArchived ? eq(prompts.userId, userId) : and(eq(prompts.userId, userId), eq(prompts.archived, false))).orderBy(desc(prompts.updatedAt)).all();
  return rows.map((p) => {
    const cur = p.currentVersionId ? getVersion(db, p.currentVersionId) : null;
    const cnt = db.select({ n: sql<number>`count(*)` }).from(promptVersions).where(eq(promptVersions.promptId, p.id)).get()?.n ?? 0;
    const checks = cur?.checks ?? [];
    return { ...p, versionCount: cnt, passed: checks.filter((c) => c.ok).length, total: checks.length, variables: cur?.rendered.variables ?? [] };
  });
}

export function setArchived(db: Db, userId: string, id: string, archived: boolean): boolean {
  return db.update(prompts).set({ archived, updatedAt: Date.now() }).where(and(eq(prompts.userId, userId), eq(prompts.id, id))).run().changes > 0;
}

export function renamePrompt(db: Db, userId: string, id: string, title: string): boolean {
  return db.update(prompts).set({ title: title.trim(), updatedAt: Date.now() }).where(and(eq(prompts.userId, userId), eq(prompts.id, id))).run().changes > 0;
}

export function deletePrompt(db: Db, userId: string, id: string): boolean {
  if (!getPrompt(db, userId, id)) return false;
  db.delete(promptEvents).where(eq(promptEvents.promptId, id)).run();
  db.delete(promptVersions).where(eq(promptVersions.promptId, id)).run();
  return db.delete(prompts).where(eq(prompts.id, id)).run().changes > 0;
}

export function recordPromptEvent(db: Db, i: { promptId: string; versionId?: string | null; action: string; slot?: string | null; payload?: Record<string, unknown> | null }): void {
  db.insert(promptEvents).values({ id: newId(), promptId: i.promptId, versionId: i.versionId ?? null, action: i.action, slot: i.slot ?? null, payload: i.payload ?? null, createdAt: Date.now() }).run();
}

/** 보관함 통계: 단계별 수, 복사 횟수, 자주 고치는 슬롯. */
export function promptStats(db: Db, userId: string): { byPurpose: Record<string, number>; copies: number; slotEdits: Record<string, number> } {
  const rows = db.select({ purpose: prompts.purpose, n: sql<number>`count(*)` }).from(prompts).where(and(eq(prompts.userId, userId), eq(prompts.archived, false))).groupBy(prompts.purpose).all();
  const ev = db.select({ action: promptEvents.action, slot: promptEvents.slot, n: sql<number>`count(*)` }).from(promptEvents)
    .innerJoin(prompts, eq(promptEvents.promptId, prompts.id)).where(eq(prompts.userId, userId)).groupBy(promptEvents.action, promptEvents.slot).all();
  const slotEdits: Record<string, number> = {};
  let copies = 0;
  for (const e of ev) {
    if (e.action === "copy" || e.action === "fill") copies += e.n;
    if ((e.action === "regenerate" || e.action === "edit") && e.slot) slotEdits[e.slot] = (slotEdits[e.slot] ?? 0) + e.n;
  }
  return { byPurpose: Object.fromEntries(rows.map((r) => [r.purpose, r.n])), copies, slotEdits };
}
