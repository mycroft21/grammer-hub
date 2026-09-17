"use client";
import { useCallback, useEffect, useState } from "react";
import { App, Button, Card, Dropdown, Empty, Input, List, Popconfirm, Progress, Select, Skeleton, Space, Tag, Tooltip, Typography } from "antd";
import { DownloadOutlined, MoreOutlined, PlusOutlined, PushpinFilled } from "@ant-design/icons";
import type { StyleRule } from "@grammer-hub/core";
import { api, type Collection, type WritingSample } from "@/lib/api";
import { AUDIENCE_KO, CHANNEL_KO, LANG_KO, PageHeader, errMsg } from "./_shared";

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>{label}</Typography.Text>
      <div className="tabular-nums font-semibold">{value}</div>
      {sub && <Typography.Text type="secondary" style={{ fontSize: 11 }}>{sub}</Typography.Text>}
    </div>
  );
}

type Status = StyleRule["status"];
const GROUPS: { status: Status; title: string; hint: string; empty: string }[] = [
  { status: "pinned", title: "고정", hint: "항상 프롬프트에 포함되는 규칙", empty: "고정된 규칙이 없습니다. 꼭 지켜야 하는 규칙은 메뉴에서 고정하세요." },
  { status: "active", title: "활성", hint: "신뢰도에 따라 적용되는 규칙", empty: "규칙이 없습니다. 예: 슬랙에서는 상급자에게도 ~요 체를 쓴다" },
  { status: "demoted", title: "꺼진 제안", hint: "적용하지 않지만 보관 중인 규칙", empty: "꺼진 규칙이 없습니다." },
];
const ACTIONS: { status: Status; label: string }[] = [
  { status: "pinned", label: "고정" }, { status: "active", label: "활성" }, { status: "demoted", label: "끄기" },
];
const SCOPE_KEY_KO: Record<string, string> = { channel: "채널", audience: "수신자", lang: "언어", category: "카테고리" };
function scopeLabel(key: string, value: string): string {
  const v = key === "channel" ? (CHANNEL_KO as Record<string, string>)[value]
    : key === "audience" ? (AUDIENCE_KO as Record<string, string>)[value]
    : key === "lang" ? (LANG_KO as Record<string, string>)[value]
    : undefined;
  return `${SCOPE_KEY_KO[key] ?? key}=${v ?? value}`;
}

export function StylePage() {
  const { message, modal } = App.useApp();
  const [rules, setRules] = useState<StyleRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [sample, setSample] = useState("");
  const [sampleChannel, setSampleChannel] = useState<string | undefined>(undefined);
  const [sampleAudience, setSampleAudience] = useState<string | undefined>(undefined);
  const [samples, setSamples] = useState<WritingSample[]>([]);
  const [savingSample, setSavingSample] = useState(false);
  const [collection, setCollection] = useState<Collection | null>(null);

  const reloadCollection = useCallback(async () => {
    const [list, stats] = await Promise.all([api.samples.list(), api.stats()]);
    setSamples(list); setCollection(stats.collection);
  }, []);
  useEffect(() => { void reloadCollection().catch(() => {}); }, [reloadCollection]);

  const saveSample = useCallback(async () => {
    setSavingSample(true);
    try {
      await api.samples.add({ text: sample, ...(sampleChannel ? { channel: sampleChannel } : {}), ...(sampleAudience ? { audience: sampleAudience } : {}) });
      setSample(""); await reloadCollection();
      message.success("샘플을 저장했습니다");
    } catch (e) { message.error(`저장하지 못했습니다: ${errMsg(e)}`); }
    finally { setSavingSample(false); }
  }, [sample, sampleChannel, sampleAudience, reloadCollection, message]);

  const removeSample = useCallback(async (id: string) => {
    try { await api.samples.remove(id); await reloadCollection(); message.success("샘플을 지웠습니다"); }
    catch (e) { message.error(`지우지 못했습니다: ${errMsg(e)}`); }
  }, [reloadCollection, message]);

  const reload = useCallback(async () => {
    try { setRules(await api.rules.list()); } catch (e) { message.error(`규칙을 불러오지 못했습니다: ${errMsg(e)}`); } finally { setLoading(false); }
  }, [message]);
  useEffect(() => { void reload(); }, [reload]);

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    if (t.length > 300) { message.warning("규칙은 300자 이내로 적어 주세요."); return; }
    setAdding(true);
    try { await api.rules.create({ text: t, confidence: 0.7 }); setText(""); message.success("규칙을 추가했습니다."); await reload(); }
    catch (e) { message.error(`추가에 실패했습니다: ${errMsg(e)}`); } finally { setAdding(false); }
  };
  const setStatus = async (r: StyleRule, status: Status) => {
    try { await api.rules.save(r.id, { ...r, status }); await reload(); }
    catch (e) { message.error(`변경에 실패했습니다: ${errMsg(e)}`); }
  };
  const remove = (r: StyleRule) => {
    modal.confirm({
      title: "규칙을 삭제할까요?", content: r.text, okText: "삭제", okButtonProps: { danger: true }, cancelText: "취소",
      onOk: async () => { try { await api.rules.remove(r.id); message.success("규칙을 삭제했습니다."); await reload(); } catch (e) { message.error(`삭제에 실패했습니다: ${errMsg(e)}`); } },
    });
  };

  const renderRule = (r: StyleRule) => {
    const pct = Math.round(r.confidence * 100);
    const scope: [string, string][] = Object.entries(r.scope).flatMap(([k, v]) => (typeof v === "string" ? [[k, v] as [string, string]] : []));
    const menuItems = [
      ...ACTIONS.filter((a) => a.status !== r.status).map((a) => ({ key: a.status, label: a.label })),
      { type: "divider" as const },
      { key: "delete", label: "삭제", danger: true },
    ];
    return (
      <List.Item key={r.id} actions={[
        <Dropdown key="more" trigger={["click"]} menu={{ items: menuItems, onClick: ({ key }) => { if (key === "delete") remove(r); else void setStatus(r, key as Status); } }}>
          <Button type="text" size="small" icon={<MoreOutlined />} aria-label="규칙 메뉴" />
        </Dropdown>,
      ]}>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Typography.Text>{r.status === "pinned" && <PushpinFilled style={{ color: "var(--ant-color-text-tertiary)", marginInlineEnd: 6 }} />}{r.text}</Typography.Text>
          <div className="flex flex-wrap items-center gap-1">
            {scope.map(([k, v]) => <Tag key={k} variant="filled" style={{ marginInlineEnd: 0 }}>{scopeLabel(k, v)}</Tag>)}
            <Tag variant="outlined" style={{ marginInlineEnd: 0 }}>{r.createdBy === "distill" ? "자동 증류" : "직접 작성"}</Tag>
          </div>
          <div className="flex items-center gap-2">
            <Progress percent={pct} size="small" showInfo={false} strokeColor="var(--ant-color-text-secondary)" style={{ maxWidth: 160, margin: 0 }} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>신뢰도 {pct}%</Typography.Text>
          </div>
        </div>
      </List.Item>
    );
  };

  return (
    <div>
      <PageHeader title="내 어투" description="자연어로 적은 규칙이 교정 프롬프트에 들어갑니다. 수락·무시 피드백으로 신뢰도가 조정됩니다." />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <Space.Compact block>
            <Input value={text} onChange={(e) => setText(e.target.value)} onPressEnter={() => void add()} maxLength={300} allowClear
              placeholder='예: 슬랙에서는 상급자에게도 "~습니다"보다 "~요"를 선호한다' />
            <Button type="primary" icon={<PlusOutlined />} loading={adding} onClick={() => void add()}>규칙 추가</Button>
          </Space.Compact>
          {loading ? (
            <Card size="small"><Skeleton active paragraph={{ rows: 3 }} /></Card>
          ) : GROUPS.map((g) => {
            const items = rules.filter((r) => r.status === g.status);
            return (
              <Card key={g.status} size="small" title={<span>{g.title} <Typography.Text type="secondary" style={{ fontWeight: 400 }}>· {items.length}</Typography.Text></span>}
                extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{g.hint}</Typography.Text>} styles={{ body: { padding: 0 } }}>
                <List size="small" dataSource={items} renderItem={renderRule}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Typography.Text type="secondary">{g.empty}</Typography.Text>} style={{ margin: "16px 0" }} /> }}
                  style={{ padding: "0 12px" }} />
              </Card>
            );
          })}
        </div>
        <aside className="flex flex-col gap-3" style={{ position: "sticky", top: 16 }}>
          <Card size="small" title="내 글 샘플 모으기">
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
              내가 쓴 메시지·메일을 그대로 붙여넣어 두면 어투 학습의 출발점이 됩니다. 이 기기의 데이터베이스에만 저장되고, 교정 요청과 달리 외부로 보내지 않습니다.
            </Typography.Paragraph>
            <Input.TextArea rows={7} value={sample} onChange={(e) => setSample(e.target.value)} placeholder="여기에 붙여넣기" count={{ show: true }} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select size="small" style={{ minWidth: 110 }} value={sampleChannel} onChange={setSampleChannel} placeholder="채널"
                options={[{ value: "messenger", label: "메신저" }, { value: "email", label: "이메일" }, { value: "report", label: "보고서" }, { value: "notice", label: "공지" }]} />
              <Select size="small" style={{ minWidth: 110 }} value={sampleAudience} onChange={setSampleAudience} placeholder="수신자"
                options={[{ value: "boss", label: "상급자" }, { value: "peer", label: "동료" }, { value: "junior", label: "후배" }, { value: "customer", label: "고객·외부" }]} />
              <Button type="primary" size="small" className="ml-auto" loading={savingSample} disabled={sample.trim().length < 20}
                onClick={() => void saveSample()}>샘플 저장</Button>
            </div>
            {samples.length > 0 && (
              <List size="small" className="mt-3" dataSource={samples.slice(0, 5)}
                renderItem={(it) => (
                  <List.Item actions={[<Popconfirm key="d" title="이 샘플을 지울까요?" okText="삭제" cancelText="취소" okButtonProps={{ danger: true }} onConfirm={() => void removeSample(it.id)}><Button type="text" size="small" danger>삭제</Button></Popconfirm>]}>
                    <List.Item.Meta
                      title={<Typography.Text ellipsis style={{ fontSize: 12 }}>{it.text.slice(0, 40)}</Typography.Text>}
                      description={<Typography.Text type="secondary" style={{ fontSize: 11 }}>{it.chars.toLocaleString()}자 · {new Date(it.createdAt).toLocaleDateString("ko-KR")}</Typography.Text>} />
                  </List.Item>
                )} />
            )}
          </Card>

          <Card size="small" title="학습 데이터 수집 현황">
            {collection ? (
              <>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
                  <Metric label="글 샘플" value={`${collection.samples}개`} sub={`${collection.sampleChars.toLocaleString()}자`} />
                  <Metric label="교정 실행" value={`${collection.runsOk}회`} />
                  <Metric label="수락·무시" value={`${(collection.feedback["accept"] ?? 0) + (collection.feedback["reject"] ?? 0)}건`} sub={`수락 ${collection.feedback["accept"] ?? 0}`} />
                  <Metric label="직접 수정" value={`${collection.editPairs}건`} sub="가장 강한 신호" />
                </div>
                <Progress percent={Math.min(100, Math.round((collection.editPairs / 30) * 100))} size="small" showInfo={false}
                  strokeColor="var(--color-primary)" className="mt-3" />
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {collection.editPairs >= 30 ? "규칙 증류를 시작할 만큼 모였습니다 (30건 기준)." : `규칙 증류 목표까지 직접 수정 ${30 - collection.editPairs}건 남았습니다.`}
                </Typography.Text>
                <Button block size="small" className="mt-3" icon={<DownloadOutlined />} href="/api/dataset" download>데이터셋 내려받기 (JSONL)</Button>
                <Typography.Paragraph type="secondary" style={{ fontSize: 11, margin: "6px 0 0" }}>
                  개인정보는 마스킹된 본문으로 내보냅니다.
                </Typography.Paragraph>
              </>
            ) : <Skeleton active paragraph={{ rows: 3 }} />}
          </Card>
        </aside>
      </div>
    </div>
  );
}
