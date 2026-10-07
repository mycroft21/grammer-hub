#!/usr/bin/env node
/**
 * 배포 기준선 이후에 보관된 프롬프트만 골라 본다 — "이번 배포로 메타프롬프트가 나아졌나"를 보는 개발자용 도구.
 * 화면에는 두지 않는다. 기준선은 DB 옆의 studio-baseline.json에 저장한다(커밋 대상이 아니다).
 *
 *   pnpm studio:mark              # 지금(시각·HEAD·studio 버전)을 기준선으로 저장. 배포 직후에 한 번 실행한다
 *   pnpm studio:since             # 기준선 이후에 보관된 프롬프트·버전·점검 실패·손댄 슬롯 요약
 *   pnpm studio:since --all       # 기준선을 무시하고 전체를 본다
 *   pnpm studio:since --json      # 같은 내용을 JSON으로(다른 스크립트에 물릴 때)
 *   pnpm studio:since --db <경로> --user you@company.com --limit 20
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const ROOT = resolve(new URL("..", import.meta.url).pathname);

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : (args[i + 1] ?? d); };
const DB_PATH = resolve(String(flag("--db", resolve(ROOT, "apps/web/data/grammer.db"))));
const BASELINE_PATH = resolve(dirname(DB_PATH), "studio-baseline.json");
const LIMIT = Number(flag("--limit", "15"));
const MARK = args.includes("--mark");
const ALL = args.includes("--all");
const AS_JSON = args.includes("--json");
// 기본은 모든 사용자를 합쳐 본다. 로그인 모드(팀 서버)에서는 사람마다 사용자 행이 따로 생기고, 규칙이 나아졌는지는 전체로 봐야 한다.
// 한 사람만 보려면 --user <이메일>.
const EMAIL = flag("--user");

const fmt = (t) => new Date(t).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
/** 한글은 터미널에서 두 칸을 차지한다. 표가 어긋나지 않게 폭으로 채운다. */
const width = (s) => [...s].reduce((n, ch) => n + (/[\u1100-\u11FF\u3000-\u303F\uAC00-\uD7AF\uFF00-\uFFEF]/.test(ch) ? 2 : 1), 0);
const pad = (s, n) => s + " ".repeat(Math.max(1, n - width(s)));
const sh = (a) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
/** 메타프롬프트 규격 버전. TS를 실행하지 않고 상수만 읽는다. */
const studioVersion = () => {
  try { return /STUDIO_PROMPT_VERSION\s*=\s*"([^"]+)"/.exec(readFileSync(resolve(ROOT, "packages/core/src/promptstudio/meta-prompt.ts"), "utf8"))?.[1] ?? null; }
  catch { return null; }
};
const readBaseline = () => {
  if (!existsSync(BASELINE_PATH)) return null;
  try { return JSON.parse(readFileSync(BASELINE_PATH, "utf8")); } catch { return null; }
};

if (MARK) {
  const prev = readBaseline();
  const next = { markedAt: Date.now(), head: sh(["rev-parse", "--short", "HEAD"]), branch: sh(["rev-parse", "--abbrev-ref", "HEAD"]), studioVersion: studioVersion() };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  if (prev?.markedAt) console.log(`이전 기준선  ${fmt(prev.markedAt)} · ${prev.head ?? "?"} · studio ${prev.studioVersion ?? "?"}`);
  console.log(`새 기준선    ${fmt(next.markedAt)} · ${next.head ?? "?"} (${next.branch ?? "?"}) · studio ${next.studioVersion ?? "?"}`);
  console.log(`저장 위치    ${BASELINE_PATH}`);
  process.exit(0);
}

if (!existsSync(DB_PATH)) { console.error(`DB가 없습니다: ${DB_PATH}`); process.exit(1); }
const baseline = ALL ? null : readBaseline();
const since = baseline?.markedAt ?? 0;
const db = new Database(DB_PATH, { readonly: true });

const user = EMAIL ? db.prepare("select id, email from users where email = ?").get(EMAIL) : null;
if (EMAIL && !user) {
  const others = db.prepare("select email from users").all().map((u) => JSON.stringify(u.email)).join(", ");
  console.error(`DB에 ${JSON.stringify(EMAIL)} 사용자가 없습니다. 있는 사용자: ${others || "(없음)"}\n--user <이메일>로 지정하세요.`);
  process.exit(1);
}
// 사용자 조건은 있을 때만 붙인다. 값은 항상 바인딩으로 넘긴다
const byUser = user ? "p.user_id = ? and" : "";
const params = (...rest) => (user ? [user.id, ...rest] : rest);

const prompts = db.prepare(`select p.id, p.title, p.purpose, p.language, p.goal, p.ticket_key, p.current_version_id, p.archived, p.created_at from prompts p where ${byUser} p.created_at > ? order by p.created_at`).all(...params(since));
const versions = db.prepare(`select v.id, v.prompt_id, v.version_no, v.checks, v.source, v.slot, v.studio_version, v.cost_usd, v.created_at, p.title from prompt_versions v join prompts p on p.id = v.prompt_id where ${byUser} v.created_at > ? order by v.created_at`).all(...params(since));
const events = db.prepare(`select e.action, e.slot, count(*) n from prompt_events e join prompts p on p.id = e.prompt_id where ${byUser} e.created_at > ? group by e.action, e.slot`).all(...params(since));

const bump = (o, k, n = 1) => { if (k) o[k] = (o[k] ?? 0) + n; };
const bySource = {}, byStudio = {}, bySlot = {}, byPurpose = {}, byFailedCheck = {}, byAction = {};
let costUsd = 0;
for (const v of versions) {
  bump(bySource, v.source); bump(byStudio, v.studio_version);
  if (v.source !== "generate") bump(bySlot, v.slot);
  costUsd += v.cost_usd ?? 0;
  for (const c of JSON.parse(v.checks ?? "[]")) if (!c.ok) bump(byFailedCheck, c.id);
}
for (const p of prompts) bump(byPurpose, p.purpose);
for (const e of events) bump(byAction, e.action, e.n);

/** 현재 버전의 점검 결과. 목록에서 "아직 실패가 남은 프롬프트"를 바로 보려고. */
const checksOf = (versionId) => {
  if (!versionId) return null;
  const row = db.prepare("select checks from prompt_versions where id = ?").get(versionId);
  if (!row) return null;
  const cs = JSON.parse(row.checks ?? "[]");
  return { passed: cs.filter((c) => c.ok).length, total: cs.length, failed: cs.filter((c) => !c.ok).map((c) => c.id) };
};
const versionCount = (promptId) => db.prepare("select count(*) n from prompt_versions where prompt_id = ?").get(promptId).n;

const rows = prompts.slice(-LIMIT).reverse().map((p) => ({
  id: p.id, createdAt: p.created_at, title: p.title, purpose: p.purpose, ticketKey: p.ticket_key,
  archived: Boolean(p.archived), versions: versionCount(p.id), checks: checksOf(p.current_version_id),
}));

if (AS_JSON) {
  console.log(JSON.stringify({ baseline, since, db: DB_PATH, user: EMAIL ?? null, totals: { prompts: prompts.length, versions: versions.length, costUsd }, bySource, byStudio, bySlot, byPurpose, byFailedCheck, byAction, recent: rows }, null, 2));
  process.exit(0);
}

const line = (label, obj) => {
  const parts = Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`);
  if (parts.length > 0) console.log(`${pad(label, 14)}${parts.join(" · ")}`);
};

console.log("\n# 프롬프트 스튜디오 — 기준선 이후 보관 자료\n");
if (ALL) console.log("기준선       (--all) 전체");
else if (baseline) console.log(`기준선       ${fmt(baseline.markedAt)} · ${baseline.head ?? "?"} · studio ${baseline.studioVersion ?? "?"}`);
else console.log(`기준선       없음 — 전체를 보여줍니다. 배포한 뒤 'pnpm studio:mark'를 실행하세요 (${BASELINE_PATH})`);
const nowStudio = studioVersion();
if (baseline?.studioVersion && nowStudio && baseline.studioVersion !== nowStudio) console.log(`             ! 코드의 studio 버전이 ${nowStudio}로 올라갔습니다. 기준선은 ${baseline.studioVersion}입니다`);
console.log(`DB           ${DB_PATH}\n사용자       ${EMAIL ?? "전체"}`);
console.log(`이후         보관 ${prompts.length}건 · 새 버전 ${versions.length}개${costUsd > 0 ? ` · $${costUsd.toFixed(4)}` : ""}`);
if (prompts.length === 0 && versions.length === 0) { console.log("\n기준선 이후에 보관된 자료가 없습니다.\n"); process.exit(0); }
console.log("");
line("생성 경로", bySource);
line("studio 버전", byStudio);
line("손댄 슬롯", bySlot);
line("실패한 점검", byFailedCheck);
line("목적", byPurpose);
line("사용 신호", byAction);

if (rows.length > 0) {
  console.log(`\n최근 보관 (${rows.length}/${prompts.length})`);
  for (const r of rows) {
    const c = r.checks;
    const mark = c ? (c.failed.length > 0 ? `점검 ${c.passed}/${c.total} ✘${c.failed.join(",")}` : `점검 ${c.passed}/${c.total}`) : "버전 없음";
    console.log(pad(`  ${fmt(r.createdAt)}  ${r.ticketKey ? `[${r.ticketKey}] ` : ""}${r.title}`, 54) + pad(r.purpose, 14) + `v${r.versions}  ${mark}${r.archived ? "  (보관 해제됨)" : ""}`);
  }
}
console.log("");
