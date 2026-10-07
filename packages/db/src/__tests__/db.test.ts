import { describe, expect, it } from "vitest";
import {
  createDraft, createPrompt, createRun, ensureUser, getVersion, finishRun, getRunContext, getStats, getTeamStats, listDictionary, listOkRunIds, listProfiles, listRecentRuns, listRules,
  openDb, recordFeedback, recordFinal, runOwnerId, saveSuggestions, seedDefaultProfiles, teamStatsCsv, upsertDictionary, upsertProfile, upsertRule,
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
