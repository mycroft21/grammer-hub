import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { EMPTY_PROFILE, EXAMPLE_PROFILE, PRICES, applyProfileOps, formatProfile, parseWorkspaceProfile, type ProfileOp, type WorkspaceProfile } from "@grammer-hub/core";
import { resetProviders } from "./providers";
import { serverLog } from "./log";
import { loadWorkspace, workspacePath } from "./workspace";

/**
 * 설정 화면(/settings)의 뒷단. 루트 `.env`를 읽고 쓰며, 저장한 값은 process.env에도 넣어 재시작 없이 반영한다.
 * 비밀값(API 키·토큰)은 절대 그대로 돌려주지 않는다(길이·끝 4자만). 빈 문자열로 저장하면 지운 것.
 * 다른 줄(주석·모르는 키)은 그대로 보존한다. E2E는 GH_ENV_FILE로 파일 위치를 바꿔 실제 .env를 건드리지 않는다.
 */
const ROOT = resolve(process.cwd(), "..", "..");
export const envFilePath = (): string => (process.env["GH_ENV_FILE"] ? resolve(ROOT, process.env["GH_ENV_FILE"]) : resolve(ROOT, ".env"));

export type SettingKind = "text" | "secret" | "select" | "bool";
export type SettingGroup = "backend" | "jira" | "team" | "behavior";
export interface SettingDef {
  key: string; label: string; group: SettingGroup;
  kind: SettingKind; help: string; options?: { value: string; label: string }[]; placeholder?: string;
  /** 첫 사용 때 고정되는 값이라 바꾸면 서버 재시작이 필요 */
  restart?: boolean;
  /** 이 값이 이럴 때만 의미 있음(UI에서 접기) — [key, values] */
  showWhen?: [string, string[]];
}
export const SETTINGS: SettingDef[] = [
  { key: "DEFAULT_PROVIDER", label: "기본 처리 위치", group: "backend", kind: "select", options: [{ value: "cloud", label: "클라우드(Claude)" }, { value: "local", label: "로컬 LLM" }], help: "교정·프롬프트 생성을 어디서 돌릴지. 화면에서 건마다 바꿀 수 있고 이것은 기본값." },
  { key: "CLOUD_BACKEND", label: "클라우드 방식", group: "backend", kind: "select", options: [{ value: "api", label: "API 키 (ANTHROPIC_API_KEY, 사용량 과금)" }, { value: "claude-cli", label: "Claude Code 구독 로그인 (claude -p, 개인 테스트용)" }], help: "api는 Anthropic API 키로 호출해 토큰 단위 과금. claude-cli는 이 컴퓨터에 로그인된 Claude Code CLI를 빌려 쓰며 구독 사용량이 나간다(팀 제공 시엔 api 권장)." },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic API 키", group: "backend", kind: "secret", help: "console.anthropic.com에서 발급. 저장하면 끝 4자만 보인다.", placeholder: "sk-ant-…", showWhen: ["CLOUD_BACKEND", ["api"]] },
  { key: "CLAUDE_CLI_PATH", label: "claude 실행 파일", group: "backend", kind: "text", help: "PATH에 없으면 `which claude` 결과(예: /opt/homebrew/bin/claude).", placeholder: "claude", showWhen: ["CLOUD_BACKEND", ["claude-cli"]] },
  { key: "CLAUDE_CLI_MODEL", label: "claude-cli 모델", group: "backend", kind: "text", help: "claude -p --model 값.", placeholder: "claude-sonnet-5", showWhen: ["CLOUD_BACKEND", ["claude-cli"]] },
  { key: "STUDIO_PLAN_MODEL", label: "의도 정리·티켓 분류 모델", group: "backend", kind: "text", help: "프롬프트 스튜디오의 짧은 단계(질문 고르기·분류)만 이 모델로. 생성·재생성은 기본 모델. 비우면 기본 모델. 클라우드에만 적용.", placeholder: "claude-sonnet-5" },
  { key: "CORRECTION_MODEL", label: "교정 모델", group: "backend", kind: "text", help: "교정(에디터)만 이 모델로. 비우면 기본 모델. 클라우드에만 적용.", placeholder: "claude-sonnet-5" },
  { key: "LOCAL_LLM_URL", label: "로컬 LLM 주소", group: "backend", kind: "text", help: "llama.cpp 서버(OpenAI 호환) 주소.", placeholder: "http://127.0.0.1:8080", showWhen: ["DEFAULT_PROVIDER", ["local"]] },
  { key: "LOCAL_LLM_MODEL", label: "로컬 LLM 모델", group: "backend", kind: "text", help: "서버에 올라간 모델 이름.", placeholder: "gemma-4-26B-A4B-it-qat-q4_0", showWhen: ["DEFAULT_PROVIDER", ["local"]] },
  { key: "JIRA_BASE_URL", label: "Jira 주소", group: "jira", kind: "text", help: "예: https://xxx.atlassian.net", placeholder: "https://xxx.atlassian.net" },
  { key: "JIRA_EMAIL", label: "Atlassian 이메일", group: "jira", kind: "text", help: "API 토큰을 발급한 계정.", placeholder: "you@company.com" },
  { key: "JIRA_API_TOKEN", label: "Jira API 토큰", group: "jira", kind: "secret", help: "id.atlassian.com → 보안 → API 토큰. 읽기 전용으로만 쓴다." },
  // 팀 서버 로그인(OIDC). 셋이 다 있어야 켜진다. 켜지면 설정 화면은 관리자만 — 자기 이메일을 관리자에 먼저 넣고 저장할 것.
  { key: "OIDC_ISSUER", label: "IdP 발급자(issuer) 주소", group: "team", kind: "text", help: "discovery 문서가 있는 주소. 구글: https://accounts.google.com · Okta: https://xxx.okta.com · Azure: https://login.microsoftonline.com/<tenant>/v2.0", placeholder: "https://accounts.google.com" },
  { key: "OIDC_CLIENT_ID", label: "클라이언트 ID", group: "team", kind: "text", help: "IdP에 등록한 웹 앱의 ID. 콜백 URL은 <APP_URL>/api/auth/callback 으로 등록." },
  { key: "OIDC_CLIENT_SECRET", label: "클라이언트 시크릿", group: "team", kind: "secret", help: "IdP가 발급한 시크릿. 저장하면 끝 4자만 보인다." },
  { key: "AUTH_SECRET", label: "세션 서명 키", group: "team", kind: "secret", help: "세션 쿠키 서명용 임의 문자열(32자 이상 권장, `openssl rand -base64 32`). 바꾸면 모두 다시 로그인." },
  { key: "APP_URL", label: "외부 접속 주소", group: "team", kind: "text", help: "콜백 URL의 기준. 리버스 프록시 뒤에 있으면 반드시 적는다. 비우면 요청의 origin.", placeholder: "https://grammar.example.internal" },
  { key: "AUTH_ALLOWED_DOMAINS", label: "허용 도메인", group: "team", kind: "text", help: "이 도메인 이메일은 모두 로그인 가능. 쉼표로 여러 개.", placeholder: "example.com" },
  { key: "AUTH_ALLOWED_EMAILS", label: "허용 이메일", group: "team", kind: "text", help: "도메인 밖에서 예외로 들일 사람. 쉼표로.", placeholder: "guest@partner.com" },
  { key: "AUTH_ADMIN_EMAILS", label: "관리자 이메일", group: "team", kind: "text", help: "설정 화면·프로필 전체 편집이 가능한 사람. 비어 있으면 로그인 모드에서는 아무도 설정을 못 바꾼다(.env 직접 편집).", placeholder: "me@example.com" },
  { key: "STORE_DRAFTS", label: "교정 원문 저장", group: "behavior", kind: "bool", help: "끄면 교정 기록에 원문을 남기지 않는다(카드·통계만)." },
  { key: "PII_BLOCK", label: "차단할 개인정보 종류", group: "behavior", kind: "text", help: "감지되면 전송을 막을 종류. 쉼표로: EMAIL,PHONE,CARD,ACCT,RRN. 비우면 마스킹만.", placeholder: "CARD,RRN" },
  { key: "LOG_FILE", label: "로그 파일", group: "behavior", kind: "text", help: "비우면 터미널에만. 경로를 주면 진행 로그를 파일에도 덧붙인다.", placeholder: "/tmp/grammer-hub.log" },
  { key: "WORKSPACE_PROFILE", label: "작업 공간 프로필 경로", group: "behavior", kind: "text", help: "루트 기준 경로. 비우면 studio.workspace.json. 아래 편집기가 이 파일을 연다.", placeholder: "studio.workspace.json" },
  { key: "ALLOWED_EMAIL", label: "사용자 이메일", group: "behavior", kind: "text", help: "단일 사용자 식별용. 바꾸면 재시작 필요.", placeholder: "you@company.com", restart: true },
  { key: "DATABASE_URL", label: "DB 파일", group: "behavior", kind: "text", help: "SQLite 경로. 바꾸면 재시작 필요.", placeholder: "file:./data/grammer.db", restart: true },
];
const KEYS = new Set(SETTINGS.map((d) => d.key));

interface EnvLine { raw: string; key?: string }
function parseEnvFile(text: string): EnvLine[] {
  return text.split(/\r?\n/).map((raw) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(raw);
    return m ? { raw, key: m[1]! } : { raw };
  });
}
function readEnvFile(): { lines: EnvLine[]; exists: boolean } {
  const p = envFilePath();
  if (!existsSync(p)) return { lines: [], exists: false };
  try { return { lines: parseEnvFile(readFileSync(p, "utf8")), exists: true }; } catch { return { lines: [], exists: true }; }
}
/** 값에 공백·#·따옴표가 있으면 큰따옴표로 감싼다(dotenv 규칙). */
function quote(v: string): string {
  return /[\s#"'\\]/.test(v) || v === "" ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v;
}
const mask = (v: string) => (v ? `••••${v.slice(-4)} (${v.length}자)` : "");

export interface SettingView { key: string; value: string; masked: boolean; set: boolean; source: "file" | "os" | "default" }
export function getSettings(): { items: SettingView[]; envFile: string; exists: boolean } {
  const f = readEnvFile();
  const inFile = new Set(f.lines.map((l) => l.key).filter(Boolean) as string[]);
  const items = SETTINGS.map((d) => {
    const v = process.env[d.key] ?? "";
    return { key: d.key, value: d.kind === "secret" ? mask(v) : v, masked: d.kind === "secret", set: Boolean(v), source: inFile.has(d.key) ? "file" as const : v ? "os" as const : "default" as const };
  });
  return { items, envFile: envFilePath().startsWith(ROOT) ? envFilePath().slice(ROOT.length + 1) : envFilePath(), exists: f.exists };
}

const VALIDATORS: Record<string, (v: string) => string | null> = {
  DEFAULT_PROVIDER: (v) => (["cloud", "local", ""].includes(v) ? null : "cloud 또는 local"),
  CLOUD_BACKEND: (v) => (["api", "claude-cli", ""].includes(v) ? null : "api 또는 claude-cli"),
  STORE_DRAFTS: (v) => (["true", "false", ""].includes(v) ? null : "true 또는 false"),
  JIRA_BASE_URL: (v) => (!v || /^https?:\/\/[^\s/]+/.test(v) ? null : "https://로 시작하는 주소"),
  LOCAL_LLM_URL: (v) => (!v || /^https?:\/\/[^\s/]+/.test(v) ? null : "http(s)://로 시작하는 주소"),
  PII_BLOCK: (v) => (v.split(",").map((x) => x.trim()).filter(Boolean).every((x) => ["EMAIL", "PHONE", "CARD", "ACCT", "RRN", "DICT"].includes(x)) ? null : "EMAIL,PHONE,CARD,ACCT,RRN,DICT 중에서"),
  ANTHROPIC_API_KEY: (v) => (!v || /^[A-Za-z0-9_-]{20,}$/.test(v) ? null : "키 형식이 아닙니다"),
  OIDC_ISSUER: (v) => (!v || /^https?:\/\/[^\s/]+/.test(v) ? null : "https://로 시작하는 주소"),
  APP_URL: (v) => (!v || /^https?:\/\/[^\s/]+/.test(v) ? null : "https://로 시작하는 주소"),
  AUTH_ALLOWED_DOMAINS: (v) => (v.split(",").map((x) => x.trim()).filter(Boolean).every((x) => /^@?[a-z0-9.-]+\.[a-z]{2,}$/i.test(x)) ? null : "도메인만(example.com), 쉼표로 구분"),
  AUTH_ALLOWED_EMAILS: (v) => (v.split(",").map((x) => x.trim()).filter(Boolean).every((x) => x.includes("@")) ? null : "이메일 주소를 쉼표로"),
  AUTH_ADMIN_EMAILS: (v) => (v.split(",").map((x) => x.trim()).filter(Boolean).every((x) => x.includes("@")) ? null : "이메일 주소를 쉼표로"),
  AUTH_SECRET: (v) => (!v || v.length >= 16 ? null : "16자 이상"),
  // 단계별 모델은 가격표에 있는 이름만 — 오타는 연결 확인(기본 모델만 봄)에 안 걸리고, 표에 없는 이름은 비용이 0으로 기록된다
  STUDIO_PLAN_MODEL: (v) => (!v || v in PRICES ? null : `${Object.keys(PRICES).join(", ")} 중에서`),
  CORRECTION_MODEL: (v) => (!v || v in PRICES ? null : `${Object.keys(PRICES).join(", ")} 중에서`),
};

/**
 * 바뀐 키만 받아 .env에 반영하고 process.env를 갱신한다. 값 ""는 지우기. 비밀값은 클라이언트가 새 값을 입력했을 때만 보낸다.
 * 반환: 재시작이 필요한 키 목록.
 */
export function saveSettings(changes: Record<string, string>): { ok: true; restart: string[]; changed: string[] } | { ok: false; message: string } {
  const entries = Object.entries(changes).filter(([k]) => KEYS.has(k)).map(([k, v]) => [k, String(v ?? "").trim()] as const);
  for (const [k, v] of entries) { const err = VALIDATORS[k]?.(v); if (err) return { ok: false, message: `${k}: ${err}` }; }
  const f = readEnvFile();
  const lines = f.lines.length ? [...f.lines] : parseEnvFile(existsSync(resolve(ROOT, ".env.example")) ? readFileSync(resolve(ROOT, ".env.example"), "utf8") : "");
  for (const [k, v] of entries) {
    const line = `${k}=${quote(v)}`;
    const i = lines.findIndex((l) => l.key === k);
    if (i === -1) lines.push({ raw: line, key: k }); else lines[i] = { raw: line, key: k };
  }
  const out = lines.map((l) => l.raw).join("\n").replace(/\n*$/, "\n");
  try { mkdirSync(dirname(envFilePath()), { recursive: true }); writeFileSync(envFilePath(), out, { mode: 0o600 }); }
  catch (e) { return { ok: false, message: `.env 쓰기 실패: ${(e as Error).message}` }; }
  for (const [k, v] of entries) { if (v === "") delete process.env[k]; else process.env[k] = v; }
  resetProviders();
  const changed = entries.map(([k]) => k);
  const restart = SETTINGS.filter((d) => d.restart && changed.includes(d.key)).map((d) => d.key);
  serverLog("settings", "저장", { keys: changed.join(","), restart: restart.join(",") || undefined });
  return { ok: true, restart, changed };
}

/** 작업 공간 프로필 편집기 뒷단: 현재 파일 원문 + 파싱된 프로필(폼 초기값) + 상태, 예시. */
export interface WorkspaceFile { path: string; exists: boolean; text: string; profile: WorkspaceProfile | null; error: string | null; summary: { repos: number } | null; example: string }
export function getWorkspaceFile(): WorkspaceFile {
  const w = loadWorkspace();
  let text = "";
  if (w.exists) { try { text = readFileSync(workspacePath(), "utf8"); } catch { /* 읽기 실패는 error에 있음 */ } }
  return { path: w.path.startsWith(ROOT) ? w.path.slice(ROOT.length + 1) : w.path, exists: w.exists, text, profile: w.profile, error: w.error, summary: w.profile ? { repos: w.profile.repos.length } : null, example: formatProfile(EXAMPLE_PROFILE) };
}
function writeWorkspace(text: string): string | null {
  try { mkdirSync(dirname(workspacePath()), { recursive: true }); writeFileSync(workspacePath(), text.endsWith("\n") ? text : text + "\n"); return null; }
  catch (e) { return `파일 쓰기 실패: ${(e as Error).message}`; }
}
/** JSON 탭·가져오기: 원문을 검증(스키마·중복 이름)해 그대로 쓴다(사용자의 들여쓰기·주석 필드 보존). */
export function saveWorkspaceFile(text: string): { ok: true; repos: number } | { ok: false; message: string } {
  const r = parseWorkspaceProfile(text);
  if (!r.ok) return { ok: false, message: r.message };
  const err = writeWorkspace(text);
  if (err) return { ok: false, message: err };
  serverLog("settings", "프로필 저장", { repos: r.profile.repos.length, via: "text" });
  return { ok: true, repos: r.profile.repos.length };
}
/** 폼 탭: 구조화된 값을 받아 표준 형태로 쓴다. 검증은 원문 경로와 같은 parseWorkspaceProfile을 거친다. */
export function saveWorkspaceProfile(profile: unknown): { ok: true; repos: number } | { ok: false; message: string } {
  const r = parseWorkspaceProfile(JSON.stringify(profile));
  if (!r.ok) return { ok: false, message: r.message };
  const err = writeWorkspace(formatProfile(r.profile));
  if (err) return { ok: false, message: err };
  serverLog("settings", "프로필 저장", { repos: r.profile.repos.length, via: "form" });
  return { ok: true, repos: r.profile.repos.length };
}
/**
 * 검토 화면의 "프로필에 추가": 파일이 없으면 빈 프로필에서 시작하고, 파일에 오류가 있으면 덮어쓰지 않고 거절한다(사용자가 손으로 고친 파일을 날리지 않기 위해).
 */
export function patchWorkspaceProfile(ops: ProfileOp[]): { ok: true; changes: string[]; repos: number } | { ok: false; message: string } {
  const w = loadWorkspace();
  if (w.exists && !w.profile) return { ok: false, message: `현재 프로필 파일에 오류가 있어 자동으로 추가할 수 없습니다 (${w.error ?? "알 수 없는 오류"}). 설정 화면에서 먼저 고쳐 주세요.` };
  const r = applyProfileOps(w.profile ?? EMPTY_PROFILE, ops);
  if (!r.ok) return r;
  if (r.changes.length) {
    const err = writeWorkspace(formatProfile(r.profile));
    if (err) return { ok: false, message: err };
    serverLog("settings", "프로필 자동 추가", { ops: ops.map((o) => o.op).join(","), changes: r.changes.length, repos: r.profile.repos.length });
  }
  return { ok: true, changes: r.changes, repos: r.profile.repos.length };
}
