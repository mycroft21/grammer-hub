import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { users } from "../schema";
import { newId } from "../ids";

export function ensureUser(db: Db, email: string): { id: string; email: string } {
  // 빈 이메일로 만들면 그 아래 쌓인 자료가 다음 실행에서 화면에 보이지 않는다(실제로 한 번 발생했다).
  if (email.trim() === "") throw new Error("ALLOWED_EMAIL이 비어 있습니다. 빈 이메일로는 사용자를 만들지 않습니다");
  const found = db.select().from(users).where(eq(users.email, email)).get();
  if (found) return { id: found.id, email: found.email };
  const id = newId();
  db.insert(users).values({ id, email }).run();
  return { id, email };
}
