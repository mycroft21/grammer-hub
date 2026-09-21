#!/usr/bin/env node
/**
 * 상태 진단 — "코드가 최신인가, .env가 읽히는가, 빌드가 최신인가, 백엔드가 살아 있는가"를 한 번에.
 *
 *   pnpm doctor              # 오프라인 점검(원격 비교는 git fetch 1회)
 *   pnpm doctor --probe      # 실행 중인 서버(localhost:3000)에 /api/health?probe=1 로 백엔드까지 확인
 *   pnpm doctor --port 3010
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const WEB = resolve(ROOT, "apps/web");
const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : (args[i + 1] ?? true); };
const PORT = String(flag("--port", process.env.PORT ?? "3000"));
const PROBE = args.includes("--probe");

const ok = (m) => console.log(`  ✔ ${m}`);
const warn = (m) => console.log(`  ▲ ${m}`);
const bad = (m) => { console.log(`  ✘ ${m}`); problems++; };
let problems = 0;
const sh = (cmd, a, opts = {}) => { try { return execFileSync(cmd, a, { cwd: ROOT, encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"], ...opts }).trim(); } catch { return null; } };

// ── 1. 코드 ──
console.log("\n# 코드");
const branch = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
const head = sh("git", ["rev-parse", "--short", "HEAD"]);
const headTime = sh("git", ["log", "-1", "--format=%cI"]);
console.log(`  브랜치 ${branch} · HEAD ${head} (${headTime})`);
if (sh("git", ["fetch", "origin", branch], { timeout: 30000 }) !== null) {
  const behind = Number(sh("git", ["rev-list", "--count", `HEAD..origin/${branch}`]) ?? "0");
  const ahead = Number(sh("git", ["rev-list", "--count", `origin/${branch}..HEAD`]) ?? "0");
  if (behind > 0) bad(`원격보다 ${behind}커밋 뒤처짐 → git pull && pnpm install && pnpm build`);
  else ok(`원격(origin/${branch})과 같음${ahead ? ` (+로컬 ${ahead}커밋)` : ""}`);
} else warn("원격 비교 실패(네트워크?) — 오프라인 점검만 진행");
const dirty = (sh("git", ["status", "--porcelain"]) ?? "").split("\n").filter(Boolean);
if (dirty.length) warn(`커밋 안 된 변경 ${dirty.length}개`); else ok("작업 트리 깨끗함");

// ── 2. .env ──
console.log("\n# .env");
const envPath = resolve(ROOT, ".env");
const webEnvPath = resolve(WEB, ".env");
let dotenv = {};
try {
  const { loadEnvConfig } = require(resolve(WEB, "node_modules/@next/env"));
  // 실제 서버와 같은 로더로 읽는다(인라인 주석·따옴표 규칙 동일). process.env는 건드리지 않게 복제본에 적용.
  const saved = { ...process.env };
  loadEnvConfig(ROOT, true, { info() {}, error() {} });
  dotenv = Object.fromEntries(Object.keys(process.env).filter((k) => saved[k] !== process.env[k]).map((k) => [k, process.env[k]]));
} catch (e) { warn(`@next/env 로드 실패(${e.message}) — pnpm install 필요?`); }
if (!existsSync(envPath)) bad(`루트 .env 없음 (${envPath}) → cp .env.example .env`);
else ok(`루트 .env 있음`);
if (existsSync(webEnvPath)) warn(`apps/web/.env 도 있음 — 같은 키는 루트 .env가 이깁니다. 헷갈리니 루트 하나만 두세요.`);
const get = (k) => (process.env[k] ?? dotenv[k] ?? "").trim();
const backend = get("FAKE_PROVIDER") === "1" ? "fake" : get("CLOUD_BACKEND") === "claude-cli" ? "claude-cli" : "api";
const mask = (v) => (v ? `${v.slice(0, 7)}…(${v.length}자)` : "(비어 있음)");
console.log(`  CLOUD_BACKEND=${get("CLOUD_BACKEND") || "(기본 api)"} → 클라우드 자리: ${backend}`);
console.log(`  DEFAULT_PROVIDER=${get("DEFAULT_PROVIDER") || "cloud"} · STORE_DRAFTS=${get("STORE_DRAFTS") || "true"} · DATABASE_URL=${get("DATABASE_URL") || "file:./data/grammer.db"}`);
if (backend === "api") {
  if (get("ANTHROPIC_API_KEY")) ok(`ANTHROPIC_API_KEY ${mask(get("ANTHROPIC_API_KEY"))}`);
  else bad("ANTHROPIC_API_KEY 비어 있음 → 키를 넣거나 CLOUD_BACKEND=claude-cli");
}
if (backend === "claude-cli") {
  const cli = get("CLAUDE_CLI_PATH") || "claude";
  const model = get("CLAUDE_CLI_MODEL") || "claude-sonnet-5";
  const found = cli.includes("/") ? (existsSync(cli) ? cli : null) : sh("which", [cli]);
  if (!found) bad(`claude CLI 못 찾음 (${cli}) → which claude 결과를 CLAUDE_CLI_PATH에`);
  else {
    const v = spawnSync(found, ["--version"], { encoding: "utf8", timeout: 20000 });
    if (v.status === 0) ok(`claude CLI ${found} · ${v.stdout.trim()} · 모델 ${model}`); else bad(`claude --version 실패: ${(v.stderr || v.stdout || "").trim().slice(0, 120)}`);
  }
}

// ── 3. 빌드 ──
console.log("\n# 빌드");
const buildId = resolve(WEB, ".next/BUILD_ID");
if (!existsSync(buildId)) bad("빌드 없음 → pnpm build");
else {
  const builtAt = statSync(buildId).mtime;
  const stale = headTime && builtAt.getTime() < new Date(headTime).getTime();
  if (stale) bad(`빌드(${builtAt.toISOString()})가 마지막 커밋(${headTime})보다 오래됨 → pnpm build`);
  else ok(`빌드 ${builtAt.toISOString()} (커밋 이후)`);
}
const nodeV = process.version; const pnpmV = sh("pnpm", ["--version"]);
console.log(`  node ${nodeV} · pnpm ${pnpmV ?? "?"}`);
if (!/^v22\./.test(nodeV)) warn("Node 22가 아닙니다. better-sqlite3 바이너리가 안 맞을 수 있음");

// ── 4. DB ──
console.log("\n# DB");
const dbUrl = get("DATABASE_URL") || "file:./data/grammer.db";
const dbPath = resolve(WEB, dbUrl.replace(/^file:/, ""));
if (!existsSync(dbPath)) warn(`DB 파일 아직 없음 (${dbPath}) — 첫 실행 때 생성됨`);
else {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const applied = db.prepare("select count(*) n from __drizzle_migrations").get().n;
    const journal = JSON.parse(readFileSync(resolve(ROOT, "packages/db/drizzle/meta/_journal.json"), "utf8")).entries.length;
    const runs = db.prepare("select count(*) n from correction_runs").get().n;
    let prompts = 0; try { prompts = db.prepare("select count(*) n from prompts").get().n; } catch { /* 마이그레이션 전 */ }
    if (applied < journal) warn(`마이그레이션 ${applied}/${journal} 적용 — 서버를 재시작하면 자동 적용`); else ok(`마이그레이션 ${applied}/${journal}`);
    console.log(`  교정 기록 ${runs}건 · 보관 프롬프트 ${prompts}건 · ${(statSync(dbPath).size / 1024).toFixed(0)}KB`);
    db.close();
  } catch (e) { warn(`DB 열기 실패: ${e.message}`); }
}

// ── 5. 서버 ──
console.log("\n# 서버");
try {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/health${PROBE ? "?probe=1" : ""}`, { signal: AbortSignal.timeout(PROBE ? 30000 : 5000) });
  const h = await r.json();
  ok(`localhost:${PORT} 응답 · 백엔드 ${h.cloud.backend} (${h.cloud.model}) · 코드 ${h.code.head}${h.build?.staleAgainstHead ? " · ⚠ 실행 중인 빌드가 오래됨" : ""}`);
  if (h.code.head && head && h.code.head !== head) warn(`서버가 보는 코드(${h.code.head})와 작업 트리(${head})가 다릅니다 → 재빌드·재시작`);
  if (!h.cloud.ready) bad(`서버 기준으로 클라우드 백엔드 준비 안 됨 (${JSON.stringify(h.cloud)}) → .env 수정 후 서버 재시작`);
  if (h.cloud.health) (h.cloud.health.ok ? ok : bad)(`백엔드 헬스: ${h.cloud.health.detail ?? "ok"}`);
  else if (!PROBE) console.log("  (백엔드 실제 호출 확인은 --probe)");
} catch { warn(`localhost:${PORT} 에 서버 없음 — pnpm start 후 다시 실행하면 서버 상태까지 봅니다`); }

console.log(problems ? `\n문제 ${problems}개. 위의 ✘ 항목을 먼저 해결하세요.` : "\n모두 정상.");
process.exit(problems ? 1 : 0);
