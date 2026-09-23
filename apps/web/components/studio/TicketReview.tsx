"use client";
import { useMemo, useState } from "react";
import { Alert, App, Button, Collapse, Input, Radio, Segmented, Select, Space, Tag, Typography } from "antd";
import { PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { AGENT_DEFAULTS, DOMAINS, DOMAIN_LIST, PURPOSES, defaultLength, defaultRuntime, isAgentRuntime, suggestAliases, type Need, type ProfileOp, type PromptLanguage, type PromptLength, type Purpose, type Runtime, type StudioRequest, type Ticket, type TicketPlanResult } from "@grammer-hub/core";
import { api, type WorkspaceStatus } from "@/lib/api";
import { LANG_LABEL, LENGTH_KO, NEED_STATUS_KO, RUNTIME_LABEL } from "./labels";

/**
 * 티켓 검토: 모델이 정리한 분류·목표·저장소·시작점·맥락을 사용자가 고치고, (있으면) 질문에 답한 뒤 생성한다.
 * 질문은 장부(needs)에서 코드가 고른 것만 나온다. 나머지는 가정과 '코드에서 확인할 것'으로 보이고, 전부 여기서 고칠 수 있다.
 */
export function TicketReview({ ticket, plan, workspace, busy, onGenerate, onBack, onWorkspaceChanged }: {
  ticket: Ticket; plan: TicketPlanResult; workspace: WorkspaceStatus | null; busy: boolean; onGenerate: (req: StudioRequest) => void; onBack: () => void;
  /** 검토 화면의 "프로필에 추가"가 파일을 바꾼 뒤 최신 요약을 돌려준다 */
  onWorkspaceChanged?: (ws: WorkspaceStatus) => void;
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
        {PURPOSES[purpose].domain === "dev" && (
          <ProfileHints ticket={ticket} plan={plan} workspace={workspace} repos={repos.length ? repos : answers["where"] && answers["where"] !== "__other" ? [answers["where"]!] : []}
            onChanged={(ws) => onWorkspaceChanged?.(ws)} />
        )}
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

/**
 * "프로필에 추가": 지금 고른 저장소를 근거로 프로필의 빈 곳을 한 번 클릭으로 채운다. 프로필을 미리 완성하지 않아도 쓰면서 쌓이게 하는 장치.
 * - 프로필에 없는 저장소를 골랐다 → 설명 한 줄 받아 저장소로 추가(파일이 없으면 만든다)
 * - 코드가 확정하지 못해 사용자가 골랐다 → 티켓 제목 태그·라벨·컴포넌트 중 아직 모르는 것을 별칭 후보로(다음엔 묻지 않게)
 * - 고른 저장소에 검증 명령이 없다 → 명령 한 줄 받아 verify에(다음 프롬프트의 성공 기준에 들어간다)
 * 저장소를 하나만 골랐을 때만 나온다(둘 이상이면 어느 쪽 별칭인지 알 수 없다).
 */
function ProfileHints({ ticket, plan, workspace, repos, onChanged }: { ticket: Ticket; plan: TicketPlanResult; workspace: WorkspaceStatus | null; repos: string[]; onChanged: (ws: WorkspaceStatus) => void }) {
  const { message } = App.useApp();
  const [what, setWhat] = useState("");
  const [cmd, setCmd] = useState("");
  const [busyOp, setBusyOp] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const small = { fontSize: 12 } as const;
  if (!workspace || workspace.error || dismissed || repos.length !== 1) return null;
  const name = repos[0]!.trim();
  if (!name) return null;
  const known = workspace.repos.find((r) => r.name.toLowerCase() === name.toLowerCase()) ?? null;
  // 코드가 이 저장소를 확정했다면 별칭은 이미 충분하다
  const codeResolved = Boolean(plan.repo_evidence) && plan.repos.some((r) => r.toLowerCase() === name.toLowerCase());
  const aliasCandidates = known && !codeResolved ? suggestAliases(workspace, ticket) : [];
  const needsVerify = Boolean(known && known.verify.length === 0);
  if (known && aliasCandidates.length === 0 && !needsVerify) return null;

  const apply = async (key: string, ops: ProfileOp[]) => {
    setBusyOp(key);
    try {
      const r = await api.settings.patchWorkspace(ops);
      message.success(r.changes.length ? `프로필에 추가: ${r.changes.join(", ")}` : "이미 프로필에 있습니다");
      onChanged(r.workspace);
      setWhat(""); setCmd("");
    } catch (e) { message.error(`프로필에 추가하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusyOp(null); }
  };

  return (
    <div className="mt-2 rounded-lg border border-dashed p-2" style={{ borderColor: "var(--ant-color-border-secondary)" }} data-testid="profile-hints">
      <div className="flex items-start justify-between gap-2">
        <Typography.Text type="secondary" style={small}>작업 공간 프로필에 적어 두면 다음 티켓부터 묻지 않습니다. {workspace.exists ? "" : "아직 프로필 파일이 없어 처음 추가할 때 만들어집니다."}</Typography.Text>
        <Button size="small" type="text" onClick={() => setDismissed(true)} style={small}>이번엔 넘기기</Button>
      </div>
      {!known && (
        <div className="mt-1 flex flex-wrap items-center gap-2" data-testid="profile-hint-repo">
          <Typography.Text style={{ fontSize: 12.5 }}><code>{name}</code>은(는) 프로필에 없는 저장소입니다.</Typography.Text>
          <Input size="small" style={{ width: 280 }} placeholder="무슨 시스템인지 한 줄 (예: 가맹점 어드민 API)" value={what} onChange={(e) => setWhat(e.target.value)} data-testid="profile-hint-what" />
          <Button size="small" icon={<PlusOutlined />} loading={busyOp === "repo"} disabled={!what.trim()} data-testid="profile-hint-add-repo"
            onClick={() => void apply("repo", [{ op: "add_repo", name, what: what.trim(), aliases: [], verify: [] }])}>저장소로 추가</Button>
        </div>
      )}
      {aliasCandidates.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-2" data-testid="profile-hint-aliases">
          <Typography.Text style={{ fontSize: 12.5 }}>이 티켓의 태그·라벨을 <code>{name}</code>의 별칭으로:</Typography.Text>
          {aliasCandidates.map((a) => (
            <Button key={a} size="small" icon={<PlusOutlined />} loading={busyOp === `alias:${a}`} data-testid="profile-hint-alias"
              onClick={() => void apply(`alias:${a}`, [{ op: "add_alias", repo: name, alias: a }])}>{a}</Button>
          ))}
        </div>
      )}
      {needsVerify && (
        <div className="mt-1 flex flex-wrap items-center gap-2" data-testid="profile-hint-verify">
          <Typography.Text style={{ fontSize: 12.5 }}><code>{name}</code>의 검증 명령이 프로필에 없습니다.</Typography.Text>
          <Input size="small" style={{ width: 240, fontFamily: "ui-monospace, Menlo, monospace" }} placeholder="./gradlew test" value={cmd} onChange={(e) => setCmd(e.target.value)} data-testid="profile-hint-cmd" onPressEnter={() => { if (cmd.trim()) void apply("verify", [{ op: "add_verify", repo: name, command: cmd.trim() }]); }} />
          <Button size="small" icon={<PlusOutlined />} loading={busyOp === "verify"} disabled={!cmd.trim()} data-testid="profile-hint-add-verify"
            onClick={() => void apply("verify", [{ op: "add_verify", repo: name, command: cmd.trim() }])}>검증 명령으로 추가</Button>
        </div>
      )}
    </div>
  );
}
