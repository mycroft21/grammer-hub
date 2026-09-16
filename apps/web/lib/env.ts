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
};
