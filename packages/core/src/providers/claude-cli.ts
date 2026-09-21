import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { costUsd } from "./pricing";
import type { CorrectionProvider, ProviderEvent, ProviderInput, ProviderUsage } from "./types";

export interface ClaudeCliOptions {
  bin?: string;              // 기본 "claude" (PATH)
  binArgs?: string[];        // bin 앞에 붙는 인자(테스트용: node <script>)
  model?: string;            // 기본 claude-sonnet-5
  timeoutMs?: number;        // 기본 180s
  effort?: "low" | "medium" | "high"; // 기본 low(API provider와 동일). 교정은 low면 충분하고 지연이 크게 준다
  cwd?: string;              // 기본: 빈 임시 디렉터리(프로젝트 CLAUDE.md·훅이 섞이지 않게)
}

/** `claude -p --output-format stream-json`의 마지막 `result` 줄 */
interface CliResult {
  type?: string;
  is_error?: boolean;
  subtype?: string;
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}
interface StreamLine {
  type?: string;
  event?: { type?: string; content_block?: { type?: string }; delta?: { type?: string; partial_json?: string; text?: string } };
}

/**
 * 교정·스튜디오는 텍스트 → JSON이면 충분하다. `--tools ""`로 내장 도구를 전부 끄고(시스템 프롬프트의 도구 정의도 빠져 토큰이 준다),
 * `--strict-mcp-config`로 MCP 서버를, `--disable-slash-commands`로 스킬을 막는다. 구조화 출력은 내부적으로 도구 한 번을 쓰므로 turns는 2.
 * `--no-session-persistence`: ~/.claude/projects에 세션 파일을 남기지 않는다.
 */
const ISOLATION_ARGS = ["--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence", "--max-turns", "2", "--permission-mode", "dontAsk"];

/** 콜백(stdout data)에서 제너레이터로 이벤트를 넘기는 최소 채널. */
class Channel<T> {
  private items: T[] = [];
  private waiters: ((r: IteratorResult<T>) => void)[] = [];
  private closed = false;
  push(v: T) { const w = this.waiters.shift(); if (w) w({ value: v, done: false }); else this.items.push(v); }
  close() { this.closed = true; for (const w of this.waiters.splice(0)) w({ value: undefined as never, done: true }); }
  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      if (this.items.length) { yield this.items.shift() as T; continue; }
      if (this.closed) return;
      const r = await new Promise<IteratorResult<T>>((res) => this.waiters.push(res));
      if (r.done) return;
      yield r.value;
    }
  }
}

type Outcome = { kind: "ok"; result: CliResult | null; stdout: string } | { kind: "error"; code: "provider_unavailable" | "timeout"; message: string };

/**
 * Claude Code CLI(`claude -p`)를 서브프로세스로 부르는 provider. 개인 Mac에서 구독 로그인으로 테스트할 때만 쓴다.
 * stream-json으로 받아 구조화 출력(StructuredOutput 도구 입력)의 input_json_delta를 그대로 delta로 흘리므로
 * 교정 카드·스튜디오 슬롯이 API 직접 호출 때와 같이 실시간으로 뜬다.
 * 제약: 프로세스 기동 지연(수 초), 캐시 제어 없음, Claude Code와 사용량 창 공유.
 * `--bare`를 쓰지 않는 이유: bare 모드는 구독 로그인을 읽지 않는다(API 키 필요).
 * 제3자에게 제공하는 제품에는 쓸 수 없다(Agent SDK 문서의 claude.ai 로그인 제공 금지 조항). 기본값은 여전히 API 키.
 */
export class ClaudeCliProvider implements CorrectionProvider {
  readonly id = "cloud" as const; // UI 관점에서는 cloud 자리를 대신한다(FakeProvider와 같은 방식)
  readonly model: string;
  private readonly bin: string;
  private readonly binArgs: string[];
  private readonly timeoutMs: number;
  private readonly effort: "low" | "medium" | "high";
  private readonly cwd: string;

  constructor(opts: ClaudeCliOptions = {}) {
    this.bin = opts.bin ?? "claude";
    this.binArgs = opts.binArgs ?? [];
    this.model = opts.model ?? "claude-sonnet-5";
    this.timeoutMs = opts.timeoutMs ?? 180_000;
    this.effort = opts.effort ?? "low";
    this.cwd = opts.cwd ?? mkdtempSync(join(tmpdir(), "gh-claude-cli-"));
  }

  async *correct(input: ProviderInput): AsyncIterable<ProviderEvent> {
    const system = input.system.map((b) => b.text).filter(Boolean).join("\n\n");
    const args = [
      ...this.binArgs,
      "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
      "--json-schema", JSON.stringify(input.schema),
      "--system-prompt", system,
      "--model", this.model,
      "--effort", this.effort,
      ...ISOLATION_ARGS,
    ];
    const ch = new Channel<ProviderEvent>();
    let raw = ""; let stage: "thinking" | "writing" | null = null; let result: CliResult | null = null;
    const onLine = (line: string) => {
      let j: StreamLine; try { j = JSON.parse(line) as StreamLine; } catch { return; }
      if (j.type === "stream_event" && j.event) {
        const e = j.event;
        if (e.type === "content_block_start" && e.content_block?.type === "thinking" && stage === null) { stage = "thinking"; ch.push({ type: "status", stage }); }
        else if (e.type === "content_block_delta" && e.delta?.type === "input_json_delta" && e.delta.partial_json) {
          if (stage !== "writing") { stage = "writing"; ch.push({ type: "status", stage }); }
          raw += e.delta.partial_json; ch.push({ type: "delta", text: e.delta.partial_json });
        }
      } else if (j.type === "result") result = j as CliResult;
    };
    const outcome = this.run(args, input.user, input.signal, onLine, () => ch.close());
    for await (const ev of ch) yield ev;
    const r = await outcome;
    if (r.kind === "error") { yield { type: "error", code: r.code, message: r.message }; return; }
    const res = result as CliResult | null;
    if (!res) { yield { type: "error", code: "provider_unavailable", message: `claude가 result를 내지 않았습니다: ${r.stdout.trim().slice(-200)}` }; return; }
    if (res.is_error) { yield { type: "error", code: "provider_unavailable", message: `claude 실패(${res.subtype ?? "error"}): ${(res.result ?? "").slice(0, 300)}` }; return; }

    // 델타가 없었으면(구버전·비스트리밍) 결과에서 JSON을 건진다. 구조화 출력이 우선.
    let finalRaw = raw;
    if (res.structured_output !== undefined && res.structured_output !== null) finalRaw = JSON.stringify(res.structured_output);
    else if (!finalRaw) {
      const t = (res.result ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
      const a = t.indexOf("{"), b = t.lastIndexOf("}");
      finalRaw = a >= 0 && b > a ? t.slice(a, b + 1) : t;
    }
    if (!raw && finalRaw) yield { type: "delta", text: finalRaw };
    const u = res.usage ?? {};
    const usage: ProviderUsage = {
      inputTokens: u.input_tokens ?? 0, cachedTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0, outputTokens: u.output_tokens ?? 0,
    };
    yield { type: "final", raw: finalRaw, usage, stopReason: res.subtype === "success" ? "end_turn" : (res.subtype ?? "end_turn") };
  }

  /** 프로세스를 돌리며 stdout을 줄 단위로 onLine에 넘기고, 끝나면 onDone을 부른 뒤 결과를 resolve한다. */
  private run(args: string[], stdin: string, signal: AbortSignal | undefined, onLine: (l: string) => void, onDone: () => void): Promise<Outcome> {
    return new Promise((resolve) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(this.bin, args, { cwd: this.cwd, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" } });
      } catch (e) { onDone(); resolve({ kind: "error", code: "provider_unavailable", message: `claude 실행 실패: ${String(e)}` }); return; }
      let out = ""; let buf = ""; let err = ""; let done = false;
      const finish = (v: Outcome) => { if (!done) { done = true; clearTimeout(timer); signal?.removeEventListener("abort", onAbort); onDone(); resolve(v); } };
      const onAbort = () => { child.kill("SIGTERM"); finish({ kind: "error", code: "provider_unavailable", message: "요청이 취소되었습니다" }); };
      const timer = setTimeout(() => { child.kill("SIGTERM"); finish({ kind: "error", code: "timeout", message: `claude 응답 없음(${Math.round(this.timeoutMs / 1000)}s)` }); }, this.timeoutMs);
      if (signal?.aborted) { onAbort(); return; }
      signal?.addEventListener("abort", onAbort, { once: true });
      child.stdout?.on("data", (d: Buffer) => {
        const t = d.toString("utf8"); out += t; buf += t;
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) { const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (line) onLine(line); }
      });
      child.stderr?.on("data", (d: Buffer) => { err += d.toString("utf8"); });
      child.on("error", (e: NodeJS.ErrnoException) => {
        finish({ kind: "error", code: "provider_unavailable", message: e.code === "ENOENT" ? `claude CLI를 찾을 수 없습니다(${this.bin}). Claude Code가 설치되어 있고 PATH에 있어야 합니다. CLAUDE_CLI_PATH로 경로를 지정할 수 있습니다.` : `claude 실행 실패: ${e.message}` });
      });
      child.on("close", (code) => {
        if (buf.trim()) { onLine(buf.trim()); buf = ""; }
        if (code === 0 || /"type":\s*"result"/.test(out)) finish({ kind: "ok", result: null, stdout: out });
        else finish({ kind: "error", code: "provider_unavailable", message: `claude 종료 코드 ${code}: ${(err || out).trim().slice(0, 300)}` });
      });
      child.stdin?.on("error", () => { /* 조기 종료 시 EPIPE 무시 */ });
      child.stdin?.end(stdin);
    });
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    return new Promise<{ ok: boolean; detail?: string }>((resolve) => {
      let out = "";
      let child: ReturnType<typeof spawn>;
      try { child = spawn(this.bin, [...this.binArgs, "--version"], { cwd: this.cwd, stdio: ["ignore", "pipe", "pipe"] }); }
      catch (e) { resolve({ ok: false, detail: String(e) }); return; }
      const t = setTimeout(() => { child.kill("SIGTERM"); resolve({ ok: false, detail: "timeout" }); }, 15_000);
      child.stdout?.on("data", (d: Buffer) => { out += d.toString("utf8"); });
      child.on("error", (e) => { clearTimeout(t); resolve({ ok: false, detail: e.message }); });
      child.on("close", (code) => { clearTimeout(t); resolve(code === 0 ? { ok: true, detail: out.trim() } : { ok: false, detail: `exit ${code}` }); });
    });
  }

  /** 구독이라 실제 청구는 0이지만, 비교를 위해 API 요금 기준 추정치를 남긴다. */
  cost(usage: ProviderUsage): number { return costUsd(this.model, usage); }
}
