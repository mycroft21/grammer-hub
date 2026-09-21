import "server-only";
import { appendFileSync } from "node:fs";
import { env } from "./env";

/**
 * 서버 진행 로그. `pnpm start` 터미널에 한 줄씩 찍히고, LOG_FILE이 있으면 같은 줄을 파일에도 덧붙인다.
 * 형식: `HH:MM:SS.mmm scope · msg · k=v …`  — 비밀값·원문은 넣지 않는다(글자 수·건수만).
 */
export function serverLog(scope: string, msg: string, fields: Record<string, string | number | boolean | null | undefined> = {}): void {
  const t = new Date();
  const hh = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}.${String(t.getMilliseconds()).padStart(3, "0")}`;
  const kv = Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(2)) : v}`).join(" ");
  const line = `${hh} ${scope.padEnd(10)} ${msg}${kv ? `  ${kv}` : ""}`;
  console.log(line);
  if (env.logFile) { try { appendFileSync(env.logFile, line + "\n"); } catch { /* 진단용 */ } }
}

/** 한 실행의 경과 시간을 붙여 주는 로거 */
export function runLogger(scope: string, id: string) {
  const t0 = Date.now();
  return (msg: string, fields: Record<string, string | number | boolean | null | undefined> = {}) =>
    serverLog(scope, msg, { id: id.slice(0, 8), t: `+${((Date.now() - t0) / 1000).toFixed(1)}s`, ...fields });
}
