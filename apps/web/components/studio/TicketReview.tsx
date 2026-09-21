"use client";
import { useMemo, useState } from "react";
import { Alert, Button, Input, Radio, Segmented, Select, Space, Tag, Typography } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { DOMAINS, DOMAIN_LIST, PURPOSES, defaultLength, defaultRuntime, type PromptLanguage, type PromptLength, type Purpose, type Runtime, type StudioRequest, type Ticket, type TicketPlanResult } from "@grammer-hub/core";
import { LANG_LABEL, LENGTH_KO } from "./labels";

const RUNTIME_LABEL: Record<Runtime, string> = { claude_code: "Claude Code", chat: "채팅" };

/**
 * 티켓 검토: 모델이 정리한 분류·목표·시작점·맥락을 사용자가 고치고, 질문에 답한 뒤 생성한다.
 * 티켓이 부실할수록 여기서 한두 줄 보태는 것이 결과를 가른다.
 */
export function TicketReview({ ticket, plan, busy, onGenerate, onBack }: {
  ticket: Ticket; plan: TicketPlanResult; busy: boolean; onGenerate: (req: StudioRequest) => void; onBack: () => void;
}) {
  const [purpose, setPurpose] = useState<Purpose>(plan.purpose);
  const [subtype, setSubtype] = useState<string | null>(plan.subtype);
  const [goal, setGoal] = useState(plan.goal);
  const [starts, setStarts] = useState(plan.starting_points.join("\n"));
  const [context, setContext] = useState(plan.context);
  const [runtime, setRuntime] = useState<Runtime>(defaultRuntime(plan.purpose));
  const [length, setLength] = useState<PromptLength>(defaultLength(plan.purpose));
  const [language, setLanguage] = useState<PromptLanguage>("ko");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const purposeOptions = useMemo(() => DOMAIN_LIST.map((d) => ({
    label: DOMAINS[d].label,
    options: DOMAINS[d].purposes.map((p) => ({ value: p, label: `${DOMAINS[d].label} › ${PURPOSES[p].label}` })),
  })), []);
  const def = PURPOSES[purpose];
  const merged = () => {
    const out: Record<string, string> = {};
    for (const q of plan.questions) { const v = answers[q.id]; if (v === "__other") { if (other[q.id]?.trim()) out[q.id] = other[q.id]!.trim(); } else if (v) out[q.id] = v; }
    return out;
  };
  const submit = (assumeRest: boolean) => {
    const a = merged();
    const unanswered = plan.questions.filter((q) => !a[q.id]);
    const assumptions = [...plan.assumptions, ...(assumeRest ? unanswered.map((q) => `${q.question} → 기본값으로 가정`) : [])];
    onGenerate({
      purpose, subtype, goal: goal.trim(), length, clarify: "assume_and_state", promptLanguage: language, includeStyleRules: false, runtime, provider: null,
      ticket: ticket.key, answers: a, assumptions,
      hints: { startingPoints: starts.split("\n").map((s) => s.trim()).filter(Boolean), context: context.trim() },
    });
  };
  const allAnswered = plan.questions.every((q) => merged()[q.id]);
  const label = (fs: number) => ({ fontSize: fs } as const);

  return (
    <div className="flex flex-col gap-4" data-testid="ticket-review">
      <div className="rounded-lg border p-3" style={{ borderColor: "var(--ant-color-border-secondary)" }}>
        <div className="flex flex-wrap items-center gap-2">
          <Tag color="blue">{ticket.key}</Tag>
          <Typography.Text strong>{ticket.summary}</Typography.Text>
          <Typography.Text type="secondary" style={label(12)}>{ticket.type} · {ticket.status}{ticket.priority ? ` · ${ticket.priority}` : ""}{ticket.attachments.length ? ` · 첨부 ${ticket.attachments.length}` : ""}{ticket.comments.length ? ` · 댓글 ${ticket.comments.length}` : ""}</Typography.Text>
          <a className="ml-auto text-[12px]" href={ticket.url} target="_blank" rel="noreferrer">Jira에서 열기</a>
        </div>
        <Typography.Paragraph type="secondary" style={{ ...label(12), marginTop: 6, marginBottom: 0 }} ellipsis={{ rows: 3, expandable: true, symbol: "더 보기" }}>{ticket.description || "(본문 없음)"}</Typography.Paragraph>
      </div>

      <Alert type="info" showIcon message={plan.summary} description="모델이 티켓을 읽고 정리한 초안입니다. 틀린 곳은 고치고, 부족한 시작점(저장소·클래스·화면)은 한 줄 보태 주세요." />
      {plan.missing_inputs.length > 0 && <Alert type="warning" showIcon message="티켓 밖에 있는 정보" description={<ul className="m-0 pl-5">{plan.missing_inputs.map((m, i) => <li key={i}>{m}</li>)}</ul>} />}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Typography.Text type="secondary" style={label(12)}>분류</Typography.Text>
          <Select className="mt-1 w-full" value={purpose} onChange={(v) => { setPurpose(v); setSubtype(null); setRuntime(defaultRuntime(v)); setLength(defaultLength(v)); }} options={purposeOptions} />
        </div>
        <div>
          <Typography.Text type="secondary" style={label(12)}>세부 유형</Typography.Text>
          <Select className="mt-1 w-full" allowClear placeholder="자동" value={subtype ?? undefined} onChange={(v) => setSubtype(v ?? null)} options={def.subtypes.map((s) => ({ value: s.id, label: `${s.label} · ${s.hint}` }))} />
        </div>
      </div>
      <div>
        <Typography.Text type="secondary" style={label(12)}>목표</Typography.Text>
        <Input.TextArea data-testid="ticket-goal" className="mt-1" autoSize={{ minRows: 2, maxRows: 6 }} value={goal} onChange={(e) => setGoal(e.target.value)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Typography.Text type="secondary" style={label(12)}>시작점 (한 줄에 하나 — 저장소·클래스·메서드·URL·화면)</Typography.Text>
          <Input.TextArea className="mt-1" autoSize={{ minRows: 3, maxRows: 8 }} value={starts} onChange={(e) => setStarts(e.target.value)} placeholder="reporter-api MerchantServiceCommandService" />
        </div>
        <div>
          <Typography.Text type="secondary" style={label(12)}>맥락 (확정된 사실·정책·일정)</Typography.Text>
          <Input.TextArea className="mt-1" autoSize={{ minRows: 3, maxRows: 8 }} value={context} onChange={(e) => setContext(e.target.value)} />
        </div>
      </div>

      {plan.questions.map((q, i) => (
        <div key={q.id} className="rounded-lg border p-3" style={{ borderColor: "var(--ant-color-border-secondary)" }}>
          <Typography.Text strong>{i + 1}. {q.question}</Typography.Text>
          <Typography.Text type="secondary" style={label(12)} className="ml-2">{q.why}</Typography.Text>
          <div className="mt-2">
            <Radio.Group value={answers[q.id]} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value as string }))}>
              <Space wrap>
                {q.options.map((o) => <Radio.Button key={o.value} value={o.value} data-testid="ticket-option">{o.label}</Radio.Button>)}
                {q.allow_other && <Radio.Button value="__other">직접 입력</Radio.Button>}
              </Space>
            </Radio.Group>
            {answers[q.id] === "__other" && <Input.TextArea className="mt-2" autoSize={{ minRows: 2, maxRows: 8 }} placeholder="직접 입력 (첨부 내용 요약 등)" value={other[q.id] ?? ""} onChange={(e) => setOther((o) => ({ ...o, [q.id]: e.target.value }))} />}
          </div>
        </div>
      ))}
      {plan.assumptions.length > 0 && <Typography.Text type="secondary" style={label(12)}>가정: {plan.assumptions.join(" · ")}</Typography.Text>}

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div><Typography.Text type="secondary" style={label(12)} className="block">실행 환경</Typography.Text>
          <Segmented size="small" value={runtime} onChange={(v) => setRuntime(v as Runtime)} options={(Object.keys(RUNTIME_LABEL) as Runtime[]).map((k) => ({ value: k, label: RUNTIME_LABEL[k] }))} /></div>
        <div><Typography.Text type="secondary" style={label(12)} className="block">분량</Typography.Text>
          <Segmented size="small" value={length} onChange={(v) => setLength(v as PromptLength)} options={(Object.keys(LENGTH_KO) as PromptLength[]).map((k) => ({ value: k, label: LENGTH_KO[k] }))} /></div>
        <div><Typography.Text type="secondary" style={label(12)} className="block">프롬프트 언어</Typography.Text>
          <Segmented size="small" value={language} onChange={(v) => setLanguage(v as PromptLanguage)} options={(Object.keys(LANG_LABEL) as PromptLanguage[]).map((k) => ({ value: k, label: LANG_LABEL[k] }))} /></div>
      </div>

      <Space wrap>
        <Button data-testid="ticket-generate" type="primary" icon={<ThunderboltOutlined />} loading={busy} disabled={!goal.trim() || !allAnswered} onClick={() => submit(false)}>프롬프트 만들기</Button>
        {plan.questions.length > 0 && <Button data-testid="ticket-assume" loading={busy} onClick={() => submit(true)}>가정으로 진행</Button>}
        <Button type="text" onClick={onBack}>뒤로</Button>
      </Space>
    </div>
  );
}
