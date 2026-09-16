import "server-only";
import { ensureUser, openDb, seedDefaultProfiles, type Db } from "@grammer-hub/db";
import { env } from "./env";

const g = globalThis as unknown as { __ghDb?: Db; __ghUser?: { id: string; email: string } };

/** 프로세스당 하나. Phase 1은 단일 사용자(ALLOWED_EMAIL). */
export function getDb(): Db {
  if (!g.__ghDb) g.__ghDb = openDb(env.databaseUrl);
  return g.__ghDb;
}

export function getUser(): { id: string; email: string } {
  if (!g.__ghUser) {
    const db = getDb();
    g.__ghUser = ensureUser(db, env.allowedEmail);
    seedDefaultProfiles(db, g.__ghUser.id);
  }
  return g.__ghUser;
}
