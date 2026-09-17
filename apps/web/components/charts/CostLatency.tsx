"use client";
import { ACCENT, ChartFrame, FAINT, GRID, INK, MUTED, SURFACE, useTooltip } from "./primitives";

export interface RecentRunPoint { id: string; createdAt: number; latencyMs: number | null; costUsd: number; level: string; cachedTokens: number; inputTokens: number }

const KRW = 1380;
const W = 440, H = 150, PAD = { t: 12, r: 14, b: 22, l: 34 };
const LEVEL_KO: Record<string, string> = { L1: "맞춤법만", L2: "다듬기", L3: "다시 쓰기" };

/** 최근 실행의 건당 비용. 추정치(₩20~40)와 대조하는 것이 목적이므로 기준선을 함께 그린다. */
export function CostLatency({ data, budgetKrw = 40 }: { data: RecentRunPoint[]; budgetKrw?: number }) {
  const { setTip, node } = useTooltip();
  const rows = data.filter((d) => d.costUsd > 0 || (d.latencyMs ?? 0) > 0);
  if (rows.length === 0) {
    return <ChartFrame title="건당 비용" subtitle="추정치와 맞는지" empty="아직 실행 기록이 없습니다."><div /></ChartFrame>;
  }
  const krw = rows.map((d) => d.costUsd * KRW);
  const hasCost = krw.some((v) => v > 0);
  const maxV = Math.max(budgetKrw, ...krw) * 1.15;
  const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b;
  const bw = Math.max(3, Math.min(18, innerW / rows.length - 2));
  const x = (i: number) => PAD.l + (i + 0.5) * (innerW / rows.length);
  const y = (v: number) => PAD.t + innerH - (v / maxV) * innerH;
  const avg = krw.reduce((a, b) => a + b, 0) / krw.length;
  const avgLatency = rows.reduce((a, b) => a + (b.latencyMs ?? 0), 0) / rows.length / 1000;

  return (
    <ChartFrame title="건당 비용" subtitle={`최근 ${rows.length}회 · 평균 ₩${Math.round(avg)} · ${avgLatency.toFixed(1)}초`}
      note={hasCost ? `기획 추정 ₩20~40 대비 ${avg <= budgetKrw ? "범위 안" : "초과"}` : "실제 모델로 교정하면 비용이 쌓입니다"}>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`최근 실행 건당 비용, 평균 ${Math.round(avg)}원`}>
          <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + innerH} y2={PAD.t + innerH} stroke={GRID} strokeWidth="1" />
          <line x1={PAD.l} x2={W - PAD.r} y1={y(budgetKrw)} y2={y(budgetKrw)} stroke={FAINT} strokeWidth="1" strokeDasharray="3 3" />
          <text x={W - PAD.r} y={y(budgetKrw) - 4} textAnchor="end" fontSize="9" fill={FAINT}>추정 상한 ₩{budgetKrw}</text>
          <text x={PAD.l - 6} y={PAD.t + innerH + 3} textAnchor="end" fontSize="9" fill={FAINT}>0</text>
          {rows.map((d, i) => {
            const v = d.costUsd * KRW;
            const h = Math.max(2, (v / maxV) * innerH);
            return (
              <g key={d.id}>
                <rect x={x(i) - bw / 2} y={PAD.t + innerH - h} width={bw} height={h} rx="4" fill={ACCENT} opacity={0.85} stroke={SURFACE} strokeWidth="1" />
                <rect x={x(i) - (innerW / rows.length) / 2} y={PAD.t} width={innerW / rows.length} height={innerH} fill="transparent"
                  onMouseEnter={(e) => { const p = e.currentTarget.closest("div")!.getBoundingClientRect(); const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.left - p.left + r.width / 2, y: PAD.t + innerH - h, lines: [new Date(d.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }), `₩${Math.round(v)} · ${((d.latencyMs ?? 0) / 1000).toFixed(1)}초`, `${LEVEL_KO[d.level] ?? d.level} · 캐시 ${d.cachedTokens + d.inputTokens > 0 ? Math.round((d.cachedTokens / (d.cachedTokens + d.inputTokens)) * 100) : 0}%`] }); }}
                  onMouseLeave={() => setTip(null)} />
              </g>
            );
          })}
          <text x={PAD.l} y={H - 6} fontSize="9" fill={FAINT}>오래됨</text>
          <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="9" fill={FAINT}>최근</text>
        </svg>
        {node}
      </div>
    </ChartFrame>
  );
}
