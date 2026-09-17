"use client";
import { ACCENT, ChartFrame, FAINT, GRID, Gradient, INK, MUTED, SURFACE, useChartId, useTooltip } from "./primitives";

export interface WeeklyPoint { weekStart: number; runs: number; accepted: number; rejected: number; costUsd: number; edits: number }

const W = 440, H = 150, PAD = { t: 12, r: 14, b: 22, l: 30 };

/** 주간 수락률 추이. 단일 시리즈이므로 범례 없이 제목이 시리즈를 지칭한다(dataviz 규칙). */
export function AcceptanceTrend({ data, target = 65 }: { data: WeeklyPoint[]; target?: number }) {
  const gid = useChartId();
  const { setTip, node } = useTooltip();
  const pts = data.map((d) => {
    const total = d.accepted + d.rejected;
    return { ...d, rate: total > 0 ? (d.accepted / total) * 100 : null, total };
  });
  const withData = pts.filter((p) => p.rate !== null);
  if (withData.length === 0) {
    return <ChartFrame title="주간 수락률" subtitle="제안을 얼마나 받아들였는지" empty="아직 피드백이 없습니다. 교정 결과에서 수락·무시를 누르면 쌓입니다."><div /></ChartFrame>;
  }
  // 단일 값은 선이 아니라 수치로 보여준다(추이는 2주차부터 의미가 생긴다).
  if (withData.length === 1) {
    const only = withData[0]!;
    return (
      <ChartFrame title="주간 수락률" subtitle="제안을 얼마나 받아들였는지" note={`목표 ${target}%`}>
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-6">
          <div className="text-[40px] leading-none font-semibold tabular-nums" style={{ color: INK }}>{Math.round(only.rate!)}<span className="text-[20px]">%</span></div>
          <div className="text-[12px]" style={{ color: MUTED }}>이번 주 {only.accepted}/{only.total}건 수락</div>
          <div className="text-[11px]" style={{ color: FAINT }}>다음 주부터 추이 선이 그려집니다</div>
        </div>
      </ChartFrame>
    );
  }
  const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
  const y = (v: number) => PAD.t + innerH - (v / 100) * innerH;
  const segs: string[] = [];
  let cur: string[] = [];
  pts.forEach((p, i) => {
    if (p.rate === null) { if (cur.length > 1) segs.push(cur.join(" ")); cur = []; return; }
    cur.push(`${cur.length === 0 ? "M" : "L"}${x(i)},${y(p.rate)}`);
  });
  if (cur.length > 1) segs.push(cur.join(" "));
  const last = withData[withData.length - 1]!;
  const lastIdx = pts.findIndex((p) => p.weekStart === last.weekStart);
  const areaPath = segs.length === 1 ? `${segs[0]} L${x(lastIdx)},${PAD.t + innerH} L${x(pts.findIndex((p) => p.rate !== null))},${PAD.t + innerH} Z` : null;
  const fmt = (ts: number) => new Date(ts).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });

  return (
    <ChartFrame title="주간 수락률" subtitle="제안을 얼마나 받아들였는지" note={`목표 ${target}% · 최근 ${Math.round(last.rate!)}%`}>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`주간 수락률 추이, 최근 ${Math.round(last.rate!)}퍼센트`}>
          <Gradient id={gid} color={ACCENT} />
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
              <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill={FAINT}>{v}</text>
            </g>
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} stroke={FAINT} strokeWidth="1" strokeDasharray="3 3" />
          <text x={PAD.l + 2} y={y(target) - 4} fontSize="9" fill={FAINT}>목표 {target}%</text>
          {areaPath && <path d={areaPath} fill={`url(#${gid})`} />}
          {segs.map((d, i) => <path key={i} d={d} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
          {pts.map((p, i) => p.rate === null ? null : (
            <g key={p.weekStart}>
              <circle cx={x(i)} cy={y(p.rate)} r="4" fill={ACCENT} stroke={SURFACE} strokeWidth="2" />
              <rect x={x(i) - 14} y={PAD.t} width="28" height={innerH} fill="transparent"
                onMouseEnter={(e) => setTip({ x: e.currentTarget.getBoundingClientRect().left - (e.currentTarget.closest("div")?.getBoundingClientRect().left ?? 0) + 14, y: y(p.rate!), lines: [`${fmt(p.weekStart)} 주`, `수락률 ${Math.round(p.rate!)}% (${p.accepted}/${p.total})`, `교정 ${p.runs}회`] })}
                onMouseLeave={() => setTip(null)} />
            </g>
          ))}
          <text x={x(0)} y={H - 6} fontSize="9" fill={FAINT}>{fmt(pts[0]!.weekStart)}</text>
          <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="9" fill={FAINT}>{fmt(pts[pts.length - 1]!.weekStart)}</text>
          <text x={x(lastIdx) - 8} y={y(last.rate!) - 10} textAnchor="end" fontSize="11" fontWeight="600" fill={INK}>{Math.round(last.rate!)}%</text>
        </svg>
        {node}
      </div>
    </ChartFrame>
  );
}
