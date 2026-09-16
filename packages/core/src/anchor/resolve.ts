import type { LlmEdit, ResolveMethod, Suggestion } from "../schema/correction";
import { diffHunks, expandHunkToWords, type Hunk } from "./diff";
import { levenshtein, similarity } from "./levenshtein";
import { graphemeBoundaries, snapToGrapheme, splitSentences, type Sentence } from "./normalize";

export interface ResolvedSpan { start: number; end: number; method: ResolveMethod }
export interface Dropped { id: string; reason: string }
export interface ResolveAllResult { resolved: Suggestion[]; dropped: Dropped[] }

export interface Doc {
  text: string;                 // NFC
  sentences: Sentence[];
  graphemes: Set<number>;
}

export function buildDoc(textNfc: string): Doc {
  return { text: textNfc, sentences: splitSentences(textNfc), graphemes: graphemeBoundaries(textNfc) };
}

function findAll(hay: string, needle: string, from: number, to: number): number[] {
  const out: number[] = [];
  if (needle.length === 0) return out;
  let i = hay.indexOf(needle, from);
  while (i !== -1 && i + needle.length <= to) {
    out.push(i);
    i = hay.indexOf(needle, i + 1);
  }
  return out;
}

/** 1 exact → 2 context → 3 fuzzy. 범위 [from,to) 안에서만 찾는다. */
function resolveInRange(edit: LlmEdit, text: string, from: number, to: number): ResolvedSpan | null {
  const { original } = edit;
  if (original.length === 0) return null;

  const hits = findAll(text, original, from, to);
  if (hits.length === 1) {
    // 문맥이 제공됐는데 양쪽 모두 어긋나면 모델이 다른 위치를 뜻한 것일 수 있다 → 상위 범위로 넘긴다
    const hasCtx = edit.context_before.length > 0 || edit.context_after.length > 0;
    if (hasCtx && !matchesContext(text, hits[0]!, edit, "provided")) return null;
    return { start: hits[0]!, end: hits[0]! + original.length, method: "exact" };
  }

  if (hits.length > 1) {
    const both = hits.filter((h) => matchesContext(text, h, edit, "both"));
    if (both.length === 1) return { start: both[0]!, end: both[0]! + original.length, method: "context" };
    const one = hits.filter((h) => matchesContext(text, h, edit, "either"));
    if (one.length === 1) return { start: one[0]!, end: one[0]! + original.length, method: "context" };
    // 문맥으로도 못 가르면 첫 번째를 택하지 않고 실패 → 상위 단계(전체 범위·diff)로 넘긴다
    return null;
  }

  // fuzzy: 길이 ±20% 창을 슬라이딩, 거리 ≤ ceil(len×0.15), 최소값이 유일해야 채택
  const L = original.length;
  const maxDist = Math.ceil(L * 0.15);
  if (maxDist === 0) return null;
  let best: { start: number; len: number; d: number } | null = null;
  let tie = false;
  const minLen = Math.max(1, Math.floor(L * 0.8));
  const maxLen = Math.ceil(L * 1.2);
  for (let s = from; s < to; s++) {
    for (let len = minLen; len <= maxLen && s + len <= to; len++) {
      const d = levenshtein(text.slice(s, s + len), original);
      if (d > maxDist) continue;
      if (!best || d < best.d) { best = { start: s, len, d }; tie = false; }
      else if (d === best.d && !(s === best.start)) {
        // 같은 시작점의 길이 변형은 동점으로 보지 않는다(경계만 다른 경우)
        if (Math.abs(s - best.start) > 1) tie = true;
      }
    }
  }
  if (best && !tie) return { start: best.start, end: best.start + best.len, method: "fuzzy" };
  return null;
}

/**
 * both: 두 문맥 모두 일치(빈 문맥은 통과). either: 둘 중 하나라도 실제로 일치.
 * provided: 제공된(비어 있지 않은) 문맥은 모두 일치해야 함.
 */
function matchesContext(text: string, hit: number, edit: LlmEdit, mode: "both" | "either" | "provided"): boolean {
  const before = edit.context_before;
  const after = edit.context_after;
  const beforeHit = before.length > 0 && text.slice(Math.max(0, hit - before.length), hit) === before;
  const afterEnd = hit + edit.original.length;
  const afterHit = after.length > 0 && text.slice(afterEnd, afterEnd + after.length) === after;
  if (mode === "either") return beforeHit || afterHit;
  const beforeOk = before.length === 0 || beforeHit;
  const afterOk = after.length === 0 || afterHit;
  return beforeOk && afterOk; // both, provided 동일 의미(빈 문맥은 통과)
}

/** 단일 edit 해소. 문장 범위 → 전체 범위 순. diff 단계는 resolveAll에서 일괄 처리. */
export function resolveEdit(edit: LlmEdit, doc: Doc): ResolvedSpan | null {
  const sentence = doc.sentences[edit.sentence_index];
  if (sentence) {
    const r = resolveInRange(edit, doc.text, sentence.start, sentence.end);
    if (r) return snap(r, doc);
  }
  const r = resolveInRange(edit, doc.text, 0, doc.text.length);
  return r ? snap(r, doc) : null;
}

function snap(r: ResolvedSpan, doc: Doc): ResolvedSpan {
  return {
    start: snapToGrapheme(r.start, doc.graphemes, "start"),
    end: snapToGrapheme(r.end, doc.graphemes, "end"),
    method: r.method,
  };
}

/**
 * 전체 해소: 개별 해소 → 미해소분은 corrected_text diff 헝크와 정렬 → 겹침 제거(confidence 우선).
 */
export function resolveAll(edits: LlmEdit[], doc: Doc, correctedText: string | null): ResolveAllResult {
  const resolved: Suggestion[] = [];
  const dropped: Dropped[] = [];
  const unresolved: LlmEdit[] = [];

  for (const e of edits) {
    const r = resolveEdit(e, doc);
    if (r) resolved.push({ ...e, start: r.start, end: r.end, resolveMethod: r.method });
    else unresolved.push(e);
  }

  if (unresolved.length > 0 && correctedText !== null) {
    const taken = new Set<number>();
    const hunks = mergeAdjacent(
      diffHunks(doc.text, correctedText).map((h) => expandHunkToWords(h, doc.text, correctedText)),
      doc.text, correctedText,
    );
    for (const e of unresolved) {
      const idx = bestHunk(e, hunks, taken);
      if (idx === -1) { dropped.push({ id: e.id, reason: "anchor_not_found" }); continue; }
      taken.add(idx);
      const h = hunks[idx]!;
      const s = snapToGrapheme(h.start, doc.graphemes, "start");
      const en = snapToGrapheme(h.end, doc.graphemes, "end");
      resolved.push({ ...e, original: doc.text.slice(s, en), replacement: h.replacement, start: s, end: en, resolveMethod: "diff" });
    }
  } else {
    for (const e of unresolved) dropped.push({ id: e.id, reason: "anchor_not_found" });
  }

  return dedupeOverlaps(resolved, dropped);
}

/** 확장 후 겹치거나 경계 문자 1개 이하로 붙은 헝크를 하나로 합친다(모델의 단어 단위 edit과 맞추기 위해). */
function mergeAdjacent(hunks: Hunk[], original: string, corrected: string): Hunk[] {
  const sorted = [...hunks].sort((a, b) => a.start - b.start);
  const out: Hunk[] = [];
  for (const h of sorted) {
    const last = out[out.length - 1];
    if (last && h.start <= last.end + 1) {
      last.end = Math.max(last.end, h.end);
      last.cend = Math.max(last.cend, h.cend);
      last.original = original.slice(last.start, last.end);
      last.replacement = corrected.slice(last.cstart, last.cend);
    } else out.push({ ...h });
  }
  return out;
}

function bestHunk(e: LlmEdit, hunks: Hunk[], taken: Set<number>): number {
  let best = -1;
  let bestScore = 0;
  hunks.forEach((h, i) => {
    if (taken.has(i)) return;
    // 교체문 유사도와 원문 유사도의 평균. 0.7 이상만 인정.
    const score = (similarity(h.replacement, e.replacement) + similarity(h.original, e.original)) / 2;
    if (score >= 0.7 && score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

function dedupeOverlaps(resolved: Suggestion[], dropped: Dropped[]): ResolveAllResult {
  const sorted = [...resolved].sort((a, b) => b.confidence - a.confidence || a.start - b.start);
  const kept: Suggestion[] = [];
  for (const s of sorted) {
    const clash = kept.some((k) => s.start < k.end && k.start < s.end && !(s.start === s.end && k.start === k.end));
    if (clash) dropped.push({ id: s.id, reason: "overlap" });
    else kept.push(s);
  }
  kept.sort((a, b) => a.start - b.start);
  return { resolved: kept, dropped };
}
