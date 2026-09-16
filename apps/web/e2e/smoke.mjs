// E2E 스모크: FAKE_PROVIDER=1 서버를 대상으로 에디터 → 카드 → 수락 → 복사 → 실행 기록까지.
// 실행: pnpm --filter @grammer-hub/web e2e  (서버는 스크립트가 직접 띄운다)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const PORT = process.env.E2E_PORT ?? "3199";
const dir = mkdtempSync(join(tmpdir(), "gh-e2e-"));
// pnpm을 거치지 않고 next 바이너리를 직접 띄우고, 프로세스 그룹 단위로 종료한다(고아 서버 방지).
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", PORT], {
  cwd: new URL("..", import.meta.url).pathname,
  env: { ...process.env, DATABASE_URL: `file:${join(dir, "e2e.db")}`, FAKE_PROVIDER: "1", ALLOWED_EMAIL: "e2e@example.com" },
  stdio: ["ignore", "pipe", "pipe"], detached: true,
});
const stopServer = () => { try { process.kill(-server.pid, "SIGTERM"); } catch { try { server.kill("SIGTERM"); } catch {} } };
process.on("exit", stopServer);
const waitServer = async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/profiles`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start");
};

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) failed++; };

try {
  await waitServer();
  const launch = { args: ["--no-sandbox"], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) };
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://127.0.0.1:${PORT}` });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
  await page.fill("textarea", "팀장님 어제 말씀하신 자료 정리해서 보내드릴께요. 커피 나오셨습니다 ㅎㅎ 연락은 010-1234-5678 로 부탁드리겠습니다.");
  await page.click("[data-testid=run]");
  await page.waitForSelector("[data-card]", { timeout: 20000 });
  await page.waitForSelector("text=최종본 복사", { timeout: 20000 });
  const cards = await page.locator("[data-card]").count();
  check("edit cards appear (>=4)", cards >= 4);
  check("original phone visible unmasked in card", (await page.textContent("body")).includes("010-1234-5678"));
  check("no stand-in leaked", !(await page.textContent("body")).includes("010-0000-0001"));

  // 첫 카드 수락, 두 번째 무시, 결과 보기 확인
  await page.locator("[data-card] button:has-text('수락')").first().click();
  await page.locator("[data-card] button:has-text('무시')").nth(1).click();
  await page.click("button:has-text('결과 보기')");
  const result = await page.inputValue("section:nth-of-type(2) textarea");
  check("result applies accepted edit only", result.includes("보내드릴게요") && result.includes("나오셨습니다"));

  await page.click("button:has-text('최종본 복사')");
  await page.waitForSelector("text=복사됨", { timeout: 5000 });
  check("copy toast", true);

  // L3 대안
  await page.click("button:has-text('L3')");
  await page.click("[data-testid=run]");
  await page.waitForSelector("text=톤 대안", { timeout: 20000 });
  await page.locator("button:has-text('이걸로 교체')").nth(2).waitFor({ timeout: 20000 });
  check("rewrites rendered (3)", (await page.locator("button:has-text('이걸로 교체')").count()) === 3);

  await page.goto(`http://127.0.0.1:${PORT}/runs`, { waitUntil: "load" });
  await page.waitForSelector("td:has-text('fake-dev')", { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length >= 2, null, { timeout: 10000 }).catch(() => {});
  const rows = await page.locator("tbody tr").count();
  check("runs page lists 2 runs", rows === 2);
  if (rows !== 2) console.log("rows:", rows, (await page.locator("tbody").textContent()).slice(0, 300));
  const body = await page.textContent("body");
  check("feedback counted (1 accept / 1 reject)", /1\/1/.test(body));
  check("no page errors", pageErrors.length === 0);
  if (pageErrors.length) console.log(pageErrors);
  await browser.close();
} catch (e) {
  console.log("FAIL", String(e).split("\n")[0]); failed++;
} finally {
  stopServer();
  await new Promise((r) => setTimeout(r, 500));
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
