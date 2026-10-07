import { describe, expect, it } from "vitest";
import {
  createDraft, createPrompt, createRun, ensureUser, getVersion, finishRun, getRunContext, getStats, getTeamStats, listDictionary, listOkRunIds, listProfiles, listRecentRuns, listRules,
  deletePreset, linkPromptRun, listPresets, listPromptRuns, openDb, savePreset, recordFeedback, recordFinal, recordPromptRun, runOwnerId, saveSuggestions, seedDefaultProfiles, teamStatsCsv, upsertDictionary, upsertProfile, upsertRule,
} from "../index";

describe("db", () => {
  it("마이그레이션 → 시드 → run/suggestion/feedback 왕복", () => {
    const db = openDb(":memory:");
    const u = ensureUser(db, "me@example.com");
    expect(ensureUser(db, "me@example.com").id).toBe(u.id);

    expect(seedDefaultProfiles(db, u.id)).toBe(3);
    expect(seedDefaultProfiles(db, u.id)).toBe(0);
    const profiles = listProfiles(db, u.id);
    expect(profiles.filter((p) => p.isDefault).map((p) => p.id)).toEqual(["boss-slack"]);

    // 기본 프로필 변경 시 이전 기본은 해제
    upsertProfile(db, { ...profiles.find((p) => p.id === "customer-email")!, isDefault: true });
    expect(listProfiles(db, u.id).filter((p) => p.isDefault).map((p) => p.id)).toEqual(["customer-email"]);

    const rule = upsertRule(db, { userId: u.id, text: "결론을 먼저 쓴다", scope: { channel: "messenger" }, confidence: 0.8 });
    expect(listRules(db, u.id)[0]).toMatchObject({ id: rule.id, scope: { channel: "messenger" } });
    upsertDictionary(db, { userId: u.id, term: "엑심베이", mask: false });
    expect(listDictionary(db, u.id)).toHaveLength(1);

    const draftId = createDraft(db, { userId: u.id, profileId: "boss-slack", textNfc: "원문", textMasked: "원문", maskMap: {}, lang: "ko", storeText: false });
    const runId = createRun(db, { draftId, level: "L2", provider: "cloud", model: "claude-sonnet-5", promptVersion: "0.1.0", profileVersionId: null });
    saveSuggestions(db, runId, [{
      id: "e1", sentence_index: 0, original: "원", context_before: "", context_after: "문", replacement: "본",
      category: "SPELLING", severity: "error", reason_ko: "r", rule_ref: null, confidence: 0.9, start: 0, end: 1, resolveMethod: "exact",
    }], [{ index: 0, label: "더 정중", text: "…", rationale: "…" }], [{ id: "e2", reason: "anchor_not_found" }]);
    finishRun(db, runId, { inputTokens: 900, cachedTokens: 2500, cacheWriteTokens: 0, outputTokens: 120, costUsd: 0.0035, latencyMs: 2100, ttfbMs: 600 }, "ok");
    recordFeedback(db, { runId, suggestionId: `${runId}:e1`, action: "accept" });
    recordFeedback(db, { runId, action: "prefer", chosenIndex: 0, rejectedIndexes: [] });
    recordFinal(db, runId, "본문");
    recordFinal(db, runId, "본문!");

    const runs = listRecentRuns(db);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: runId, accepted: 1, rejected: 0, edits: 1, status: "ok", cachedTokens: 2500 });
  });

  it("팀 서버: 실행·통계·데이터셋은 초안의 userId로 사람별로 나뉜다", () => {
    const db = openDb(":memory:");
    const a = ensureUser(db, "a@team.com"), b = ensureUser(db, "b@team.com");
    const mk = (userId: string) => {
      const draftId = createDraft(db, { userId, profileId: "boss-slack", textNfc: "원문", textMasked: "원문", maskMap: {}, lang: "ko", storeText: false });
      const runId = createRun(db, { draftId, level: "L2", provider: "cloud", model: "m", promptVersion: "0.1.0", profileVersionId: null });
      finishRun(db, runId, { inputTokens: 1, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 1, costUsd: 0.01, latencyMs: 10, ttfbMs: 5 }, "ok");
      recordFeedback(db, { runId, action: "reject" });
      recordFinal(db, runId, "최종");
      return runId;
    };
    const ra = mk(a.id); mk(a.id); const rb = mk(b.id);
    expect(listRecentRuns(db, 50).length).toBe(3);                       // 사용자 없이(로컬 단일 사용자) 전체
    expect(listRecentRuns(db, 50, a.id).map((r) => r.id)).toContain(ra);
    expect(listRecentRuns(db, 50, a.id).length).toBe(2);
    expect(listRecentRuns(db, 50, b.id).map((r) => r.id)).toEqual([rb]);
    expect(listOkRunIds(db, 100, b.id)).toEqual([rb]);
    expect(runOwnerId(db, ra)).toBe(a.id);
    expect(runOwnerId(db, "nope")).toBeNull();
    expect(getRunContext(db, rb)?.userId).toBe(b.id);
    const sa = getStats(db, 8, 30, a.id), sb = getStats(db, 8, 30, b.id), all = getStats(db, 8, 30);
    expect([sa.collection.runsOk, sb.collection.runsOk, all.collection.runsOk]).toEqual([2, 1, 3]);
    expect([sa.collection.finals, sb.collection.finals]).toEqual([2, 1]);
    expect([sa.collection.feedback["reject"], sb.collection.feedback["reject"]]).toEqual([2, 1]);
    expect(sa.weekly.reduce((n, w) => n + w.runs, 0)).toBe(2);
    expect(sb.recent.map((r) => r.id)).toEqual([rb]);

    // 팀 화면: 사람별 집계(텍스트 없음) + CSV
    ensureUser(db, "idle@team.com");
    const t = getTeamStats(db, 8);
    const ma = t.members.find((m) => m.email === "a@team.com")!, mb = t.members.find((m) => m.email === "b@team.com")!, mi = t.members.find((m) => m.email === "idle@team.com")!;
    expect([ma.runsOk, mb.runsOk, mi.runsOk]).toEqual([2, 1, 0]);
    expect([ma.rejected, ma.finals, ma.costUsd]).toEqual([2, 2, 0.02]);
    expect(ma.lastActiveAt).not.toBeNull();
    expect(t.weeklyActive.at(-1)?.users).toBe(2);
    expect(t.team.collection.runsOk).toBe(3);
    const csv = teamStatsCsv(t);
    expect(csv.startsWith("\uFEFFemail,runs_ok")).toBe(true);
    expect(csv.split("\n").filter(Boolean)).toHaveLength(1 + t.members.length);
    expect(csv).not.toContain("원문");
  });

  it("STORE_DRAFTS=false면 원문 대신 해시만 남는다", () => {
    const db = openDb(":memory:");
    const u = ensureUser(db, "a@b.c");
    const id = createDraft(db, { userId: u.id, profileId: "p", textNfc: "비밀", textMasked: "비밀", maskMap: {}, lang: "ko", storeText: false });
    const row = db.query.drafts.findFirst({ where: (d, { eq }) => eq(d.id, id) }).sync();
    expect(row?.textNfc).toBeNull();
    expect(row?.textHash).toHaveLength(64);
  });

  it("기본 프로필은 사람마다 따로 심기고, 같은 id를 써도 서로의 프로필을 가져가거나 덮어쓰지 않는다", () => {
    const db = openDb(":memory:");
    const a = ensureUser(db, "a@example.com");
    const b = ensureUser(db, "b@example.com");
    expect(seedDefaultProfiles(db, a.id)).toBe(3);
    expect(seedDefaultProfiles(db, b.id)).toBe(3);
    expect(listProfiles(db, a.id)).toHaveLength(3);
    expect(listProfiles(db, b.id)).toHaveLength(3);
    // b가 기본 프로필을 고치고 기본값을 바꿔도 a의 같은 id 프로필은 그대로
    upsertProfile(db, { ...listProfiles(db, b.id).find((p) => p.id === "boss-report")!, name: "b의 보고용", isDefault: true });
    expect(listProfiles(db, a.id).find((p) => p.id === "boss-report")?.name).toBe("상급자 · 보고용");
    expect(listProfiles(db, a.id).filter((p) => p.isDefault).map((p) => p.id)).toEqual(["boss-slack"]);
    expect(listProfiles(db, b.id).filter((p) => p.isDefault).map((p) => p.id)).toEqual(["boss-report"]);
  });

  it("스튜디오 실행 기록: 사람별로 나뉘고, 보관 연결은 본인 실행만, 팀 집계는 보관하지 않은 생성·실패·분류 비용까지 센다", () => {
    const db = openDb(":memory:");
    const a = ensureUser(db, "a@team.com"), b = ensureUser(db, "b@team.com");
    const base = { provider: "cloud", model: "m", studioVersion: "0.5.2", purpose: "build", language: "ko" } as const;
    const usage = { inputTokens: 100, cachedTokens: 50, outputTokens: 20, costUsd: 0.1, latencyMs: 1000 };
    recordPromptRun(db, { ...base, userId: a.id, kind: "plan", status: "ok", usage: { ...usage, costUsd: 0.01 } });
    const gen = recordPromptRun(db, { ...base, userId: a.id, kind: "generate", status: "ok", usage, checksPassed: 9, checksTotal: 10 });
    recordPromptRun(db, { ...base, userId: a.id, kind: "generate", status: "ok", usage });          // 보관하지 않은 생성
    recordPromptRun(db, { ...base, userId: a.id, kind: "generate", status: "error", errorCode: "aborted", latencyMs: 300 });
    recordPromptRun(db, { ...base, userId: a.id, kind: "regenerate", status: "ok", usage: { ...usage, costUsd: 0.02 } });
    recordPromptRun(db, { ...base, userId: b.id, kind: "ticket", status: "ok", ticketKey: "EP-1", usage: { ...usage, costUsd: 0.03 } });

    expect(listPromptRuns(db, a.id)).toHaveLength(5);
    expect(listPromptRuns(db, b.id).map((r) => r.kind)).toEqual(["ticket"]);
    expect(listPromptRuns(db, a.id).find((r) => r.id === gen)).toMatchObject({ checksPassed: 9, checksTotal: 10, costUsd: 0.1, promptId: null });
    // 원문 컬럼이 없다(목표·티켓 본문·결과)
    expect(Object.keys(listPromptRuns(db, a.id)[0]!)).not.toEqual(expect.arrayContaining(["goal"]));
    expect(Object.keys(listPromptRuns(db, a.id)[0]!).some((k) => /goal|text|spec|rendered|description/i.test(k))).toBe(false);

    expect(linkPromptRun(db, b.id, gen, "p-x")).toBe(false);       // 남의 실행은 못 잇는다
    expect(linkPromptRun(db, a.id, gen, "p-1")).toBe(true);
    expect(listPromptRuns(db, a.id).find((r) => r.id === gen)?.promptId).toBe("p-1");

    const t = getTeamStats(db, 8);
    const ma = t.members.find((m) => m.email === "a@team.com")!, mb = t.members.find((m) => m.email === "b@team.com")!;
    expect([ma.prompts, ma.promptErrors, ma.promptRegens]).toEqual([2, 1, 1]);
    expect(ma.studioCostUsd).toBeCloseTo(0.23);
    expect(mb.studioCostUsd).toBeCloseTo(0.03);
    expect(ma.lastActiveAt).not.toBeNull();
    expect(teamStatsCsv(t).split("\n")[0]).toContain("prompts,prompt_errors,prompt_versions");
    // 티켓 분류만 한 사람도 마지막 활동이 있다(팀 화면은 이 값으로 활동자를 고른다)
    expect(mb.lastActiveAt).not.toBeNull();
  });

  it("임시 프로필은 기본 프로필이 될 수 없다", () => {
    const db = openDb(":memory:");
    const u = ensureUser(db, "t@team.com");
    seedDefaultProfiles(db, u.id);
    upsertProfile(db, { id: "tmp-1", userId: u.id, name: "임시 · 10:00", audience: "peer", channel: "messenger", lang: "ko", honorific: "haeyo", formality: 3, length: "concise", intent: "request", tone: "polite", isDefault: true, temporary: true });
    expect(listProfiles(db, u.id).find((p) => p.id === "tmp-1")).toMatchObject({ temporary: true, isDefault: false });
    expect(listProfiles(db, u.id).filter((p) => p.isDefault).map((p) => p.id)).toEqual(["boss-slack"]);
  });

  it("설정 프리셋은 사람별로 나뉘고, 남의 프리셋은 바꾸거나 지울 수 없다", () => {
    const db = openDb(":memory:");
    const a = ensureUser(db, "a@team.com"), b = ensureUser(db, "b@team.com");
    const settings = { purpose: "build", subtype: null, length: "short", runtime: "claude_code", promptLanguage: "ko", includeStyleRules: false, repos: ["reporter-api"], clarify: "ask_first" };
    const p = savePreset(db, { userId: a.id, name: "구현 · CC", settings })!;
    expect(listPresets(db, a.id).map((x) => x.name)).toEqual(["구현 · CC"]);
    expect(listPresets(db, b.id)).toEqual([]);
    expect(savePreset(db, { userId: b.id, id: p.id, name: "가로채기", settings })).toBeNull();
    expect(deletePreset(db, b.id, p.id)).toBe(false);
    expect(savePreset(db, { userId: a.id, id: p.id, name: "새 이름", settings: { ...settings, length: "standard" } })?.name).toBe("새 이름");
    expect(listPresets(db, a.id)[0]?.settings).toMatchObject({ length: "standard", repos: ["reporter-api"] });
    expect(deletePreset(db, a.id, p.id)).toBe(true);
    expect(listPresets(db, a.id)).toEqual([]);
  });

  it("예전에 <system> 태그로 감싸 보관한 한 덩어리는 읽을 때 태그 없이 돌려준다", () => {
    const db = openDb(":memory:");
    const u = ensureUser(db, "a@b.c");
    const rendered = { target: "claude", language: "ko", runtime: "claude_code", system: "S", user: "U", combined: "<system>\nS\n</system>\n\nU", variables: [] };
    const { version } = createPrompt(db, {
      userId: u.id, purpose: "build", subtype: null, language: "ko", goal: "목표",
      spec: { title: "t" } as unknown as Parameters<typeof createPrompt>[1]["spec"], rendered: rendered as unknown as Parameters<typeof createPrompt>[1]["rendered"],
      checks: [], source: "generate", studioVersion: "0.5.0",
    });
    expect(version.rendered.combined).toBe("S\n\nU");
    expect(getVersion(db, version.id)?.rendered.combined).toBe("S\n\nU");
  });
});
