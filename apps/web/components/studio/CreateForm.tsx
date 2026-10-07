"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Input, Modal, Popconfirm, Segmented, Select, Space, Switch, Tooltip, Typography } from "antd";
import { ArrowRightOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, SaveOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { AGENT_DEFAULTS, DOMAINS, DOMAIN_LIST, PURPOSES, defaultLength, defaultRuntime, isAgentRuntime, type ClarifyPolicy, type Domain, type PresetSettings, type PromptLanguage, type PromptLength, type Purpose, type Runtime, type StudioRequest } from "@grammer-hub/core";
import { api, type Preset, type WorkspaceStatus } from "@/lib/api";
import { useAuth } from "@/components/providers/AppProviders";
import { DRAFT_BASE, draftKey } from "@/lib/studio-draft";
import { CLARIFY_KO, LANG_LABEL, LENGTH_KO, RUNTIME_LABEL_LONG as RUNTIME_LABEL } from "./labels";

type Draft = Pick<StudioRequest, "purpose" | "subtype" | "goal" | "length" | "clarify" | "promptLanguage" | "includeStyleRules"> & { runtime?: Runtime | null | undefined; repos?: string[] | undefined };
function loadDraft(key: string): Draft | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as Draft) : null; } catch { return null; }
}

/**
 * 만들기 폼. 실패해서 폼으로 돌아와도 입력이 남도록 (1) 마지막 요청(initial)에서 복원하고 (2) 입력값을 localStorage에 임시 저장한다.
 * 새로고침해도 마지막 목표가 살아 있다. 목표를 비우면 임시 저장을 지우고(지운 목표가 되살아나지 않게), 보관함에 저장한 뒤에도 지운다.
 * 임시 저장은 로그인 모드면 사람별 키(lib/studio-draft). 위쪽 프리셋은 목표 문장 없이 설정만 서버에 사람별로 저장한다.
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
  const [repos, setRepos] = useState<string[]>(() => initial?.hints?.repos ?? []);
  const [restored, setRestored] = useState(false);
  // 연동 상태(Jira 설정, 작업 공간 프로필). 한 번만 읽는다. 실패해도 폼은 동작한다.
  const [status, setStatus] = useState<{ configured: boolean; workspace: WorkspaceStatus } | null>(null);
  useEffect(() => { api.prompts.ticketConfigured().then(setStatus).catch(() => setStatus(null)); }, []);

  // 임시 저장 키는 로그인 상태를 안 뒤에 정해진다(그 전에는 읽지도 쓰지도 않는다)
  const me = useAuth();
  const key = me ? draftKey(me) : null;
  const restoredOnce = useRef(false);
  // 마지막 요청이 없을 때만(첫 진입) 임시 저장분을 복원한다. 아래 저장 효과보다 먼저 선언해야 지우기 전에 읽는다
  useEffect(() => {
    if (!key || restoredOnce.current) return;
    restoredOnce.current = true;
    // 로그인 모드에서 예전 공용 키에 남은 입력은 누구 것인지 모르므로 버린다
    if (me?.authEnabled) { try { localStorage.removeItem(DRAFT_BASE); } catch { /* 저장소를 못 쓰면 지울 것도 없다 */ } }
    if (seed) return;
    const d = loadDraft(key);
    if (d && d.goal && !goal.trim()) {   // 키가 정해지기 전에 이미 입력을 시작했으면 덮지 않는다
      setDomain(PURPOSES[d.purpose]?.domain ?? "dev"); setPurpose(d.purpose); setSubtype(d.subtype ?? null); setGoal(d.goal);
      setLength(d.length); setClarify(d.clarify ?? "ask_first"); setLanguage(d.promptLanguage); setIncludeStyleRules(d.includeStyleRules); setRuntime(d.runtime ?? defaultRuntime(d.purpose)); setRepos(d.repos ?? []); setRestored(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!key) return;
    try {
      // 목표가 비면 지운다 — 남겨 두면 지운 목표가 새로고침 뒤 되살아난다
      if (goal.trim()) localStorage.setItem(key, JSON.stringify({ purpose, subtype, goal, length, clarify, promptLanguage: language, includeStyleRules, runtime, repos } satisfies Draft));
      else localStorage.removeItem(key);
    } catch { /* 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)면 임시 저장 없이 동작 */ }
  }, [key, purpose, subtype, goal, length, clarify, language, includeStyleRules, runtime, repos]);

  // 설정 프리셋(목표 문장 제외). 고르면 값을 채우고, 지금 설정을 이름 붙여 저장한다
  const { message } = App.useApp();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<{ mode: "create" | "rename"; name: string } | null>(null);
  const loadPresets = useCallback(() => { api.presets.list().then(setPresets).catch(() => setPresets([])); }, []);
  useEffect(() => { loadPresets(); }, [loadPresets]);
  const currentSettings = (): PresetSettings => ({ purpose, subtype, length, runtime, promptLanguage: language, includeStyleRules, repos, clarify });
  const applyPreset = (id: string | null) => {
    setPresetId(id);
    const v = presets.find((x) => x.id === id)?.settings; if (!v) return;
    setDomain(PURPOSES[v.purpose].domain); setPurpose(v.purpose); setSubtype(v.subtype); setLength(v.length); setRuntime(v.runtime);
    setLanguage(v.promptLanguage); setIncludeStyleRules(v.includeStyleRules); setRepos(v.repos); setClarify(v.clarify);
  };
  const savePresetName = async () => {
    if (!nameDialog?.name.trim()) return;
    const cur = presets.find((x) => x.id === presetId);
    try {
      const row = nameDialog.mode === "rename" && cur?.settings
        ? await api.presets.save({ id: cur.id, name: nameDialog.name.trim(), settings: cur.settings })
        : await api.presets.save({ name: nameDialog.name.trim(), settings: currentSettings() });
      setNameDialog(null); setPresetId(row.id); loadPresets();
      message.success(nameDialog.mode === "rename" ? "이름을 바꿨습니다" : "현재 설정을 프리셋으로 저장했습니다(목표 문장은 넣지 않습니다)");
    } catch (e) { message.error(`저장 실패: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const removePreset = async () => {
    if (!presetId) return;
    try { await api.presets.remove(presetId); setPresetId(null); loadPresets(); message.success("프리셋을 지웠습니다"); }
    catch (e) { message.error(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`); }
  };

  /** 처음부터: 모든 값을 기본값으로, 임시 저장 삭제(위 효과가 빈 목표를 보고 지운다), 티켓 입력도 비움. */
  const resetAll = () => {
    setDomain("dev"); setPurpose("investigate"); setSubtype(null); setGoal(""); setLength(defaultLength("investigate")); setRuntime(defaultRuntime("investigate"));
    setClarify("ask_first"); setLanguage("ko"); setIncludeStyleRules(false); setRepos([]); setTicketInput(""); setRestored(false); setPresetId(null);
  };

  const def = PURPOSES[purpose];
  const sub = useMemo(() => def.subtypes.find((s) => s.id === subtype) ?? null, [def, subtype]);
  const canRun = goal.trim().length >= 4 && !busy;

  const submit = () => onSubmit({ purpose, subtype, goal: goal.trim(), length, clarify, promptLanguage: language, includeStyleRules, runtime, provider: null, ...(repos.length ? { hints: { repos } } : {}) });
  const ws = status?.workspace ?? null;
  const wsLine = ws === null ? null : !ws.exists
    ? <>작업 공간 프로필 없음 — 루트에 <code>studio.workspace.json</code>을 두면(예시 <code>studio.workspace.example.json</code>) 저장소·검증 명령·팀 규칙을 매번 묻지 않습니다.</>
    : ws.error ? <>작업 공간 프로필 오류: {ws.error}</>
    : <>작업 공간 프로필 · 저장소 {ws.summary?.repos ?? 0}개 · 팀 규칙 {ws.summary?.conventions ?? 0}개{ws.summary?.team ? ` · ${ws.summary.team}` : ""}</>;
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
          <Typography.Text type="secondary" style={{ fontSize: 12 }} className="mt-1 block" data-testid="ticket-status">
            {status ? (status.configured ? "Jira 연동 켜짐" : "Jira 연동 꺼짐 — `.env`에 JIRA_BASE_URL · JIRA_EMAIL · JIRA_API_TOKEN") : "연동 상태 확인 중…"} · 토큰 없이 흐름만 보려면 <code>DEMO-1</code>(자세한 티켓) / <code>DEMO-2</code>(제목뿐인 티켓)
          </Typography.Text>
          {wsLine && <Typography.Text type="secondary" style={{ fontSize: 12 }} className="block" data-testid="workspace-status">{wsLine}</Typography.Text>}
        </div>
        {error && <Alert type="error" showIcon message="가져오기에 실패했습니다." description={error} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented data-testid="studio-mode" value={mode} onChange={(v) => setMode(v as typeof mode)} options={[{ value: "manual", label: "직접 입력" }, { value: "ticket", label: "Jira 티켓" }]} />
        <Tooltip title="목적·분량·실행 환경 등 모든 값을 기본값으로 되돌리고 임시 저장을 지웁니다">
          <Button data-testid="studio-reset" size="small" icon={<ReloadOutlined />} onClick={resetAll}>처음부터</Button>
        </Tooltip>
        <span className="ml-auto" />
        <Select data-testid="studio-preset" size="small" style={{ minWidth: 200 }} allowClear placeholder="설정 프리셋" value={presetId ?? undefined} onChange={(v) => applyPreset(v ?? null)}
          options={presets.map((p) => ({ value: p.id, label: p.settings ? p.name : `${p.name} (옛 설정 — 골라서 지운 뒤 다시 저장)` }))} notFoundContent={<Typography.Text type="secondary" style={{ fontSize: 12 }}>저장한 프리셋이 없습니다</Typography.Text>} />
        {presetId && presets.find((x) => x.id === presetId)?.settings && <Tooltip title="이름 바꾸기"><Button size="small" icon={<EditOutlined />} onClick={() => setNameDialog({ mode: "rename", name: presets.find((x) => x.id === presetId)?.name ?? "" })} /></Tooltip>}
        {presetId && <Popconfirm title="이 프리셋을 지울까요?" okText="삭제" okButtonProps={{ danger: true }} onConfirm={() => void removePreset()}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>}
        <Tooltip title="목적·세부 유형·분량·실행 환경·언어·어투 규칙·대상 저장소·질문 정책을 이름 붙여 저장합니다(목표 문장 제외)">
          <Button data-testid="preset-save" size="small" icon={<SaveOutlined />} onClick={() => setNameDialog({ mode: "create", name: `${PURPOSES[purpose].label} · ${RUNTIME_LABEL[runtime]}` })}>현재 설정 저장</Button>
        </Tooltip>
      </div>
      <Modal open={nameDialog !== null} title={nameDialog?.mode === "rename" ? "프리셋 이름 바꾸기" : "현재 설정을 프리셋으로 저장"} okText="저장" cancelText="취소"
        onOk={() => void savePresetName()} onCancel={() => setNameDialog(null)} okButtonProps={{ disabled: !nameDialog?.name.trim() }} destroyOnHidden>
        <Input data-testid="preset-name" maxLength={40} value={nameDialog?.name ?? ""} onChange={(e) => setNameDialog((d) => (d ? { ...d, name: e.target.value } : d))} onPressEnter={() => void savePresetName()} />
      </Modal>
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
        {isAgentRuntime(runtime) && AGENT_DEFAULTS[purpose] && <Typography.Text type="secondary" style={{ fontSize: 12 }} className="mt-1 block">이 분류의 첫 규칙: “{AGENT_DEFAULTS[purpose]!.scope.ko}”</Typography.Text>}
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

      {domain === "dev" && ws?.exists && ws.repoNames.length > 0 && (
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>대상 저장소 <span style={{ opacity: .7 }}>(프로필에서 · 비우면 목표 문장에서 찾고, 못 찾으면 묻습니다)</span></Typography.Text>
          <Select data-testid="studio-repos" className="mt-1 w-full" mode="multiple" allowClear placeholder="예: reporter-api" value={repos} onChange={(v) => setRepos(v as string[])} options={ws.repoNames.map((r) => ({ value: r, label: r }))} />
        </div>
      )}
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>목표 — 프롬프트를 받은 모델이 끝냈을 때 무엇을 손에 쥐어야 하나</Typography.Text>
        <Input.TextArea data-testid="studio-goal" className="mt-1" autoSize={{ minRows: 3, maxRows: 8 }} maxLength={2000} showCount allowClear value={goal} onChange={(e) => setGoal(e.target.value)}
          placeholder={PLACEHOLDER[domain]} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) submit(); }} />
      </div>

      <div>
        <Tooltip title="Claude Code·Codex: 에이전트가 저장소를 직접 읽으므로 코드를 붙여넣지 않고 시작점(저장소·경로·클래스·검색어)만 줍니다. Codex는 system 프롬프트가 없어 한 덩어리로 렌더합니다. 채팅: 자료를 붙여넣는 입력 변수를 만듭니다.">
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

      {domain === "dev" && wsLine && !ws?.exists && <Typography.Text type="secondary" style={{ fontSize: 12 }} data-testid="workspace-status">{wsLine}</Typography.Text>}
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
