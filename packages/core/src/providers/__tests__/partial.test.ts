import { describe, expect, it } from "vitest";
import { PartialCorrectionParser } from "../partial";
import { costUsd } from "../pricing";

const edit = (id: string) => ({
  id, sentence_index: 0, original: "가", context_before: "", context_after: "", replacement: "나",
  category: "SPELLING", severity: "error", reason_ko: "이유", rule_ref: null, confidence: 0.9,
});
const full = {
  corrected_text: "나 나", edits: [edit("e1"), edit("e2")],
  rewrites: [{ label: "더 정중", text: "…", rationale: "…" }],
  reader_view: null, preserved_facts_check: { numbers: true, dates: true, commitments: true },
};

describe("PartialCorrectionParser", () => {
  it("항목이 닫힐 때 정확히 한 번씩 내보내고 마지막은 finish에서 나온다", () => {
    const json = JSON.stringify(full);
    const p = new PartialCorrectionParser();
    const seen: string[] = [];
    let rewrites = 0;
    // 7바이트 단위로 잘라 스트리밍 시뮬레이션
    for (let i = 0; i < json.length; i += 7) {
      const r = p.push(json.slice(i, i + 7));
      seen.push(...r.edits.map((e) => e.id));
      rewrites += r.rewrites.length;
    }
    const last = p.finish();
    seen.push(...last.edits.map((e) => e.id));
    rewrites += last.rewrites.length;
    expect(seen).toEqual(["e1", "e2"]);
    expect(rewrites).toBe(1);
    expect(JSON.parse(p.text)).toEqual(full);
  });

  it("e1은 e2가 시작되면 즉시(스트림 종료 전) 나온다", () => {
    const json = JSON.stringify(full);
    const cut = json.indexOf('"id":"e2"') + 8;
    const p = new PartialCorrectionParser();
    const r = p.push(json.slice(0, cut));
    expect(r.edits.map((e) => e.id)).toEqual(["e1"]);
  });
});

describe("costUsd", () => {
  it("Sonnet 5: 캐시 읽기 0.1×, 쓰기 1.25×", () => {
    const c = costUsd("claude-sonnet-5", { inputTokens: 1_000_000, cachedTokens: 1_000_000, cacheWriteTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(c).toBeCloseTo(2 + 0.2 + 2.5 + 10, 6);
    expect(costUsd("unknown", { inputTokens: 1, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0 })).toBe(0);
  });
});
