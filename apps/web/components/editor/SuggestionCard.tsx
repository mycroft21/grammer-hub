"use client";
import { Button, Tooltip } from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { CAT_GROUP } from "./HighlightView";
import type { EditItem } from "./useCorrection";

const CAT_KO: Record<string, string> = {
  SPACING: "띄어쓰기", SPELLING: "철자", GRAMMAR: "문법", PUNCTUATION: "문장부호", HONORIFIC: "높임",
  REGISTER: "문체", WORD_CHOICE: "어휘", CLARITY: "명확성", CONCISENESS: "간결성", TONE: "어조",
};

/** 접힌 한 줄(점 · 카테고리 · 원문→교정 · ✓ ✕) + 펼치면 이유·근거·끄기. */
export function SuggestionCard({ item, focused, expanded, onHover, onFocus, onAccept, onReject, onUndo, onMute }: {
  item: EditItem; focused: boolean; expanded: boolean; onHover: (id: string | null) => void; onFocus: () => void;
  onAccept: () => void; onReject: () => void; onUndo: () => void; onMute: () => void;
}) {
  const { s, state } = item;
  const group = CAT_GROUP[s.category] ?? CAT_GROUP["CLARITY"]!;
  const isError = s.severity === "error";
  const bg = state === "accepted" ? "var(--color-primary-soft)" : "var(--ant-color-bg-container)";
  const border = state === "accepted" ? "var(--color-primary-line)" : focused ? "var(--color-primary)" : "var(--ant-color-border-secondary)";
  return (
    <div data-card={s.id} tabIndex={-1} onClick={onFocus}
      className="rounded-lg px-3 py-2 text-[13px] transition"
      style={{ background: bg, border: `1px solid ${border}`, boxShadow: focused ? `0 0 0 2px var(--color-primary-soft)` : undefined, opacity: state === "rejected" ? 0.55 : 1 }}
      onMouseEnter={() => onHover(s.id)} onMouseLeave={() => onHover(null)}>
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={isError ? { background: group.color } : { boxShadow: `inset 0 0 0 1.5px ${group.color}` }} />
        <span className="w-12 shrink-0 text-[12px]" style={{ color: "var(--ant-color-text-secondary)" }}>{CAT_KO[s.category] ?? s.category}</span>
        <span className="min-w-0 flex-1 truncate">
          <span className="line-through" style={{ color: "var(--ant-color-text-tertiary)" }}>{s.original || "∅"}</span>
          <span className="mx-1.5" style={{ color: "var(--ant-color-text-quaternary, #d4d4d4)" }}>→</span>
          <span className="font-semibold">{s.replacement || <span style={{ color: "var(--ant-color-text-secondary)" }}>삭제</span>}</span>
        </span>
        <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip title={state === "accepted" ? "수락 취소" : "수락 (a)"}>
            <Button size="small" aria-label="수락" aria-pressed={state === "accepted"} type={state === "accepted" ? "primary" : "default"} icon={<CheckOutlined />}
              onClick={state === "accepted" ? onUndo : onAccept} />
          </Tooltip>
          <Tooltip title={state === "rejected" ? "무시 취소" : "무시 (x)"}>
            <Button size="small" aria-label="무시" aria-pressed={state === "rejected"} icon={<CloseOutlined />}
              onClick={state === "rejected" ? onUndo : onReject} style={state === "rejected" ? { borderColor: "var(--ant-color-text-secondary)", color: "var(--ant-color-text)" } : undefined} />
          </Tooltip>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--ant-color-border-secondary)", color: "var(--ant-color-text-secondary)" }} onClick={(e) => e.stopPropagation()}>
          <p className="m-0">{s.reason_ko}</p>
          <div className="mt-1.5 flex items-center gap-3 text-[12px]">
            {s.rule_ref && <a href={s.rule_ref} target="_blank" rel="noreferrer">근거 보기</a>}
            <span style={{ color: "var(--ant-color-text-tertiary)" }} title={`확신 ${Math.round(s.confidence * 100)}% · 위치 ${s.resolveMethod}`}>{isError ? "오류" : "제안"}</span>
            <Button type="link" size="small" className="ml-auto !px-0" onClick={onMute} title="이 카테고리 제안을 이 프로필에서 끕니다">이런 제안 끄기</Button>
          </div>
        </div>
      )}
    </div>
  );
}
