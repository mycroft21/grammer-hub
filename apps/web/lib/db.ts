import "server-only";
import { ensureUser, openDb, seedDefaultProfiles, type Db } from "@grammer-hub/db";
import { currentSession } from "./auth/user";
import { env } from "./env";

const g = globalThis as unknown as { __ghDb?: Db; __ghUsers?: Map<string, { id: string; email: string }> };

/** 프로세스당 하나. */
export function getDb(): Db {
  if (!g.__ghDb) g.__ghDb = openDb(env.databaseUrl);
  return g.__ghDb;
}

/**
 * 이 요청의 사용자. 로그인 모드면 세션 쿠키의 이메일, 아니면 ALLOWED_EMAIL(로컬 단일 사용자).
 * 이메일별로 한 번만 DB에서 찾고 기본 프로필을 심는다. 로그인 모드에서 세션이 없으면 던진다 — proxy가 먼저 막으므로 여기 오면 설정 문제다.
 */
export async function getUser(): Promise<{ id: string; email: string }> {
  const email = env.authEnabled ? (await currentSession())?.email : env.allowedEmail;
  if (!email) throw new Error("로그인이 필요합니다(세션 없음)");
  if (!g.__ghUsers) g.__ghUsers = new Map();
  let u = g.__ghUsers.get(email);
  if (!u) {
    const db = getDb();
    u = ensureUser(db, email);
    seedDefaultProfiles(db, u.id);
    g.__ghUsers.set(email, u);
  }
  return u;
}
