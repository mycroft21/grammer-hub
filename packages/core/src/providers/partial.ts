import { parse, Allow } from "partial-json";
import { LlmEdit, LlmRewrite } from "../schema/correction";

/**
 * 스트리밍 텍스트를 누적하며 edits[] / rewrites[] 항목이 "닫힌" 시점에 한 번씩 내보낸다.
 * 항목 i는 배열에 i+1번째 항목이 나타나기 시작했거나, 스트림이 끝났을 때 닫힌 것으로 본다.
 */
export class PartialCorrectionParser {
  private buf = "";
  private emittedEdits = 0;
  private emittedRewrites = 0;

  push(delta: string): { edits: LlmEdit[]; rewrites: LlmRewrite[] } {
    this.buf += delta;
    return this.drain(false);
  }

  finish(): { edits: LlmEdit[]; rewrites: LlmRewrite[] } {
    return this.drain(true);
  }

  get text(): string { return this.buf; }

  private drain(final: boolean): { edits: LlmEdit[]; rewrites: LlmRewrite[] } {
    let obj: unknown;
    try {
      obj = parse(this.buf, Allow.ALL);
    } catch {
      return { edits: [], rewrites: [] };
    }
    if (!obj || typeof obj !== "object") return { edits: [], rewrites: [] };
    const o = obj as { edits?: unknown[]; rewrites?: unknown[] };
    const edits = this.take(o.edits ?? [], this.emittedEdits, final, LlmEdit);
    this.emittedEdits += edits.length;
    const rewrites = this.take(o.rewrites ?? [], this.emittedRewrites, final, LlmRewrite);
    this.emittedRewrites += rewrites.length;
    return { edits, rewrites };
  }

  private take<T>(arr: unknown[], from: number, final: boolean, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): T[] {
    const closedUpTo = final ? arr.length : Math.max(0, arr.length - 1);
    const out: T[] = [];
    for (let i = from; i < closedUpTo; i++) {
      const r = schema.safeParse(arr[i]);
      if (r.success && r.data !== undefined) out.push(r.data);
      else if (!final) break; // 아직 덜 채워진 항목이면 다음 델타를 기다린다
    }
    return out;
  }
}
