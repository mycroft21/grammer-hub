import { randomUUID, createHash } from "node:crypto";
export const newId = (): string => randomUUID();
export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
