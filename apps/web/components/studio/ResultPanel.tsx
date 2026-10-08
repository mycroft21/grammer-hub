"use client";
import { useEffect, useState } from "react";
import { Alert, App, Button, Collapse, Segmented, Space, Tag, Typography } from "antd";
import { CheckCircleFilled, CloseCircleFilled, CopyOutlined, SaveOutlined, ReloadOutlined } from "@ant-design/icons";
import { SLOT_KEYS, checksSummary, type CheckResult, type PromptSpec, type RenderedPrompt, type SlotKey } from "@grammer-hub/core";
import type { StudioState } from "./useStudio";
import { SlotCard } from "./SlotCard";
import { ProgressLine } from "@/components/ProgressLine";
import { RunLog } from "@/components/RunLog";
import { SLOT_KEYS as ALL_SLOTS } from "@grammer-hub/core";
import { RUNTIME_TAG } from "./labels";

const fmtUsd = (v: number) => `$${v.toFixed(4)}`;

/** 렌더 결과(system/user/한 덩어리) + 복사. 보관함 상세에서도 재사용. */
export function RenderedView({ rendered, onCopy }: { rendered: RenderedPrompt; onCopy?: ((which: "system" | "user" | "combined") => void) | undefined }) {
  const { message } = App.useApp();
  const [tab, setTab] = useState<"combined" | "system" | "user">("combined");
  const [done, setDone] = useState(false);
  const text = rendered[tab];
  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setDone(true); setTimeout(() => setDone(false), 1500);
    message.success("복사했습니다"); onCopy?.(tab);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="small" value={tab} onChange={(v) => setTab(v as typeof tab)} options={[{ value: "combined", label: "한 덩어리" }, { value: "system", label: "System" }, { value: "user", label: "User" }]} />
        {RUNTIME_TAG[rendered.runtime] && <Tag color="green" style={{ fontSize: 11 }}>{RUNTIME_TAG[rendered.runtime]}</Tag>}
        {rendered.language === "en" && <Tag color="geekblue" style={{ fontSize: 11 }}>EN 지시문 · 답변 한국어</Tag>}
        {rendered.variables.length > 0 && <Typography.Text type="secondary" style={{ fontSize: 12 }}>변수 {rendered.variables.map((v) => `{{${v}}}`).join(" ")}</Typography.Text>}
        <Button data-testid="studio-copy" data-done={done ? "1" : "0"} className="ml-auto" size="small" type={done ? "primary" : "default"} icon={<CopyOutlined />} onClick={copy}>복사</Button>
      </div>
      <pre data-testid="studio-rendered" className="m-0 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border p-3 text-[12.5px] leading-relaxed"
        style={{ borderColor: "var(--ant-color-border-secondary)", background: "var(--ant-color-fill-quaternary)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{text}</pre>
    </div>
  );
}

export function ChecksView({ checks }: { checks: CheckResult[] }) {
  const s = checksSummary(checks);
  return (
    <div data-testid="studio-checks" className="rounded-lg border p-3" style={{ borderColor: "var(--ant-color-border-secondary)" }}>
      <div className="mb-1 flex items-center gap-2"><Typography.Text strong style={{ fontSize: 12 }}>규격 점검</Typography.Text><Tag color={s.passed === s.total ? "green" : "orange"}>{s.passed}/{s.total}</Tag></div>
      <ul className="m-0 list-none p-0 text-[12.5px]">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-1.5 py-0.5">
            {c.ok ? <CheckCircleFilled style={{ color: "var(--ant-color-primary)", marginTop: 3 }} /> : <CloseCircleFilled style={{ color: "var(--ant-color-error)", marginTop: 3 }} />}
            <span>{c.label}{!c.ok && <span style={{ color: "var(--ant-color-text-secondary)" }}> — {c.detail}</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DETAIL_KEY = "gh:studio:detail";
const detailOpen = (): boolean => { try { return localStorage.getItem(DETAIL_KEY) === "open"; } catch { return false; } };

/**
 * 결과: 기본은 출력 먼저(제목·렌더 결과·복사·보관 + '가정 n개 · 점검 p/t' 한 줄). 나머지(슬롯별 수정·재생성, 점검 목록, 실행 로그, 모델·비용)는
 * '상세 보기'에 접어 두고, 펼친 상태는 이 브라우저에 기억한다(자주 고치는 사람은 계속 펼쳐 둔다).
 */
export function ResultPanel({ state, onRegenerate, onEdit, onSave, onReset }: {
  state: StudioState; onRegenerate: (slot: SlotKey, instruction: string | null) => void; onEdit: (slot: SlotKey, value: unknown) => void; onSave: () => Promise<string | null>; onReset: () => void;
}) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  useEffect(() => { setDetail(detailOpen()); }, []);
  const toggleDetail = (open: boolean) => { setDetail(open); try { localStorage.setItem(DETAIL_KEY, open ? "open" : "closed"); } catch { /* 기억하지 못해도 동작 */ } };
  const generating = state.phase === "generating";
  const spec: Partial<PromptSpec> = state.spec ?? (state.slots as Partial<PromptSpec>);
  const assumptions = state.request?.assumptions ?? [];
  const passed = state.checks.filter((c) => c.ok).length;
  const failed = state.checks.length - passed;
  const save = async () => {
    setSaving(true);
    try { const id = await onSave(); if (id) message.success("보관함에 저장했습니다"); }
    catch (e) { message.error(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };
  return (
    <div className="flex flex-col gap-3" data-testid="studio-result">
      <div className="flex flex-wrap items-center gap-2">
        <Typography.Title level={5} style={{ margin: 0 }}>{spec.title ?? (generating ? "생성 중…" : "결과")}</Typography.Title>
        <span className="ml-auto" />
        <Space size="small">
          <Button size="small" icon={<ReloadOutlined />} onClick={onReset}>새로 만들기</Button>
          <Button data-testid="studio-save" size="small" type="primary" icon={<SaveOutlined />} loading={saving} disabled={!state.spec || generating || Boolean(state.savedId)} onClick={save}>{state.savedId ? "보관됨" : "보관"}</Button>
        </Space>
      </div>
      {generating && (
        <ProgressLine compact stage={state.progress.stage} startedAt={state.progress.startedAt} expectedMs={state.progress.expectedMs}
          fraction={Object.keys(state.slots).length / ALL_SLOTS.length} detail={`항목 ${Object.keys(state.slots).length}/${ALL_SLOTS.length}`} />
      )}
      {state.error && <Alert type="error" showIcon message={state.error} />}
      {state.rendered ? <RenderedView rendered={state.rendered} /> : !generating && state.spec ? (
        <Alert type="info" showIcon message="직접 고친 내용은 보관하면 다시 렌더됩니다." action={<Button size="small" onClick={save} loading={saving}>보관</Button>} />
      ) : null}
      {(assumptions.length > 0 || state.checks.length > 0) && (
        <div style={{ fontSize: 12.5 }} data-testid="result-line">
          {assumptions.length > 0 && <Typography.Link style={{ fontSize: 12.5, color: "var(--ant-color-warning-text)" }} onClick={() => setShowAssumptions((v) => !v)} data-testid="result-assumptions-toggle">가정 {assumptions.length}개로 만들었습니다</Typography.Link>}
          {assumptions.length > 0 && state.checks.length > 0 && <Typography.Text type="secondary" style={{ fontSize: 12.5 }}> · </Typography.Text>}
          {state.checks.length > 0 && <Typography.Text style={{ fontSize: 12.5, color: failed ? "var(--ant-color-warning-text)" : "var(--ant-color-text-secondary)" }} data-testid="result-checks-line">점검 {passed}/{state.checks.length}{failed ? ` — 통과 못 한 ${failed}개는 상세 보기에서` : ""}</Typography.Text>}
          {showAssumptions && <ul className="m-0 mt-1 pl-5" data-testid="result-assumptions">{assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>}
        </div>
      )}
      <Collapse size="small" activeKey={detail ? ["d"] : []} onChange={(k) => toggleDetail((Array.isArray(k) ? k : [k]).includes("d"))} data-testid="result-detail"
        items={[{ key: "d", label: <span data-testid="result-detail-toggle">상세 보기 <Typography.Text type="secondary" style={{ fontSize: 12 }}>항목별 수정·재생성 · 점검 · 실행 로그{state.meta ? ` · ${state.meta.model}` : ""}{state.usage ? ` · ${fmtUsd(state.usage.costUsd)} · ${(state.usage.latencyMs / 1000).toFixed(1)}s` : ""}</Typography.Text></span>, children: (
          <div className="flex flex-col gap-3">
            {state.meta && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{state.meta.model} · 스튜디오 v{state.meta.promptVersion}{state.usage ? ` · ${fmtUsd(state.usage.costUsd)} · ${(state.usage.latencyMs / 1000).toFixed(1)}s` : ""}</Typography.Text>}
            <RunLog entries={state.log} running={generating} compact />
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-2">
                {SLOT_KEYS.map((k) => (
                  <SlotCard key={k} slot={k} value={spec[k]} runtime={(spec.runtime as PromptSpec["runtime"] | undefined) ?? state.request?.runtime ?? null} rationale={state.spec?.rationale[k as keyof PromptSpec["rationale"]]} loading={generating && !(k in spec)} busy={state.busySlot === k}
                    onRegenerate={state.spec && !generating ? onRegenerate : undefined} onEdit={state.spec && !generating ? onEdit : undefined} />
                ))}
              </div>
              <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
                {state.checks.length > 0 && <ChecksView checks={state.checks} />}
              </div>
            </div>
          </div>
        ) }]} />
    </div>
  );
}
