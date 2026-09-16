import { describe, expect, it } from "vitest";
import {
  createDraft, createRun, ensureUser, finishRun, listDictionary, listProfiles, listRecentRuns, listRules,
  openDb, recordFeedback, recordFinal, saveSuggestions, seedDefaultProfiles, upsertDictionary, upsertProfile, upsertRule,
} from "../index";

describe("db", () => {
  it("마이그레이션 → 시드 → run/suggestion/feedback 왕복", () => {
    const db = openDb(":memory:");
    const u = ensureUser(db, "me@example.com");
    expect(ensureUser(db, "me@example.com").id).toBe(u.id);

    expect(seedDefaultProfiles(db, u.id)).toBe(6);
    expect(seedDefaultProfiles(db, u.id)).toBe(0);
    const profiles = listProfiles(db, u.id);
    expect(profiles.filter((p) => p.isDefault).map((p) => p.id)).toEqual(["boss-slack"]);

    // 기본 프로필 변경 시 이전 기본은 해제
    upsertProfile(db, { ...profiles.find((p) => p.id === "peer-slack")!, isDefault: true });
    expect(listProfiles(db, u.id).filter((p) => p.isDefault).map((p) => p.id)).toEqual(["peer-slack"]);

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

  it("STORE_DRAFTS=false면 원문 대신 해시만 남는다", () => {
    const db = openDb(":memory:");
    const u = ensureUser(db, "a@b.c");
    const id = createDraft(db, { userId: u.id, profileId: "p", textNfc: "비밀", textMasked: "비밀", maskMap: {}, lang: "ko", storeText: false });
    const row = db.query.drafts.findFirst({ where: (d, { eq }) => eq(d.id, id) }).sync();
    expect(row?.textNfc).toBeNull();
    expect(row?.textHash).toHaveLength(64);
  });
});
