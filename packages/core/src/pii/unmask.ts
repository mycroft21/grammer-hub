import type { MaskResult } from "./types";

export interface UnmaskResult {
  text: string;
  /** result.map에 있지만 text에서 (정확·퍼지 모두) 찾지 못한 토큰 */
  lost: string[];
}

function escapeRe(c: string): string {
  return /[.*+?^${}()|[\]\\/]/.test(c) ? `\\${c}` : c;
}

/**
 * 대체어의 공백·하이픈을 무시하고, 문자 사이에 공백/하이픈이 끼어도 맞는 정규식.
 * 숫자만으로 된 대체어는 앞뒤에 숫자가 붙지 않아야 한다(더 긴 숫자열의 일부와 오매칭 방지).
 */
export function fuzzyPattern(token: string): RegExp {
  const chars = [...token].filter((c) => !/[\s-]/.test(c));
  const body = chars.map(escapeRe).join("[\\s-]*");
  const digitsOnly = chars.length > 0 && chars.every((c) => /\d/.test(c));
  return new RegExp(digitsOnly ? `(?<!\\d)${body}(?!\\d)` : body, "gu");
}

/**
 * 모델 응답의 대체어/토큰을 원문 값으로 되돌린다.
 * 1) 긴 토큰부터 정확 치환 2) 남은 변형(공백·하이픈 삽입/삭제, 따옴표 감싸기)은 퍼지 치환.
 * 따옴표는 대체어 바깥이므로 그대로 남는다.
 */
export function unmask(text: string, result: MaskResult): UnmaskResult {
  let out = text.normalize("NFC");
  const entries = [...result.map.entries()].sort((a, b) => b[0].length - a[0].length);
  const found = new Set<string>();

  for (const [token, original] of entries) {
    if (out.includes(token)) {
      out = out.split(token).join(original);
      found.add(token);
    }
  }
  for (const [token, original] of entries) {
    const re = fuzzyPattern(token);
    if (re.test(out)) {
      re.lastIndex = 0;
      out = out.replace(re, () => original);
      found.add(token);
    }
  }

  const lost = [...result.map.keys()].filter((t) => !found.has(t));
  return { text: out, lost };
}

/**
 * 마스킹된 텍스트의 오프셋을 NFC 원문 오프셋으로 되돌린다(구간별 선형).
 * 오프셋이 대체어 내부에 있으면 bias "start"는 원문 값의 시작, "end"는 끝으로 붙인다.
 */
export function mapOffset(offsetInMasked: number, result: MaskResult, bias: "start" | "end" = "start"): number {
  let delta = 0; // 원문 오프셋 - 마스킹 오프셋 (누적)
  for (const s of result.spans) {
    if (offsetInMasked <= s.start) break;
    const tokenLen = s.end - s.start;
    const originalLen = s.original.length;
    if (offsetInMasked >= s.end) {
      delta += originalLen - tokenLen;
      continue;
    }
    const originalStart = s.start + delta;
    return bias === "start" ? originalStart : originalStart + originalLen;
  }
  return offsetInMasked + delta;
}

/** [start,end) 범위를 원문 기준으로. 대체어를 일부만 덮는 범위는 원문 값 전체를 덮도록 확장된다. */
export function mapRange(start: number, end: number, result: MaskResult): { start: number; end: number } {
  return { start: mapOffset(start, result, "start"), end: mapOffset(end, result, "end") };
}
