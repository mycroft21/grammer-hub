import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CorrectionOutput, CorrectionOutputStrict, DEFAULT_PROFILES, SituationProfile, SseEvent, toOutputJsonSchema } from "../index";

describe("schema", () => {
  it("기본 프로필 6종이 SituationProfile을 통과한다", () => {
    for (const p of DEFAULT_PROFILES) {
      expect(() => SituationProfile.parse({ ...p, userId: "u1" })).not.toThrow();
    }
    expect(DEFAULT_PROFILES.filter((p) => p.isDefault)).toHaveLength(1);
  });

  it("느슨한 출력 스키마는 제약 없이, 엄격 스키마는 confidence 범위를 검사한다", () => {
    const out = {
      corrected_text: "팀장님, 자료 보내드릴게요.",
      edits: [{
        id: "e1", sentence_index: 0, original: "보내드릴께요", context_before: "자료 ", context_after: ".",
        replacement: "보내드릴게요", category: "SPELLING", severity: "error",
        reason_ko: "'-ㄹ게요'가 표준 표기입니다.", rule_ref: null, confidence: 1.7,
      }],
      rewrites: [], reader_view: null,
      preserved_facts_check: { numbers: true, dates: true, commitments: true },
    };
    expect(CorrectionOutput.safeParse(out).success).toBe(true);
    expect(CorrectionOutputStrict.safeParse(out).success).toBe(false);
  });

  it("구조화 출력용 JSON Schema에 min/max/pattern 제약이 들어가지 않는다", () => {
    // zod 4의 z.int()는 safe-integer 범위를 minimum/maximum으로 내보낸다 → 헬퍼가 제거해야 한다
    expect(JSON.stringify(z.toJSONSchema(CorrectionOutput))).toContain("minimum");
    const out = toOutputJsonSchema(CorrectionOutput);
    // 속성 이름이 키워드와 겹쳐도(format, pattern) 지워지지 않고 required와 일치해야 한다
    const tricky = toOutputJsonSchema(z.object({ format: z.enum(["a", "b"]), pattern: z.string().min(2), inner: z.object({ maxLength: z.number().int().min(0) }) }));
    const props = tricky["properties"] as Record<string, Record<string, unknown>>;
    expect(Object.keys(props)).toEqual(["format", "pattern", "inner"]);
    expect(tricky["required"]).toEqual(["format", "pattern", "inner"]);
    expect(props["pattern"]).toEqual({ type: "string" });
    expect(Object.keys((props["inner"]!["properties"] as Record<string, unknown>))).toEqual(["maxLength"]);
    for (const r of tricky["required"] as string[]) expect(props[r]).toBeDefined();
    const json = JSON.stringify(out);
    for (const k of ["minLength", "maxLength", "pattern", "minimum", "maximum", "$schema"]) expect(json).not.toContain(`"${k}"`);
    expect(out["additionalProperties"]).toBe(false);
    expect(json).toContain('"type":"integer"');
  });

  it("SSE 이벤트 판별 유니온", () => {
    expect(SseEvent.safeParse({ event: "done", data: {} }).success).toBe(true);
    expect(SseEvent.safeParse({ event: "nope", data: {} }).success).toBe(false);
  });
});
