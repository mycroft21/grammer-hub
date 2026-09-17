"use client";
import type { EditItem } from "./useCorrection";

/** 10개 카테고리를 사용자가 구분할 수 있는 4계열로 묶는다. */
export const CAT_GROUP: Record<string, { name: string; color: string; text: string }> = {
  SPACING: { name: "정확성", color: "var(--color-cat-accuracy)", text: "text-cat-accuracy" },
  SPELLING: { name: "정확성", color: "var(--color-cat-accuracy)", text: "text-cat-accuracy" },
  GRAMMAR: { name: "정확성", color: "var(--color-cat-accuracy)", text: "text-cat-accuracy" },
  PUNCTUATION: { name: "정확성", color: "var(--color-cat-accuracy)", text: "text-cat-accuracy" },
  HONORIFIC: { name: "높임·문체", color: "var(--color-cat-register)", text: "text-cat-register" },
  REGISTER: { name: "높임·문체", color: "var(--color-cat-register)", text: "text-cat-register" },
  WORD_CHOICE: { name: "명확성", color: "var(--color-cat-clarity)", text: "text-cat-clarity" },
  CLARITY: { name: "명확성", color: "var(--color-cat-clarity)", text: "text-cat-clarity" },
  CONCISENESS: { name: "명확성", color: "var(--color-cat-clarity)", text: "text-cat-clarity" },
  TONE: { name: "어조", color: "var(--color-cat-tone)", text: "text-cat-tone" },
};

/**
 * 대기: 카테고리 색 점선 밑줄만. 수락: 교정문이 자리 잡고 연한 초록. 무시: 표시 없음.
 * 포커스/hover: 연한 배경.
 */
export function HighlightView({ text, edits, hoverId, onHover, onClick }: {
  text: string; edits: EditItem[]; hoverId: string | null; onHover: (id: string | null) => void; onClick: (id: string) => void;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const e of edits) {
    if (e.s.start < cursor) continue;
    if (e.s.start > cursor) parts.push(<span key={`t${cursor}`}>{text.slice(cursor, e.s.start)}</span>);
    const original = text.slice(e.s.start, e.s.end);
    const focused = hoverId === e.s.id;
    const group = CAT_GROUP[e.s.category] ?? CAT_GROUP["CLARITY"]!;
    let cls = "cursor-pointer transition";
    let style: React.CSSProperties | undefined;
    let content: React.ReactNode = original;
    if (e.state === "accepted") { cls += " hl-accepted"; content = e.s.replacement || null; }
    else if (e.state === "pending") { cls += " hl-pending"; style = { textDecorationColor: group.color }; }
    if (focused) cls += " hl-focus";
    parts.push(
      <span key={e.s.id} data-edit={e.s.id} className={cls} style={style}
        title={e.state === "accepted" ? `원문: ${original}` : `${group.name} · ${e.s.replacement || "삭제"}`}
        onMouseEnter={() => onHover(e.s.id)} onMouseLeave={() => onHover(null)} onClick={() => onClick(e.s.id)}>
        {content ?? (e.state === "accepted" ? "" : original)}
      </span>,
    );
    cursor = e.s.end;
  }
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);
  return <div className="whitespace-pre-wrap text-[16px] leading-[1.75]">{parts}</div>;
}
