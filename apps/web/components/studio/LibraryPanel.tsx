"use client";
import { useCallback, useEffect, useState } from "react";
import { App, Button, Drawer, Empty, Input, List, Popconfirm, Segmented, Skeleton, Space, Tag, Tooltip, Typography } from "antd";
import { CopyOutlined, DeleteOutlined, InboxOutlined } from "@ant-design/icons";
import { PURPOSES, SLOT_KEYS, SLOT_KO, fillVariables, type PromptSpec, type Purpose } from "@grammer-hub/core";
import { api, type PromptStats, type PromptSummary, type PromptVersion } from "@/lib/api";
import { errMsg } from "@/components/pages/_shared";
import { PURPOSE_COLOR, fmtDate } from "./labels";
import { ChecksView, RenderedView } from "./ResultPanel";
import { SlotValue } from "./SlotCard";

function purposeLabel(p: string) { return (PURPOSES as Record<string, { label: string }>)[p]?.label ?? p; }

export function LibraryPanel({ refreshKey, openId, onOpened }: { refreshKey: number; openId?: string | null; onOpened?: () => void }) {
  const { message } = App.useApp();
  const [items, setItems] = useState<PromptSummary[] | null>(null);
  const [stats, setStats] = useState<PromptStats | null>(null);
  const [filter, setFilter] = useState<Purpose | "all">("all");
  const [active, setActive] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { const r = await api.prompts.list(); setItems(r.items); setStats(r.stats); }
    catch (e) { message.error(errMsg(e)); }
  }, [message]);
  useEffect(() => { void reload(); }, [reload, refreshKey]);
  useEffect(() => { if (openId) { setActive(openId); onOpened?.(); } }, [openId, onOpened]);

  const shown = (items ?? []).filter((i) => filter === "all" || i.purpose === filter);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="small" value={filter} onChange={(v) => setFilter(v as Purpose | "all")}
          options={[{ value: "all", label: `전체 ${items?.length ?? 0}` }, ...(Object.keys(PURPOSES) as Purpose[]).map((p) => ({ value: p, label: `${PURPOSES[p].label} ${stats?.byPurpose[p] ?? 0}` }))]} />
        {stats && <Typography.Text type="secondary" style={{ fontSize: 12 }} className="ml-auto">복사·채움 {stats.copies}회</Typography.Text>}
      </div>
      {items === null ? <Skeleton active /> : shown.length === 0 ? <Empty description="보관한 프롬프트가 없습니다. 만들기에서 생성 후 '보관'을 누르세요." /> : (
        <List data-testid="prompt-list" size="small" bordered dataSource={shown} renderItem={(p) => (
          <List.Item className="cursor-pointer" onClick={() => setActive(p.id)} data-prompt-item>
            <div className="flex w-full flex-wrap items-center gap-2">
              <Tag color={PURPOSE_COLOR[p.purpose as Purpose] ?? "default"} style={{ marginInlineEnd: 0 }}>{purposeLabel(p.purpose)}</Tag>
              {p.language === "en" && <Tag color="geekblue" style={{ marginInlineEnd: 0, fontSize: 11 }}>EN</Tag>}
              <Typography.Text strong>{p.title}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis className="min-w-0 flex-1">{p.goal}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{p.variables.length > 0 ? `변수 ${p.variables.length}` : "변수 없음"} · 점검 {p.passed}/{p.total} · v{p.versionCount} · {fmtDate(p.updatedAt)}</Typography.Text>
            </div>
          </List.Item>
        )} />
      )}
      <PromptDrawer id={active} onClose={() => setActive(null)} onChanged={reload} />
    </div>
  );
}

/** 상세: 변수 채우기 → 복사 / 블록 보기 / 버전 / 보관 해제·삭제 */
function PromptDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { message } = App.useApp();
  const [data, setData] = useState<{ prompt: { id: string; title: string; purpose: string; goal: string; language: string; archived: boolean }; versions: PromptVersion[] } | null>(null);
  const [verId, setVerId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"fill" | "blocks" | "versions">("fill");

  useEffect(() => {
    if (!id) { setData(null); return; }
    setData(null); setValues({}); setTab("fill");
    api.prompts.get(id).then((r) => { setData(r); setVerId(r.versions[0]?.id ?? null); void api.prompts.event({ promptId: id, action: "view" }); }).catch((e) => message.error(errMsg(e)));
  }, [id, message]);

  const ver = data?.versions.find((v) => v.id === verId) ?? data?.versions[0] ?? null;
  const spec: PromptSpec | null = ver?.spec ?? null;
  const required = spec?.inputs.filter((i) => i.required).map((i) => i.name) ?? [];
  const filled = ver ? fillVariables(ver.rendered.combined, values, required) : null;

  const copyFilled = async () => {
    if (!filled || !data) return;
    if (filled.missing.length) { message.warning(`필수 변수를 채우세요: ${filled.missing.join(", ")}`); return; }
    await navigator.clipboard.writeText(filled.text).catch(() => {});
    message.success("채운 프롬프트를 복사했습니다");
    void api.prompts.event({ promptId: data.prompt.id, versionId: ver?.id ?? null, action: "fill", payload: { vars: Object.keys(values).filter((k) => values[k]?.trim()) } });
  };
  const archive = async () => {
    if (!data) return;
    try { await api.prompts.patch(data.prompt.id, { archived: true }); message.success("보관 해제했습니다"); onChanged(); onClose(); } catch (e) { message.error(errMsg(e)); }
  };
  const remove = async () => {
    if (!data) return;
    try { await api.prompts.remove(data.prompt.id); message.success("삭제했습니다"); onChanged(); onClose(); } catch (e) { message.error(errMsg(e)); }
  };

  return (
    <Drawer open={Boolean(id)} onClose={onClose} width={720} title={data ? (
      <div className="flex flex-wrap items-center gap-2">
        <Tag color={PURPOSE_COLOR[data.prompt.purpose as Purpose] ?? "default"}>{purposeLabel(data.prompt.purpose)}</Tag>
        <span>{data.prompt.title}</span>
        {data.prompt.language === "en" && <Tag color="geekblue" style={{ fontSize: 11 }}>EN</Tag>}
      </div>) : "불러오는 중"} extra={data && (
      <Space size="small">
        <Tooltip title="목록에서 숨김"><Button size="small" icon={<InboxOutlined />} onClick={archive}>보관 해제</Button></Tooltip>
        <Popconfirm title="이 프롬프트와 모든 버전을 삭제할까요?" okText="삭제" okButtonProps={{ danger: true }} onConfirm={remove}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>)}>
      {!data || !ver || !spec ? <Skeleton active /> : (
        <div className="flex flex-col gap-3">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>목표: {data.prompt.goal}</Typography.Text>
          <Segmented size="small" value={tab} onChange={(v) => setTab(v as typeof tab)} options={[{ value: "fill", label: "변수 채워 복사" }, { value: "blocks", label: "블록" }, { value: "versions", label: `버전 ${data.versions.length}` }]} />
          {tab === "fill" && (
            <div className="flex flex-col gap-3">
              {spec.inputs.length === 0 ? <Typography.Text type="secondary">입력 변수가 없는 프롬프트입니다. 그대로 복사하세요.</Typography.Text> : spec.inputs.map((i) => (
                <div key={i.name}>
                  <Typography.Text style={{ fontSize: 12 }}>{i.label}{i.required && <span style={{ color: "var(--ant-color-error)" }}> *</span>} <code style={{ fontSize: 11, color: "var(--ant-color-text-tertiary)" }}>{`{{${i.name}}}`}</code></Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }} className="block">{i.description}</Typography.Text>
                  {i.multiline
                    ? <Input.TextArea data-var={i.name} className="mt-1" autoSize={{ minRows: 2, maxRows: 10 }} placeholder={i.placeholder} value={values[i.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [i.name]: e.target.value }))} />
                    : <Input data-var={i.name} className="mt-1" placeholder={i.placeholder} value={values[i.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [i.name]: e.target.value }))} />}
                </div>
              ))}
              <Button data-testid="prompt-fill-copy" type="primary" icon={<CopyOutlined />} onClick={copyFilled}>채워서 복사</Button>
              <RenderedView rendered={{ ...ver.rendered, combined: filled?.text ?? ver.rendered.combined }} onCopy={() => void api.prompts.event({ promptId: data.prompt.id, versionId: ver.id, action: "copy" })} />
            </div>
          )}
          {tab === "blocks" && (
            <div className="flex flex-col gap-3">
              <ChecksView checks={ver.checks} />
              {SLOT_KEYS.map((k) => (
                <div key={k} className="rounded-lg border p-3" style={{ borderColor: "var(--ant-color-border-secondary)" }}>
                  <div className="mb-1 flex items-center gap-1"><Typography.Text strong style={{ fontSize: 12 }}>{SLOT_KO[k]}</Typography.Text>
                    {spec.rationale[k as keyof PromptSpec["rationale"]] && <Typography.Text type="secondary" style={{ fontSize: 11 }} className="ml-2">{spec.rationale[k as keyof PromptSpec["rationale"]]}</Typography.Text>}</div>
                  <SlotValue slot={k} value={spec[k]} />
                </div>
              ))}
            </div>
          )}
          {tab === "versions" && (
            <List size="small" bordered dataSource={data.versions} renderItem={(v) => (
              <List.Item className="cursor-pointer" onClick={() => { setVerId(v.id); setTab("fill"); }} style={{ background: v.id === ver.id ? "var(--ant-color-primary-bg)" : undefined }}>
                <Space wrap size="small">
                  <Tag>v{v.versionNo}</Tag>
                  <span>{v.source === "generate" ? "생성" : v.source === "regenerate" ? `재생성 · ${v.slot ? SLOT_KO[v.slot as keyof typeof SLOT_KO] ?? v.slot : ""}` : `직접 수정 · ${v.slot ? SLOT_KO[v.slot as keyof typeof SLOT_KO] ?? v.slot : ""}`}</span>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{fmtDate(v.createdAt)} · 점검 {v.checks.filter((c) => c.ok).length}/{v.checks.length}{v.costUsd ? ` · $${v.costUsd.toFixed(4)}` : ""}</Typography.Text>
                </Space>
              </List.Item>
            )} />
          )}
        </div>
      )}
    </Drawer>
  );
}
