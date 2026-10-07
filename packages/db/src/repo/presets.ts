import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { studioPresets } from "../schema";
import { newId } from "../ids";

export type PresetRow = typeof studioPresets.$inferSelect;

/** 본인 프리셋, 최근 수정순. */
export function listPresets(db: Db, userId: string): PresetRow[] {
  return db.select().from(studioPresets).where(eq(studioPresets.userId, userId)).orderBy(desc(studioPresets.updatedAt)).all();
}

/** id가 없으면 새로 만들고, 있으면 본인 것만 이름·설정을 바꾼다. 남의 id면 null. */
export function savePreset(db: Db, i: { userId: string; id?: string | null; name: string; settings: Record<string, unknown> }): PresetRow | null {
  const t = Date.now();
  if (i.id) {
    const changed = db.update(studioPresets).set({ name: i.name, settings: i.settings, updatedAt: t }).where(and(eq(studioPresets.userId, i.userId), eq(studioPresets.id, i.id))).run().changes;
    return changed ? db.select().from(studioPresets).where(and(eq(studioPresets.userId, i.userId), eq(studioPresets.id, i.id))).get() ?? null : null;
  }
  const row = { id: newId(), userId: i.userId, name: i.name, settings: i.settings, createdAt: t, updatedAt: t };
  db.insert(studioPresets).values(row).run();
  return row;
}

export function deletePreset(db: Db, userId: string, id: string): boolean {
  return db.delete(studioPresets).where(and(eq(studioPresets.userId, userId), eq(studioPresets.id, id))).run().changes > 0;
}
