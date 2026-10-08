import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { apiThinking } from "../thinking";
import { CloudProvider } from "../cloud";

describe("thinking level → API parameters", () => {
  it("maps per model: off disables where allowed, falls back to low effort where it can't, Haiku 4.5 gets neither", () => {
    expect(apiThinking("claude-sonnet-5", "low")).toEqual({ thinking: { type: "adaptive" }, effort: "low" });
    expect(apiThinking("claude-opus-5", "high")).toEqual({ thinking: { type: "adaptive" }, effort: "high" });
    // Opus 5는 effort high 이하에서만 disabled를 받는다 → off일 때 effort low로 보낸다
    expect(apiThinking("claude-opus-5", "off")).toEqual({ thinking: { type: "disabled" }, effort: "low" });
    expect(apiThinking("claude-sonnet-5", "off")).toEqual({ thinking: { type: "disabled" }, effort: "low" });
    expect(apiThinking("claude-opus-5-5", "off")).toEqual({ thinking: { type: "adaptive" }, effort: "low" });
    expect(apiThinking("claude-haiku-4-5", "high")).toEqual({});
  });

  it("CloudProvider sends the mapped values and omits what the model doesn't take", async () => {
    const run = async (model: string, thinking: "off" | "medium") => {
      const cap: { params?: Record<string, unknown> } = {};
      const client = { messages: { stream: (params: Record<string, unknown>) => { cap.params = params; throw new Error("stop"); } } } as unknown as Anthropic;
      for await (const _ of new CloudProvider({ client, model, thinking }).correct({ system: [], user: "u", level: "L2", schema: { type: "object" } })) { /* error event */ }
      return cap.params!;
    };
    const off = await run("claude-sonnet-5", "off");
    expect(off["thinking"]).toEqual({ type: "disabled" });
    expect((off["output_config"] as Record<string, unknown>)["effort"]).toBe("low");
    const haiku = await run("claude-haiku-4-5", "medium");
    expect(haiku["thinking"]).toBeUndefined();
    expect(haiku["output_config"]).toEqual({ format: { type: "json_schema", schema: { type: "object" } } });
  });
});
