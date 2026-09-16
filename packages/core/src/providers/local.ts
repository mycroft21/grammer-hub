import type { CorrectionProvider, ProviderEvent, ProviderInput, ProviderUsage } from "./types";

export interface LocalProviderOptions {
  baseUrl?: string;          // llama-server, 기본 http://127.0.0.1:8080
  model?: string;
  fetchImpl?: typeof fetch;
  slotId?: number;
  maxTokens?: number;
  temperature?: number;
}

/**
 * llama-server `/completion` 스트리밍 클라이언트.
 * 고정 시스템 블록을 항상 같은 바이트로 프롬프트 맨 앞에 두어 `--cache-reuse` prefix 캐시가 걸리게 한다.
 * Gemma 계열은 system 역할이 없어 user 턴 앞에 붙인다.
 */
export class LocalProvider implements CorrectionProvider {
  readonly id = "local" as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly f: typeof fetch;
  private readonly slotId: number;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(opts: LocalProviderOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "http://127.0.0.1:8080").replace(/\/$/, "");
    this.model = opts.model ?? "local";
    this.f = opts.fetchImpl ?? fetch;
    this.slotId = opts.slotId ?? 0;
    this.maxTokens = opts.maxTokens ?? 2000;
    this.temperature = opts.temperature ?? 0.2;
  }

  buildPrompt(input: ProviderInput): string {
    const system = input.system.map((b) => b.text).filter(Boolean).join("\n\n");
    return `<start_of_turn>user\n${system}\n\n${input.user}<end_of_turn>\n<start_of_turn>model\n`;
  }

  async *correct(input: ProviderInput): AsyncIterable<ProviderEvent> {
    let res: Response;
    try {
      res = await this.f(`${this.baseUrl}/completion`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: this.buildPrompt(input), stream: true, cache_prompt: true, id_slot: this.slotId,
          n_predict: this.maxTokens, temperature: this.temperature, json_schema: input.schema,
        }),
        ...(input.signal ? { signal: input.signal } : {}),
      });
    } catch (e) {
      yield { type: "error", code: "provider_unavailable", message: `llama-server 연결 실패: ${String(e)}` };
      return;
    }
    if (!res.ok || !res.body) {
      yield { type: "error", code: "provider_unavailable", message: `llama-server ${res.status}` };
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let raw = "";
    let usage: ProviderUsage = { inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
    let truncated = false;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith("data: ")) continue;
          const j = JSON.parse(line.slice(6)) as { content?: string; stop?: boolean; tokens_evaluated?: number; tokens_cached?: number; tokens_predicted?: number; truncated?: boolean; stopped_limit?: boolean };
          if (j.content) { raw += j.content; yield { type: "delta", text: j.content }; }
          if (j.stop) {
            const cached = j.tokens_cached ?? 0;
            usage = { inputTokens: Math.max(0, (j.tokens_evaluated ?? 0)), cachedTokens: cached, cacheWriteTokens: 0, outputTokens: j.tokens_predicted ?? 0 };
            truncated = Boolean(j.truncated || j.stopped_limit);
          }
        }
      }
    } catch (e) {
      yield { type: "error", code: input.signal?.aborted ? "timeout" : "provider_unavailable", message: String(e) };
      return;
    }
    if (truncated) { yield { type: "error", code: "max_tokens", message: "출력이 n_predict에서 잘렸습니다" }; return; }
    yield { type: "final", raw, usage, stopReason: "end_turn" };
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const r = await this.f(`${this.baseUrl}/health`);
      return r.ok ? { ok: true } : { ok: false, detail: `HTTP ${r.status}` };
    } catch (e) { return { ok: false, detail: String(e) }; }
  }

  /** 규칙 스냅샷이 바뀐 뒤 prefix KV를 디스크에 보존. 서버가 --slot-save-path로 떠 있어야 한다. */
  async saveSlot(filename = "grammer-prefix.bin"): Promise<boolean> {
    try {
      const r = await this.f(`${this.baseUrl}/slots/${this.slotId}?action=save`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename }) });
      return r.ok;
    } catch { return false; }
  }

  cost(): number { return 0; }
}
