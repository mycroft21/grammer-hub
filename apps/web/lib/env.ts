import "server-only";

export const env = {
  databaseUrl: process.env["DATABASE_URL"] ?? "file:./data/grammer.db",
  allowedEmail: process.env["ALLOWED_EMAIL"] ?? "local@grammer-hub",
  defaultProvider: (process.env["DEFAULT_PROVIDER"] === "local" ? "local" : "cloud") as "cloud" | "local",
  localLlmUrl: process.env["LOCAL_LLM_URL"] ?? "http://127.0.0.1:8080",
  localLlmModel: process.env["LOCAL_LLM_MODEL"] ?? "gemma-4-26B-A4B-it-qat-q4_0",
  piiBlock: (process.env["PII_BLOCK"] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  storeDrafts: (process.env["STORE_DRAFTS"] ?? "true") !== "false",
  hasAnthropicKey: Boolean(process.env["ANTHROPIC_API_KEY"]),
  fakeProvider: process.env["FAKE_PROVIDER"] === "1",
  /** cloud 자리를 무엇으로 채울지. api(기본) | claude-cli(개인 테스트: Claude Code 구독 로그인으로 `claude -p` 호출) */
  cloudBackend: (process.env["CLOUD_BACKEND"] === "claude-cli" ? "claude-cli" : "api") as "api" | "claude-cli",
  claudeCliPath: process.env["CLAUDE_CLI_PATH"] ?? "claude",
  claudeCliModel: process.env["CLAUDE_CLI_MODEL"] ?? "claude-sonnet-5",
  /** Jira 티켓 → 프롬프트. 셋 다 있어야 켜진다. DEMO-* 키는 없이도 동작. */
  jiraBaseUrl: process.env["JIRA_BASE_URL"] ?? "",
  jiraEmail: process.env["JIRA_EMAIL"] ?? "",
  jiraApiToken: process.env["JIRA_API_TOKEN"] ?? "",
  /** 진행 로그를 파일에도 남길 경로(선택). 터미널에는 항상 찍힌다. */
  logFile: process.env["LOG_FILE"] || null,
};

/** cloud provider가 API 키 없이도 동작하는가(fake 또는 claude-cli). */
export const cloudReady = (): boolean => env.hasAnthropicKey || env.fakeProvider || env.cloudBackend === "claude-cli";
