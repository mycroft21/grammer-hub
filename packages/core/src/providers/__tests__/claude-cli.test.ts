import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ClaudeCliProvider } from "../claude-cli";
import { toOutputJsonSchema } from "../../schema/json-schema";
import { PromptSpec } from "../../promptstudio/spec";
import { generatePrompt } from "../../promptstudio/pipeline";

/**
 * claude 대역: 인자와 stdin을 검사하고 `--output-format stream-json` 모양으로 응답한다.
 * body 안에서 `emit(obj)`로 줄을, `streamJson(obj, meta)`로 구조화 출력을 input_json_delta 조각 + result로 낸다.
 */
function fakeCli(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "gh-fake-claude-"));
  const p = join(dir, "fake-claude.mjs");
  writeFileSync(p, `
    const args = process.argv.slice(2);
    if (args[0] === "--version") { console.log("9.9.9 (fake)"); process.exit(0); }
    const emit = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
    const streamJson = (obj, meta = {}) => {
      const json = JSON.stringify(obj);
      emit({ type: "system", subtype: "init" });
      if (meta.thinking) emit({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "thinking" } } });
      emit({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use", name: "StructuredOutput" } } });
      for (let i = 0; i < json.length; i += 9) emit({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: json.slice(i, i + 9) } } });
      emit({ type: "result", subtype: "success", is_error: false, result: json, structured_output: obj, usage: meta.usage ?? {}, total_cost_usd: 0 });
    };
    let stdin = ""; process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => { stdin += d; });
    process.stdin.on("end", () => { ${body} });
  `);
  return p;
}
const SPEC_SCHEMA = toOutputJsonSchema(PromptSpec);

describe("ClaudeCliProvider", () => {
  it("passes system prompt, schema and model as flags; prompt via stdin; parses structured_output", async () => {
    const script = fakeCli(`
      const get = (k) => args[args.indexOf(k) + 1];
      streamJson({ echo: stdin.trim(), system: get("--system-prompt"), model: get("--model"), schema: JSON.parse(get("--json-schema")).type, turns: get("--max-turns"), tools: get("--tools"), persist: args.includes("--no-session-persistence"), effort: get("--effort"), fmt: get("--output-format") },
        { thinking: true, usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 } });
    `);
    const p = new ClaudeCliProvider({ bin: process.execPath, binArgs: [script], model: "claude-sonnet-5" });
    const events = [];
    for await (const ev of p.correct({ system: [{ text: "SYS-A", cache: true }, { text: "SYS-B", cache: false }], user: "hello\nworld", level: "L2", schema: { type: "object" } })) events.push(ev);
    // 실시간 스트리밍: 델타가 여러 개, 상태 이벤트 thinking → writing 순
    expect(events.filter((e) => e.type === "delta").length).toBeGreaterThan(3);
    expect(events.filter((e) => e.type === "status").map((e) => (e as { stage: string }).stage)).toEqual(["thinking", "writing"]);
    const fin = events.find((e) => e.type === "final");
    expect(fin?.type).toBe("final");
    if (fin?.type !== "final") return;
    const j = JSON.parse(fin.raw);
    expect(j).toMatchObject({ echo: "hello\nworld", system: "SYS-A\n\nSYS-B", model: "claude-sonnet-5", schema: "object", turns: "2", tools: "", persist: true, effort: "low", fmt: "stream-json" });
    expect(fin.usage).toEqual({ inputTokens: 120, cachedTokens: 100, cacheWriteTokens: 0, outputTokens: 30 });
    expect(p.cost(fin.usage)).toBeGreaterThan(0);
    expect((await p.health()).ok).toBe(true);
  });

  it("falls back to JSON inside result text when structured_output is absent", async () => {
    const script = fakeCli(`emit({ type: "result", subtype: "success", result: "Here you go:\\n\`\`\`json\\n{\\"a\\":1}\\n\`\`\`", usage: {} });`);
    const p = new ClaudeCliProvider({ bin: process.execPath, binArgs: [script] });
    let raw = "";
    for await (const ev of p.correct({ system: [], user: "x", level: "L1", schema: {} })) if (ev.type === "final") raw = ev.raw;
    expect(JSON.parse(raw)).toEqual({ a: 1 });
  });

  it("reports missing binary and CLI errors as provider_unavailable", async () => {
    const missing = new ClaudeCliProvider({ bin: "/nonexistent/claude-bin-xyz" });
    const evs = [];
    for await (const ev of missing.correct({ system: [], user: "x", level: "L1", schema: {} })) evs.push(ev);
    expect(evs[0]).toMatchObject({ type: "error", code: "provider_unavailable" });
    expect((await missing.health()).ok).toBe(false);

    const failing = new ClaudeCliProvider({ bin: process.execPath, binArgs: [fakeCli(`emit({ type: "result", is_error: true, subtype: "error_during_execution", result: "Not logged in" });`)] });
    const evs2 = [];
    for await (const ev of failing.correct({ system: [], user: "x", level: "L1", schema: {} })) evs2.push(ev);
    expect(evs2[0]).toMatchObject({ type: "error", code: "provider_unavailable" });
    expect((evs2[0] as { message: string }).message).toContain("Not logged in");
  });

  it("works end-to-end through the studio pipeline", async () => {
    const script = fakeCli(`
      const spec = { language: "ko", title: "T", role: "판단 기준이 있는 역할 한 문장이다.", goal: "흐름을 정리한 문서를 만든다", success_criteria: ["a", "b", "c"],
        inputs: [{ name: "code", label: "코드", description: "소스", required: true, multiline: true, placeholder: "" }], context: null,
        hard_rules: ["추측 대신 미확인으로 표시한다"], process: null, output_contract: { format: "markdown", structure: "요약/흐름", length: "짧게" },
        self_check: ["x", "y"], failure_guards: ["이름 대신 호출을 먼저 본다"], clarify_policy: "ask_first", examples: null,
        rationale: { role: "", goal: "", success_criteria: "", inputs: "", hard_rules: "", process: "", output_contract: "", self_check: "", failure_guards: "" } };
      streamJson(spec, { usage: { input_tokens: 10, output_tokens: 5 } });
    `);
    const p = new ClaudeCliProvider({ bin: process.execPath, binArgs: [script] });
    const gen = generatePrompt(p, { purpose: "investigate", subtype: "source", goal: "결제 재시도 로직 조사 문서", length: "short", language: "ko" });
    const seen: string[] = [];
    let r = await gen.next();
    while (!r.done) { seen.push(r.value.event); r = await gen.next(); }
    expect(seen).toContain("slot");
    expect(seen.slice(-1)[0]).toBe("done");
    expect(r.value.spec?.title).toBe("T");
    expect(r.value.rendered?.user).toContain("{{code}}");
    void SPEC_SCHEMA;
  });
});
