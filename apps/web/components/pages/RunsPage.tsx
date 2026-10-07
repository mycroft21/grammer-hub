"use client";
import { useEffect, useMemo, useState } from "react";
import { App, Card, Empty, Segmented, Statistic, Table, Tag, Typography, type TableProps } from "antd";
import Link from "next/link";
import { PURPOSES, findSubtype, type Purpose } from "@grammer-hub/core";
import { api, type PromptRun, type RunSummary, type Stats } from "@/lib/api";
import { AcceptanceTrend } from "@/components/charts/AcceptanceTrend";
import { CategoryBreakdown } from "@/components/charts/CategoryBreakdown";
import { CostLatency } from "@/components/charts/CostLatency";
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
  const [tab, setTab] = useState<"correct" | "prompt">("correct");
  return (
    <div>
      <PageHeader title="실행 기록" description="최근 실행의 비용·지연입니다. 비용은 1달러 = 1,380원으로 환산합니다."
        extra={<Segmented data-testid="runs-tab" value={tab} onChange={(v) => setTab(v as typeof tab)} options={[{ value: "correct", label: "교정" }, { value: "prompt", label: "프롬프트" }]} />} />
      {tab === "correct" ? <CorrectionRuns /> : <PromptRuns />}
    </div>
  );
}

const KIND_KO: Record<PromptRun["kind"], string> = { plan: "의도 정리", ticket: "티켓 분류", generate: "생성", regenerate: "재생성" };

/** 프롬프트 스튜디오 실행: 보관하지 않은 생성·실패까지 모두. 원문은 기록에 없다. */
function PromptRuns() {
  const { message } = App.useApp();
  const [runs, setRuns] = useState<PromptRun[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.promptRuns().then(setRuns).catch((e) => message.error(`기록을 불러오지 못했습니다: ${errMsg(e)}`)).finally(() => setLoading(false));
  }, [message]);
  const summary = useMemo(() => ({
    generated: runs.filter((r) => r.kind === "generate" && r.status === "ok").length,
    errors: runs.filter((r) => r.status === "error").length,
    totalUsd: runs.reduce((a, r) => a + r.costUsd, 0),
  }), [runs]);
  const purposeLabel = (r: PromptRun) => {
    if (!r.purpose || !(r.purpose in PURPOSES)) return "-";
    const p = r.purpose as Purpose;
    return r.subtype ? `${PURPOSES[p].label} · ${findSubtype(p, r.subtype).label}` : PURPOSES[p].label;
  };
  const columns: TableProps<PromptRun>["columns"] = [
    { title: "시각", dataIndex: "createdAt", key: "createdAt", width: 150, className: num, render: (t: number) => <Typography.Text type="secondary">{new Date(t).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}</Typography.Text> },
    { title: "종류", dataIndex: "kind", key: "kind", width: 96, render: (k: PromptRun["kind"]) => <Tag variant="filled" style={{ marginInlineEnd: 0 }}>{KIND_KO[k] ?? k}</Tag> },
    { title: "목적", key: "purpose", width: 170, ellipsis: true, render: (_, r) => purposeLabel(r) },
    { title: "티켓", dataIndex: "ticketKey", key: "ticket", width: 96, render: (k: string | null) => k ?? "-" },
    { title: "모델", dataIndex: "model", key: "model", ellipsis: true, render: (m: string) => <Typography.Text type="secondary">{m}</Typography.Text> },
    { title: "점검", key: "checks", width: 70, align: "right", className: num, render: (_, r) => (r.checksTotal ? `${r.checksPassed}/${r.checksTotal}` : "-") },
    { title: "비용", dataIndex: "costUsd", key: "costUsd", width: 90, align: "right", className: num, render: (usd: number) => won(usd) },
    { title: "지연", dataIndex: "latencyMs", key: "latencyMs", width: 80, align: "right", className: num, render: (ms: number | null) => ms != null ? `${(ms / 1000).toFixed(1)}초` : "-" },
    { title: "상태", key: "status", width: 110, render: (_, r) => r.status === "ok" ? <Tag color="success" style={{ marginInlineEnd: 0 }}>완료</Tag>
      : <Tag color={r.errorCode === "aborted" ? "default" : "error"} style={{ marginInlineEnd: 0 }}>{r.errorCode === "aborted" ? "중단" : `오류${r.errorCode ? ` ${r.errorCode}` : ""}`}</Tag> },
    { title: "보관함", key: "prompt", width: 80, render: (_, r) => (r.promptId ? <Link href={`/prompts?prompt=${encodeURIComponent(r.promptId)}`} data-testid="run-prompt-link">열기</Link> : <Typography.Text type="secondary">-</Typography.Text>) },
  ];
  const usdSmall = <Typography.Text type="secondary" style={{ fontSize: 12 }}>${summary.totalUsd.toFixed(3)}</Typography.Text>;
  return (
    <div className="flex flex-col gap-4" data-testid="prompt-runs">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card size="small" loading={loading}><Statistic title="최근 실행 수" value={runs.length} suffix="건" /></Card>
        <Card size="small" loading={loading}><Statistic title="생성 성공" value={summary.generated} suffix="건" /></Card>
        <Card size="small" loading={loading}><Statistic title="실패·중단" value={summary.errors} suffix="건" /></Card>
        <Card size="small" loading={loading}><Statistic title="총 비용" value={Math.round(summary.totalUsd * KRW_PER_USD)} prefix="₩" suffix={usdSmall} /></Card>
      </div>
      <Table<PromptRun> size="small" rowKey="id" sticky columns={columns} dataSource={runs} loading={loading} scroll={{ x: 1000 }}
        pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true, size: "small" }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Typography.Text type="secondary">아직 프롬프트 실행 기록이 없습니다. 프롬프트 화면에서 만들면 보관하지 않아도 여기에 쌓입니다.</Typography.Text>} /> }} />
    </div>
  );
}

/** 교정 실행(기존 화면 그대로). */
function CorrectionRuns() {
  const { message } = App.useApp();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([api.runs().then(setRuns), api.stats().then(setStats)])
      .catch((e) => message.error(`기록을 불러오지 못했습니다: ${errMsg(e)}`)).finally(() => setLoading(false));
  }, [message]);

  const summary = useMemo(() => {
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

  const usdSmall = <Typography.Text type="secondary" style={{ fontSize: 12 }}>${summary.totalUsd.toFixed(3)}</Typography.Text>;

  return (
    <div>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card size="small" loading={loading}><Statistic title="최근 실행 수" value={runs.length} suffix="건" /></Card>
          <Card size="small" loading={loading}><Statistic title="총 비용" value={Math.round(summary.totalUsd * KRW_PER_USD)} prefix="₩" suffix={usdSmall} /></Card>
          <Card size="small" loading={loading}><Statistic title="수락률" value={summary.rate ?? "-"} suffix={summary.rate != null ? <span>% <Typography.Text type="secondary" style={{ fontSize: 12 }}>({summary.acc}/{summary.acc + summary.rej})</Typography.Text></span> : undefined} /></Card>
          <Card size="small" loading={loading}><Statistic title="평균 지연" value={summary.avgSec ?? "-"} precision={summary.avgSec != null ? 1 : 0} suffix="초" /></Card>
        </div>
        <Card size="small" loading={loading}>
          <div className="grid gap-6 lg:grid-cols-3">
            <AcceptanceTrend data={stats?.weekly ?? []} />
            <CategoryBreakdown data={stats?.byCategory ?? []} />
            <CostLatency data={stats?.recent ?? []} />
          </div>
        </Card>
        <Table<RunSummary> size="small" rowKey="id" sticky columns={columns} dataSource={runs} loading={loading} scroll={{ x: 960 }}
          pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true, size: "small" }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Typography.Text type="secondary">아직 실행 기록이 없습니다. 에디터에서 교정을 실행하면 여기에 쌓입니다.</Typography.Text>} /> }} />
      </div>
    </div>
  );
}
