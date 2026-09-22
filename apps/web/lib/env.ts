import "server-only";

/**
 * 환경 변수 접근. 게터라서 매번 process.env를 읽는다 — 설정 화면(/settings)이 process.env를 갱신하면 재시작 없이 반영된다.
 * 예외: DATABASE_URL·ALLOWED_EMAIL은 첫 사용 때 연결·사용자가 고정되므로 재시작이 필요하다(설정 화면에 표시).
 */
const s = (k: string) => process.env[k] ?? "";
export const env = {
  get databaseUrl() { return s("DATABASE_URL") || "file:./data/grammer.db"; },
  get allowedEmail() { return s("ALLOWED_EMAIL") || "local@grammer-hub"; },
  get defaultProvider() { return (s("DEFAULT_PROVIDER") === "local" ? "local" : "cloud") as "cloud" | "local"; },
  get localLlmUrl() { return s("LOCAL_LLM_URL") || "http://127.0.0.1:8080"; },
  get localLlmModel() { return s("LOCAL_LLM_MODEL") || "gemma-4-26B-A4B-it-qat-q4_0"; },
  get piiBlock() { return s("PII_BLOCK").split(",").map((x) => x.trim()).filter(Boolean); },
  get storeDrafts() { return (s("STORE_DRAFTS") || "true") !== "false"; },
  get hasAnthropicKey() { return Boolean(s("ANTHROPIC_API_KEY")); },
  get fakeProvider() { return s("FAKE_PROVIDER") === "1"; },
  /** cloud 자리를 무엇으로 채울지. api(기본) | claude-cli(개인 테스트: Claude Code 구독 로그인으로 `claude -p` 호출) */
  get cloudBackend() { return (s("CLOUD_BACKEND") === "claude-cli" ? "claude-cli" : "api") as "api" | "claude-cli"; },
  get claudeCliPath() { return s("CLAUDE_CLI_PATH") || "claude"; },
  get claudeCliModel() { return s("CLAUDE_CLI_MODEL") || "claude-sonnet-5"; },
  /** Jira 티켓 → 프롬프트. 셋 다 있어야 켜진다. DEMO-* 키는 없이도 동작. */
  get jiraBaseUrl() { return s("JIRA_BASE_URL"); },
  get jiraEmail() { return s("JIRA_EMAIL"); },
  get jiraApiToken() { return s("JIRA_API_TOKEN"); },
  /** 진행 로그를 파일에도 남길 경로(선택). 터미널에는 항상 찍힌다. */
  get logFile() { return s("LOG_FILE") || null; },
  /** 작업 공간 프로필 파일 경로(루트 기준). 비우면 루트 studio.workspace.json */
  get workspaceProfile() { return s("WORKSPACE_PROFILE") || null; },
};

/** cloud provider가 API 키 없이도 동작하는가(fake 또는 claude-cli). */
export const cloudReady = (): boolean => env.hasAnthropicKey || env.fakeProvider || env.cloudBackend === "claude-cli";
