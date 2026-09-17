"use client";
import { CAT_COLOR, ChartFrame, FAINT, INK, MUTED, NEUTRAL_MARK, SURFACE, useTooltip } from "./primitives";

export interface CategoryPoint { category: string; accepted: number; rejected: number }

const GROUP: Record<string, string> = {
  SPACING: "정확성", SPELLING: "정확성", GRAMMAR: "정확성", PUNCTUATION: "정확성",
  HONORIFIC: "높임·문체", REGISTER: "높임·문체",
  WORD_CHOICE: "명확성", CLARITY: "명확성", CONCISENESS: "명확성", TONE: "어조",
};
const KO: Record<string, string> = {
  SPACING: "띄어쓰기", SPELLING: "철자", GRAMMAR: "문법", PUNCTUATION: "문장부호", HONORIFIC: "높임",
  REGISTER: "문체", WORD_CHOICE: "어휘", CLARITY: "명확성", CONCISENESS: "간결성", TONE: "어조",
};

/** 카테고리별 수락/무시. 부분-전체이므로 가로 스택 막대, 마크 사이 2px 서페이스 간격. */
export function CategoryBreakdown({ data }: { data: CategoryPoint[] }) {
  const { setTip, node } = useTooltip();
  const rows = data.filter((d) => d.accepted + d.rejected > 0).slice(0, 8);
  if (rows.length === 0) {
    return <ChartFrame title="종류별 수락·무시" subtitle="어떤 제안이 거슬리는지" empty="아직 피드백이 없습니다."><div /></ChartFrame>;
  }
  const max = Math.max(...rows.map((d) => d.accepted + d.rejected));
  const worst = [...rows].filter((r) => r.accepted + r.rejected >= 3).sort((a, b) => (a.accepted / (a.accepted + a.rejected)) - (b.accepted / (b.accepted + b.rejected)))[0];
  return (
    <ChartFrame title="종류별 수락·무시" subtitle="어떤 제안이 거슬리는지"
      note={worst ? `무시가 많은 종류: ${KO[worst.category] ?? worst.category}` : undefined}>
      <div className="relative flex flex-col gap-1.5">
        <div className="flex items-center gap-3 text-[11px]" style={{ color: MUTED }}>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: "var(--color-primary)" }} />수락</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: NEUTRAL_MARK }} />무시</span>
        </div>
        {rows.map((d) => {
          const total = d.accepted + d.rejected;
          const color = CAT_COLOR[GROUP[d.category] ?? "명확성"] ?? "var(--color-primary)";
          const w = (total / max) * 100;
          const accPct = (d.accepted / total) * 100;
          return (
            <div key={d.category} className="flex items-center gap-2"
              onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); const p = e.currentTarget.parentElement!.getBoundingClientRect(); setTip({ x: r.left - p.left + r.width / 2, y: r.top - p.top + 8, lines: [KO[d.category] ?? d.category, `수락 ${d.accepted} · 무시 ${d.rejected}`, `수락률 ${Math.round(accPct)}%`] }); }}
              onMouseLeave={() => setTip(null)}>
              <span className="w-14 shrink-0 text-right text-[11px]" style={{ color: MUTED }}>{KO[d.category] ?? d.category}</span>
              <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
              <div className="relative h-4 flex-1">
                <div className="absolute inset-y-0 left-0 flex" style={{ width: `${w}%` }}>
                  {d.accepted > 0 && <div style={{ width: `${accPct}%`, background: "var(--color-primary)", borderRadius: d.rejected > 0 ? "4px 0 0 4px" : 4, marginRight: d.rejected > 0 ? 2 : 0 }} />}
                  {d.rejected > 0 && <div style={{ flex: 1, background: NEUTRAL_MARK, borderRadius: d.accepted > 0 ? "0 4px 4px 0" : 4 }} />}
                </div>
              </div>
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums" style={{ color: INK }}>{Math.round(accPct)}%</span>
            </div>
          );
        })}
        {node}
      </div>
    </ChartFrame>
  );
}
