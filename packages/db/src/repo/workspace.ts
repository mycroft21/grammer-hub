import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { userWorkspaceOverlays } from "../schema";

/** 내 작업 공간(검증 전 원본). 없으면 null. 읽는 쪽이 core의 WorkspaceOverlay로 다시 검증한다. */
export function getWorkspaceOverlay(db: Db, userId: string): Record<string, unknown> | null {
  return db.select().from(userWorkspaceOverlays).where(eq(userWorkspaceOverlays.userId, userId)).get()?.overlay ?? null;
}

/** 본인 행을 덮어쓴다(한 사람 한 행). */
export function saveWorkspaceOverlay(db: Db, userId: string, overlay: Record<string, unknown>): void {
  const t = Date.now();
  db.insert(userWorkspaceOverlays).values({ userId, overlay, updatedAt: t })
    .onConflictDoUpdate({ target: userWorkspaceOverlays.userId, set: { overlay, updatedAt: t } }).run();
}
