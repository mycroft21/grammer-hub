import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../client";
import { correctionRuns, drafts, feedbackEvents, runFinals, suggestions, writingSamples } from "../schema";

export interface WeeklyPoint { weekStart: number; runs: number; accepted: number; rejected: number; costUsd: number; edits: number }
export interface CategoryPoint { category: string; accepted: number; rejected: number }
export interface RecentRunPoint { id: string; createdAt: number; latencyMs: number | null; costUsd: number; level: string; cachedTokens: number; inputTokens: number }
export interface Collection { samples: number; sampleChars: number; feedback: Record<string, number>; finals: number; editPairs: number; runsOk: number }
export interface Stats { weekly: WeeklyPoint[]; byCategory: CategoryPoint[]; recent: RecentRunPoint[]; collection: Collection }

const WEEK = 7 * 86400_000;
/** 월요일 00:00(로컬이 아닌 UTC 기준 단순화) 시작 주차 키 */
function weekStartOf(ts: number): number {
  const d = new Date(ts); const day = (d.getUTCDay() + 6) % 7; // 월=0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

/** 기록 그래프 재료. userId를 주면 그 사람의 실행·피드백·샘플만 센다(팀 서버). 모든 집계는 실행 → 초안 → userId로 잇는다. */
export function getStats(db: Db, weeks = 8, recentN = 30, userId?: string): Stats {
  const since = weekStartOf(Date.now()) - (weeks - 1) * WEEK;
  const mine = userId ? eq(drafts.userId, userId) : undefined;

  const runs = db.select({ id: correctionRuns.id, createdAt: correctionRuns.createdAt, costUsd: correctionRuns.costUsd, status: correctionRuns.status })
    .from(correctionRuns).innerJoin(drafts, eq(drafts.id, correctionRuns.draftId)).where(and(gte(correctionRuns.createdAt, since), mine)).all();
  const fb = db.select({ runId: feedbackEvents.runId, action: feedbackEvents.action, createdAt: feedbackEvents.createdAt })
    .from(feedbackEvents).innerJoin(correctionRuns, eq(correctionRuns.id, feedbackEvents.runId)).innerJoin(drafts, eq(drafts.id, correctionRuns.draftId))
    .where(and(gte(feedbackEvents.createdAt, since), mine)).all();
  const editCounts = db.select({ runId: suggestions.runId, n: sql<number>`count(*)` }).from(suggestions)
    .innerJoin(correctionRuns, eq(correctionRuns.id, suggestions.runId)).innerJoin(drafts, eq(drafts.id, correctionRuns.draftId))
    .where(and(sql`${suggestions.kind} = 'edit' and ${suggestions.dropped} = 0`, mine)).groupBy(suggestions.runId).all();
  const editByRun = new Map(editCounts.map((r) => [r.runId, r.n]));

  const buckets = new Map<number, WeeklyPoint>();
  for (let i = 0; i < weeks; i++) { const ws = since + i * WEEK; buckets.set(ws, { weekStart: ws, runs: 0, accepted: 0, rejected: 0, costUsd: 0, edits: 0 }); }
  for (const r of runs) {
    const b = buckets.get(weekStartOf(r.createdAt)); if (!b) continue;
    if (r.status === "ok") { b.runs++; b.costUsd += r.costUsd; b.edits += editByRun.get(r.id) ?? 0; }
  }
  for (const f of fb) {
    const b = buckets.get(weekStartOf(f.createdAt)); if (!b) continue;
    if (f.action === "accept") b.accepted++; else if (f.action === "reject") b.rejected++;
  }

  const byCategory = db.select({
    category: suggestions.category,
    accepted: sql<number>`sum(case when ${feedbackEvents.action} = 'accept' then 1 else 0 end)`,
    rejected: sql<number>`sum(case when ${feedbackEvents.action} = 'reject' then 1 else 0 end)`,
  }).from(feedbackEvents).innerJoin(suggestions, eq(suggestions.id, feedbackEvents.suggestionId))
    .innerJoin(correctionRuns, eq(correctionRuns.id, suggestions.runId)).innerJoin(drafts, eq(drafts.id, correctionRuns.draftId))
    .where(and(sql`${suggestions.category} is not null`, mine)).groupBy(suggestions.category).all()
    .map((r) => ({ category: r.category ?? "", accepted: r.accepted, rejected: r.rejected }))
    .sort((a, b) => (b.accepted + b.rejected) - (a.accepted + a.rejected));

  const recent = db.select({ id: correctionRuns.id, createdAt: correctionRuns.createdAt, latencyMs: correctionRuns.latencyMs, costUsd: correctionRuns.costUsd, level: correctionRuns.level, cachedTokens: correctionRuns.cachedTokens, inputTokens: correctionRuns.inputTokens })
    .from(correctionRuns).innerJoin(drafts, eq(drafts.id, correctionRuns.draftId)).where(and(eq(correctionRuns.status, "ok"), mine)).orderBy(desc(correctionRuns.createdAt)).limit(recentN).all().reverse();

  const s = db.select({ n: sql<number>`count(*)`, chars: sql<number>`coalesce(sum(${writingSamples.chars}), 0)` }).from(writingSamples).where(userId ? eq(writingSamples.userId, userId) : undefined).get();
  const fbAll = db.select({ action: feedbackEvents.action, n: sql<number>`count(*)` }).from(feedbackEvents)
    .innerJoin(correctionRuns, eq(correctionRuns.id, feedbackEvents.runId)).innerJoin(drafts, eq(drafts.id, correctionRuns.draftId)).where(mine).groupBy(feedbackEvents.action).all();
  const finals = db.select({ n: sql<number>`count(*)` }).from(runFinals)
    .innerJoin(correctionRuns, eq(correctionRuns.id, runFinals.runId)).innerJoin(drafts, eq(drafts.id, correctionRuns.draftId)).where(mine).get();
  const runsOk = db.select({ n: sql<number>`count(*)` }).from(correctionRuns).innerJoin(drafts, eq(drafts.id, correctionRuns.draftId)).where(and(eq(correctionRuns.status, "ok"), mine)).get();
  const feedback: Record<string, number> = {};
  for (const f of fbAll) feedback[f.action] = f.n;
  const collection: Collection = {
    samples: s?.n ?? 0, sampleChars: s?.chars ?? 0, feedback, finals: finals?.n ?? 0,
    editPairs: feedback["edit"] ?? 0, runsOk: runsOk?.n ?? 0,
  };

  return { weekly: [...buckets.values()], byCategory, recent, collection };
}

/** 진행 표시용 예상 소요: 같은 provider·강도의 최근 성공 실행 지연 중앙값(ms). 표본이 3개 미만이면 null. */
export function expectedLatencyMs(db: Db, provider: string, level: string, n = 15): number | null {
  const rows = db.select({ ms: correctionRuns.latencyMs }).from(correctionRuns)
    .where(sql`${correctionRuns.status} = 'ok' and ${correctionRuns.provider} = ${provider} and ${correctionRuns.level} = ${level} and ${correctionRuns.latencyMs} is not null`)
    .orderBy(desc(correctionRuns.createdAt)).limit(n).all().map((r) => r.ms as number).sort((a, b) => a - b);
  if (rows.length < 3) return null;
  return rows[Math.floor(rows.length / 2)] ?? null;
}
