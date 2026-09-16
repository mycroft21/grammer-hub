"use client";
import type { EditItem } from "./useCorrection";

const CAT_COLOR: Record<string, string> = {
  SPACING: "bg-sky-100 border-sky-400", SPELLING: "bg-rose-100 border-rose-400", GRAMMAR: "bg-orange-100 border-orange-400",
  PUNCTUATION: "bg-slate-100 border-slate-400", HONORIFIC: "bg-violet-100 border-violet-400", REGISTER: "bg-amber-100 border-amber-400",
  WORD_CHOICE: "bg-lime-100 border-lime-400", CLARITY: "bg-teal-100 border-teal-400", CONCISENESS: "bg-cyan-100 border-cyan-400", TONE: "bg-fuchsia-100 border-fuchsia-400",
};

/** 원문 위에 변경을 표시. accepted면 삭제선+삽입, rejected면 흐리게, pending은 밑줄. */
export function HighlightView({ text, edits, hoverId, onHover, onClick }: {
  text: string; edits: EditItem[]; hoverId: string | null; onHover: (id: string | null) => void; onClick: (id: string) => void;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const e of edits) {
    if (e.s.start < cursor) continue; // 겹침 방어
    if (e.s.start > cursor) parts.push(<span key={`t${cursor}`}>{text.slice(cursor, e.s.start)}</span>);
    const color = CAT_COLOR[e.s.category] ?? "bg-neutral-100 border-neutral-400";
    const active = hoverId === e.s.id ? "ring-2 ring-neutral-800" : "";
    const original = text.slice(e.s.start, e.s.end);
    parts.push(
      <span key={e.s.id} data-edit={e.s.id} className={`cursor-pointer rounded px-0.5 ${active}`}
        onMouseEnter={() => onHover(e.s.id)} onMouseLeave={() => onHover(null)} onClick={() => onClick(e.s.id)}>
        {e.state === "accepted" ? (
          <>
            {original && <del className="text-neutral-400">{original}</del>}
            <ins className={`no-underline ${color} border-b-2`}>{e.s.replacement}</ins>
          </>
        ) : e.state === "rejected" ? (
          <span className="opacity-60">{original}</span>
        ) : (
          <span className={`border-b-2 ${color}`}>{original || "␣"}</span>
        )}
      </span>,
    );
    cursor = e.s.end;
  }
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);
  return <div className="whitespace-pre-wrap break-words leading-7">{parts}</div>;
}
