import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../client";
import { correctionRuns, drafts, feedbackEvents, promptEvents, promptVersions, prompts, runFinals, suggestions, users } from "../schema";
import { getStats, type Stats } from "./stats";

/**
 * 팀 화면(관리자) 재료: 사람별 사용량·수락률·비용 + 팀 전체 주간 추이. 기간은 최근 n주.
 * 텍스트(원문·카드·최종본)는 전혀 읽지 않는다 — 건수·토큰·비용·시각만. 외부 테스트 분석(0단계 텔레메트리)의 단위가 이 표다.
 */
export interface TeamMember {
  userId: string; email: string;
  runsOk: number; runsError: number; lastActiveAt: number | null;
  costUsd: number; inputTokens: number; cachedTokens: number; outputTokens: number; latencyAvgMs: number | null;
  cards: number;                 // 드롭되지 않은 변경 카드 수(제안)
  accepted: number; rejected: number; muted: number;
  edits: number;                 // 직접 수정(복사 시 제안 적용본과 최종본이 다른 실행)
  finals: number;                // 복사(최종본 기록) 수
  prefers: number;               // 톤 대안 선택
  prompts: number; promptVersions: number; promptRegens: number; promptCopies: number; studioCostUsd: number;
}
export interface WeeklyActive { weekStart: number; users: number }
export interface TeamStats { since: number; weeks: number; members: TeamMember[]; team: Stats; weeklyActive: WeeklyActive[] }

const WEEK = 7 * 86400_000;
function weekStartOf(ts: number): number {
  const d = new Date(ts); const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

export function getTeamStats(db: Db, weeks = 8): TeamStats {
  const since = weekStartOf(Date.now()) - (weeks - 1) * WEEK;
  const byUser = new Map<string, TeamMember>();
  const member = (userId: string): TeamMember => {
    let m = byUser.get(userId);
    if (!m) {
      m = { userId, email: "", runsOk: 0, runsError: 0, lastActiveAt: null, costUsd: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, latencyAvgMs: null, cards: 0, accepted: 0, rejected: 0, muted: 0, edits: 0, finals: 0, prefers: 0, prompts: 0, promptVersions: 0, promptRegens: 0, promptCopies: 0, studioCostUsd: 0 };
      byUser.set(userId, m);
    }
    return m;
  };
  for (const u of db.select({ id: users.id, email: users.email }).from(users).all()) member(u.id).email = u.email;

  // 실행: 상태별 건수·비용·토큰·평균 지연·마지막 활동(초안 → userId)
  const runRows = db.select({
    userId: drafts.userId, status: correctionRuns.status, n: sql<number>`count(*)`,
    cost: sql<number>`coalesce(sum(${correctionRuns.costUsd}), 0)`, inp: sql<number>`coalesce(sum(${correctionRuns.inputTokens}), 0)`,
    cached: sql<number>`coalesce(sum(${correctionRuns.cachedTokens}), 0)`, out: sql<number>`coalesce(sum(${correctionRuns.outputTokens}), 0)`,
    lat: sql<number | null>`avg(${correctionRuns.latencyMs})`, last: sql<number>`max(${correctionRuns.createdAt})`,
  }).from(correctionRuns).innerJoin(drafts, eq(drafts.id, correctionRuns.draftId))
    .where(gte(correctionRuns.createdAt, since)).groupBy(drafts.userId, correctionRuns.status).all();
  for (const r of runRows) {
    const m = member(r.userId);
    if (r.status === "ok") { m.runsOk += r.n; m.costUsd += r.cost; m.inputTokens += r.inp; m.cachedTokens += r.cached; m.outputTokens += r.out; m.latencyAvgMs = r.lat == null ? null : Math.round(r.lat); }
    else if (r.status === "error") m.runsError += r.n;
    m.lastActiveAt = Math.max(m.lastActiveAt ?? 0, r.last) || null;
  }
  // 카드 수
  for (const r of db.select({ userId: drafts.userId, n: sql<number>`count(*)` }).from(suggestions)
    .innerJoin(correctionRuns, eq(correctionRuns.id, suggestions.runId)).innerJoin(drafts, eq(drafts.id, correctionRuns.draftId))
    .where(and(gte(correctionRuns.createdAt, since), sql`${suggestions.kind} = 'edit' and ${suggestions.dropped} = 0`)).groupBy(drafts.userId).all()) member(r.userId).cards = r.n;
  // 피드백
  for (const r of db.select({ userId: drafts.userId, action: feedbackEvents.action, n: sql<number>`count(*)` }).from(feedbackEvents)
    .innerJoin(correctionRuns, eq(correctionRuns.id, feedbackEvents.runId)).innerJoin(drafts, eq(drafts.id, correctionRuns.draftId))
    .where(gte(feedbackEvents.createdAt, since)).groupBy(drafts.userId, feedbackEvents.action).all()) {
    const m = member(r.userId);
    if (r.action === "accept") m.accepted = r.n; else if (r.action === "reject") m.rejected = r.n; else if (r.action === "mute") m.muted = r.n;
    else if (r.action === "edit") m.edits = r.n; else if (r.action === "prefer") m.prefers = r.n;
  }
  // 최종본(복사)
  for (const r of db.select({ userId: drafts.userId, n: sql<number>`count(*)` }).from(runFinals)
    .innerJoin(correctionRuns, eq(correctionRuns.id, runFinals.runId)).innerJoin(drafts, eq(drafts.id, correctionRuns.draftId))
    .where(gte(runFinals.copiedAt, since)).groupBy(drafts.userId).all()) member(r.userId).finals = r.n;
  // 프롬프트 스튜디오: 생성 건수·버전(재생성·수정)·비용·복사
  for (const r of db.select({ userId: prompts.userId, n: sql<number>`count(*)` }).from(prompts).where(gte(prompts.createdAt, since)).groupBy(prompts.userId).all()) member(r.userId).prompts = r.n;
  for (const r of db.select({ userId: prompts.userId, source: promptVersions.source, n: sql<number>`count(*)`, cost: sql<number>`coalesce(sum(${promptVersions.costUsd}), 0)` })
    .from(promptVersions).innerJoin(prompts, eq(prompts.id, promptVersions.promptId)).where(gte(promptVersions.createdAt, since)).groupBy(prompts.userId, promptVersions.source).all()) {
    const m = member(r.userId);
    m.promptVersions += r.n; m.studioCostUsd += r.cost;
    if (r.source === "regenerate") m.promptRegens += r.n;
    const last = db.select({ last: sql<number>`max(${promptVersions.createdAt})` }).from(promptVersions).innerJoin(prompts, eq(prompts.id, promptVersions.promptId)).where(eq(prompts.userId, r.userId)).get();
    if (last?.last) m.lastActiveAt = Math.max(m.lastActiveAt ?? 0, last.last);
  }
  for (const r of db.select({ userId: prompts.userId, n: sql<number>`count(*)` }).from(promptEvents)
    .innerJoin(prompts, eq(prompts.id, promptEvents.promptId)).where(and(gte(promptEvents.createdAt, since), sql`${promptEvents.action} in ('copy', 'fill')`)).groupBy(prompts.userId).all()) member(r.userId).promptCopies = r.n;

  // 주간 활성 사용자(그 주에 성공 실행이 있는 사람 수)
  const buckets = new Map<number, Set<string>>();
  for (let i = 0; i < weeks; i++) buckets.set(since + i * WEEK, new Set());
  for (const r of db.select({ userId: drafts.userId, at: correctionRuns.createdAt }).from(correctionRuns).innerJoin(drafts, eq(drafts.id, correctionRuns.draftId))
    .where(and(gte(correctionRuns.createdAt, since), eq(correctionRuns.status, "ok"))).all()) buckets.get(weekStartOf(r.at))?.add(r.userId);

  const members = [...byUser.values()].sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0) || a.email.localeCompare(b.email));
  return { since, weeks, members, team: getStats(db, weeks, 30), weeklyActive: [...buckets.entries()].map(([weekStart, s]) => ({ weekStart, users: s.size })) };
}

/** 팀 표를 CSV로(엑셀용 BOM). 텍스트 없음. */
export function teamStatsCsv(t: TeamStats): string {
  const head = ["email", "runs_ok", "runs_error", "last_active", "cost_usd", "input_tokens", "cached_tokens", "output_tokens", "latency_avg_ms", "cards", "accepted", "rejected", "muted", "accept_rate", "direct_edits", "finals", "clean_copy_rate", "prefers", "prompts", "prompt_versions", "prompt_regens", "prompt_copies", "studio_cost_usd"];
  const rows = t.members.map((m) => {
    const judged = m.accepted + m.rejected;
    return [m.email, m.runsOk, m.runsError, m.lastActiveAt ? new Date(m.lastActiveAt).toISOString() : "", m.costUsd.toFixed(4), m.inputTokens, m.cachedTokens, m.outputTokens, m.latencyAvgMs ?? "",
      m.cards, m.accepted, m.rejected, m.muted, judged ? (m.accepted / judged).toFixed(3) : "", m.edits, m.finals, m.finals ? ((m.finals - m.edits) / m.finals).toFixed(3) : "", m.prefers,
      m.prompts, m.promptVersions, m.promptRegens, m.promptCopies, m.studioCostUsd.toFixed(4)];
  });
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
