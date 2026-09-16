import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILES, SituationProfile } from "../../schema";
import type { CorrectionProvider, ProviderEvent, ProviderInput } from "../../providers/types";
import { runCorrection, type CorrectPipelineResult } from "../correct";
import type { SseEvent } from "../../schema/events";

const profile = SituationProfile.parse({ ...DEFAULT_PROFILES[0]!, userId: "u1" });

/** 프롬프트를 받아 JSON 문자열을 만들어 청크로 흘리는 가짜 provider. */
function fakeProvider(makeOutput: (input: ProviderInput) => unknown, id: "cloud" | "local" = "cloud", chunk = 9): CorrectionProvider & { lastInput?: ProviderInput } {
  const p: CorrectionProvider & { lastInput?: ProviderInput } = {
    id, model: "fake",
    async *correct(input) {
      p.lastInput = input;
      const json = JSON.stringify(makeOutput(input));
      for (let i = 0; i < json.length; i += chunk) yield { type: "delta", text: json.slice(i, i + chunk) } as ProviderEvent;
      yield { type: "final", raw: json, usage: { inputTokens: 100, cachedTokens: 50, cacheWriteTokens: 0, outputTokens: 40 }, stopReason: "end_turn" };
    },
    async health() { return { ok: true }; },
    cost() { return 0.001; },
  };
  return p;
}

async function collect(gen: AsyncGenerator<SseEvent, CorrectPipelineResult>) {
  const events: SseEvent[] = [];
  let r = await gen.next();
  while (!r.done) { events.push(r.value); r = await gen.next(); }
  return { events, result: r.value };
}

const baseEdit = { context_before: "", context_after: "", severity: "error", reason_ko: "이유", rule_ref: null, confidence: 0.9 };

describe("runCorrection", () => {
  it("마스킹된 초안이 프롬프트에 들어가고, 이벤트 오프셋과 텍스트는 원문 기준으로 복원된다", async () => {
    const text = "김대리 010-1234-5678 로 연락 부탁드립니다. 자료 보내드릴께요.";
    const provider = fakeProvider((input) => {
      // 모델은 마스킹된 초안을 본다
      expect(input.user).toContain("010-0000-0001");
      expect(input.user).not.toContain("010-1234-5678");
      const draft = /<draft[^>]*>\n([\s\S]*?)\n<\/draft>/.exec(input.user)![1]!;
      return {
        corrected_text: draft.replace("보내드릴께요", "보내드릴게요").replace(" 로 ", "로 "),
        edits: [
          { id: "e1", sentence_index: 1, original: "보내드릴께요", replacement: "보내드릴게요", category: "SPELLING", ...baseEdit },
          { id: "e2", sentence_index: 0, original: "010-0000-0001 로", replacement: "010-0000-0001로", category: "SPACING", ...baseEdit, context_before: "김대리 " },
        ],
        rewrites: [], reader_view: "연락처 010-0000-0001 가 포함되어 있습니다.",
        preserved_facts_check: { numbers: true, dates: true, commitments: true },
      };
    });
    const { events, result } = await collect(runCorrection({
      runId: "r1", text, level: "L2", profile, rules: [], rulesVersionId: null, dictionary: [], mutedCategories: [], provider, piiBlock: [],
    }));
    const types = events.map((e) => e.event);
    expect(types[0]).toBe("meta");
    expect(types.at(-1)).toBe("done");
    expect(types.filter((t) => t === "edit")).toHaveLength(2);
    const meta = events[0]!; if (meta.event !== "meta") throw new Error();
    expect(meta.data.maskedSpans).toEqual([{ start: 4, end: 17, kind: "PHONE" }]);
    const e2 = events.find((e) => e.event === "edit" && e.data.id === "e2")!; if (e2.event !== "edit") throw new Error();
    expect(text.slice(e2.data.start, e2.data.end)).toBe("010-1234-5678 로");
    expect(e2.data.original).toBe("010-1234-5678 로");
    expect(e2.data.replacement).toBe("010-1234-5678로");
    const textEv = events.find((e) => e.event === "text")!; if (textEv.event !== "text") throw new Error();
    expect(textEv.data.corrected_text).toBe("김대리 010-1234-5678로 연락 부탁드립니다. 자료 보내드릴게요.");
    expect(textEv.data.reader_view).toContain("010-1234-5678");
    expect(result.error).toBeNull();
    expect(result.usage).toMatchObject({ inputTokens: 100, cachedTokens: 50, costUsd: 0.001 });
    expect(result.edits.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("로컬 provider: corrected_text가 null이면 edits 적용으로 합성하고 rewrites는 1개로 제한한다", async () => {
    const provider = fakeProvider((input) => {
      expect(input.user).toContain("corrected_text는 null");
      expect(input.user).toContain("rewrites는 최대 1개");
      return {
        corrected_text: null,
        edits: [{ id: "e1", sentence_index: 0, original: "할수있다", replacement: "할 수 있다", category: "SPACING", ...baseEdit }],
        rewrites: [{ label: "더 정중", text: "이번 주까지 할 수 있습니다.", rationale: "r" }],
        reader_view: null, preserved_facts_check: { numbers: true, dates: true, commitments: true },
      };
    }, "local");
    const { events } = await collect(runCorrection({
      runId: "r2", text: "이번 주까지 할수있다.", level: "L3", profile, rules: [], rulesVersionId: null, dictionary: [], mutedCategories: [], provider, piiBlock: [],
    }));
    const textEv = events.find((e) => e.event === "text")!; if (textEv.event !== "text") throw new Error();
    expect(textEv.data.corrected_text).toBe("이번 주까지 할 수 있다.");
    expect(events.filter((e) => e.event === "rewrite")).toHaveLength(1);
  });

  it("앵커를 못 찾은 edit은 최종 단계에서 corrected_text diff로 복구되거나 edit_dropped로 알린다", async () => {
    const provider = fakeProvider(() => ({
      corrected_text: "금일 배포가 완료되었습니다.",
      edits: [
        { id: "ok", sentence_index: 0, original: "배포작업 종료 되었음", replacement: "배포가 완료되었습니다", category: "SPACING", ...baseEdit },
        { id: "bad", sentence_index: 0, original: "전혀 없는 문장", replacement: "무엇", category: "CLARITY", ...baseEdit },
      ],
      rewrites: [], reader_view: null, preserved_facts_check: { numbers: true, dates: true, commitments: true },
    }));
    const { events, result } = await collect(runCorrection({
      runId: "r3", text: "금일 배포 완료 되었습니다.", level: "L1", profile, rules: [], rulesVersionId: null, dictionary: [], mutedCategories: [], provider, piiBlock: [],
    }));
    const edits = events.filter((e) => e.event === "edit");
    expect(edits).toHaveLength(1);
    if (edits[0]!.event !== "edit") throw new Error();
    expect(edits[0]!.data.resolveMethod).toBe("diff");
    expect(events.find((e) => e.event === "edit_dropped")).toMatchObject({ data: { id: "bad", reason: "anchor_not_found" } });
    expect(result.dropped.map((d) => d.id)).toContain("bad");
  });

  it("PII 차단 정책에 걸리면 provider를 호출하지 않고 error 하나만 낸다", async () => {
    const provider = fakeProvider(() => { throw new Error("must not be called"); });
    const { events, result } = await collect(runCorrection({
      runId: "r4", text: "주민번호 900101-1234567 확인", level: "L1", profile, rules: [], rulesVersionId: null, dictionary: [], mutedCategories: [], provider, piiBlock: ["RRN"],
    }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: "error", data: { code: "pii_blocked" } });
    expect(result.error?.code).toBe("pii_blocked");
  });

  it("스키마에 맞지 않는 출력은 schema_invalid", async () => {
    const provider = fakeProvider(() => ({ nope: true }));
    const { events } = await collect(runCorrection({
      runId: "r5", text: "안녕하세요.", level: "L1", profile, rules: [], rulesVersionId: null, dictionary: [], mutedCategories: [], provider, piiBlock: [],
    }));
    expect(events.at(-1)).toMatchObject({ event: "error", data: { code: "schema_invalid" } });
  });
});
