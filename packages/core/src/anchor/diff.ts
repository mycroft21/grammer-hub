import DiffMatchPatch from "diff-match-patch";

export interface Hunk {
  start: number;      // 원문 오프셋
  end: number;        // exclusive
  cstart: number;     // 교정문 오프셋
  cend: number;
  original: string;
  replacement: string;
}

const dmp = new DiffMatchPatch();

/**
 * 원문과 교정문의 문자 단위 diff를 교체 헝크로 묶는다.
 * 연속된 DELETE/INSERT는 하나의 헝크. 순수 INSERT는 길이 0 스팬.
 */
export function diffHunks(original: string, corrected: string): Hunk[] {
  const diffs = dmp.diff_main(original, corrected);
  dmp.diff_cleanupSemantic(diffs);
  const hunks: Hunk[] = [];
  let pos = 0;
  let cpos = 0;
  let pending: Hunk | null = null;
  const flush = () => { if (pending) { hunks.push(pending); pending = null; } };
  for (const [op, text] of diffs) {
    if (op === 0) { flush(); pos += text.length; cpos += text.length; continue; }
    if (!pending) pending = { start: pos, end: pos, cstart: cpos, cend: cpos, original: "", replacement: "" };
    if (op === -1) { pending.original += text; pending.end += text.length; pos += text.length; }
    else { pending.replacement += text; pending.cend += text.length; cpos += text.length; }
  }
  flush();
  return hunks;
}

const BOUNDARY = /[\s.,!?;:()\[\]"'\u3002\uff0c\uff01\uff1f]/;

/**
 * 헝크를 양쪽 단어 경계까지 확장한다. 헝크 밖 문맥은 원문·교정문이 동일하므로
 * 같은 길이만큼 확장하면 두 문자열의 창이 대응한다.
 */
export function expandHunkToWords(h: Hunk, original: string, corrected: string): Hunk {
  let s = h.start, cs = h.cstart;
  while (s > 0 && cs > 0 && !BOUNDARY.test(original[s - 1]!) && original[s - 1] === corrected[cs - 1]) { s--; cs--; }
  let e = h.end, ce = h.cend;
  while (e < original.length && ce < corrected.length && !BOUNDARY.test(original[e]!) && original[e] === corrected[ce]) { e++; ce++; }
  return { start: s, end: e, cstart: cs, cend: ce, original: original.slice(s, e), replacement: corrected.slice(cs, ce) };
}
