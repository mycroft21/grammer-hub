"use client";
import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Empty, Segmented, Statistic, Table, Tooltip, Typography, type TableProps } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { api, type TeamMember, type TeamStats } from "@/lib/api";
import { AcceptanceTrend } from "@/components/charts/AcceptanceTrend";
import { CategoryBreakdown } from "@/components/charts/CategoryBreakdown";
import { CostLatency } from "@/components/charts/CostLatency";
import { PageHeader, errMsg } from "./_shared";

const KRW_PER_USD = 1380;
const won = (usd: number) => `₩${Math.round(usd * KRW_PER_USD).toLocaleString("ko-KR")}`;
const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 100) : null);
const num = "tabular-nums";
const WEEKS = [4, 8, 12] as const;

/**
 * 팀 화면(관리자). 사람별 사용량·수락률·직접 수정률·비용과 팀 전체 추이. 텍스트는 보여 주지 않는다 — 건수·비율·비용뿐.
 * 외부 테스트 분석의 단위가 이 표이고, CSV로 그대로 내려받는다.
 */
export function TeamPage() {
  const { message } = App.useApp();
  const [weeks, setWeeks] = useState<number>(8);
  const [data, setData] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.team.stats(weeks).then(setData).catch((e) => message.error(`팀 통계를 불러오지 못했습니다: ${errMsg(e)}`)).finally(() => setLoading(false));
  }, [weeks, message]);

  const members = useMemo(() => (data?.members ?? []).filter((m) => m.lastActiveAt != null), [data]);
  const idle = (data?.members.length ?? 0) - members.length;
  const total = useMemo(() => {
    const sum = (k: keyof TeamMember) => members.reduce((a, m) => a + (Number(m[k]) || 0), 0);
    const accepted = sum("accepted"), rejected = sum("rejected"), edits = sum("edits"), finals = sum("finals");
    return { runs: sum("runsOk"), costUsd: sum("costUsd") + sum("studioCostUsd"), rate: pct(accepted, accepted + rejected), accepted, rejected, cleanCopy: pct(finals - edits, finals), edits, finals, active: data?.weeklyActive.at(-1)?.users ?? 0 };
  }, [members, data]);

  const columns: TableProps<TeamMember>["columns"] = [
    { title: "사람", dataIndex: "email", key: "email", fixed: "left", width: 220, ellipsis: true, sorter: (a, b) => a.email.localeCompare(b.email), render: (e: string) => <Typography.Text data-testid="team-member">{e}</Typography.Text> },
    { title: "마지막 활동", dataIndex: "lastActiveAt", key: "last", width: 130, className: num, sorter: (a, b) => (a.lastActiveAt ?? 0) - (b.lastActiveAt ?? 0), defaultSortOrder: "descend", render: (t: number | null) => <Typography.Text type="secondary">{t ? new Date(t).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "-"}</Typography.Text> },
    { title: "교정", dataIndex: "runsOk", key: "runs", width: 80, align: "right", className: num, sorter: (a, b) => a.runsOk - b.runsOk, render: (n: number, m) => <span>{n}{m.runsError ? <Typography.Text type="danger" style={{ fontSize: 11 }}> +{m.runsError}오류</Typography.Text> : null}</span> },
    { title: "카드", dataIndex: "cards", key: "cards", width: 70, align: "right", className: num, sorter: (a, b) => a.cards - b.cards },
    { title: <Tooltip title="수락 ÷ (수락 + 무시). 판단한 카드가 없으면 -">수락률</Tooltip>, key: "rate", width: 110, align: "right", className: num, sorter: (a, b) => (pct(a.accepted, a.accepted + a.rejected) ?? -1) - (pct(b.accepted, b.accepted + b.rejected) ?? -1),
      render: (_, m) => { const r = pct(m.accepted, m.accepted + m.rejected); return r == null ? "-" : <span>{r}% <Typography.Text type="secondary" style={{ fontSize: 11 }}>({m.accepted}/{m.accepted + m.rejected})</Typography.Text></span>; } },
    { title: <Tooltip title="복사할 때 제안 적용본을 손으로 더 고친 비율. 높으면 제안이 부족하거나 어긋난다">직접 수정</Tooltip>, key: "edit", width: 100, align: "right", className: num, sorter: (a, b) => (pct(a.edits, a.finals) ?? -1) - (pct(b.edits, b.finals) ?? -1),
      render: (_, m) => { const r = pct(m.edits, m.finals); return r == null ? "-" : <span>{r}% <Typography.Text type="secondary" style={{ fontSize: 11 }}>({m.edits}/{m.finals})</Typography.Text></span>; } },
    { title: "끈 카테고리", dataIndex: "muted", key: "muted", width: 100, align: "right", className: num, sorter: (a, b) => a.muted - b.muted },
    { title: "대안 선택", dataIndex: "prefers", key: "prefers", width: 90, align: "right", className: num, sorter: (a, b) => a.prefers - b.prefers },
    { title: "평균 지연", dataIndex: "latencyAvgMs", key: "lat", width: 90, align: "right", className: num, sorter: (a, b) => (a.latencyAvgMs ?? 0) - (b.latencyAvgMs ?? 0), render: (ms: number | null) => (ms != null ? `${(ms / 1000).toFixed(1)}초` : "-") },
    { title: <Tooltip title="교정 비용. 1달러 = 1,380원">교정 비용</Tooltip>, dataIndex: "costUsd", key: "cost", width: 100, align: "right", className: num, sorter: (a, b) => a.costUsd - b.costUsd, render: (usd: number) => won(usd) },
    { title: <Tooltip title="입력 중 캐시에서 온 토큰 비율. 낮으면 고정 블록이 캐시를 못 타고 있다">캐시율</Tooltip>, key: "cache", width: 80, align: "right", className: num, sorter: (a, b) => (pct(a.cachedTokens, a.inputTokens + a.cachedTokens) ?? -1) - (pct(b.cachedTokens, b.inputTokens + b.cachedTokens) ?? -1), render: (_, m) => { const r = pct(m.cachedTokens, m.inputTokens + m.cachedTokens); return r == null ? "-" : `${r}%`; } },
    { title: <Tooltip title="성공한 생성 수(보관하지 않은 것 포함). 재생성·실패는 따로">프롬프트</Tooltip>, dataIndex: "prompts", key: "prompts", width: 120, align: "right", className: num, sorter: (a, b) => a.prompts - b.prompts, render: (n: number, m) => <span>{n}{m.promptRegens ? <Typography.Text type="secondary" style={{ fontSize: 11 }}> · 재생성 {m.promptRegens}</Typography.Text> : null}{m.promptErrors ? <Typography.Text type="danger" style={{ fontSize: 11 }}> +{m.promptErrors}오류</Typography.Text> : null}</span> },
    { title: <Tooltip title="복사·변수 채움 횟수. 만들기만 하고 안 쓰면 0">프롬프트 사용</Tooltip>, dataIndex: "promptCopies", key: "copies", width: 110, align: "right", className: num, sorter: (a, b) => a.promptCopies - b.promptCopies },
    { title: <Tooltip title="의도 정리·티켓 분류·생성·재생성 비용 합(보관 여부 무관)">스튜디오 비용</Tooltip>, dataIndex: "studioCostUsd", key: "scost", width: 110, align: "right", className: num, sorter: (a, b) => a.studioCostUsd - b.studioCostUsd, render: (usd: number) => won(usd) },
  ];

  return (
    <div data-testid="team-page">
      <PageHeader title="팀" description="사람별 사용량·수락률·비용입니다. 원문·카드 내용은 보이지 않고 건수와 비율만 셉니다. 외부 테스트 분석은 이 표를 CSV로 내려받아 합니다."
        extra={<div className="flex items-center gap-2">
          <Segmented size="small" value={weeks} onChange={(v) => setWeeks(Number(v))} options={WEEKS.map((w) => ({ value: w, label: `최근 ${w}주` }))} data-testid="team-weeks" />
          <Button icon={<DownloadOutlined />} href={`/api/team/stats?weeks=${weeks}&format=csv`} data-testid="team-csv">CSV</Button>
        </div>} />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Card size="small" loading={loading}><Statistic title="활동한 사람" value={members.length} suffix={<Typography.Text type="secondary" style={{ fontSize: 12 }}>명{idle ? ` · 기록 없음 ${idle}` : ""}</Typography.Text>} /></Card>
          <Card size="small" loading={loading}><Statistic title="교정 실행" value={total.runs} suffix="건" /></Card>
          <Card size="small" loading={loading}><Statistic title="수락률" value={total.rate ?? "-"} suffix={total.rate != null ? <span>% <Typography.Text type="secondary" style={{ fontSize: 12 }}>({total.accepted}/{total.accepted + total.rejected})</Typography.Text></span> : undefined} /></Card>
          <Card size="small" loading={loading}><Statistic title="무수정 복사율" value={total.cleanCopy ?? "-"} suffix={total.cleanCopy != null ? <span>% <Typography.Text type="secondary" style={{ fontSize: 12 }}>({total.finals - total.edits}/{total.finals})</Typography.Text></span> : undefined} /></Card>
          <Card size="small" loading={loading}><Statistic title="총 비용" value={Math.round(total.costUsd * KRW_PER_USD)} prefix="₩" suffix={<Typography.Text type="secondary" style={{ fontSize: 12 }}>${total.costUsd.toFixed(2)}</Typography.Text>} /></Card>
        </div>
        <Card size="small" loading={loading} title={<Typography.Text style={{ fontSize: 13 }}>팀 전체 추이 <Typography.Text type="secondary" style={{ fontSize: 12 }}>· 이번 주 활성 {total.active}명</Typography.Text></Typography.Text>}>
          <div className="grid gap-6 lg:grid-cols-3">
            <AcceptanceTrend data={data?.team.weekly ?? []} />
            <CategoryBreakdown data={data?.team.byCategory ?? []} />
            <CostLatency data={data?.team.recent ?? []} />
          </div>
        </Card>
        <Table<TeamMember> size="small" rowKey="userId" sticky columns={columns} dataSource={members} loading={loading} scroll={{ x: 1500 }}
          pagination={{ pageSize: 30, showSizeChanger: false, hideOnSinglePage: true, size: "small" }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Typography.Text type="secondary">이 기간에 활동한 사람이 없습니다.</Typography.Text>} /> }} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          읽는 법: 수락률이 낮은데 직접 수정도 낮으면 제안이 과하다(카테고리 끄기 유도). 직접 수정이 높으면 제안이 부족하다(강도·프로필 점검). 캐시율이 낮으면 고정 블록이 바뀌어 비용이 샌다. 프롬프트는 만든 수보다 사용(복사) 수가 신호다.
        </Typography.Text>
      </div>
    </div>
  );
}
