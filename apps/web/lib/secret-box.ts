import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "./env";

/**
 * 사람별 외부 연결 토큰 암호화(AES-256-GCM). 키 = HKDF(AUTH_SECRET, 용도). AUTH_SECRET을 바꾸면 복호화가 실패하고,
 * 그 연결은 '연결 안 됨'으로 보여 다시 연결하게 된다. 결과·오류 어디에도 원문을 싣지 않는다.
 */
const key = (purpose: string) => Buffer.from(hkdfSync("sha256", env.authSecret, "grammer-hub", purpose, 32));

export function seal(plain: string, purpose: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(purpose), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url");
}

/** 키가 바뀌었거나 값이 깨졌으면 null(던지지 않는다). */
export function open(sealed: string, purpose: string): string | null {
  try {
    const b = Buffer.from(sealed, "base64url");
    const d = createDecipheriv("aes-256-gcm", key(purpose), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch { return null; }
}
