import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { users } from "../schema";
import { newId } from "../ids";

export function ensureUser(db: Db, email: string): { id: string; email: string } {
  const found = db.select().from(users).where(eq(users.email, email)).get();
  if (found) return { id: found.id, email: found.email };
  const id = newId();
  db.insert(users).values({ id, email }).run();
  return { id, email };
}
