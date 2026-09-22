"use client";
import { useState } from "react";
import { Button, Input, Popover, Skeleton, Space, Tag, Tooltip, Typography } from "antd";
import { CheckOutlined, CloseOutlined, EditOutlined, InfoCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { SLOT_KO, slotLabel, type PromptSpec, type SlotKey } from "@grammer-hub/core";
import { CLARIFY_KO } from "./labels";

type Inputs = PromptSpec["inputs"]; type Contract = PromptSpec["output_contract"]; type Examples = NonNullable<PromptSpec["examples"]>;

/** 슬롯 값 표시. 종류별로 읽기 쉬운 형태. */
export function SlotValue({ slot, value }: { slot: SlotKey; value: unknown }) {
  if (value === null || value === undefined) return <Typography.Text type="secondary">(없음)</Typography.Text>;
  if (slot === "inputs") {
    const v = value as Inputs;
    return v.length === 0 ? <Typography.Text type="secondary">(입력 변수 없음)</Typography.Text> : (
      <ul className="m-0 list-none p-0 text-[13px]">{v.map((i) => (
        <li key={i.name} className="py-0.5"><code className="rounded px-1" style={{ background: "var(--ant-color-fill-tertiary)" }}>{`{{${i.name}}}`}</code> <b>{i.label}</b>{!i.required && <Tag className="ml-1" style={{ fontSize: 11 }}>선택</Tag>} <span style={{ color: "var(--ant-color-text-secondary)" }}>— {i.description}</span></li>
      ))}</ul>
    );
  }
  if (slot === "output_contract") {
    const v = value as Contract;
    return <ul className="m-0 list-none p-0 text-[13px]"><li>형식: <Tag>{v.format}</Tag></li><li>구성: {v.structure}</li><li>분량: {v.length}</li></ul>;
  }
  if (slot === "examples") {
    const v = value as Examples;
    return <div className="flex flex-col gap-2">{v.map((e, i) => (
      <div key={i} className="grid gap-2 text-[12px] md:grid-cols-2">
        <pre className="m-0 whitespace-pre-wrap rounded p-2" style={{ background: "var(--ant-color-fill-quaternary)" }}>{e.input}</pre>
        <pre className="m-0 whitespace-pre-wrap rounded p-2" style={{ background: "var(--ant-color-fill-quaternary)" }}>{e.output}</pre>
      </div>))}</div>;
  }
  if (slot === "clarify_policy") return <span className="text-[13px]">{CLARIFY_KO[value as keyof typeof CLARIFY_KO] ?? String(value)}</span>;
  if (Array.isArray(value)) return <ol className="m-0 pl-5 text-[13px]">{(value as string[]).map((x, i) => <li key={i} className="py-0.5">{x}</li>)}</ol>;
  return <Typography.Paragraph className="!mb-0 whitespace-pre-wrap text-[13px]">{String(value)}</Typography.Paragraph>;
}

const EDITABLE_TEXT: SlotKey[] = ["title", "role", "goal", "context"];
const EDITABLE_LIST: SlotKey[] = ["success_criteria", "hard_rules", "process", "self_check", "failure_guards"];

export interface SlotCardProps {
  slot: SlotKey; value: unknown; rationale?: string | undefined; loading?: boolean; busy?: boolean;
  /** 에이전트 런타임이면 슬롯 이름이 다르게 읽힌다(완료 조건·범위와 제약·보고 형식·검증) */
  runtime?: PromptSpec["runtime"] | null | undefined;
  onRegenerate?: ((slot: SlotKey, instruction: string | null) => void) | undefined;
  onEdit?: ((slot: SlotKey, value: unknown) => void) | undefined;
}

/** 블록 카드: 값 + ✎ 직접 수정 / ↻ 재생성(지시 가능) / ⓘ 이유. */
export function SlotCard({ slot, value, rationale, loading, busy, runtime, onRegenerate, onEdit }: SlotCardProps) {
  const name = slotLabel(slot, runtime ?? null, SLOT_KO);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [instr, setInstr] = useState("");
  const [open, setOpen] = useState(false);
  const canEdit = Boolean(onEdit) && (EDITABLE_TEXT.includes(slot) || EDITABLE_LIST.includes(slot));
  const startEdit = () => {
    setDraft(Array.isArray(value) ? (value as string[]).join("\n") : value == null ? "" : String(value));
    setEditing(true);
  };
  const commit = () => {
    const v = EDITABLE_LIST.includes(slot) ? draft.split("\n").map((s) => s.trim()).filter(Boolean) : (slot === "context" && !draft.trim() ? null : draft.trim());
    onEdit?.(slot, v); setEditing(false);
  };
  return (
    <div data-slot={slot} className="rounded-lg border p-3" style={{ borderColor: "var(--ant-color-border-secondary)", background: "var(--ant-color-bg-container)", opacity: busy ? .6 : 1 }}>
      <div className="mb-1.5 flex items-center gap-1">
        <Typography.Text strong style={{ fontSize: 12 }}>{name}</Typography.Text>
        {rationale && <Tooltip title={rationale}><InfoCircleOutlined style={{ fontSize: 12, color: "var(--ant-color-text-tertiary)" }} /></Tooltip>}
        <span className="ml-auto" />
        {canEdit && !editing && <Tooltip title="직접 수정"><Button type="text" size="small" icon={<EditOutlined />} onClick={startEdit} aria-label={`${name} 수정`} /></Tooltip>}
        {onRegenerate && (
          <Popover trigger="click" open={open} onOpenChange={setOpen} placement="bottomRight" content={
            <div className="flex w-64 flex-col gap-2">
              <Input size="small" placeholder="지시(선택) 예: 더 짧게, 수치 기준 추가" value={instr} onChange={(e) => setInstr(e.target.value)} onPressEnter={() => { onRegenerate(slot, instr.trim() || null); setOpen(false); }} />
              <Button size="small" type="primary" onClick={() => { onRegenerate(slot, instr.trim() || null); setOpen(false); }}>이 블록만 다시</Button>
            </div>}>
            <Tooltip title="이 블록만 다시 생성"><Button type="text" size="small" icon={<ReloadOutlined spin={Boolean(busy)} />} aria-label={`${name} 재생성`} /></Tooltip>
          </Popover>
        )}
      </div>
      {loading ? <Skeleton active paragraph={{ rows: 2 }} title={false} /> : editing ? (
        <div className="flex flex-col gap-2">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 10 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={EDITABLE_LIST.includes(slot) ? "한 줄에 하나" : ""} />
          <Space><Button size="small" type="primary" icon={<CheckOutlined />} onClick={commit}>적용</Button><Button size="small" icon={<CloseOutlined />} onClick={() => setEditing(false)}>취소</Button></Space>
        </div>
      ) : <SlotValue slot={slot} value={value} />}
    </div>
  );
}
