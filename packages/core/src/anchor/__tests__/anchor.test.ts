import { describe, expect, it } from "vitest";
import type { LlmEdit } from "../../schema/correction";
import { applyEdits, buildDoc, diffHunks, levenshtein, nfc, resolveAll, splitSentences } from "../index";
import fixtures from "./fixtures.ko.json";

type Fixture = {
  name: string; text: string; textNfd?: boolean; corrected: string | null;
  edit: Partial<LlmEdit> & { original: string; replacement: string; sentence_index: number };
  expect: { method?: string; span?: string; start?: number; graphemeSafe?: boolean; dropped?: string };
};

function mkEdit(f: Fixture, id = "e1"): LlmEdit {
  return {
    id, sentence_index: f.edit.sentence_index, original: f.edit.original,
    context_before: f.edit.context_before ?? "", context_after: f.edit.context_after ?? "",
    replacement: f.edit.replacement, category: (f.edit.category ?? "GRAMMAR") as LlmEdit["category"],
    severity: "error", reason_ko: "테스트", rule_ref: null, confidence: 0.9,
  };
}

describe("anchor fixtures (ko)", () => {
  for (const f of fixtures as Fixture[]) {
    it(f.name, () => {
      const raw = f.textNfd ? f.text.normalize("NFD") : f.text;
      const text = nfc(raw);
      const doc = buildDoc(text);
      const { resolved, dropped } = resolveAll([mkEdit(f)], doc, f.corrected);
      if (f.expect.dropped) {
        expect(resolved).toHaveLength(0);
        expect(dropped[0]?.reason).toBe(f.expect.dropped);
        return;
      }
      expect(dropped).toHaveLength(0);
      expect(resolved).toHaveLength(1);
      const s = resolved[0]!;
      expect(s.resolveMethod).toBe(f.expect.method);
      if (f.expect.span !== undefined) expect(text.slice(s.start, s.end)).toBe(f.expect.span);
      if (f.expect.start !== undefined) expect(s.start).toBe(f.expect.start);
      if (f.expect.graphemeSafe) {
        for (const o of [s.start, s.end]) expect(doc.graphemes.has(o)).toBe(true);
      }
      if (f.corrected !== null && s.resolveMethod !== "diff") {
        expect(applyEdits(text, resolved)).toBe(f.corrected);
      }
    });
  }
});

describe("anchor utilities", () => {
  it("splitSentences: 문장부호와 개행 모두에서 끊고 공백을 제외한다", () => {
    const s = splitSentences("첫 문장입니다. 두 번째\n세 번째 줄");
    expect(s.map((x) => x.text)).toEqual(["첫 문장입니다.", "두 번째", "세 번째 줄"]);
    expect(s[1]!.start).toBe(9);
  });

  it("levenshtein", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("보내드릴께요", "보내드릴게요")).toBe(1);
  });

  it("diffHunks: 삭제+삽입을 하나의 교체 헝크로 묶는다", () => {
    const h = diffHunks("금일 배포 완료 되었습니다.", "금일 배포가 완료되었습니다.");
    expect(h.length).toBeGreaterThanOrEqual(1);
    const joined = h.map((x) => x.original).join("|");
    expect(joined).not.toContain("금일");
  });

  it("겹치는 제안은 confidence가 높은 것만 남긴다", () => {
    const text = nfc("자료 확인 부탁드립니다.");
    const doc = buildDoc(text);
    const a: LlmEdit = { ...mkEdit({ name: "", text, corrected: null, edit: { sentence_index: 0, original: "확인 부탁드립니다", replacement: "확인해 주세요" }, expect: {} }, "a"), confidence: 0.9 };
    const b: LlmEdit = { ...mkEdit({ name: "", text, corrected: null, edit: { sentence_index: 0, original: "부탁드립니다", replacement: "부탁합니다" }, expect: {} }, "b"), confidence: 0.5 };
    const r = resolveAll([b, a], doc, null);
    expect(r.resolved.map((x) => x.id)).toEqual(["a"]);
    expect(r.dropped).toEqual([{ id: "b", reason: "overlap" }]);
  });

  it("applyEdits: 여러 제안을 뒤에서부터 적용해 드리프트가 없다", () => {
    const out = applyEdits("가 나 다", [
      { start: 0, end: 1, replacement: "AAA" },
      { start: 4, end: 5, replacement: "C" },
    ]);
    expect(out).toBe("AAA 나 C");
  });
});
