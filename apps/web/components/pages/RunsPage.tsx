"use client";
import { useEffect, useMemo, useState } from "react";
import { App, Card, Empty, Statistic, Table, Tag, Typography, type TableProps } from "antd";
import { api, type RunSummary } from "@/lib/api";
import { PageHeader, errMsg } from "./_shared";

const KRW_PER_USD = 1380;
const LEVEL_KO: Record<string, string> = { L1: "맞춤법만", L2: "다듬기", L3: "다시 쓰기" };
const PROVIDER_KO: Record<string, string> = { cloud: "클라우드", local: "내 Mac" };
const STATUS: Record<string, { label: string; color?: string }> = {
  ok: { label: "완료", color: "success" },
  error: { label: "오류", color: "error" },
  running: { label: "진행 중" },
};
const won = (usd: number) => `₩${Math.round(usd * KRW_PER_USD).toLocaleString("ko-KR")}`;
const num = "tabular-nums";

export function RunsPage() {
  const { message } = App.useApp();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.runs().then(setRuns).catch((e) => message.error(`기록을 불러오지 못했습니다: ${errMsg(e)}`)).finally(() => setLoading(false));
  }, [message]);

  const stats = useMemo(() => {
    const totalUsd = runs.reduce((a, r) => a + r.costUsd, 0);
    const acc = runs.reduce((a, r) => a + r.accepted, 0);
    const rej = runs.reduce((a, r) => a + r.rejected, 0);
    const lat = runs.map((r) => r.latencyMs).filter((v): v is number => v != null);
    const avgSec = lat.length ? lat.reduce((a, v) => a + v, 0) / lat.length / 1000 : null;
    return { totalUsd, acc, rej, rate: acc + rej > 0 ? Math.round((acc / (acc + rej)) * 100) : null, avgSec };
  }, [runs]);

  const columns: TableProps<RunSummary>["columns"] = [
    { title: "시각", dataIndex: "createdAt", key: "createdAt", width: 160, className: num, render: (t: number) => <Typography.Text type="secondary">{new Date(t).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}</Typography.Text> },
    { title: "강도", dataIndex: "level", key: "level", width: 96, render: (l: string) => <Tag variant="filled" style={{ marginInlineEnd: 0 }}>{LEVEL_KO[l] ?? l}</Tag> },
    { title: "제공자", dataIndex: "provider", key: "provider", width: 96, render: (p: string) => PROVIDER_KO[p] ?? p },
    { title: "모델", dataIndex: "model", key: "model", ellipsis: true, render: (m: string) => <Typography.Text type="secondary">{m}</Typography.Text> },
    { title: "지연", dataIndex: "latencyMs", key: "latencyMs", width: 80, align: "right", className: num, render: (ms: number | null) => ms != null ? `${(ms / 1000).toFixed(1)}초` : "-" },
    { title: "비용", dataIndex: "costUsd", key: "costUsd", width: 90, align: "right", className: num, render: (usd: number) => won(usd) },
    { title: "캐시 토큰", dataIndex: "cachedTokens", key: "cachedTokens", width: 100, align: "right", className: num, render: (n: number) => n.toLocaleString("ko-KR") },
    { title: "변경 수", dataIndex: "edits", key: "edits", width: 80, align: "right", className: num },
    { title: "수락/무시", key: "feedback", width: 96, align: "right", className: num, render: (_, r) => `${r.accepted}/${r.rejected}` },
    { title: "상태", dataIndex: "status", key: "status", width: 88, render: (s: string) => { const st = STATUS[s]; return <Tag style={{ marginInlineEnd: 0 }} {...(st?.color ? { color: st.color } : {})}>{st?.label ?? s}</Tag>; } },
  ];

  const usdSmall = <Typography.Text type="secondary" style={{ fontSize: 12 }}>${stats.totalUsd.toFixed(3)}</Typography.Text>;

  return (
    <div>
      <PageHeader title="실행 기록" description="최근 교정 실행의 비용·지연·수락률입니다. 비용은 1달러 = 1,380원으로 환산합니다." />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card size="small" loading={loading}><Statistic title="최근 실행 수" value={runs.length} suffix="건" /></Card>
          <Card size="small" loading={loading}><Statistic title="총 비용" value={Math.round(stats.totalUsd * KRW_PER_USD)} prefix="₩" suffix={usdSmall} /></Card>
          <Card size="small" loading={loading}><Statistic title="수락률" value={stats.rate ?? "-"} suffix={stats.rate != null ? <span>% <Typography.Text type="secondary" style={{ fontSize: 12 }}>({stats.acc}/{stats.acc + stats.rej})</Typography.Text></span> : undefined} /></Card>
          <Card size="small" loading={loading}><Statistic title="평균 지연" value={stats.avgSec ?? "-"} precision={stats.avgSec != null ? 1 : 0} suffix="초" /></Card>
        </div>
        <Table<RunSummary> size="small" rowKey="id" sticky columns={columns} dataSource={runs} loading={loading} scroll={{ x: 960 }}
          pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true, size: "small" }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Typography.Text type="secondary">아직 실행 기록이 없습니다. 에디터에서 교정을 실행하면 여기에 쌓입니다.</Typography.Text>} /> }} />
      </div>
    </div>
  );
}
