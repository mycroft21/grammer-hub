"use client";
import { useMemo, useState } from "react";
import { Alert, Button, Collapse, Input, Radio, Segmented, Select, Space, Tag, Typography } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { AGENT_DEFAULTS, DOMAINS, DOMAIN_LIST, PURPOSES, defaultLength, defaultRuntime, isAgentRuntime, type Need, type PromptLanguage, type PromptLength, type Purpose, type Runtime, type StudioRequest, type Ticket, type TicketPlanResult } from "@grammer-hub/core";
import type { WorkspaceStatus } from "@/lib/api";
import { LANG_LABEL, LENGTH_KO, NEED_STATUS_KO, RUNTIME_LABEL } from "./labels";

/**
 * 티켓 검토: 모델이 정리한 분류·목표·저장소·시작점·맥락을 사용자가 고치고, (있으면) 질문에 답한 뒤 생성한다.
 * 질문은 장부(needs)에서 코드가 고른 것만 나온다. 나머지는 가정과 '코드에서 확인할 것'으로 보이고, 전부 여기서 고칠 수 있다.
 */
export function TicketReview({ ticket, plan, workspace, busy, onGenerate, onBack }: {
  ticket: Ticket; plan: TicketPlanResult; workspace: WorkspaceStatus | null; busy: boolean; onGenerate: (req: StudioRequest) => void; onBack: () => void;
}) {
  const [purpose, setPurpose] = useState<Purpose>(plan.purpose);
  const [subtype, setSubtype] = useState<string | null>(plan.subtype);
  const [goal, setGoal] = useState(plan.goal);
  const [repos, setRepos] = useState<string[]>(plan.repos);
  const [starts, setStarts] = useState(plan.starting_points.join("\n"));
  const [context, setContext] = useState(plan.context);
  const [verify, setVerify] = useState(plan.verify_in_repo.join("\n"));
  // 프로필 기본값(실행 환경·분량)은 개발 목적에만. 리서치·글쓰기 티켓에 Claude Code 런타임을 물려주지 않는다.
  const rtFor = (p: Purpose) => (PURPOSES[p].domain === "dev" ? workspace?.defaults.runtime ?? defaultRuntime(p) : defaultRuntime(p));
  const lenFor = (p: Purpose) => (PURPOSES[p].domain === "dev" ? workspace?.defaults.length ?? defaultLength(p) : defaultLength(p));
  const [runtime, setRuntime] = useState<Runtime>(rtFor(plan.purpose));
  const [length, setLength] = useState<PromptLength>(lenFor(plan.purpose));
  const [language, setLanguage] = useState<PromptLanguage>(workspace?.defaults.promptLanguage ?? "ko");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const purposeOptions = useMemo(() => DOMAIN_LIST.map((d) => ({
    label: DOMAINS[d].label,
    options: DOMAINS[d].purposes.map((p) => ({ value: p, label: `${DOMAINS[d].label} › ${PURPOSES[p].label}` })),
  })), []);
  const def = PURPOSES[purpose];
  const repoOptions = useMemo(() => Array.from(new Set([...(workspace?.repoNames ?? []), ...plan.repos])).map((r) => ({ value: r, label: r })), [workspace, plan.repos]);
  const merged = () => {
    const out: Record<string, string> = {};
    for (const q of plan.questions) { const v = answers[q.id]; if (v === "__other") { if (other[q.id]?.trim()) out[q.id] = other[q.id]!.trim(); } else if (v) out[q.id] = v; }
    return out;
  };
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const submit = (assumeRest: boolean) => {
    const a = merged();
    // where 질문에 답했으면 저장소로 반영
    const answeredRepos = a["where"] && !repos.length ? [a["where"]] : repos;
    const unanswered = plan.questions.filter((q) => !a[q.id]);
    const assumptions = [...plan.assumptions, ...(assumeRest ? unanswered.map((q) => { const n = plan.needs.find((x) => x.id === q.id); return n?.value ? `${n.label}: ${n.value}` : `${q.question} → 기본값으로 가정`; }) : [])];
    onGenerate({
      purpose, subtype, goal: goal.trim(), length, clarify: "assume_and_state", promptLanguage: language, includeStyleRules: false, runtime, provider: null,
      ticket: ticket.key, answers: a, assumptions,
      hints: { startingPoints: lines(starts), context: context.trim(), repos: answeredRepos, verifyInRepo: lines(verify) },
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
          <Typography.Text type="secondary" style={label(12)}>{ticket.type} · {ticket.status}{ticket.priority ? ` · ${ticket.priority}` : ""}{ticket.attachments.length ? ` · 첨부 ${ticket.attachments.length}` : ""}{ticket.comments.length ? ` · 댓글 ${ticket.comments.length}` : ""}{ticket.redactedPeople ? ` · 이름 ${ticket.redactedPeople}곳 역할명으로 바꿈` : ""}</Typography.Text>
          <a className="ml-auto text-[12px]" href={ticket.url} target="_blank" rel="noreferrer">Jira에서 열기</a>
        </div>
        <Typography.Paragraph type="secondary" style={{ ...label(12), marginTop: 6, marginBottom: 0 }} ellipsis={{ rows: 3, expandable: true, symbol: "더 보기" }}>{ticket.description || "(본문 없음)"}</Typography.Paragraph>
      </div>

      <Alert type="info" showIcon message={plan.summary} description={plan.questions.length ? "모델이 정리한 초안입니다. 아래 질문은 저장소를 읽어도 알 수 없는 것만 골랐습니다. 나머지는 가정으로 두었으니 틀린 곳만 고치세요." : "모델이 정리한 초안입니다. 물을 것이 없어 바로 만들 수 있습니다. 가정이 틀렸으면 아래에서 고치세요."} />
      {plan.missing_inputs.length > 0 && <Alert type="warning" showIcon message="티켓 밖에 있는 정보" description={<ul className="m-0 pl-5">{plan.missing_inputs.map((m, i) => <li key={i}>{m}</li>)}</ul>} />}
      {plan.suggested_purpose && purpose === plan.purpose && (
        <Alert type="warning" showIcon data-testid="purpose-suggestion" message={`분류를 '${PURPOSES[plan.suggested_purpose.purpose].label}'으로 바꾸는 것이 맞아 보입니다`} description={plan.suggested_purpose.why}
          action={<Button size="small" type="primary" onClick={() => { const v = plan.suggested_purpose!.purpose; setPurpose(v); setSubtype(null); setRuntime(rtFor(v)); setLength(lenFor(v)); }}>바꾸기</Button>} />
      )}
      {workspace && !workspace.exists && PURPOSES[purpose].domain === "dev" && (
        <Typography.Text type="secondary" style={label(12)}>작업 공간 프로필이 없어 저장소를 티켓 텍스트에서만 추측했습니다. 루트에 <code>studio.workspace.json</code>을 두면(예시: <code>studio.workspace.example.json</code>) 저장소·검증 명령·팀 규칙을 매번 묻지 않습니다.</Typography.Text>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Typography.Text type="secondary" style={label(12)}>분류</Typography.Text>
          <Select className="mt-1 w-full" value={purpose} onChange={(v) => { setPurpose(v); setSubtype(null); setRuntime(rtFor(v)); setLength(lenFor(v)); }} options={purposeOptions} />
          {isAgentRuntime(runtime) && AGENT_DEFAULTS[purpose] && <Typography.Text type="secondary" style={label(12)} className="mt-1 block" data-testid="scope-hint">이 분류의 첫 규칙: “{AGENT_DEFAULTS[purpose]!.scope.ko}” — 코드까지 고치게 하려면 분류를 <b>구현</b>으로.</Typography.Text>}
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
      <div>
        <Typography.Text type="secondary" style={label(12)}>대상 저장소{plan.repo_evidence ? <span style={{ opacity: .7 }}> · 코드가 확정: {plan.repo_evidence}</span> : null}</Typography.Text>
        <Select data-testid="ticket-repos" className="mt-1 w-full" mode="tags" placeholder="예: reporter-api (프로필이 있으면 목록에서 고릅니다)" value={repos} onChange={(v) => setRepos(v as string[])} options={repoOptions} tokenSeparators={[","]} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Typography.Text type="secondary" style={label(12)}>시작점 (한 줄에 하나 — 저장소: 클래스·메서드·URL·화면·검색어)</Typography.Text>
          <Input.TextArea className="mt-1" autoSize={{ minRows: 3, maxRows: 8 }} value={starts} onChange={(e) => setStarts(e.target.value)} placeholder="reporter-api: MerchantServiceCommandService.updateMasterCardStatus" />
        </div>
        <div>
          <Typography.Text type="secondary" style={label(12)}>맥락 (확정된 사실·정책·일정)</Typography.Text>
          <Input.TextArea className="mt-1" autoSize={{ minRows: 3, maxRows: 8 }} value={context} onChange={(e) => setContext(e.target.value)} />
        </div>
      </div>
      <div>
        <Typography.Text type="secondary" style={label(12)}>코드에서 확인할 것 (묻지 않고 프롬프트가 모델에게 시킵니다 — 한 줄에 하나)</Typography.Text>
        <Input.TextArea data-testid="ticket-verify" className="mt-1" autoSize={{ minRows: 2, maxRows: 6 }} value={verify} onChange={(e) => setVerify(e.target.value)} placeholder="예: CardCode.VISA 코드값을 enum에서 확인" />
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
      <NeedsLedger needs={plan.needs} />

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

/** 장부 보기: 항목마다 채움/질문/가정/코드에서 확인 중 어디로 갔고 왜 그런지. 질문 정책이 왜 그렇게 동작했는지 여기서 읽는다. */
export function NeedsLedger({ needs }: { needs: Need[] }) {
  if (!needs.length) return null;
  const color: Record<Need["status"], string> = { filled: "green", ask: "orange", assume: "gold", agent_can_find: "blue" };
  return (
    <Collapse size="small" ghost items={[{
      key: "needs",
      label: <Typography.Text type="secondary" style={{ fontSize: 12 }}>필요 정보 장부 {needs.length}개 — 무엇을 묻고 무엇을 가정했는지</Typography.Text>,
      children: (
        <ul className="m-0 flex flex-col gap-1 pl-0" style={{ listStyle: "none" }} data-testid="needs-ledger">
          {needs.map((n) => (
            <li key={n.id} className="text-[12.5px]">
              <Tag color={color[n.status]} style={{ fontSize: 11 }}>{NEED_STATUS_KO[n.status]}</Tag>
              <span className="font-medium">{n.label}</span>{n.value ? <span> — {n.value}</span> : null}
              <Typography.Text type="secondary" style={{ fontSize: 12 }} className="ml-2">{n.why}</Typography.Text>
            </li>
          ))}
        </ul>
      ),
    }]} />
  );
}
