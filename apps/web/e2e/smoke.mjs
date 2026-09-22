// E2E 스모크: FAKE_PROVIDER=1 서버를 대상으로 에디터 → 카드 → 수락 → 복사 → 실행 기록까지.
// 실행: pnpm --filter @grammer-hub/web e2e  (서버는 스크립트가 직접 띄운다)
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  // 작업 공간 프로필은 예시 파일을 그대로 쓴다(DEMO-2의 [partner] 태그 → eximbay-partner 확정 경로를 검사)
  // 설정 화면 검사는 실제 .env를 건드리지 않도록 GH_ENV_FILE을 임시 파일로 돌린다
  env: { ...process.env, DATABASE_URL: `file:${join(dir, "e2e.db")}`, FAKE_PROVIDER: "1", ALLOWED_EMAIL: "e2e@example.com", WORKSPACE_PROFILE: "studio.workspace.example.json", GH_ENV_FILE: join(dir, "e2e.env") },
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


/** 하이드레이션 전에 fill하면 React 상태에 반영되지 않는다. 교정 버튼이 활성화될 때까지 재시도. */
async function fillDraft(page, text) {
  for (let i = 0; i < 20; i++) {
    await page.fill("textarea", text);
    const enabled = await page.locator("[data-testid=run]:not([disabled])").count();
    if (enabled > 0) return;
    await page.waitForTimeout(250);
  }
  throw new Error("draft fill never enabled the run button (hydration?)");
}

/** 임의 입력을 하이드레이션 이후까지 재시도(버튼이 활성화될 때까지). */
async function fillUntil(page, inputSel, text, enabledSel) {
  for (let i = 0; i < 20; i++) {
    await page.fill(inputSel, text);
    if ((await page.locator(enabledSel).count()) > 0) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`fill never enabled ${enabledSel}`);
}

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
  await fillDraft(page, "팀장님 어제 말씀하신 자료 정리해서 보내드릴께요. 커피 나오셨습니다 ㅎㅎ 연락은 010-1234-5678 로 부탁드리겠습니다.");
  await page.click("[data-testid=run]");
  const progressSeen = await page.waitForSelector("[data-testid=progress]", { timeout: 5000 }).then(() => true).catch(() => false);
  check("progress line shown while running", progressSeen);
  await page.waitForSelector("[data-card]", { timeout: 20000 });
  await page.waitForSelector("[data-testid=copy][data-done='1']", { timeout: 20000 }); // 완료 표시
  const cards = await page.locator("[data-card]").count();
  check("edit cards appear (>=4)", cards >= 4);
  check("run log lists events", (await page.locator("[data-testid=run-log]").count()) === 1 && /로그 \d+/.test(await page.textContent("[data-testid=run-log]")));
  check("original phone visible unmasked in card", (await page.textContent("body")).includes("010-1234-5678"));
  check("no stand-in leaked", !(await page.textContent("body")).includes("010-0000-0001"));

  // 첫 카드 수락, 두 번째 무시, 결과 보기 확인
  await page.locator("[data-card] button[aria-label='수락']").first().click();
  await page.locator("[data-card] button[aria-label='무시']").nth(1).click();
  await page.click("text=결과 보기");
  const result = await page.inputValue("[data-testid=result-text]");
  check("result applies accepted edit only", result.includes("보내드릴게요") && result.includes("나오셨습니다"));

  await page.click("[data-testid=copy]");
  await page.waitForSelector("text=복사했습니다", { timeout: 5000 });
  check("copy toast", true);

  // L3 대안
  await page.click("text=다시 쓰기");
  await page.click("[data-testid=run]");
  await page.waitForSelector("text=톤 대안", { timeout: 20000 });
  await page.locator("[data-rewrite]").nth(2).waitFor({ timeout: 20000 });
  check("rewrites rendered (3)", (await page.locator("[data-rewrite]").count()) === 3);

  await page.goto(`http://127.0.0.1:${PORT}/runs`, { waitUntil: "load" });
  await page.waitForSelector("td:has-text('fake-dev')", { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll("tbody tr.ant-table-row").length >= 2, null, { timeout: 10000 }).catch(() => {});
  const rows = await page.locator("tbody tr.ant-table-row").count();
  check("runs page lists 2 runs", rows === 2);
  if (rows !== 2) console.log("rows:", rows, (await page.locator("tbody").textContent()).slice(0, 300));
  const body = await page.textContent("body");
  check("feedback counted (1 accept / 1 reject)", /1\/1/.test(body));
  // ── 프롬프트 스튜디오: 질문 → 생성 → 보관 → 보관함에서 변수 채워 복사 ──
  await page.goto(`http://127.0.0.1:${PORT}/prompts`, { waitUntil: "load" });
  await fillUntil(page, "[data-testid=studio-goal] textarea, textarea[data-testid=studio-goal]", "재시도 로직 조사", "[data-testid=studio-run]:not([disabled])");
  await page.click("[data-testid=studio-runtime] >> text=채팅");   // 변수 채우기 흐름을 보려고 붙여넣기 모드로
  await page.click("[data-testid=studio-run]");
  await page.waitForSelector("[data-testid=studio-ask]", { timeout: 15000 });
  check("studio asks a question for a short goal", (await page.locator("[data-testid=studio-option]").count()) >= 2);
  await page.locator("label.ant-radio-button-wrapper:has([data-testid=studio-option])").first().click();
  await page.click("[data-testid=studio-answer]");
  await page.waitForSelector("[data-testid=studio-save]:not([disabled])", { timeout: 20000 });
  check("studio renders all slot cards", (await page.locator("[data-slot]").count()) === 14);
  const rendered = await page.textContent("[data-testid=studio-rendered]");
  check("rendered prompt has delimited variable", rendered.includes("<code>") && rendered.includes("{{code}}"));
  check("checks panel present", (await page.locator("[data-testid=studio-checks]").count()) === 1);
  await page.click("[data-testid=studio-save]");
  await page.waitForSelector("text=보관함에 저장했습니다", { timeout: 5000 });
  await page.click("[data-testid=studio-tab] >> text=보관함");
  await page.waitForSelector("[data-prompt-item]", { timeout: 10000 });
  check("library lists saved prompt", (await page.locator("[data-prompt-item]").count()) === 1);
  await page.locator("[data-prompt-item]").first().click();
  await page.waitForSelector("[data-var=code]", { timeout: 10000 });
  await page.fill("[data-var=code]", "function retry() {}");
  await page.click("[data-testid=prompt-fill-copy]");
  await page.waitForSelector("text=채운 프롬프트를 복사했습니다", { timeout: 5000 });
  const drawerText = await page.textContent(".ant-drawer [data-testid=studio-rendered]");
  check("filled prompt replaces the variable", drawerText.includes("function retry() {}") && !drawerText.includes("{{code}}"));

  // 영어 지시문: 긴 목표는 바로 ready → 생성. 답변 언어 규칙이 자동 삽입된다.
  await page.goto(`http://127.0.0.1:${PORT}/prompts`, { waitUntil: "load" });
  await fillUntil(page, "[data-testid=studio-goal] textarea, textarea[data-testid=studio-goal]", "결제 승인 모듈의 재시도 로직을 파악해서 타임아웃 버그를 고치기 전에 흐름을 정리한 문서를 만든다", "[data-testid=studio-run]:not([disabled])");
  await page.click("[data-testid=studio-lang] >> text=영어 지시문");
  await page.click("[data-testid=studio-run]");
  await page.waitForSelector("[data-testid=studio-save]:not([disabled])", { timeout: 20000 });
  const en = await page.textContent("[data-testid=studio-rendered]");
  check("english prompt forces korean answers", en.includes("## Scope and constraints") && en.includes("## Done when") && en.includes("respond in Korean"));
  check("dev domain defaults to Claude Code runtime (starting points, no variables)", en.includes("## Where to start") && !en.includes("{{"));

  // Jira 티켓 → 프롬프트 (DEMO-1: 토큰 없이). 첨부 때문에 질문 1개 → 답변 → 생성 → 보관 → 보관함 태그
  await page.goto(`http://127.0.0.1:${PORT}/prompts`, { waitUntil: "load" });
  await page.click("[data-testid=studio-mode] >> text=Jira 티켓");
  await fillUntil(page, "[data-testid=ticket-input]", "DEMO-1", "[data-testid=ticket-fetch]:not([disabled])");
  await page.waitForSelector("[data-testid=workspace-status]", { timeout: 10000 });
  check("workspace profile status is shown", ((await page.textContent("[data-testid=workspace-status]")) ?? "").includes("저장소 3개"));
  await page.click("[data-testid=ticket-fetch]");
  await page.waitForSelector("[data-testid=ticket-review]", { timeout: 15000 });
  check("ticket review shows suggested goal", (await page.inputValue("[data-testid=ticket-goal]")).includes("DEMO-1"));
  check("profile resolved the repo from the label (no 'where' question)", ((await page.textContent("[data-testid=ticket-review]")) ?? "").includes("코드가 확정") && (await page.locator("[data-testid=ticket-option]").count()) === 2);
  check("verify-in-repo list is prefilled from the ledger", ((await page.inputValue("[data-testid=ticket-verify]")) ?? "").length > 0);
  await page.locator("label.ant-radio-button-wrapper:has([data-testid=ticket-option])").first().click();
  await page.click("[data-testid=ticket-generate]");
  await page.waitForSelector("[data-testid=studio-save]:not([disabled])", { timeout: 20000 });
  const fromTicket = await page.textContent("[data-testid=studio-rendered]");
  check("ticket prompt is Claude Code style with starting points and a scope line", fromTicket.includes("## 시작점") && fromTicket.includes("## 범위와 제약") && fromTicket.includes("설계안만 낸다") && !fromTicket.includes("{{"));
  await page.click("[data-testid=studio-save]");
  await page.waitForSelector("text=보관함에 저장했습니다", { timeout: 5000 });
  await page.click("[data-testid=studio-tab] >> text=보관함");
  await page.waitForSelector("[data-ticket-tag]", { timeout: 10000 });
  check("library shows ticket tag", (await page.textContent("[data-ticket-tag]")) === "DEMO-1");

  // 제목뿐인 티켓(DEMO-2): 프로필이 [partner] → eximbay-partner를 확정하므로 저장소는 묻지 않고 업무 판단(policy) 하나만 묻는다.
  await page.goto(`http://127.0.0.1:${PORT}/prompts`, { waitUntil: "load" });
  await page.click("[data-testid=studio-mode] >> text=Jira 티켓");
  await fillUntil(page, "[data-testid=ticket-input]", "DEMO-2", "[data-testid=ticket-fetch]:not([disabled])");
  await page.click("[data-testid=ticket-fetch]");
  await page.waitForSelector("[data-testid=ticket-review]", { timeout: 15000 });
  const terseText = (await page.textContent("[data-testid=ticket-review]")) ?? "";
  check("terse ticket: repo resolved by alias, only the policy question remains", terseText.includes("eximbay-partner") && terseText.includes("[partner]") && !terseText.includes("어느 저장소에서 작업하나요") && (await page.locator("[data-testid=ticket-option]").count()) === 2);
  await page.click("text=필요 정보 장부");
  check("needs ledger lists every universal need", (await page.locator("[data-testid=needs-ledger] li").count()) === 6);
  await page.click("[data-testid=ticket-assume]");
  await page.waitForSelector("[data-testid=studio-save]:not([disabled])", { timeout: 20000 });
  check("terse ticket still yields a Claude Code prompt", ((await page.textContent("[data-testid=studio-rendered]")) ?? "").includes("## 시작점"));

  // 설정 화면: .env 대신 편집 → 저장 → 다시 읽어도 남는다. 프로필 편집기는 잘못된 JSON을 막는다.
  await page.goto(`http://127.0.0.1:${PORT}/settings`, { waitUntil: "load" });
  await page.waitForSelector("[data-testid=settings-page]", { timeout: 15000 });
  check("settings shows backend health line", ((await page.textContent("[data-testid=settings-health]")) ?? "").includes("fake"));
  await fillUntil(page, "[data-testid=setting-LOG_FILE] input", "/tmp/gh-e2e.log", "[data-testid=settings-save]:not([disabled])");
  await page.click("[data-testid=settings-save]");
  await page.waitForSelector("text=저장했습니다", { timeout: 5000 });
  await page.goto(`http://127.0.0.1:${PORT}/settings`, { waitUntil: "load" });
  await page.waitForSelector("[data-testid=setting-LOG_FILE] input", { timeout: 15000 });
  check("saved setting survives reload and is written to the env file", (await page.inputValue("[data-testid=setting-LOG_FILE] input")) === "/tmp/gh-e2e.log" && readFileSync(join(dir, "e2e.env"), "utf8").includes("LOG_FILE=/tmp/gh-e2e.log"));
  await page.fill("[data-testid=workspace-editor]", "{ not json");
  await page.click("[data-testid=workspace-save]");
  await page.waitForSelector("[data-testid=workspace-error]", { timeout: 5000 });
  check("workspace editor rejects invalid JSON", ((await page.textContent("[data-testid=workspace-error]")) ?? "").includes("JSON"));
  const health = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
  check("health reflects the runtime-updated setting without restart", health.ok === true && (await (await fetch(`http://127.0.0.1:${PORT}/api/settings`)).json()).items.some((i) => i.key === "LOG_FILE" && i.value === "/tmp/gh-e2e.log" && i.source === "file"));

  // 화면 취향: 글자 크기를 바꾸면 body zoom이 걸리고 새로고침해도 남는다(localStorage)
  await page.click("[data-testid=pref-scale] >> text=더 크게");
  await page.waitForTimeout(200);
  check("font scale applies as body zoom", (await page.evaluate(() => document.body.style.zoom)) === "1.25");
  await page.click("[data-testid=pref-theme] >> text=다크");
  await page.waitForTimeout(200);
  check("theme pref switches to dark", (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark");
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("[data-testid=appearance-card]", { timeout: 15000 });
  await page.waitForTimeout(300);
  check("appearance prefs survive reload", (await page.evaluate(() => document.body.style.zoom)) === "1.25" && (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark");

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
