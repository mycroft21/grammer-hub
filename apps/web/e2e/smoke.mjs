// E2E 스모크: FAKE_PROVIDER=1 서버를 대상으로 에디터 → 카드 → 수락 → 복사 → 실행 기록까지.
// 실행: pnpm --filter @grammer-hub/web e2e  (서버는 스크립트가 직접 띄운다)
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const PORT = process.env.E2E_PORT ?? "3199";
const dir = mkdtempSync(join(tmpdir(), "gh-e2e-"));
const ROOT = new URL("../../..", import.meta.url).pathname;
// 작업 공간 프로필은 예시를 임시 폴더에 복사해 쓴다: 검토 화면의 "프로필에 추가"와 설정 폼 저장이 실제 파일에 쓰기 때문
const profilePath = join(dir, "studio.workspace.json");
copyFileSync(join(ROOT, "studio.workspace.example.json"), profilePath);
// pnpm을 거치지 않고 next 바이너리를 직접 띄우고, 프로세스 그룹 단위로 종료한다(고아 서버 방지).
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", PORT], {
  cwd: new URL("..", import.meta.url).pathname,
  // 작업 공간 프로필은 예시의 임시 복사본(DEMO-2의 [partner] 태그 → eximbay-partner 확정 경로를 검사)
  // 설정 화면 검사는 실제 .env를 건드리지 않도록 GH_ENV_FILE을 임시 파일로 돌린다
  // Jira는 빈 값으로 고정한다: Next가 .env를 자동으로 읽어 실제 계정으로 외부 호출을 하지 않게(빈 값도 "설정됨"이라 .env가 덮지 않는다)
  env: { ...process.env, DATABASE_URL: `file:${join(dir, "e2e.db")}`, FAKE_PROVIDER: "1", ALLOWED_EMAIL: "e2e@example.com", WORKSPACE_PROFILE: profilePath, GH_ENV_FILE: join(dir, "e2e.env"), JIRA_BASE_URL: "", JIRA_EMAIL: "", JIRA_API_TOKEN: "" },
  stdio: ["ignore", "pipe", "pipe"], detached: true,
});
const extraStops = [];
const stopServer = () => { for (const f of extraStops.splice(0)) { try { f(); } catch {} } try { process.kill(-server.pid, "SIGTERM"); } catch { try { server.kill("SIGTERM"); } catch {} } };
process.on("exit", stopServer);
const waitServer = async (port = PORT, path = "/api/profiles", okStatuses = [200]) => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual" }); if (okStatuses.includes(r.status)) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server on ${port} did not start`);
};

/**
 * 가짜 OIDC IdP(discovery·authorize·token·jwks). authorize는 묻지 않고 바로 콜백으로 돌려보내며,
 * 어떤 이메일로 로그인시킬지는 `state.email`로 테스트가 정한다. id_token은 RS256으로 서명해 서버의 jose 검증을 실제로 거친다.
 */
async function startFakeIdp(port, clientSecret) {
  const { generateKeyPair, exportJWK, SignJWT } = require("jose");
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "e2e", alg: "RS256", use: "sig" };
  const issuer = `http://127.0.0.1:${port}`;
  const codes = new Map();
  const state = { email: "tester@example.com", authorizeHits: 0 };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, issuer);
    const json = (o, status = 200) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
    if (u.pathname === "/.well-known/openid-configuration") return json({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` });
    if (u.pathname === "/jwks") return json({ keys: [jwk] });
    if (u.pathname === "/authorize") {
      state.authorizeHits++;
      const code = randomUUID();
      codes.set(code, { nonce: u.searchParams.get("nonce"), aud: u.searchParams.get("client_id"), email: state.email, challenge: u.searchParams.get("code_challenge") });
      res.statusCode = 302; res.setHeader("location", `${u.searchParams.get("redirect_uri")}?code=${code}&state=${encodeURIComponent(u.searchParams.get("state"))}`); return res.end();
    }
    if (u.pathname === "/token") {
      let body = ""; for await (const c of req) body += c;
      const p = new URLSearchParams(body); const c = codes.get(p.get("code"));
      if (!c || p.get("client_secret") !== clientSecret || !p.get("code_verifier")) return json({ error: "invalid_grant" }, 400);
      codes.delete(p.get("code"));
      const id_token = await new SignJWT({ email: c.email, email_verified: true, name: "E2E 사용자", nonce: c.nonce })
        .setProtectedHeader({ alg: "RS256", kid: "e2e" }).setIssuer(issuer).setAudience(c.aud).setSubject(c.email).setIssuedAt().setExpirationTime("5m").sign(privateKey);
      return json({ id_token, access_token: "x", token_type: "Bearer" });
    }
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => srv.listen(port, "127.0.0.1", r));
  return { state, issuer, close: () => srv.close() };
}


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
  // 프로필을 바꿔 골라도 편집 폼이 처음 고른 값에 머물지 않는다(useForm 인스턴스가 이전 값을 들고 있던 문제)
  await page.goto(`http://127.0.0.1:${PORT}/profiles`, { waitUntil: "load" });
  await page.click(".ant-card:has-text('상급자 · 메시지')");
  await page.waitForSelector("aside input#name", { timeout: 5000 });
  const firstName = await page.inputValue("aside input#name");
  await page.click(".ant-card:has-text('고객 · 이메일 안내')");
  await page.waitForFunction(() => document.querySelector("aside input#name")?.value === "고객 · 이메일 안내", null, { timeout: 5000 }).catch(() => {});
  check("profile editor follows the selected card", firstName === "상급자 · 메시지" && (await page.inputValue("aside input#name")) === "고객 · 이메일 안내");

  // 에디터에서 새 상황 만들기: 드롭다운 맨 아래 → 지금 프로필 값으로 채운 서랍 → 저장하고 쓰기 / 이번만 쓰기 → 다음에 열면 저장·삭제를 묻는다
  // antd v6 단일 선택은 고른 값을 .ant-select-content의 title로 보여 준다
  const selectedProfile = async () => ((await page.getAttribute("[data-testid=profile-select] .ant-select-content", "title")) ?? "").trim();
  const openNewSituation = async () => {
    await page.click("[data-testid=profile-select]");
    await page.click("[data-testid=new-situation]");
    await page.waitForSelector(".ant-drawer [data-testid=situation-save]", { timeout: 5000 });
  };
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
  await page.waitForSelector("[data-testid=profile-select]");
  await openNewSituation();
  await page.click("[data-testid=situation-save]");
  await page.waitForSelector("text=저장하려면 이름이 필요합니다", { timeout: 5000 });
  await page.fill(".ant-drawer input#name", "협력사 · 메일");
  await page.click("[data-testid=situation-save]");
  await page.waitForSelector(".ant-drawer [data-testid=situation-save]", { state: "detached", timeout: 5000 }).catch(() => {});
  check("new situation from the editor is saved and selected", (await selectedProfile()) === "협력사 · 메일");
  await openNewSituation();
  const reopenedName = await page.inputValue(".ant-drawer input#name");
  await page.click("[data-testid=situation-temp]");
  await page.waitForSelector(".ant-drawer [data-testid=situation-temp]", { state: "detached", timeout: 5000 }).catch(() => {});
  check("'use once' creates a temporary profile, selected, without asking yet (drawer reopens empty)", reopenedName === "" && (await selectedProfile()).startsWith("임시 · ") && (await selectedProfile()).endsWith("(임시)") && (await page.locator("[data-testid=temp-profiles]").count()) === 0);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("[data-testid=temp-profiles]", { timeout: 5000 });
  await page.click("[data-testid=drop-temp]");
  await page.waitForSelector("[data-testid=temp-profiles]", { state: "detached", timeout: 5000 }).catch(() => {});
  const profilesNow = await (await fetch(`http://127.0.0.1:${PORT}/api/profiles`)).json();
  check("next visit asks about the temporary profile and dropping it deletes it", profilesNow.every((p) => !p.temporary) && profilesNow.some((p) => p.name === "협력사 · 메일" && p.temporary === false));

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

  // 스튜디오 실행 기록: 위 흐름(의도 정리 2회 + 생성 1회, 보관함 저장)이 기록 화면 프롬프트 탭에 남고, 저장한 생성은 보관함으로 이어진다
  await page.goto(`http://127.0.0.1:${PORT}/runs`, { waitUntil: "load" });
  await page.click("[data-testid=runs-tab] >> text=프롬프트");
  await page.waitForSelector("[data-testid=prompt-runs] .ant-table-row", { timeout: 10000 });
  const promptRunText = await page.locator("[data-testid=prompt-runs] .ant-table-row").allTextContents();
  check("prompt runs tab lists plan and generate runs", promptRunText.length >= 3 && promptRunText.some((t) => t.includes("생성")) && promptRunText.filter((t) => t.includes("의도 정리")).length >= 2);
  check("saved generate run links to the library", (await page.locator("[data-testid=run-prompt-link]").count()) === 1);
  await page.click("[data-testid=run-prompt-link]");
  await page.waitForSelector(".ant-drawer [data-testid=studio-rendered]", { timeout: 10000 });
  check("library link opens the saved prompt", ((await page.textContent(".ant-drawer")) ?? "").includes("테스트 프롬프트"));

  // 다회차 질문: 답을 반영하면 새 질문이 아래에 붙고 위 답은 남는다 → 즉시 생성. 폼의 '모호하면 묻기'가 프롬프트의 질문 정책이 된다.
  await page.goto(`http://127.0.0.1:${PORT}/prompts`, { waitUntil: "load" });
  await fillUntil(page, "[data-testid=studio-goal] textarea, textarea[data-testid=studio-goal]", "여러 번 묻는 재시도 조사", "[data-testid=studio-run]:not([disabled])");
  await page.click("[data-testid=studio-run]");
  await page.waitForSelector("[data-testid=studio-ask]", { timeout: 15000 });
  const round1 = await page.locator("[data-testid=studio-ask] .rounded-lg").count();
  await page.locator("label.ant-radio-button-wrapper:has([data-testid=studio-option])").first().click();
  await page.click("[data-testid=studio-answer]");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=studio-ask] .rounded-lg").length === 2, null, { timeout: 15000 }).catch(() => {});
  const asked = await page.locator("[data-testid=studio-ask] .rounded-lg").allTextContents();
  check("follow-up question is appended below the first", round1 === 1 && asked.length === 2 && asked[0].includes("어느 깊이까지") && asked[1].includes("파악한 뒤"));
  // 보관함 탭에 다녀와도 이미 반영한 답은 남는다
  await page.click("[data-testid=studio-tab] >> text=보관함");
  await page.click("[data-testid=studio-tab] >> text=만들기");
  await page.waitForSelector("[data-testid=studio-ask]", { timeout: 5000 });
  check("earlier answer stays selected and editable (even after switching tabs)", (await page.locator("[data-testid=studio-ask] .rounded-lg").first().locator(".ant-radio-button-wrapper-checked").count()) === 1
    && (await page.locator("[data-testid=studio-ask] .rounded-lg").first().locator(".ant-radio-button-wrapper-disabled").count()) === 0);
  await page.click("[data-testid=studio-now]");
  await page.waitForSelector("[data-testid=studio-save]:not([disabled])", { timeout: 20000 });
  check("ask_first from the form becomes 'stop and ask before starting'", ((await page.textContent("[data-testid=studio-rendered]")) ?? "").includes("작업을 시작하기 전에 멈추고"));

  // 영어 지시문: 긴 목표는 바로 ready → 생성. 답변 언어 규칙이 자동 삽입된다.
  await page.goto(`http://127.0.0.1:${PORT}/prompts`, { waitUntil: "load" });
  await fillUntil(page, "[data-testid=studio-goal] textarea, textarea[data-testid=studio-goal]", "결제 승인 모듈의 재시도 로직을 파악해서 타임아웃 버그를 고치기 전에 흐름을 정리한 문서를 만든다", "[data-testid=studio-run]:not([disabled])");
  await page.click("[data-testid=studio-lang] >> text=영어 지시문");
  await page.click("[data-testid=studio-run]");
  await page.waitForSelector("[data-testid=studio-save]:not([disabled])", { timeout: 20000 });
  const en = await page.textContent("[data-testid=studio-rendered]");
  check("english prompt forces korean answers", en.includes("## Scope and constraints") && en.includes("## Done when") && en.includes("respond in Korean"));
  check("dev domain defaults to Claude Code runtime (starting points, no variables)", en.includes("## Where to start") && !en.includes("{{"));

  // 입력 초기화: 위 영어 실행의 목표가 임시 저장에서 복원되고, 지우기 아이콘으로 비우면 새로고침해도 되살아나지 않는다
  await page.goto(`http://127.0.0.1:${PORT}/prompts`, { waitUntil: "load" });
  await page.waitForFunction(() => (document.querySelector("[data-testid=studio-goal] textarea, textarea[data-testid=studio-goal]")?.value ?? "").length > 0, null, { timeout: 5000 }).catch(() => {});
  const restoredGoal = await page.inputValue("[data-testid=studio-goal] textarea, textarea[data-testid=studio-goal]");
  await page.locator(".ant-input-clear-icon").first().click({ force: true });
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("[data-testid=studio-run]");
  await page.waitForTimeout(500);
  check("clearing the goal deletes the draft (no revival after reload)", restoredGoal.length > 0 && (await page.inputValue("[data-testid=studio-goal] textarea, textarea[data-testid=studio-goal]")) === "");
  // 설정 프리셋: 채팅·영어로 바꿔 저장 → 처음부터(기본값) → 프리셋을 고르면 다시 채팅·영어. 목표 문장은 저장하지 않는다
  const picked = async (tid) => ((await page.textContent(`[data-testid=${tid}] .ant-segmented-item-selected`)) ?? "").trim();
  await page.click("[data-testid=studio-runtime] >> text=채팅");
  await page.click("[data-testid=studio-lang] >> text=영어 지시문");
  await page.click("[data-testid=preset-save]");
  await page.fill("[data-testid=preset-name]", "채팅·영어");
  await page.click(".ant-modal-footer .ant-btn-primary");
  await page.waitForSelector("text=현재 설정을 프리셋으로 저장했습니다", { timeout: 5000 });
  await page.click("[data-testid=studio-reset]");
  const afterReset = [await picked("studio-runtime"), await picked("studio-lang")];
  await page.click("[data-testid=studio-preset]");
  await page.click(".ant-select-item-option >> text=채팅·영어");
  check("reset returns to defaults and a preset refills its settings", !afterReset[0].includes("채팅") && !afterReset[1].includes("영어") && (await picked("studio-runtime")).includes("채팅") && (await picked("studio-lang")).includes("영어"));
  const presetsJson = await (await fetch(`http://127.0.0.1:${PORT}/api/prompts/presets`)).json();
  const withGoal = await fetch(`http://127.0.0.1:${PORT}/api/prompts/presets`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x", settings: { ...presetsJson[0].settings, goal: "목표 문장" } }) });
  check("presets store settings only and reject a goal", presetsJson.length === 1 && !("goal" in presetsJson[0].settings) && "clarify" in presetsJson[0].settings && withGoal.status === 400);
  // 보관함 '이 설정으로 새로 만들기': 처음 보관한 채팅 프롬프트의 설정으로 폼이 열리고 목표는 비어 있다
  await page.click("[data-testid=studio-runtime] >> text=Claude Code");
  await page.click("[data-testid=studio-tab] >> text=보관함");
  await page.waitForSelector("[data-prompt-item]", { timeout: 10000 });
  await page.locator("[data-prompt-item]").first().click();
  await page.waitForSelector("[data-testid=prompt-reuse]", { timeout: 10000 });
  await page.click("[data-testid=prompt-reuse]");
  await page.waitForSelector("[data-testid=studio-run]", { timeout: 5000 });
  check("library 'reuse settings' opens the form with that prompt's settings and an empty goal", (await picked("studio-runtime")).includes("채팅") && (await page.inputValue("[data-testid=studio-goal] textarea, textarea[data-testid=studio-goal]")) === "");

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
  // "프로필에 추가": 코드가 확정한 저장소(reporter-api, 검증 명령 있음)에는 힌트가 없다. 사용자가 reporter-legacy로 바꾸면
  // 별칭 후보([Feature]·feature — 이미 아는 reporter-api 라벨은 제외)와 검증 명령 입력이 나오고, 클릭하면 내 작업 공간(DB)에 얹힌다(팀 파일은 그대로).
  check("no profile hints while the code-resolved repo is selected", (await page.locator("[data-testid=profile-hints]").count()) === 0);
  await page.click("[data-testid=ticket-repos] .ant-select-selection-item[title=reporter-api] .ant-select-selection-item-remove");
  await page.click("[data-testid=ticket-repos]");
  await page.click(".ant-select-dropdown .ant-select-item-option[title=reporter-legacy]");
  await page.keyboard.press("Escape");
  await page.waitForSelector("[data-testid=profile-hints]", { timeout: 5000 });
  const aliasButtons = await page.locator("[data-testid=profile-hint-alias]").allTextContents();
  check("hints offer unknown title tag and label as aliases, not the known one", aliasButtons.some((t) => t.includes("[Feature]")) && aliasButtons.some((t) => t.includes("feature")) && !aliasButtons.some((t) => t.includes("reporter-api")));
  check("hints ask for a verify command when the repo has none", (await page.locator("[data-testid=profile-hint-verify]").count()) === 1);
  await page.click("[data-testid=profile-hint-alias]:has-text('[Feature]')");
  await page.waitForFunction(() => !Array.from(document.querySelectorAll("[data-testid=profile-hint-alias]")).some((b) => b.textContent?.includes("[Feature]")), null, { timeout: 5000 });
  await page.fill("[data-testid=profile-hint-cmd]", "./gradlew test");
  await page.click("[data-testid=profile-hint-add-verify]");
  await page.waitForSelector("[data-testid=profile-hint-verify]", { state: "detached", timeout: 5000 });
  const teamFile = JSON.parse(readFileSync(profilePath, "utf8"));
  const myWs = await (await fetch(`http://127.0.0.1:${PORT}/api/me/workspace`)).json();
  const myLegacy = myWs.overlay.repos.find((r) => r.name === "reporter-legacy");
  check("one-click additions land in my workspace as an add-on, team file unchanged",
    myLegacy?.aliases.includes("[Feature]") && myLegacy.verify.includes("./gradlew test") && !myLegacy.what
    && !teamFile.repos.find((r) => r.name === "reporter-legacy").aliases.includes("[Feature]") && myWs.workspace.repos.find((r) => r.name === "reporter-legacy").aliases.includes("[Feature]"));
  await page.locator("label.ant-radio-button-wrapper:has([data-testid=ticket-option])").first().click();
  await page.click("[data-testid=ticket-generate]");
  await page.waitForSelector("[data-testid=studio-save]:not([disabled])", { timeout: 20000 });
  const fromTicket = await page.textContent("[data-testid=studio-rendered]");
  check("ticket prompt is Claude Code style with starting points and a scope line", fromTicket.includes("## 시작점") && fromTicket.includes("## 범위와 제약") && fromTicket.includes("설계안만 낸다") && fromTicket.includes("필수로 적힌 항목") && fromTicket.includes("설계 문서 전체를 대상 저장소 안의") && !fromTicket.includes("{{"));
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
  // 카드별 연결 확인: 모델(가짜)은 정상, Jira는 설정이 없어 실패로 구분해 보인다. 로그인 없는 모드라 공개 health의 probe도 그대로 돈다
  await page.click("[data-testid=probe-cloud]");
  await page.waitForSelector("[data-testid=probe-result-cloud]", { timeout: 10000 });
  await page.click("[data-testid=probe-jira]");
  await page.waitForSelector("[data-testid=probe-result-jira]", { timeout: 10000 });
  check("probe: model ok and jira reports missing settings per card", ((await page.textContent("[data-testid=probe-result-cloud]")) ?? "").includes("가짜 모델")
    && ((await page.textContent("[data-testid=probe-result-jira]")) ?? "").includes("셋 다"));
  check("probe: public health still probes when login is off", (await (await fetch(`http://127.0.0.1:${PORT}/api/health?probe=1`)).json()).cloud?.health?.ok === true);
  await fillUntil(page, "[data-testid=setting-LOG_FILE] input", "/tmp/gh-e2e.log", "[data-testid=settings-save]:not([disabled])");
  await page.click("[data-testid=settings-save]");
  await page.waitForSelector("text=저장했습니다", { timeout: 5000 });
  await page.goto(`http://127.0.0.1:${PORT}/settings`, { waitUntil: "load" });
  await page.waitForSelector("[data-testid=setting-LOG_FILE] input", { timeout: 15000 });
  check("saved setting survives reload and is written to the env file", (await page.inputValue("[data-testid=setting-LOG_FILE] input")) === "/tmp/gh-e2e.log" && readFileSync(join(dir, "e2e.env"), "utf8").includes("LOG_FILE=/tmp/gh-e2e.log"));
  // 팀 프로필 폼: 파일이 폼으로 열리고(검토 화면에서 추가한 별칭은 내 작업 공간에 있으므로 팀 폼엔 없다), 빈 저장소는 칸 옆 오류로 막히며, 채우면 저장된다
  await page.waitForSelector("[data-testid=workspace-form]", { timeout: 10000 });
  check("profile opens as a form with the file's repos", (await page.locator("[data-testid=ws-repo-0]").count()) === 1 && (await page.inputValue("[data-testid=ws-repo-name-0]")) === "reporter-api");
  check("team form does not show my personal alias", !((await page.textContent("[data-testid=ws-repo-aliases-1]")) ?? "").includes("[Feature]"));
  await page.click("[data-testid=ws-repo-add]");
  await page.click("[data-testid=workspace-save]");
  await page.waitForSelector("[data-testid=ws-field-error]", { timeout: 5000 });
  check("empty repo row is rejected with a field-level error", (await page.locator("[data-testid=ws-field-error]").count()) >= 2 && ((await page.textContent("[data-testid=workspace-error]")) ?? "").includes("칸"));
  await page.fill("[data-testid=ws-repo-name-3]", "billing-batch");
  await page.fill("[data-testid=ws-repo-what-3]", "정산 배치");
  await page.click("[data-testid=workspace-save]");
  await page.waitForSelector("text=프로필을 저장했습니다 · 저장소 4개", { timeout: 5000 });
  const savedProfile = JSON.parse(readFileSync(profilePath, "utf8"));
  check("form save writes a valid profile with the new repo", savedProfile.repos.length === 4 && savedProfile.repos[3].name === "billing-batch" && !savedProfile.repos[1].aliases.includes("[Feature]"));
  // 내보내기: 현재 내용이 studio.workspace.json 으로 내려온다
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.click("[data-testid=workspace-export]")]);
  check("export downloads studio.workspace.json", download.suggestedFilename() === "studio.workspace.json");
  // 가져오기: 팀에서 받은 파일을 고르면 폼이 그 내용으로 바뀌고(저장 전), 저장하면 파일에 쓰인다
  const importPath = join(dir, "team.workspace.json");
  writeFileSync(importPath, JSON.stringify({ ...savedProfile, team: "가져온 팀", repos: savedProfile.repos.slice(0, 2) }, null, 2));
  await page.setInputFiles("[data-testid=workspace-import]", importPath);
  await page.waitForFunction(() => document.querySelector("[data-testid=ws-team]")?.value === "가져온 팀", null, { timeout: 5000 });
  check("import fills the form without saving yet", (await page.locator("[data-testid^=ws-repo-name-]").count()) === 2 && JSON.parse(readFileSync(profilePath, "utf8")).repos.length === 4);
  await page.click("[data-testid=workspace-save]");
  await page.waitForSelector("text=프로필을 저장했습니다 · 저장소 2개", { timeout: 5000 });
  check("saving the imported profile writes it to the file", JSON.parse(readFileSync(profilePath, "utf8")).team === "가져온 팀");
  // JSON 탭은 남아 있고, 잘못된 JSON은 서버가 막는다
  await page.click("[data-testid=workspace-card] .ant-tabs-tab:has-text('JSON')");
  await page.fill("[data-testid=workspace-editor]", "{ not json");
  await page.click("[data-testid=workspace-save]");
  await page.waitForSelector("[data-testid=workspace-error]", { timeout: 5000 });
  check("workspace editor rejects invalid JSON", ((await page.textContent("[data-testid=workspace-error]")) ?? "").includes("JSON"));
  const health = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
  check("health reflects the runtime-updated setting without restart", health.ok === true && (await (await fetch(`http://127.0.0.1:${PORT}/api/settings`)).json()).items.some((i) => i.key === "LOG_FILE" && i.value === "/tmp/gh-e2e.log" && i.source === "file"));

  // 화면 취향(내 설정): 글자 크기를 바꾸면 body zoom이 걸리고 새로고침해도 남는다(localStorage)
  await page.goto(`http://127.0.0.1:${PORT}/me`, { waitUntil: "load" });
  await page.waitForSelector("[data-testid=appearance-card]", { timeout: 15000 });
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

  // ── 팀 서버 로그인(OIDC): 가짜 IdP + 로그인 모드의 두 번째 서버. 사람별 데이터 분리·관리자 전용 설정·허용 목록·쿠키 위조까지 ──
  const IDP_PORT = String(Number(PORT) + 2), PORT2 = String(Number(PORT) + 1), BASE2 = `http://127.0.0.1:${PORT2}`;
  const CLIENT_SECRET = "e2e-secret-1234567890";
  const idp = await startFakeIdp(IDP_PORT, CLIENT_SECRET);
  extraStops.push(idp.close);
  const profile2 = join(dir, "team.workspace.json");
  copyFileSync(join(ROOT, "studio.workspace.example.json"), profile2);
  const server2 = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", PORT2], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: `file:${join(dir, "team.db")}`, FAKE_PROVIDER: "1", WORKSPACE_PROFILE: profile2, GH_ENV_FILE: join(dir, "team.env"),
      OIDC_ISSUER: idp.issuer, OIDC_CLIENT_ID: "gh-e2e", OIDC_CLIENT_SECRET: CLIENT_SECRET, APP_URL: "", JIRA_BASE_URL: "", JIRA_EMAIL: "", JIRA_API_TOKEN: "", AUTH_SECRET: "e2e-session-secret-0123456789",
      AUTH_ALLOWED_DOMAINS: "example.com", AUTH_ADMIN_EMAILS: "admin@example.com" },
    stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  extraStops.push(() => { try { process.kill(-server2.pid, "SIGTERM"); } catch {} });
  await waitServer(PORT2, "/api/health", [200]);
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await ctx2.newPage();
  const call = (path, init) => p2.evaluate(async ([path, init]) => { const r = await fetch(path, init); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: r.status, json, text }; }, [path, init ?? {}]);
  const jsonInit = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  await p2.goto(`${BASE2}/runs`, { waitUntil: "load" });
  check("auth: unauthenticated page is redirected to /login with next", p2.url().includes("/login?next=%2Fruns"));
  check("auth: unauthenticated API gets 401", (await fetch(`${BASE2}/api/runs`)).status === 401);
  check("auth: health stays reachable without a session and reports login on", (await (await fetch(`${BASE2}/api/health`)).json()).auth?.enabled === true);
  const pubProbe = await (await fetch(`${BASE2}/api/health?probe=1`)).json();
  check("auth: public health ignores probe=1 in login mode", pubProbe.cloud?.health === null && typeof pubProbe.cloud?.probeIgnored === "string");
  check("auth: probe API needs a session", (await fetch(`${BASE2}/api/settings/probe`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: "cloud" }) })).status === 401);

  idp.state.email = "tester@example.com";
  await p2.click("[data-testid=login-button]");
  await p2.waitForURL((u) => u.pathname === "/runs", { timeout: 15000 });
  const meTester = (await call("/api/auth/me")).json;
  check("auth: team member logs in through the IdP and lands on the requested page", meTester?.email === "tester@example.com" && meTester.admin === false && idp.state.authorizeHits === 1);
  await p2.goto(`${BASE2}/`, { waitUntil: "load" });
  await p2.waitForSelector("[data-testid=me-email], [data-testid=logout]", { timeout: 10000 });
  check("auth: non-admin does not see the settings menu", (await p2.locator("a[href='/settings']").count()) === 0);
  await p2.goto(`${BASE2}/settings`, { waitUntil: "load" });
  check("auth: non-admin is bounced from /settings", new URL(p2.url()).pathname === "/");
  check("auth: non-admin settings API is 403", (await call("/api/settings")).status === 403 && (await call("/api/settings/probe", jsonInit("POST", { target: "cloud" }))).status === 403);
  check("team: non-admin cannot read team stats", (await call("/api/team/stats")).status === 403 && (await p2.locator("a[href='/team']").count()) === 0);
  // 작업 공간: 팀 기본값(파일)은 관리자만, '프로필에 추가'와 내 작업 공간은 본인 것
  check("auth: non-admin cannot write the team workspace (PATCH)", (await call("/api/settings/workspace", jsonInit("PATCH", { ops: [{ op: "add_verify", repo: "reporter-legacy", command: "./gradlew test" }] }))).status === 403);
  check("workspace: non-admin adds to their own workspace from review (PATCH)", (await call("/api/me/workspace", jsonInit("PATCH", { ops: [{ op: "add_alias", repo: "reporter-legacy", alias: "tester-only" }] }))).status === 200);
  const badOverlay = await call("/api/me/workspace", jsonInit("PUT", { overlay: { version: 1, repos: [{ name: "reporter-api", what: "덮어쓰기", aliases: [], entry: [], verify: [], notes: [] }] } }));
  check("workspace: my layer cannot override a team repo's description", badOverlay.status === 400 && Boolean(badOverlay.json?.error?.issues?.["repos.0.what"]));
  check("workspace: merged repos include my alias for me", (await call("/api/prompts/ticket")).json?.workspace?.repos?.find((r) => r.name === "reporter-legacy")?.aliases.includes("tester-only"));
  await p2.goto(`${BASE2}/me`, { waitUntil: "load" });
  await p2.waitForSelector("[data-testid=my-workspace-card] [data-testid=ws-repo-onteam-0]", { timeout: 15000 });
  check("me: non-admin sees My settings with the add-on marked as a team repo", (await p2.locator("a[href='/me']").count()) > 0 && (await p2.inputValue("[data-testid=ws-repo-name-0]")) === "reporter-legacy");
  const corr = await call("/api/correct", jsonInit("POST", { text: "보내드릴께요 확인 부탁드립니다", profileId: "boss-slack", level: "L2" }));
  check("auth: team member can run a correction", corr.status === 200 && corr.text.includes("event: done"));
  check("auth: team member sees own run", (await call("/api/runs")).json?.length === 1);

  // 임시 저장은 사람별 키, 로그아웃하면 지운다(같은 브라우저를 다음 사람이 써도 남의 입력이 안 보이게)
  await p2.goto(`${BASE2}/prompts`, { waitUntil: "load" });
  await fillUntil(p2, "[data-testid=studio-goal] textarea, textarea[data-testid=studio-goal]", "사람별 임시 저장 확인", "[data-testid=studio-run]:not([disabled])");
  await p2.waitForTimeout(300);
  const draftKeys = () => p2.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("gh:studio:draft")));
  const keysIn = await draftKeys();
  const testerToken = (await ctx2.cookies()).find((c) => c.name === "gh_session")?.value ?? "";
  await p2.click("[data-testid=logout]");
  await p2.waitForURL((u) => u.pathname === "/login", { timeout: 10000 });
  check("auth: studio draft is kept per person and cleared on logout", keysIn.length === 1 && keysIn[0] === "gh:studio:draft:tester@example.com" && (await draftKeys()).length === 0);
  check("auth: logout clears the session", (await fetch(`${BASE2}/api/runs`, { headers: { cookie: (await ctx2.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") } })).status === 401);
  idp.state.email = "nobody@other.org";
  await p2.click("[data-testid=login-button]");
  await p2.waitForSelector("[data-testid=login-error]", { timeout: 15000 });
  check("auth: email outside the allowlist is refused with a readable reason", ((await p2.textContent("[data-testid=login-error]")) ?? "").includes("허용 목록") && p2.url().includes("error=not_allowed"));

  idp.state.email = "admin@example.com";
  await p2.click("[data-testid=login-button]");
  await p2.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
  const meAdmin = (await call("/api/auth/me")).json;
  check("auth: admin logs in", meAdmin?.email === "admin@example.com" && meAdmin.admin === true);
  const adminLegacy = (await call("/api/prompts/ticket")).json?.workspace?.repos?.find((r) => r.name === "reporter-legacy");
  check("workspace: the member's personal alias is not in the admin's workspace", Array.isArray(adminLegacy?.aliases) && !adminLegacy.aliases.includes("tester-only"));
  check("auth: admin does not see the other member's runs or stats", (await call("/api/runs")).json?.length === 0 && (await call("/api/stats")).json?.collection?.runsOk === 0);
  check("auth: admin settings API is 200", (await call("/api/settings")).status === 200);
  const oidcProbe = (await call("/api/settings/probe", jsonInit("POST", { target: "oidc" }))).json;
  check("probe: admin checks OIDC issuer, callback and client against the IdP", oidcProbe?.ok === true && oidcProbe.steps.map((x) => `${x.label}:${x.state}`).join(",") === "발급자:ok,콜백 URL:warn,클라이언트:ok" && !JSON.stringify(oidcProbe).includes("e2e-secret"));
  await p2.goto(`${BASE2}/settings`, { waitUntil: "load" });
  await p2.waitForSelector("[data-testid=settings-health]", { timeout: 15000 });
  check("auth: admin opens settings and sees login on with one admin", ((await p2.textContent("[data-testid=settings-health]")) ?? "").includes("로그인 켜짐 (관리자 1명"));
  // 팀 화면: 관리자에게 팀원의 실행이 사람별로 집계되어 보이고(본문은 없음), CSV는 같은 표
  await p2.goto(`${BASE2}/team`, { waitUntil: "load" });
  await p2.waitForSelector("[data-testid=team-member]", { timeout: 15000 });
  const teamText = (await p2.textContent("[data-testid=team-page]")) ?? "";
  check("team: admin sees per-person usage for the member who ran a correction", (await p2.locator("[data-testid=team-member]").allTextContents()).includes("tester@example.com") && !teamText.includes("보내드릴께요"));
  const teamJson = (await call("/api/team/stats?weeks=4")).json;
  const tester = teamJson?.members?.find((m) => m.email === "tester@example.com");
  if (!(tester?.runsOk === 1 && tester.cards >= 1 && teamJson.weeklyActive.at(-1)?.users === 1)) console.log("team stats debug:", JSON.stringify({ tester, weeklyActive: teamJson?.weeklyActive }));
  check("team: stats count the member's run, cards and nothing textual", tester?.runsOk === 1 && tester.cards >= 1 && teamJson.weeklyActive.at(-1)?.users === 1 && !JSON.stringify(teamJson).includes("보내드릴께요"));
  const csv = await call("/api/team/stats?format=csv");
  // fetch().text()는 선두 BOM을 떼고 돌려주므로 헤더 줄만 본다
  check("team: CSV export has a header and one row per member", csv.status === 200 && csv.text.replace(/^\uFEFF/, "").startsWith("email,runs_ok") && csv.text.includes("tester@example.com") && !csv.text.includes("보내드릴께요"));
  const sess = (await ctx2.cookies()).find((c) => c.name === "gh_session");
  const forged = sess.value.slice(0, -2) + (sess.value.endsWith("AA") ? "BB" : "AA");
  check("auth: a tampered session cookie is rejected", Boolean(sess) && (await fetch(`${BASE2}/api/runs`, { headers: { cookie: `gh_session=${forged}` } })).status === 401);
  // 허용 목록에서 빠지면 아직 유효한 세션도 막힌다(세션은 14일)
  const asTester = () => fetch(`${BASE2}/api/runs`, { headers: { cookie: `gh_session=${testerToken}` } }).then((r) => r.status);
  const before = await asTester();
  await call("/api/settings", jsonInit("PUT", { values: { AUTH_ALLOWED_DOMAINS: "example.org" } }));
  check("auth: a still-valid session is refused once the email leaves the allowlist", before === 200 && (await asTester()) === 401 && (await call("/api/runs")).status === 200);
  await ctx2.close();

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
