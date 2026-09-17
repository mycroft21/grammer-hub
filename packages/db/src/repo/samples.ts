import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { writingSamples } from "../schema";
import { newId } from "../ids";

export interface WritingSample { id: string; userId: string; text: string; chars: number; channel: string | null; audience: string | null; note: string | null; createdAt: number }

export function listSamples(db: Db, userId: string): WritingSample[] {
  return db.select().from(writingSamples).where(eq(writingSamples.userId, userId)).orderBy(desc(writingSamples.createdAt)).all();
}

export function addSample(db: Db, i: { userId: string; text: string; channel?: string | undefined; audience?: string | undefined; note?: string | undefined }): WritingSample {
  const text = i.text.normalize("NFC").trim();
  const row = { id: newId(), userId: i.userId, text, chars: text.length, channel: i.channel ?? null, audience: i.audience ?? null, note: i.note ?? null, createdAt: Date.now() };
  db.insert(writingSamples).values(row).run();
  return row;
}

export function deleteSample(db: Db, userId: string, id: string): boolean {
  return db.delete(writingSamples).where(and(eq(writingSamples.userId, userId), eq(writingSamples.id, id))).run().changes > 0;
}
