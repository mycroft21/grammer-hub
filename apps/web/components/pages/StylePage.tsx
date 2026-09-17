"use client";
import { useCallback, useEffect, useState } from "react";
import { App, Button, Card, Dropdown, Empty, Input, List, Progress, Skeleton, Space, Tag, Tooltip, Typography } from "antd";
import { MoreOutlined, PlusOutlined, PushpinFilled } from "@ant-design/icons";
import type { StyleRule } from "@grammer-hub/core";
import { api } from "@/lib/api";
import { AUDIENCE_KO, CHANNEL_KO, LANG_KO, PageHeader, errMsg } from "./_shared";

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
        <aside>
          <Card size="small" title="내 글 샘플로 시작하기" style={{ position: "sticky", top: 16 }}>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
              내가 쓴 메시지·메일을 300자 이상 붙여넣으면 어투 규칙 초안을 만들어 드립니다. 지금은 화면에만 보관되고 서버로 보내지 않습니다.
            </Typography.Paragraph>
            <Input.TextArea rows={8} value={sample} onChange={(e) => setSample(e.target.value)} placeholder="여기에 붙여넣기" count={{ show: true }} />
            <div className="mt-3 flex items-center justify-between gap-2">
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{sample.length < 300 ? `${300 - sample.length}자 더 필요` : "충분합니다"}</Typography.Text>
              <Tooltip title="Phase 2에서 활성화됩니다"><Button disabled>규칙 초안 생성 (Phase 2)</Button></Tooltip>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
