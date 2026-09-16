import { and, eq } from "drizzle-orm";
import { DictionaryEntry, StyleRule } from "@grammer-hub/core";
import type { Db } from "../client";
import { personalDictionary, styleRules } from "../schema";
import { newId } from "../ids";

/** exactOptionalPropertyTypes 하에서 zod partial 출력(undefined 포함)을 받기 위한 입력 타입 */
type Loose<T> = { [K in keyof T]?: T[K] | undefined };

export function listRules(db: Db, userId: string): StyleRule[] {
  return db.select().from(styleRules).where(eq(styleRules.userId, userId)).all()
    .map((r) => StyleRule.parse({ ...r, scope: r.scope ?? {} }));
}

export function upsertRule(db: Db, input: Loose<StyleRule> & { userId: string; text: string }): StyleRule {
  const rule = StyleRule.parse({ id: input.id ?? newId(), ...input });
  const values = { ...rule, scope: rule.scope as Record<string, string>, updatedAt: Date.now() };
  db.insert(styleRules).values(values).onConflictDoUpdate({ target: styleRules.id, set: values }).run();
  return rule;
}

export function deleteRule(db: Db, userId: string, id: string): boolean {
  return db.delete(styleRules).where(and(eq(styleRules.userId, userId), eq(styleRules.id, id))).run().changes > 0;
}

export function listDictionary(db: Db, userId: string): DictionaryEntry[] {
  return db.select().from(personalDictionary).where(eq(personalDictionary.userId, userId)).all()
    .map((r) => DictionaryEntry.parse({ ...r, note: r.note ?? undefined }));
}

export function upsertDictionary(db: Db, input: Loose<DictionaryEntry> & { userId: string; term: string }): DictionaryEntry {
  const e = DictionaryEntry.parse({ id: input.id ?? newId(), ...input });
  const values = { ...e, note: e.note ?? null };
  db.insert(personalDictionary).values(values).onConflictDoUpdate({ target: personalDictionary.id, set: values }).run();
  return e;
}

export function deleteDictionary(db: Db, userId: string, id: string): boolean {
  return db.delete(personalDictionary).where(and(eq(personalDictionary.userId, userId), eq(personalDictionary.id, id))).run().changes > 0;
}
