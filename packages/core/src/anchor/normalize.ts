/** 모든 오프셋 계산의 기준: NFC 정규화된 문자열의 UTF-16 코드 유닛. */
export function nfc(text: string): string {
  return text.normalize("NFC");
}

export interface Sentence {
  index: number;
  start: number;
  end: number; // exclusive
  text: string;
}

const koSentenceSegmenter = new Intl.Segmenter("ko", { granularity: "sentence" });
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * 문장 분할. Intl.Segmenter(ko, sentence)로 나눈 뒤 개행에서 추가로 끊는다.
 * 슬랙 메시지는 문장부호 없이 줄바꿈으로 문장을 구분하는 경우가 많다.
 */
export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  for (const seg of koSentenceSegmenter.segment(text)) {
    let cursor = seg.index;
    const parts = seg.segment.split(/(\n+)/);
    for (const part of parts) {
      if (part.length === 0) continue;
      if (/^\n+$/.test(part)) { cursor += part.length; continue; }
      // 앞뒤 공백은 문장 범위에서 제외
      const lead = part.length - part.trimStart().length;
      const trail = part.length - part.trimEnd().length;
      const start = cursor + lead;
      const end = cursor + part.length - trail;
      if (end > start) out.push({ index: out.length, start, end, text: text.slice(start, end) });
      cursor += part.length;
    }
  }
  return out;
}

/** grapheme 경계 오프셋 집합. 이모지·결합 문자 중간에 오프셋이 놓이지 않게 한다. */
export function graphemeBoundaries(text: string): Set<number> {
  const set = new Set<number>([0, text.length]);
  for (const seg of graphemeSegmenter.segment(text)) set.add(seg.index);
  return set;
}

/** 오프셋을 가장 가까운 grapheme 경계로 보정 (start는 앞으로, end는 뒤로). */
export function snapToGrapheme(offset: number, boundaries: Set<number>, direction: "start" | "end"): number {
  if (boundaries.has(offset)) return offset;
  let o = offset;
  if (direction === "start") { while (o > 0 && !boundaries.has(o)) o--; }
  else { while (!boundaries.has(o)) o++; }
  return o;
}
