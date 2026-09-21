"use client";
import { useEffect, useState } from "react";
import { Progress, Typography } from "antd";

export type Stage = "requesting" | "thinking" | "writing";
const STAGE_KO: Record<Stage, string> = { requesting: "요청 보내는 중", thinking: "모델이 검토하는 중", writing: "작성 중" };

/**
 * 진행 표시. 정확한 퍼센트는 알 수 없으니 두 신호를 합친다:
 * - expectedMs(최근 같은 종류 실행의 중앙값)가 있으면 경과/예상, 없으면 15초를 반감기로 하는 점근 곡선
 * - fraction(스튜디오의 슬롯 n/13처럼 실제 진척)이 있으면 그것과 큰 쪽
 * 완료 전에는 95%에서 멈춘다.
 */
export function ProgressLine({ stage, startedAt, expectedMs, fraction, detail, compact }: {
  stage: Stage; startedAt: number; expectedMs: number | null; fraction?: number | null; detail?: string | undefined; compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  const elapsed = Math.max(0, now - (startedAt || now));
  const timeBased = expectedMs ? Math.min(95, (elapsed / expectedMs) * 100) : Math.min(95, 100 * (1 - Math.exp(-elapsed / 15000)));
  const percent = Math.round(Math.max(timeBased, fraction ? Math.min(95, fraction * 100) : 0));
  const remain = expectedMs ? Math.max(0, expectedMs - elapsed) : null;
  const overdue = expectedMs !== null && elapsed > expectedMs * 1.5;
  return (
    <div data-testid="progress" data-stage={stage} className={`flex items-center gap-2 ${compact ? "" : "px-3 py-1.5"}`}>
      <Progress percent={percent} size="small" status="active" showInfo={false} style={{ margin: 0, flex: 1, minWidth: 80 }} />
      <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        {STAGE_KO[stage]}{detail ? ` · ${detail}` : ""} · {(elapsed / 1000).toFixed(0)}초
        {remain !== null && !overdue ? ` · 약 ${Math.ceil(remain / 1000)}초 남음` : overdue ? " · 평소보다 오래 걸리는 중" : ""}
      </Typography.Text>
    </div>
  );
}
