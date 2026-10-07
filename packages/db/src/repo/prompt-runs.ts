import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { promptRuns } from "../schema";
import { newId } from "../ids";

export type PromptRunRow = typeof promptRuns.$inferSelect;
export type PromptRunKind = "plan" | "ticket" | "generate" | "regenerate";
export interface PromptRunInput {
  userId: string; kind: PromptRunKind; provider: string; model: string; status: "ok" | "error"; studioVersion: string;
  purpose?: string | null; subtype?: string | null; ticketKey?: string | null; runtime?: string | null; language?: string | null;
  errorCode?: string | null; checksPassed?: number | null; checksTotal?: number | null;
  usage?: { inputTokens: number; cachedTokens: number; outputTokens: number; costUsd: number; latencyMs: number } | null;
  latencyMs?: number | null; promptId?: string | null;
}

/** 실행 한 건을 남기고 id를 돌려준다. 원문은 받지 않는다. */
export function recordPromptRun(db: Db, i: PromptRunInput): string {
  const id = newId();
  db.insert(promptRuns).values({
    id, userId: i.userId, kind: i.kind, purpose: i.purpose ?? null, subtype: i.subtype ?? null, ticketKey: i.ticketKey ?? null, runtime: i.runtime ?? null, language: i.language ?? null,
    provider: i.provider, model: i.model, status: i.status, errorCode: i.errorCode ?? null, checksPassed: i.checksPassed ?? null, checksTotal: i.checksTotal ?? null,
    inputTokens: i.usage?.inputTokens ?? 0, cachedTokens: i.usage?.cachedTokens ?? 0, outputTokens: i.usage?.outputTokens ?? 0, costUsd: i.usage?.costUsd ?? 0,
    latencyMs: i.usage?.latencyMs ?? i.latencyMs ?? null, studioVersion: i.studioVersion, promptId: i.promptId ?? null, createdAt: Date.now(),
  }).run();
  return id;
}

/** 본인 실행만, 최근순. */
export function listPromptRuns(db: Db, userId: string, limit = 50): PromptRunRow[] {
  return db.select().from(promptRuns).where(eq(promptRuns.userId, userId)).orderBy(desc(promptRuns.createdAt)).limit(limit).all();
}

/** 보관한 프롬프트를 실행 기록에 잇는다. 본인 실행일 때만 바뀐다. */
export function linkPromptRun(db: Db, userId: string, runId: string, promptId: string): boolean {
  return db.update(promptRuns).set({ promptId }).where(and(eq(promptRuns.id, runId), eq(promptRuns.userId, userId))).run().changes > 0;
}
