import type { SseEvent } from "@grammer-hub/core";

export function encodeSse(ev: SseEvent): string {
  return `event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`;
}

/** 이벤트 제너레이터를 SSE Response로. 클라이언트 abort 시 signal이 전파된다. */
export function sseResponse(gen: AsyncGenerator<SseEvent, unknown>, onClose?: () => void): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const r = await gen.next();
      if (r.done) { controller.close(); onClose?.(); return; }
      controller.enqueue(enc.encode(encodeSse(r.value)));
    },
    async cancel() { await gen.return(undefined); onClose?.(); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
