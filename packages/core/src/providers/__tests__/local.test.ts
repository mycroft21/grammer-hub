import { describe, expect, it } from "vitest";
import { LocalProvider } from "../local";

function fakeFetch(lines: string[], capture: { body?: unknown; url?: string }): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    capture.url = String(url); capture.body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (String(url).endsWith("/health")) return new Response("{}", { status: 200 });
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) { for (const l of lines) c.enqueue(enc.encode(l + "\n")); c.close(); },
    });
    return new Response(stream, { status: 200 });
  }) as typeof fetch;
}

describe("LocalProvider", () => {
  it("Gemma 템플릿으로 system을 앞에 두고, SSE data 라인을 델타·usage로 변환한다", async () => {
    const cap: { body?: unknown } = {};
    const p = new LocalProvider({ fetchImpl: fakeFetch([
      'data: {"content":"{\\"a\\":","stop":false}',
      'data: {"content":"1}","stop":false}',
      'data: {"content":"","stop":true,"tokens_evaluated":900,"tokens_cached":2500,"tokens_predicted":12}',
    ], cap), model: "gemma-4-26B-A4B" });
    const events = [];
    for await (const e of p.correct({ system: [{ text: "S1", cache: true }, { text: "S2", cache: true }, { text: "D", cache: false }], user: "U", level: "L2", schema: { type: "object" } })) events.push(e);
    const body = cap.body as Record<string, unknown>;
    expect(String(body["prompt"]).startsWith("<start_of_turn>user\nS1\n\nS2\n\nD\n\nU")).toBe(true);
    expect(body["cache_prompt"]).toBe(true);
    expect(body["json_schema"]).toEqual({ type: "object" });
    expect(events.map((e) => e.type)).toEqual(["delta", "delta", "final"]);
    const fin = events[2]!; if (fin.type !== "final") throw new Error();
    expect(fin.raw).toBe('{"a":1}');
    expect(fin.usage).toEqual({ inputTokens: 900, cachedTokens: 2500, cacheWriteTokens: 0, outputTokens: 12 });
    expect(p.cost()).toBe(0);
    expect(await p.health()).toEqual({ ok: true });
  });

  it("연결 실패는 provider_unavailable", async () => {
    const p = new LocalProvider({ fetchImpl: (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch });
    const events = [];
    for await (const e of p.correct({ system: [], user: "U", level: "L1", schema: {} })) events.push(e);
    expect(events[0]).toMatchObject({ type: "error", code: "provider_unavailable" });
  });
});
