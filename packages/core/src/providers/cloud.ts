import Anthropic from "@anthropic-ai/sdk";
import type { CorrectionProvider, ProviderEvent, ProviderInput, ProviderUsage } from "./types";
import { costUsd } from "./pricing";
import { apiThinking, type ThinkingLevel } from "./thinking";

export interface CloudProviderOptions {
  client?: Anthropic;
  model?: string;
  maxTokens?: number;
  /** 단계별 thinking(기본 low = adaptive + effort low). 모델이 받는 값으로는 apiThinking이 바꾼다 */
  thinking?: ThinkingLevel;
}

/** Claude Sonnet 5 기본. system[0..1]에 cache_control, 구조화 출력, thinking은 단계 설정(기본 adaptive + effort low). */
export class CloudProvider implements CorrectionProvider {
  readonly id = "cloud" as const;
  readonly model: string;
  private readonly client: Anthropic;
  private readonly maxTokens: number;
  readonly thinking: ThinkingLevel;

  constructor(opts: CloudProviderOptions = {}) {
    this.client = opts.client ?? new Anthropic();
    this.model = opts.model ?? "claude-sonnet-5";
    this.maxTokens = opts.maxTokens ?? 8000;
    this.thinking = opts.thinking ?? "low";
  }

  async *correct(input: ProviderInput): AsyncIterable<ProviderEvent> {
    const system: Anthropic.TextBlockParam[] = input.system
      .filter((b) => b.text.length > 0)
      .map((b) => (b.cache ? { type: "text", text: b.text, cache_control: { type: "ephemeral" } } : { type: "text", text: b.text }));

    const t = apiThinking(this.model, this.thinking);
    let stream: ReturnType<Anthropic["messages"]["stream"]>;
    try {
      stream = this.client.messages.stream(
        {
          model: this.model,
          max_tokens: this.maxTokens,
          system,
          messages: [{ role: "user", content: input.user }],
          ...(t.thinking ? { thinking: t.thinking } : {}),
          output_config: { ...(t.effort ? { effort: t.effort } : {}), format: { type: "json_schema", schema: input.schema } },
        },
        input.signal ? { signal: input.signal } : undefined,
      );
    } catch (e) {
      yield { type: "error", code: "provider_unavailable", message: String(e) };
      return;
    }

    try {
      let stage: "thinking" | "writing" | null = null;
      for await (const ev of stream) {
        if (ev.type === "content_block_start" && ev.content_block.type === "thinking" && stage === null) {
          stage = "thinking"; yield { type: "status", stage };
        } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          if (stage !== "writing") { stage = "writing"; yield { type: "status", stage }; }
          yield { type: "delta", text: ev.delta.text };
        }
      }
      const msg: Anthropic.Message = await stream.finalMessage();
      const raw = msg.content.filter((c): c is Anthropic.TextBlock => c.type === "text").map((c) => c.text).join("");
      const usage: ProviderUsage = {
        inputTokens: msg.usage.input_tokens,
        cachedTokens: msg.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
        outputTokens: msg.usage.output_tokens,
      };
      if (msg.stop_reason === "refusal") {
        yield { type: "error", code: "refusal", message: msg.stop_details?.explanation ?? "refused" };
        return;
      }
      if (msg.stop_reason === "max_tokens") {
        yield { type: "error", code: "max_tokens", message: "output truncated" };
        return;
      }
      yield { type: "final", raw, usage, stopReason: msg.stop_reason ?? "end_turn" };
    } catch (e) {
      if (e instanceof Anthropic.APIConnectionTimeoutError) yield { type: "error", code: "timeout", message: e.message };
      else if (e instanceof Anthropic.APIError) yield { type: "error", code: "provider_unavailable", message: `${e.status ?? ""} ${e.message}`.trim() };
      else yield { type: "error", code: "provider_unavailable", message: String(e) };
    }
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await this.client.models.retrieve(this.model);
      return { ok: true };
    } catch (e) {
      return { ok: false, detail: String(e) };
    }
  }

  cost(usage: ProviderUsage): number { return costUsd(this.model, usage); }
}
