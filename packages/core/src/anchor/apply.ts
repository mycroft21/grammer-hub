import type { Suggestion } from "../schema/correction";

/** 해소된 제안을 원문에 적용. start 내림차순으로 적용해 오프셋 드리프트가 없다. */
export function applyEdits(text: string, edits: ReadonlyArray<Pick<Suggestion, "start" | "end" | "replacement">>): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of sorted) out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  return out;
}
