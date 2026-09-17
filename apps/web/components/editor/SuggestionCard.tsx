"use client";
import { CAT_GROUP } from "./HighlightView";
import type { EditItem } from "./useCorrection";

const CAT_KO: Record<string, string> = {
  SPACING: "띄어쓰기", SPELLING: "철자", GRAMMAR: "문법", PUNCTUATION: "문장부호", HONORIFIC: "높임",
  REGISTER: "문체", WORD_CHOICE: "어휘", CLARITY: "명확성", CONCISENESS: "간결성", TONE: "어조",
};

/** 접힌 한 줄(점 · 카테고리 · 원문→교정 · ✓ ✕) + 펼치면 이유·근거·끄기. */
export function SuggestionCard({ item, focused, expanded, onHover, onFocus, onAccept, onReject, onMute }: {
  item: EditItem; focused: boolean; expanded: boolean; onHover: (id: string | null) => void; onFocus: () => void;
  onAccept: () => void; onReject: () => void; onMute: () => void;
}) {
  const { s, state } = item;
  const group = CAT_GROUP[s.category] ?? CAT_GROUP["CLARITY"]!;
  const isError = s.severity === "error";
  const shell = state === "accepted" ? "border-primary-line bg-primary-soft/60" : state === "rejected" ? "opacity-50" : "bg-white";
  return (
    <div data-card={s.id} tabIndex={-1} onClick={onFocus}
      className={`rounded-lg border px-3 py-2 text-[13px] transition ${shell} ${focused ? "ring-2 ring-primary/60" : ""}`}
      onMouseEnter={() => onHover(s.id)} onMouseLeave={() => onHover(null)}>
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={isError ? { background: group.color } : { boxShadow: `inset 0 0 0 1.5px ${group.color}` }} />
        <span className="w-12 shrink-0 text-[12px] text-neutral-500">{CAT_KO[s.category] ?? s.category}</span>
        <span className="min-w-0 flex-1 truncate">
          <span className={state === "accepted" ? "text-neutral-400 line-through" : "text-neutral-700 line-through decoration-neutral-400"}>{s.original || "∅"}</span>
          <span className="mx-1.5 text-neutral-300">→</span>
          <span className="font-medium text-neutral-900">{s.replacement || <span className="text-neutral-500">삭제</span>}</span>
        </span>
        <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
          <button aria-label="수락" title="수락 (a)" onClick={onAccept} disabled={state === "accepted"}
            className={`grid h-7 w-7 place-items-center rounded-md border transition ${state === "accepted" ? "border-primary bg-primary text-white" : "hover:border-primary hover:text-primary"}`}>✓<span className="sr-only">수락</span></button>
          <button aria-label="무시" title="무시 (x)" onClick={onReject} disabled={state === "rejected"}
            className="grid h-7 w-7 place-items-center rounded-md border transition hover:border-neutral-400 hover:bg-neutral-100">✕<span className="sr-only">무시</span></button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 border-t pt-2 text-neutral-600" onClick={(e) => e.stopPropagation()}>
          <p>{s.reason_ko}</p>
          <div className="mt-1.5 flex items-center gap-3 text-[12px]">
            {s.rule_ref && <a className="text-sky-700 underline" href={s.rule_ref} target="_blank" rel="noreferrer">근거 보기</a>}
            <span className="text-neutral-400" title={`확신 ${Math.round(s.confidence * 100)}% · 위치 ${s.resolveMethod}`}>{isError ? "오류" : "제안"}</span>
            <button className="ml-auto text-neutral-500 hover:text-neutral-900" onClick={onMute} title="이 카테고리 제안을 이 프로필에서 끕니다">이런 제안 끄기</button>
          </div>
        </div>
      )}
    </div>
  );
}
