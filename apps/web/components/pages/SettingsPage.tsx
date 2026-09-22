"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Card, Input, Select, Skeleton, Space, Switch, Tag, Tooltip, Typography } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { api, type HealthDto, type SettingDefDto, type SettingsDto, type WorkspaceFileDto } from "@/lib/api";
import { PageHeader, errMsg } from "./_shared";

const GROUP: Record<SettingDefDto["group"], { title: string; desc: string }> = {
  backend: { title: "모델 연결", desc: "교정·프롬프트 생성을 어느 모델로, 무엇으로 인증해 돌릴지." },
  jira: { title: "Jira", desc: "티켓 → 프롬프트에 쓰는 읽기 전용 연결. 셋 다 있어야 켜진다. 없어도 DEMO-1·DEMO-2로 흐름은 볼 수 있다." },
  behavior: { title: "동작·저장", desc: "기록·로그·파일 위치." },
};

/**
 * 설정 화면. 루트 .env를 대신 편집한다(비밀값은 끝 4자만 보임). 저장하면 대부분 즉시 반영, 재시작이 필요한 항목은 표시.
 * 아래 작업 공간 프로필 편집기는 studio.workspace.json을 검증해서 저장한다.
 */
export function SettingsPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<SettingsDto | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});   // 바뀐 키만
  const [saving, setSaving] = useState(false);
  const [restart, setRestart] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthDto | null>(null);
  const [probing, setProbing] = useState(false);
  const [ws, setWs] = useState<WorkspaceFileDto | null>(null);
  const [wsText, setWsText] = useState("");
  const [wsSaving, setWsSaving] = useState(false);
  const [wsErr, setWsErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, w, h] = await Promise.all([api.settings.get(), api.settings.workspace(), api.settings.health(false)]);
      setData(s); setWs(w); setWsText(w.text || ""); setHealth(h);
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
  const probe = async () => {
    setProbing(true);
    try { setHealth(await api.settings.health(true)); } catch (e) { message.error(`연결 확인 실패: ${errMsg(e)}`); } finally { setProbing(false); }
  };
  const saveWs = async () => {
    setWsSaving(true); setWsErr(null);
    try { const r = await api.settings.saveWorkspace(wsText); setWs(r); message.success(`프로필을 저장했습니다 · 저장소 ${r.repos}개`); }
    catch (e) { setWsErr(errMsg(e)); } finally { setWsSaving(false); }
  };
  const validateWs = () => {
    try { JSON.parse(wsText); setWsErr(null); message.success("JSON 문법은 맞습니다. 저장하면 스키마까지 검증합니다."); } catch (e) { setWsErr(`JSON 문법 오류: ${errMsg(e)}`); }
  };

  if (!data) return <div><PageHeader title="설정" description="모델 연결·Jira·저장 위치를 화면에서 바꿉니다. 루트 .env 파일을 대신 편집합니다." /><Skeleton active /></div>;

  const groups = (["backend", "jira", "behavior"] as const);
  const small = { fontSize: 12 } as const;
  return (
    <div className="flex flex-col gap-4" data-testid="settings-page">
      <PageHeader title="설정" description={`모델 연결·Jira·저장 위치를 화면에서 바꿉니다. 저장하면 ${data.envFile} 에 쓰고 대부분 즉시 반영됩니다.`}
        extra={<Space><Button icon={<ReloadOutlined />} onClick={() => void reload()}>다시 읽기</Button><Button data-testid="settings-save" type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={() => void save()}>저장{dirty ? ` (${Object.keys(draft).length})` : ""}</Button></Space>} />

      {health && (
        <Alert type={health.cloud.ready ? "success" : "warning"} showIcon
          message={<span data-testid="settings-health">클라우드 자리: <b>{health.cloud.backend}</b> · 모델 {health.cloud.model} · {health.cloud.ready ? "준비됨" : "준비 안 됨 — API 키를 넣거나 클라우드 방식을 바꾸세요"} · Jira {health.jira.configured ? "켜짐" : "꺼짐"} · 프로필 {health.workspace.exists ? `${health.workspace.repos ?? 0}개 저장소` : "없음"}{health.cloud.health ? <> · 실제 호출 {health.cloud.health.ok ? <CheckCircleOutlined style={{ color: "var(--color-primary)" }} /> : <CloseCircleOutlined style={{ color: "var(--color-danger)" }} />} {health.cloud.health.detail ?? ""}</> : null}</span>}
          action={<Button size="small" loading={probing} onClick={() => void probe()}>연결 확인</Button>} />
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
        </Card>
      ))}

      <Card size="small" title="작업 공간 프로필" extra={<Typography.Text type="secondary" style={small}>{ws?.path ?? "studio.workspace.json"} · {ws?.exists ? (ws.summary ? `저장소 ${ws.summary.repos}개` : "오류") : "없음"}</Typography.Text>}>
        <Typography.Paragraph type="secondary" style={{ ...small, marginBottom: 8 }}>
          팀의 저장소(이름·별칭·검증 명령·주의), Jira 프로젝트 뜻, 팀 규칙, 용어를 적어 두면 티켓마다 "어느 저장소?"를 묻지 않고 프롬프트에 검증 명령·규칙이 들어갑니다. 예시로 시작해 팀 값으로 바꾸세요. 필드 설명은 docs/05 §A-3″.
        </Typography.Paragraph>
        {ws?.error && !wsErr && <Alert type="error" showIcon message={`현재 파일 오류: ${ws.error}`} className="mb-2" />}
        {wsErr && <Alert type="error" showIcon message={wsErr} className="mb-2" data-testid="workspace-error" />}
        <Input.TextArea data-testid="workspace-editor" value={wsText} onChange={(e) => setWsText(e.target.value)} autoSize={{ minRows: 10, maxRows: 30 }} spellCheck={false}
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5 }} placeholder='{ "version": 1, "repos": [ … ] }' />
        <Space wrap className="mt-2">
          <Button data-testid="workspace-save" type="primary" loading={wsSaving} disabled={!wsText.trim()} onClick={() => void saveWs()}>검증 후 저장</Button>
          <Button onClick={validateWs} disabled={!wsText.trim()}>문법만 확인</Button>
          <Button onClick={() => { if (ws) setWsText(ws.example); }}>예시 불러오기</Button>
          {ws?.exists && <Button type="text" onClick={() => setWsText(ws.text)}>파일 내용으로 되돌리기</Button>}
        </Space>
      </Card>

      <Typography.Text type="secondary" style={small}>
        비밀값(API 키·토큰)은 이 컴퓨터의 .env에만 저장되고 화면에는 끝 4자만 보입니다. 이 앱은 인증 없이 로컬에서 쓰는 단일 사용자용이므로, 다른 사람에게 줄 때는 각자 자기 컴퓨터에서 설정하게 하세요. 터미널에서 확인하려면 <code>pnpm health</code>.
      </Typography.Text>
    </div>
  );
}

const DEFAULTS: Record<string, string> = { DEFAULT_PROVIDER: "cloud", CLOUD_BACKEND: "api", STORE_DRAFTS: "true" };
const defaultOf = (key: string) => DEFAULTS[key] ?? "";
