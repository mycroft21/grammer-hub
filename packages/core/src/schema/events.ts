import { z } from "zod";
import { LlmRewrite, ProviderId, Suggestion } from "./correction";

/** `POST /api/correct` SSE 이벤트. 순서: meta → (edit|edit_dropped|rewrite)* → text → usage → done | error */
export const MaskedSpan = z.object({
  start: z.number().int(), end: z.number().int(), kind: z.string(),
});
export const Usage = z.object({
  inputTokens: z.number().int(),
  cachedTokens: z.number().int(),
  cacheWriteTokens: z.number().int(),
  outputTokens: z.number().int(),
  costUsd: z.number(),
  latencyMs: z.number().int(),
  ttfbMs: z.number().int(),
});
export type Usage = z.infer<typeof Usage>;

export const ErrorCode = z.enum([
  "provider_unavailable", "refusal", "schema_invalid", "timeout", "pii_blocked", "bad_request",
]);

export const SseEvent = z.discriminatedUnion("event", [
  z.object({ event: z.literal("meta"), data: z.object({
    runId: z.string(), provider: ProviderId, model: z.string(),
    profileVersionId: z.string().nullable(), maskedSpans: z.array(MaskedSpan),
  }) }),
  z.object({ event: z.literal("edit"), data: Suggestion }),
  z.object({ event: z.literal("edit_dropped"), data: z.object({ id: z.string(), reason: z.string() }) }),
  z.object({ event: z.literal("rewrite"), data: LlmRewrite.extend({ index: z.number().int() }) }),
  z.object({ event: z.literal("text"), data: z.object({ corrected_text: z.string(), reader_view: z.string().nullable() }) }),
  z.object({ event: z.literal("usage"), data: Usage }),
  z.object({ event: z.literal("done"), data: z.object({}) }),
  z.object({ event: z.literal("error"), data: z.object({ code: ErrorCode, message: z.string() }) }),
]);
export type SseEvent = z.infer<typeof SseEvent>;
