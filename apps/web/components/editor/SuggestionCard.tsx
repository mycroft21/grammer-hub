"use client";
import type { EditItem } from "./useCorrection";

const CAT_KO: Record<string, string> = {
  SPACING: "띄어쓰기", SPELLING: "철자", GRAMMAR: "문법", PUNCTUATION: "문장부호", HONORIFIC: "높임",
  REGISTER: "문체", WORD_CHOICE: "어휘", CLARITY: "명확성", CONCISENESS: "간결성", TONE: "어조",
};

export function SuggestionCard({ item, focused, onHover, onAccept, onReject, onMute }: {
  item: EditItem; focused: boolean; onHover: (id: string | null) => void;
  onAccept: () => void; onReject: () => void; onMute: () => void;
}) {
  const { s, state } = item;
  const border = state === "accepted" ? "border-emerald-500" : state === "rejected" ? "border-neutral-300 opacity-60" : "border-neutral-200";
  return (
    <div data-card={s.id} tabIndex={-1}
      className={`rounded-md border bg-white p-3 text-sm shadow-sm transition ${border} ${focused ? "ring-2 ring-neutral-800" : ""}`}
      onMouseEnter={() => onHover(s.id)} onMouseLeave={() => onHover(null)}>
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded bg-neutral-900 px-1.5 py-0.5 font-medium text-white">{CAT_KO[s.category] ?? s.category}</span>
        <span className={`rounded px-1.5 py-0.5 ${s.severity === "error" ? "bg-rose-100 text-rose-800" : s.severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-700"}`}>{s.severity}</span>
        <span className="ml-auto text-neutral-400">{Math.round(s.confidence * 100)}% · {s.resolveMethod}</span>
      </div>
      <div className="mt-2 font-medium">
        <span className="text-rose-700 line-through decoration-rose-400">{s.original || "(삽입)"}</span>
        <span className="mx-2 text-neutral-400">→</span>
        <span className="text-emerald-700">{s.replacement || "(삭제)"}</span>
      </div>
      <p className="mt-1 text-neutral-600">{s.reason_ko}</p>
      {s.rule_ref && <a className="mt-1 inline-block text-xs text-sky-700 underline" href={s.rule_ref} target="_blank" rel="noreferrer">근거 보기</a>}
      <div className="mt-2 flex gap-2">
        <button className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-40" onClick={onAccept} disabled={state === "accepted"}>수락 <kbd className="opacity-70">a</kbd></button>
        <button className="rounded border px-2 py-1 text-xs disabled:opacity-40" onClick={onReject} disabled={state === "rejected"}>무시 <kbd className="opacity-70">x</kbd></button>
        <button className="ml-auto rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100" onClick={onMute} title="이 카테고리 제안을 이 프로필에서 끕니다">이런 제안 끄기</button>
      </div>
    </div>
  );
}
