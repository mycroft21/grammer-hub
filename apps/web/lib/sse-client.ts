import { SseEvent } from "@grammer-hub/core";

/** fetch 응답 본문(SSE)을 이벤트로 파싱한다. EventSource는 POST를 지원하지 않는다. */
export async function* readSse(res: Response, signal?: AbortSignal): AsyncGenerator<SseEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
        let event = ""; let data = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7);
          else if (line.startsWith("data: ")) data += line.slice(6);
        }
        if (!event) continue;
        const parsed = SseEvent.safeParse({ event, data: JSON.parse(data || "{}") });
        if (parsed.success) yield parsed.data;
      }
    }
  } finally { reader.releaseLock(); }
}
