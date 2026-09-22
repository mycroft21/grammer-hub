import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const require = createRequire("/home/user/grammer-hub/apps/web/package.json");
const PORT = process.env.PORT ?? "3288"; const MODE = process.env.MODE ?? "dark"; const OUT = process.env.OUT ?? "/tmp/shots";
const dir = mkdtempSync(join(tmpdir(), "gh-shot-"));
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", PORT], { cwd: "/home/user/grammer-hub/apps/web",
  env: { ...process.env, DATABASE_URL: `file:${join(dir, "s.db")}`, FAKE_PROVIDER: "1", ALLOWED_EMAIL: "shot@example.com", WORKSPACE_PROFILE: "studio.workspace.example.json" }, stdio: ["ignore", "ignore", "ignore"], detached: true });
const stop = () => { try { process.kill(-server.pid, "SIGTERM"); } catch {} };
process.on("exit", stop);
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
const browser = await chromium.launch({ args: ["--no-sandbox"], executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: MODE });
await page.addInitScript((m) => { try { localStorage.setItem("gh:theme", m); } catch {} }, MODE);
const shot = async (path, name, fn) => { await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: "networkidle" }); if (fn) await fn(); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${MODE}-${name}.png`, fullPage: true }); };
if (process.env.ONLY_SETTINGS) { await shot("/settings", "settings-light"); await browser.close(); stop(); process.exit(0); }
await shot("/", "editor", async () => { await page.fill("textarea", "안녕하세요 팀장님, 배포 일정이 지연되어 내일 오전으로 변경되었습니다. 확인 부탁드립니다."); await page.click("[data-testid=run]"); await page.waitForSelector("[data-testid=card]", { timeout: 15000 }).catch(() => {}); });
await shot("/prompts", "prompts-form");
await shot("/prompts", "prompts-result", async () => {
  await page.fill("[data-testid=studio-goal] textarea, textarea[data-testid=studio-goal]", "결제 승인 모듈의 재시도 로직을 파악해서 타임아웃 버그를 고치기 전에 흐름을 정리한 문서를 만든다");
  await page.waitForTimeout(300); await page.click("[data-testid=studio-run]"); await page.waitForSelector("[data-testid=studio-save]:not([disabled])", { timeout: 20000 }).catch(() => {}); });
await shot("/prompts", "ticket-review", async () => { await page.click("[data-testid=studio-mode] >> text=Jira 티켓"); await page.fill("[data-testid=ticket-input]", "DEMO-2"); await page.waitForTimeout(300); await page.click("[data-testid=ticket-fetch]"); await page.waitForSelector("[data-testid=ticket-review]", { timeout: 15000 }).catch(() => {}); await page.click("text=필요 정보 장부").catch(() => {}); });
await shot("/profiles", "profiles"); await shot("/runs", "runs"); await shot("/style", "style");
if (process.env.SETTINGS) await shot("/settings", "settings");
await browser.close(); stop(); rmSync(dir, { recursive: true, force: true }); process.exit(0);
