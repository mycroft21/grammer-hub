"use client";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Segmented, Select, Space, Switch, Tooltip, Typography } from "antd";
import { ArrowRightOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { DOMAINS, DOMAIN_LIST, PURPOSES, defaultLength, defaultRuntime, type ClarifyPolicy, type Domain, type PromptLanguage, type PromptLength, type Purpose, type Runtime, type StudioRequest } from "@grammer-hub/core";
import { CLARIFY_KO, LANG_LABEL, LENGTH_KO } from "./labels";

const DRAFT_KEY = "gh:studio:draft";
type Draft = Pick<StudioRequest, "purpose" | "subtype" | "goal" | "length" | "clarify" | "promptLanguage" | "includeStyleRules"> & { runtime?: Runtime | null | undefined };
const RUNTIME_LABEL: Record<Runtime, string> = { claude_code: "Claude Code (저장소 직접 탐색)", chat: "채팅 (자료 붙여넣기)" };
function loadDraft(): Draft | null {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? (JSON.parse(raw) as Draft) : null; } catch { return null; }
}

/**
 * 만들기 폼. 실패해서 폼으로 돌아와도 입력이 남도록 (1) 마지막 요청(initial)에서 복원하고 (2) 입력값을 localStorage에 임시 저장한다.
 * 새로고침해도 마지막 목표가 살아 있다. 보관함에 저장한 뒤에는 임시 저장을 지운다.
 */
export function CreateForm({ busy, error, initial, onSubmit, onTicket }: { busy: boolean; error: string | null; initial?: StudioRequest | null; onSubmit: (req: StudioRequest) => void; onTicket?: (input: string) => void }) {
  const [mode, setMode] = useState<"manual" | "ticket">(() => (initial?.ticket ? "ticket" : "manual"));
  const [ticketInput, setTicketInput] = useState(() => initial?.ticket ?? "");
  const seed: Draft | null = initial ?? null;
  const [domain, setDomain] = useState<Domain>(() => (seed ? PURPOSES[seed.purpose].domain : "dev"));
  const [purpose, setPurpose] = useState<Purpose>(() => seed?.purpose ?? "investigate");
  const [subtype, setSubtype] = useState<string | null>(() => seed?.subtype ?? null);
  const [goal, setGoal] = useState(() => seed?.goal ?? "");
  const [length, setLength] = useState<PromptLength>(() => seed?.length ?? defaultLength(seed?.purpose ?? "investigate"));
  const [runtime, setRuntime] = useState<Runtime>(() => seed?.runtime ?? defaultRuntime(seed?.purpose ?? "investigate"));
  const [clarify, setClarify] = useState<ClarifyPolicy>(() => seed?.clarify ?? "ask_first");
  const [language, setLanguage] = useState<PromptLanguage>(() => seed?.promptLanguage ?? "ko");
  const [includeStyleRules, setIncludeStyleRules] = useState(() => seed?.includeStyleRules ?? false);
  const [restored, setRestored] = useState(false);

  // 마지막 요청이 없을 때만(첫 진입) 임시 저장분을 복원한다
  useEffect(() => {
    if (seed) return;
    const d = loadDraft();
    if (d && d.goal) {
      setDomain(PURPOSES[d.purpose]?.domain ?? "dev"); setPurpose(d.purpose); setSubtype(d.subtype ?? null); setGoal(d.goal);
      setLength(d.length); setClarify(d.clarify); setLanguage(d.promptLanguage); setIncludeStyleRules(d.includeStyleRules); setRuntime(d.runtime ?? defaultRuntime(d.purpose)); setRestored(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try { if (goal.trim()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ purpose, subtype, goal, length, clarify, promptLanguage: language, includeStyleRules, runtime } satisfies Draft)); } catch { /* noop */ }
  }, [purpose, subtype, goal, length, clarify, language, includeStyleRules, runtime]);

  const def = PURPOSES[purpose];
  const sub = useMemo(() => def.subtypes.find((s) => s.id === subtype) ?? null, [def, subtype]);
  const canRun = goal.trim().length >= 4 && !busy;

  const submit = () => onSubmit({ purpose, subtype, goal: goal.trim(), length, clarify, promptLanguage: language, includeStyleRules, runtime, provider: null });
  // 대분류가 바뀌면 실행 환경·길이 기본값을 따라 바꾼다(개발 = Claude Code·짧게)
  const pickDomain = (d: Domain) => { const p = DOMAINS[d].purposes[0]!; setDomain(d); setPurpose(p); setSubtype(null); setRuntime(defaultRuntime(p)); setLength(defaultLength(p)); };

  if (mode === "ticket") {
    return (
      <div className="flex flex-col gap-4">
        <Segmented data-testid="studio-mode" value={mode} onChange={(v) => setMode(v as typeof mode)} options={[{ value: "manual", label: "직접 입력" }, { value: "ticket", label: "Jira 티켓" }]} />
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Jira 이슈 URL 또는 키 — 가져와서 분류·목표·시작점을 정리한 뒤 확인하고 만듭니다</Typography.Text>
          <Space.Compact className="mt-1 w-full">
            <Input data-testid="ticket-input" placeholder="https://xxx.atlassian.net/browse/EP-1174 또는 EP-1174" value={ticketInput} onChange={(e) => setTicketInput(e.target.value)}
              onPressEnter={() => { if (ticketInput.trim() && onTicket) onTicket(ticketInput.trim()); }} />
            <Button data-testid="ticket-fetch" type="primary" loading={busy} disabled={!ticketInput.trim() || !onTicket} onClick={() => onTicket?.(ticketInput.trim())}>가져와서 정리</Button>
          </Space.Compact>
          <Typography.Text type="secondary" style={{ fontSize: 12 }} className="mt-1 block">`.env`에 JIRA_BASE_URL · JIRA_EMAIL · JIRA_API_TOKEN 이 필요합니다. 토큰 없이 흐름만 보려면 <code>DEMO-1</code>.</Typography.Text>
        </div>
        {error && <Alert type="error" showIcon message="가져오기에 실패했습니다." description={error} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Segmented data-testid="studio-mode" value={mode} onChange={(v) => setMode(v as typeof mode)} options={[{ value: "manual", label: "직접 입력" }, { value: "ticket", label: "Jira 티켓" }]} />
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>목적</Typography.Text>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Segmented data-testid="studio-domain" value={domain} onChange={(v) => pickDomain(v as Domain)}
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

      <div>
        <Tooltip title="Claude Code: 대상 모델이 저장소를 직접 읽으므로 코드를 붙여넣지 않고 시작점(URL·경로·키워드)만 줍니다. 채팅: 자료를 붙여넣는 입력 변수를 만듭니다.">
          <Typography.Text type="secondary" style={{ fontSize: 12 }} className="block">실행 환경</Typography.Text>
        </Tooltip>
        <Segmented data-testid="studio-runtime" size="small" value={runtime} onChange={(v) => setRuntime(v as Runtime)} options={(Object.keys(RUNTIME_LABEL) as Runtime[]).map((k) => ({ value: k, label: RUNTIME_LABEL[k] }))} />
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
      {restored && !error && <Alert type="info" showIcon closable onClose={() => setRestored(false)} message="마지막에 입력하던 목표를 복원했습니다." style={{ padding: "6px 12px" }} />}
      {error && <Alert type="error" showIcon message="생성에 실패했습니다. 입력은 그대로 남아 있습니다." description={error}
        action={<Button size="small" type="primary" disabled={!canRun} onClick={submit}>다시 시도</Button>} />}

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
