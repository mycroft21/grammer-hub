"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Card, Input, Select, Skeleton, Space, Switch, Tag, Tooltip, Typography } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { api, type HealthDto, type ProbeDto, type ProbeTarget, type SettingDefDto, type SettingsDto, type WorkspaceFileDto } from "@/lib/api";
import { PageHeader, errMsg } from "./_shared";
import { WorkspaceEditor } from "@/components/settings/WorkspaceEditor";

const GROUP: Record<SettingDefDto["group"], { title: string; desc: string }> = {
  backend: { title: "모델 연결", desc: "교정·프롬프트 생성을 어느 모델로, 무엇으로 인증해 돌릴지." },
  jira: { title: "Jira", desc: "티켓 → 프롬프트에 쓰는 읽기 전용 연결. 셋 다 있어야 켜진다. 없어도 DEMO-1·DEMO-2로 흐름은 볼 수 있다." },
  team: { title: "팀 서버 로그인 (OIDC)", desc: "발급자·클라이언트 ID·시크릿이 다 있으면 로그인이 켜지고, 그때부터 이 화면은 관리자만 연다. 자기 이메일을 관리자에 먼저 넣고 저장할 것." },
  behavior: { title: "동작·저장", desc: "기록·로그·파일 위치." },
};

/**
 * 설정 화면. 루트 .env를 대신 편집한다(비밀값은 끝 4자만 보임). 저장하면 대부분 즉시 반영, 재시작이 필요한 항목은 표시.
 * 아래 작업 공간 프로필 편집기(WorkspaceEditor)는 studio.workspace.json을 폼·JSON·가져오기로 편집해 검증 후 저장한다.
 */
export function SettingsPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<SettingsDto | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});   // 바뀐 키만
  const [saving, setSaving] = useState(false);
  const [restart, setRestart] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthDto | null>(null);
  const [ws, setWs] = useState<WorkspaceFileDto | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, w, h] = await Promise.all([api.settings.get(), api.settings.workspace(), api.settings.health(false)]);
      setData(s); setWs(w); setHealth(h);
    } catch (e) { message.error(`설정을 불러오지 못했습니다: ${errMsg(e)}`); }
  }, [message]);
  useEffect(() => { void reload(); }, [reload]);

  const current = useMemo(() => Object.fromEntries((data?.items ?? []).map((i) => [i.key, i])), [data]);
  const effective = (key: string) => (key in draft ? draft[key]! : current[key]?.masked ? "" : current[key]?.value ?? "");
  const visible = (d: SettingDefDto) => !d.showWhen || d.showWhen[1].includes(effective(d.showWhen[0]) || defaultOf(d.showWhen[0]));
  const dirty = Object.keys(draft).length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.settings.save(draft);
      setData((prev) => ({ ...r, defs: r.defs ?? prev?.defs ?? [] })); setDraft({}); setRestart(r.restart);
      message.success(r.restart.length ? "저장했습니다. 일부 항목은 서버를 재시작해야 반영됩니다." : "저장했습니다. 바로 반영됩니다.");
      setHealth(await api.settings.health(false));
    } catch (e) { message.error(`저장 실패: ${errMsg(e)}`); } finally { setSaving(false); }
  };
  /** 프로필 저장 후 상단 상태 줄(프로필 n개 저장소)도 맞춘다 */
  const onWorkspaceSaved = async (f: WorkspaceFileDto) => { setWs(f); try { setHealth(await api.settings.health(false)); } catch { /* 상태 줄만 */ } };

  if (!data) return <div><PageHeader title="설정" description="관리자 설정 — 모델 연결·Jira 앱·로그인·팀 작업 공간. 루트 .env 파일을 대신 편집합니다. 화면 취향·내 작업 공간은 '내 설정'에서." /><Skeleton active /></div>;

  const groups = (["backend", "jira", "team", "behavior"] as const);
  const small = { fontSize: 12 } as const;
  return (
    <div className="flex flex-col gap-4" data-testid="settings-page">
      <PageHeader title="설정" description={`관리자 설정 — 팀 전체에 적용됩니다. 저장하면 ${data.envFile} 에 쓰고 대부분 즉시 반영됩니다. 화면 취향·내 작업 공간은 '내 설정'에서.`}
        extra={<Space><Button icon={<ReloadOutlined />} onClick={() => void reload()}>다시 읽기</Button><Button data-testid="settings-save" type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={() => void save()}>저장{dirty ? ` (${Object.keys(draft).length})` : ""}</Button></Space>} />

      {health && (
        <Alert type={health.cloud.ready ? "success" : "warning"} showIcon
          message={<span data-testid="settings-health">클라우드 자리: <b>{health.cloud.backend}</b> · 모델 {health.cloud.model} · {health.cloud.ready ? "준비됨" : "준비 안 됨 — API 키를 넣거나 클라우드 방식을 바꾸세요"} · Jira {health.jira.configured ? "켜짐" : "꺼짐"} · 로그인 {health.auth?.enabled ? `켜짐 (관리자 ${health.auth.admins}명${health.auth.sessionSecretSet ? "" : " · AUTH_SECRET 없음"})` : "꺼짐(단일 사용자)"} · 프로필 {health.workspace.exists ? `${health.workspace.repos ?? 0}개 저장소` : "없음"}</span>}
          description={<Typography.Text type="secondary" style={small}>실제 연결은 아래 카드마다 있는 &apos;연결 확인&apos;으로 봅니다.</Typography.Text>} />
      )}
      {restart.length > 0 && <Alert type="info" showIcon message={`재시작 필요: ${restart.join(", ")} — 터미널에서 서버를 다시 띄우면(pnpm start) 반영됩니다.`} closable onClose={() => setRestart([])} />}
      {!data.exists && <Alert type="info" showIcon message={`${data.envFile} 파일이 아직 없습니다. 저장하면 .env.example을 바탕으로 만들어집니다.`} />}

      

      {groups.map((g) => (
        <Card key={g} size="small" title={GROUP[g].title} extra={<Typography.Text type="secondary" style={small}>{GROUP[g].desc}</Typography.Text>}>
          <div className="grid gap-3 md:grid-cols-2">
            {data.defs.filter((d) => d.group === g && visible(d)).map((d) => {
              const cur = current[d.key];
              const changed = d.key in draft;
              const set = (v: string) => setDraft((x) => ({ ...x, [d.key]: v }));
              return (
                <div key={d.key} data-testid={`setting-${d.key}`}>
                  <div className="flex items-center gap-2">
                    <Typography.Text strong style={{ fontSize: 13 }}>{d.label}</Typography.Text>
                    <Typography.Text type="secondary" style={small}><code>{d.key}</code></Typography.Text>
                    {d.restart && <Tag style={{ fontSize: 11 }}>재시작 필요</Tag>}
                    {cur?.source === "os" && <Tooltip title="OS 환경 변수로 들어온 값. .env에 저장하면 그쪽이 우선합니다."><Tag style={{ fontSize: 11 }}>OS 환경</Tag></Tooltip>}
                    {changed && <Tag color="gold" style={{ fontSize: 11 }}>변경됨</Tag>}
                  </div>
                  <div className="mt-1">
                    {d.kind === "select" && <Select className="w-full" value={effective(d.key) || defaultOf(d.key)} onChange={set} options={d.options ?? []} />}
                    {d.kind === "bool" && <Space><Switch checked={(effective(d.key) || "true") !== "false"} onChange={(v) => set(v ? "true" : "false")} /><Typography.Text type="secondary" style={small}>{(effective(d.key) || "true") !== "false" ? "켜짐" : "꺼짐"}</Typography.Text></Space>}
                    {d.kind === "text" && <Input value={effective(d.key)} placeholder={d.placeholder} onChange={(e) => set(e.target.value)} allowClear />}
                    {d.kind === "secret" && (
                      <Space.Compact className="w-full">
                        <Input.Password value={draft[d.key] ?? ""} placeholder={cur?.set ? `저장됨 ${cur.value} — 바꾸려면 새 값 입력` : d.placeholder ?? "비어 있음"} onChange={(e) => set(e.target.value)} autoComplete="off" />
                        {cur?.set && <Button danger onClick={() => set("")}>지우기</Button>}
                      </Space.Compact>
                    )}
                  </div>
                  <Typography.Text type="secondary" style={small} className="mt-1 block">{d.help}</Typography.Text>
                </div>
              );
            })}
          </div>
          {PROBES[g] && <ProbeBar dirty={dirty} targets={PROBES[g]!.map((t) => (t.target === "cloud" && (effective("CLOUD_BACKEND") || defaultOf("CLOUD_BACKEND")) === "claude-cli" ? { ...t, note: "claude -p로 짧게 한 번 실제 호출합니다(구독 사용량이 조금 듭니다)" } : t))} />}
        </Card>
      ))}

      <WorkspaceEditor file={ws} onSaved={(f) => void onWorkspaceSaved(f)} />

      <Typography.Text type="secondary" style={small}>
        비밀값(API 키·토큰)은 이 컴퓨터의 .env에만 저장되고 화면에는 끝 4자만 보입니다. 이 앱은 인증 없이 로컬에서 쓰는 단일 사용자용이므로, 다른 사람에게 줄 때는 각자 자기 컴퓨터에서 설정하게 하세요. 터미널에서 확인하려면 <code>pnpm health</code>.
      </Typography.Text>
    </div>
  );
}

/** 카드별 연결 확인 대상. 실제 외부 호출을 하므로 관리자만(서버가 requireAdmin). */
const PROBES: Partial<Record<SettingDefDto["group"], { target: ProbeTarget; label: string; note?: string }[]>> = {
  backend: [{ target: "cloud", label: "모델 연결 확인" }, { target: "local", label: "로컬 LLM 확인" }],
  jira: [{ target: "jira", label: "Jira 연결 확인", note: "계정 정보(/myself)를 읽어 봅니다" }],
  team: [{ target: "oidc", label: "로그인 설정 확인", note: "발급자 문서 → 콜백 URL → 클라이언트 시크릿 순으로 봅니다" }],
};
const STATE_ICON = {
  ok: <CheckCircleOutlined style={{ color: "var(--color-primary)" }} />,
  warn: <ExclamationCircleOutlined style={{ color: "var(--ant-color-warning)" }} />,
  fail: <CloseCircleOutlined style={{ color: "var(--color-danger)" }} />,
} as const;

function ProbeBar({ targets, dirty }: { targets: { target: ProbeTarget; label: string; note?: string }[]; dirty: boolean }) {
  const { message } = App.useApp();
  const [results, setResults] = useState<Partial<Record<ProbeTarget, ProbeDto>>>({});
  const [busy, setBusy] = useState<ProbeTarget | null>(null);
  const run = async (t: ProbeTarget) => {
    setBusy(t);
    try { const r = await api.settings.probe(t); setResults((x) => ({ ...x, [t]: r })); }
    catch (e) { message.error(`연결 확인 실패: ${errMsg(e)}`); }
    finally { setBusy(null); }
  };
  const small = { fontSize: 12 } as const;
  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--ant-color-border-secondary)" }}>
      {targets.map((t) => {
        const r = results[t.target];
        return (
          <div key={t.target}>
            <Space wrap>
              <Button size="small" data-testid={`probe-${t.target}`} loading={busy === t.target} disabled={busy !== null && busy !== t.target} onClick={() => void run(t.target)}>{t.label}</Button>
              {t.note && <Typography.Text type="secondary" style={small}>{t.note}</Typography.Text>}
              {dirty && <Typography.Text type="warning" style={small}>저장한 값으로 확인합니다</Typography.Text>}
            </Space>
            {r && (
              <div className="mt-1 flex flex-col gap-0.5" data-testid={`probe-result-${t.target}`}>
                {r.steps.map((s, i) => (
                  <Typography.Text key={i} style={small}>{STATE_ICON[s.state]} <b>{s.label}</b> {s.detail}</Typography.Text>
                ))}
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>{new Date(r.checkedAt).toLocaleTimeString("ko-KR")} 확인</Typography.Text>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const DEFAULTS: Record<string, string> = { DEFAULT_PROVIDER: "cloud", CLOUD_BACKEND: "api", STORE_DRAFTS: "true" };
const defaultOf = (key: string) => DEFAULTS[key] ?? "";
