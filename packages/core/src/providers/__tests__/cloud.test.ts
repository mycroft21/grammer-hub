import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { CloudProvider } from "../cloud";

/** SDK 클라이언트 흉내: 요청을 기록하고 텍스트 델타 2개 + finalMessage를 낸다. */
function fakeClient(capture: { params?: unknown }, stop: string = "end_turn") {
  const chunks = ['{"corrected_text":"x","edits":[],', '"rewrites":[],"reader_view":null,"preserved_facts_check":{"numbers":true,"dates":true,"commitments":true}}'];
  const stream = {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: c } };
    },
    async finalMessage() {
      return {
        content: [{ type: "text", text: chunks.join("") }],
        stop_reason: stop, stop_details: stop === "refusal" ? { type: "refusal", category: null, explanation: "no" } : null,
        usage: { input_tokens: 900, cache_read_input_tokens: 2500, cache_creation_input_tokens: 0, output_tokens: 120 },
      };
    },
  };
  return { messages: { stream: (params: unknown) => { capture.params = params; return stream; } } } as unknown as Anthropic;
}

describe("CloudProvider", () => {
  it("system 캐시 블록·구조화 출력·effort를 요청에 싣고 델타→final 순으로 낸다", async () => {
    const cap: { params?: unknown } = {};
    const p = new CloudProvider({ client: fakeClient(cap) });
    const events = [];
    for await (const e of p.correct({
      system: [{ text: "stable", cache: true }, { text: "rules", cache: true }, { text: "dyn", cache: false }],
      user: "u", level: "L2", schema: { type: "object" },
    })) events.push(e);
    const params = cap.params as Record<string, unknown>;
    expect(params["model"]).toBe("claude-sonnet-5");
    const system = params["system"] as Array<Record<string, unknown>>;
    expect(system[0]!["cache_control"]).toEqual({ type: "ephemeral" });
    expect(system[1]!["cache_control"]).toEqual({ type: "ephemeral" });
    expect(system[2]!["cache_control"]).toBeUndefined();
    expect((params["output_config"] as Record<string, unknown>)["effort"]).toBe("low");
    expect(((params["output_config"] as Record<string, unknown>)["format"] as Record<string, unknown>)["type"]).toBe("json_schema");
    expect(params["thinking"]).toEqual({ type: "adaptive" });
    expect(events.map((e) => e.type)).toEqual(["delta", "delta", "final"]);
    const fin = events[2]!;
    if (fin.type !== "final") throw new Error();
    expect(fin.usage).toEqual({ inputTokens: 900, cachedTokens: 2500, cacheWriteTokens: 0, outputTokens: 120 });
    expect(p.cost(fin.usage)).toBeCloseTo((900 * 2 + 2500 * 0.2 + 120 * 10) / 1e6, 9);
  });

  it("refusal은 error 이벤트로 바뀐다", async () => {
    const p = new CloudProvider({ client: fakeClient({}, "refusal") });
    const events = [];
    for await (const e of p.correct({ system: [], user: "u", level: "L1", schema: {} })) events.push(e);
    expect(events.at(-1)).toMatchObject({ type: "error", code: "refusal" });
  });
});
