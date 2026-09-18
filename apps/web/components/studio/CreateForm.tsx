"use client";
import { useMemo, useState } from "react";
import { Alert, Button, Input, Segmented, Select, Space, Switch, Tooltip, Typography } from "antd";
import { ArrowRightOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { DOMAINS, DOMAIN_LIST, PURPOSES, type ClarifyPolicy, type Domain, type PromptLanguage, type PromptLength, type Purpose, type StudioRequest } from "@grammer-hub/core";
import { CLARIFY_KO, LANG_LABEL, LENGTH_KO } from "./labels";

export function CreateForm({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (req: StudioRequest) => void }) {
  const [domain, setDomain] = useState<Domain>("dev");
  const [purpose, setPurpose] = useState<Purpose>("investigate");
  const [subtype, setSubtype] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [length, setLength] = useState<PromptLength>("standard");
  const [clarify, setClarify] = useState<ClarifyPolicy>("ask_first");
  const [language, setLanguage] = useState<PromptLanguage>("ko");
  const [includeStyleRules, setIncludeStyleRules] = useState(false);

  const def = PURPOSES[purpose];
  const sub = useMemo(() => def.subtypes.find((s) => s.id === subtype) ?? null, [def, subtype]);
  const canRun = goal.trim().length >= 4 && !busy;

  const submit = () => onSubmit({ purpose, subtype, goal: goal.trim(), length, clarify, promptLanguage: language, includeStyleRules, provider: null });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>목적</Typography.Text>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Segmented data-testid="studio-domain" value={domain} onChange={(v) => { const d = v as Domain; setDomain(d); setPurpose(DOMAINS[d].purposes[0]!); setSubtype(null); }}
            options={DOMAIN_LIST.map((d) => ({ value: d, label: DOMAINS[d].label }))} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{DOMAINS[domain].short}</Typography.Text>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Segmented data-testid="studio-stage" size="small" value={purpose} onChange={(v) => { setPurpose(v as Purpose); setSubtype(null); }}
            options={DOMAINS[domain].purposes.map((p) => ({ value: p, label: PURPOSES[p].label }))} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {def.short}{def.next ? <> <ArrowRightOutlined style={{ fontSize: 10 }} /> {PURPOSES[def.next].label}</> : null}
          </Typography.Text>
        </div>
      </div>

      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>세부 유형 <span style={{ opacity: .7 }}>(비우면 목표에서 추정)</span></Typography.Text>
        <Select className="mt-1 w-full" allowClear placeholder="자동 추정" value={subtype ?? undefined} onChange={(v) => setSubtype(v ?? null)}
          options={def.subtypes.map((s) => ({ value: s.id, label: <span>{s.label} <span style={{ color: "var(--ant-color-text-tertiary)", fontSize: 12 }}>· {s.hint}</span></span> }))} />
        {sub && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }} className="mt-1 block">
            보통 필요한 입력: {sub.inputs.map((i) => i.label).join(", ")} · 다음 단계로 넘기는 것: {sub.seeds.handoff.join(", ")}
          </Typography.Text>
        )}
      </div>

      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>목표 — 프롬프트를 받은 모델이 끝냈을 때 무엇을 손에 쥐어야 하나</Typography.Text>
        <Input.TextArea data-testid="studio-goal" className="mt-1" autoSize={{ minRows: 3, maxRows: 8 }} maxLength={2000} showCount value={goal} onChange={(e) => setGoal(e.target.value)}
          placeholder={PLACEHOLDER[domain]} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) submit(); }} />
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }} className="block">분량</Typography.Text>
          <Segmented size="small" value={length} onChange={(v) => setLength(v as PromptLength)} options={(Object.keys(LENGTH_KO) as PromptLength[]).map((k) => ({ value: k, label: LENGTH_KO[k] }))} />
        </div>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }} className="block">모호할 때</Typography.Text>
          <Select size="small" style={{ width: 190 }} value={clarify} onChange={setClarify} options={(Object.keys(CLARIFY_KO) as ClarifyPolicy[]).map((k) => ({ value: k, label: CLARIFY_KO[k] }))} />
        </div>
        <div>
          <Tooltip title="영어 지시문이 최적화가 잘 돼 있어 품질이 안정적입니다. 영어로 뽑아도 답변은 한국어로 하라는 규칙이 자동으로 들어갑니다.">
            <Typography.Text type="secondary" style={{ fontSize: 12 }} className="block">프롬프트 언어</Typography.Text>
          </Tooltip>
          <Segmented data-testid="studio-lang" size="small" value={language} onChange={(v) => setLanguage(v as PromptLanguage)} options={(Object.keys(LANG_LABEL) as PromptLanguage[]).map((k) => ({ value: k, label: LANG_LABEL[k] }))} />
        </div>
        <div className="flex items-center gap-2">
          <Switch size="small" checked={includeStyleRules} onChange={setIncludeStyleRules} />
          <Tooltip title="기본은 중립(내 데이터 미사용). 글쓰기 목적일 때만 '내 어투' 규칙을 프롬프트에 넣습니다.">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>내 어투 규칙 포함</Typography.Text>
          </Tooltip>
        </div>
      </div>

      {language === "en" && <Alert type="info" showIcon message="지시문은 영어로, 답변은 한국어로 나오도록 렌더 시 규칙이 자동 삽입됩니다." style={{ padding: "6px 12px" }} />}
      {error && <Alert type="error" showIcon message={error} />}

      <Space>
        <Button data-testid="studio-run" type="primary" icon={<ThunderboltOutlined />} loading={busy} disabled={!canRun} onClick={submit}>프롬프트 만들기</Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>⌘⏎</Typography.Text>
      </Space>
    </div>
  );
}

const PLACEHOLDER: Record<Domain, string> = {
  dev: "예: 결제 승인 모듈의 재시도 로직이 어떻게 동작하는지 파악해서, 타임아웃 버그를 고치기 전에 흐름을 정리하고 싶다",
  research: "예: 사내 알림 발송에 쓸 메시지 큐 후보(SQS, Kafka, Redis Streams)를 운영 난이도 기준으로 비교하고 싶다",
  analysis: "예: 지난달 결제 실패율이 1.2%→2.1%로 올랐다. 원인 후보와 확인 방법을 정리하고 싶다",
  planning: "예: 정산 리포트 자동 발송 기능 도입 제안서. 결정권자는 CTO, 한 페이지",
  writing: "예: 배포 지연 사유와 새 일정을 팀장에게 슬랙으로 보고하는 메시지",
  decision: "예: 결제 게이트웨이를 교체할지 유지할지, 되돌리기 어려운 결정이라 기준부터 세우고 싶다",
};
