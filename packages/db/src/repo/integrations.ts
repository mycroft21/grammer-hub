import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { userIntegrations } from "../schema";

export type IntegrationRow = typeof userIntegrations.$inferSelect;
export type IntegrationKind = IntegrationRow["kind"];

export function getIntegration(db: Db, userId: string, kind: IntegrationKind): IntegrationRow | null {
  return db.select().from(userIntegrations).where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.kind, kind))).get() ?? null;
}

/** 본인 행을 만들거나 바꾼다(한 사람·종류당 한 행). createdAt은 처음 연결한 시각을 유지한다. */
export function saveIntegration(db: Db, row: Omit<IntegrationRow, "createdAt" | "updatedAt">): void {
  const t = Date.now();
  const { userId: _u, kind: _k, ...rest } = row;
  db.insert(userIntegrations).values({ ...row, createdAt: t, updatedAt: t })
    .onConflictDoUpdate({ target: [userIntegrations.userId, userIntegrations.kind], set: { ...rest, updatedAt: t } }).run();
}

export function deleteIntegration(db: Db, userId: string, kind: IntegrationKind): boolean {
  return db.delete(userIntegrations).where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.kind, kind))).run().changes > 0;
}

/**
 * refresh 결과 저장: 갱신을 시작할 때의 refresh token(암호문)이 아직 그대로일 때만 바꾼다.
 * 그 사이 연결을 끊었거나 다시 연결했으면 0행 — 진행 중이던 refresh가 끊은 연결을 되살리거나 새 연결을 덮지 않게.
 */
export function updateIntegrationTokens(db: Db, userId: string, kind: IntegrationKind, expectRefreshEnc: string, t: Pick<IntegrationRow, "accessTokenEnc" | "accessExpiresAt" | "refreshTokenEnc" | "scopes">): boolean {
  return db.update(userIntegrations).set({ ...t, updatedAt: Date.now() })
    .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.kind, kind), eq(userIntegrations.refreshTokenEnc, expectRefreshEnc))).run().changes > 0;
}
