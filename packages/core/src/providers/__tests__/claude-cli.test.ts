import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ClaudeCliProvider } from "../claude-cli";
import { toOutputJsonSchema } from "../../schema/json-schema";
import { PromptSpec } from "../../promptstudio/spec";
import { generatePrompt } from "../../promptstudio/pipeline";

/** claude 대역: 인자와 stdin을 검사하고 `--output-format json` 모양으로 응답한다. */
function fakeCli(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "gh-fake-claude-"));
  const p = join(dir, "fake-claude.mjs");
  writeFileSync(p, `
    const args = process.argv.slice(2);
    if (args[0] === "--version") { console.log("9.9.9 (fake)"); process.exit(0); }
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
      const out = { type: "result", subtype: "success", is_error: false, result: "ok",
        structured_output: { echo: stdin.trim(), system: get("--system-prompt"), model: get("--model"), schema: JSON.parse(get("--json-schema")).type, turns: get("--max-turns"), tools: get("--tools"), persist: args.includes("--no-session-persistence"), effort: get("--effort") },
        usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 }, total_cost_usd: 0.001 };
      console.log(JSON.stringify(out));
    `);
    const p = new ClaudeCliProvider({ bin: process.execPath, binArgs: [script], model: "claude-sonnet-5" });
    const events = [];
    for await (const ev of p.correct({ system: [{ text: "SYS-A", cache: true }, { text: "SYS-B", cache: false }], user: "hello\nworld", level: "L2", schema: { type: "object" } })) events.push(ev);
    const fin = events.find((e) => e.type === "final");
    expect(fin?.type).toBe("final");
    if (fin?.type !== "final") return;
    const j = JSON.parse(fin.raw);
    expect(j).toMatchObject({ echo: "hello\nworld", system: "SYS-A\n\nSYS-B", model: "claude-sonnet-5", schema: "object", turns: "2", tools: "", persist: true, effort: "low" });
    expect(fin.usage).toEqual({ inputTokens: 120, cachedTokens: 100, cacheWriteTokens: 0, outputTokens: 30 });
    expect(p.cost(fin.usage)).toBeGreaterThan(0);
    expect((await p.health()).ok).toBe(true);
  });

  it("falls back to JSON inside result text when structured_output is absent", async () => {
    const script = fakeCli(`console.log(JSON.stringify({ subtype: "success", result: "Here you go:\\n\`\`\`json\\n{\\"a\\":1}\\n\`\`\`", usage: {} }));`);
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

    const failing = new ClaudeCliProvider({ bin: process.execPath, binArgs: [fakeCli(`console.log(JSON.stringify({ is_error: true, subtype: "error_during_execution", result: "Not logged in" }));`)] });
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
      console.log(JSON.stringify({ subtype: "success", structured_output: spec, usage: { input_tokens: 10, output_tokens: 5 } }));
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
