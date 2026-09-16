import { and, eq } from "drizzle-orm";
import { DEFAULT_PROFILES, SituationProfile, type SituationProfileInput } from "@grammer-hub/core";
import type { Db } from "../client";
import { situationProfiles } from "../schema";

function toDomain(row: typeof situationProfiles.$inferSelect): SituationProfile {
  return SituationProfile.parse({ ...row, notes: row.notes ?? undefined });
}

export function listProfiles(db: Db, userId: string): SituationProfile[] {
  return db.select().from(situationProfiles).where(eq(situationProfiles.userId, userId)).all().map(toDomain);
}

export function getProfile(db: Db, userId: string, id: string): SituationProfile | null {
  const row = db.select().from(situationProfiles).where(and(eq(situationProfiles.userId, userId), eq(situationProfiles.id, id))).get();
  return row ? toDomain(row) : null;
}

export function upsertProfile(db: Db, input: SituationProfileInput): SituationProfile {
  const p = SituationProfile.parse(input);
  const values = { ...p, notes: p.notes ?? null, updatedAt: Date.now() };
  db.insert(situationProfiles).values(values)
    .onConflictDoUpdate({ target: situationProfiles.id, set: values }).run();
  if (p.isDefault) {
    db.update(situationProfiles).set({ isDefault: false })
      .where(and(eq(situationProfiles.userId, p.userId), eq(situationProfiles.isDefault, true))).run();
    db.update(situationProfiles).set({ isDefault: true }).where(eq(situationProfiles.id, p.id)).run();
  }
  return p;
}

export function deleteProfile(db: Db, userId: string, id: string): boolean {
  const r = db.delete(situationProfiles).where(and(eq(situationProfiles.userId, userId), eq(situationProfiles.id, id))).run();
  return r.changes > 0;
}

/** 프로필이 하나도 없을 때 기본 6종을 넣는다. 반환값은 삽입 수. */
export function seedDefaultProfiles(db: Db, userId: string): number {
  if (listProfiles(db, userId).length > 0) return 0;
  for (const p of DEFAULT_PROFILES) upsertProfile(db, { ...p, userId });
  return DEFAULT_PROFILES.length;
}
