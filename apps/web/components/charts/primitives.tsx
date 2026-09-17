"use client";
import { useId, useState } from "react";

/**
 * 의존성 없는 인라인 SVG 차트. dataviz 규칙: 얇은 마크(선 2px), 마크 사이 2px 서페이스 간격,
 * 데이터 끝 4px 라운드, 값 라벨은 선택적으로만, 축·격자는 후퇴, 텍스트는 잉크 색(시리즈 색 금지).
 */
export const INK = "var(--ant-color-text)";
export const MUTED = "var(--ant-color-text-secondary)";
export const FAINT = "var(--ant-color-text-tertiary)";
export const GRID = "var(--ant-color-border-secondary)";
export const SURFACE = "var(--ant-color-bg-container)";
export const ACCENT = "var(--color-primary)";
export const NEUTRAL_MARK = "var(--ant-color-text-quaternary, #a3a3a3)";
export const CAT_COLOR: Record<string, string> = {
  정확성: "var(--color-cat-accuracy)", "높임·문체": "var(--color-cat-register)",
  명확성: "var(--color-cat-clarity)", 어조: "var(--color-cat-tone)",
};

export function ChartFrame({ title, subtitle, note, children, empty }: {
  title: string; subtitle?: string | undefined; note?: string | undefined; children: React.ReactNode; empty?: string | null | undefined;
}) {
  return (
    <figure className="m-0 flex h-full flex-col gap-1">
      <figcaption>
        <div className="text-[13px] font-semibold" style={{ color: INK }}>{title}</div>
        {subtitle && <div className="text-[12px]" style={{ color: MUTED }}>{subtitle}</div>}
      </figcaption>
      {empty ? (
        <div className="flex flex-1 items-center justify-center rounded-md py-8 text-center text-[12px]"
          style={{ color: FAINT, border: `1px dashed ${GRID}` }}>{empty}</div>
      ) : children}
      {!empty && note && <figcaption className="text-[11px]" style={{ color: FAINT }}>{note}</figcaption>}
    </figure>
  );
}

export function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const node = tip ? (
    <div className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-[11px] leading-[1.5] shadow-lg"
      style={{ left: tip.x, top: tip.y, transform: "translate(-50%, -110%)", background: "var(--ant-color-bg-elevated)", border: `1px solid ${GRID}`, color: INK, whiteSpace: "nowrap" }}>
      {tip.lines.map((l, i) => <div key={i} style={i === 0 ? { fontWeight: 600 } : { color: MUTED }}>{l}</div>)}
    </div>
  ) : null;
  return { tip, setTip, node };
}

/** 값이 0일 때도 축이 보이도록 하는 최소 눈금 */
export function niceMax(v: number, fallback = 1): number {
  if (!Number.isFinite(v) || v <= 0) return fallback;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

export function Gradient({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.18" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

export const useChartId = () => useId().replace(/[^a-zA-Z0-9]/g, "");
