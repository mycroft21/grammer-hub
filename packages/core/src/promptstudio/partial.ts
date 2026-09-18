import { parse, Allow } from "partial-json";

/**
 * 스트리밍 JSON에서 최상위 키가 "닫힐 때"(다음 키가 시작되거나 스트림 종료) 한 번씩 내보낸다.
 * 교정의 PartialCorrectionParser와 같은 원리를 임의의 객체에 일반화.
 */
export class PartialSlotParser {
  private buf = "";
  private emitted = new Set<string>();
  constructor(private readonly order: readonly string[]) {}

  push(delta: string): Array<{ key: string; value: unknown }> { this.buf += delta; return this.drain(false); }
  finish(): Array<{ key: string; value: unknown }> { return this.drain(true); }
  get text(): string { return this.buf; }

  private drain(final: boolean): Array<{ key: string; value: unknown }> {
    let obj: Record<string, unknown>;
    try { obj = parse(this.buf, Allow.ALL) as Record<string, unknown>; } catch { return []; }
    if (!obj || typeof obj !== "object") return [];
    const present = this.order.filter((k) => k in obj);
    const out: Array<{ key: string; value: unknown }> = [];
    // 마지막으로 나타난 키는 아직 채워지는 중일 수 있다 → final이 아니면 보류
    const closed = final ? present : present.slice(0, -1);
    for (const k of closed) {
      if (this.emitted.has(k)) continue;
      this.emitted.add(k);
      out.push({ key: k, value: obj[k] });
    }
    return out;
  }
}
