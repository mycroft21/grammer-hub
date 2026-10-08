"use client";
import { useEffect, useState } from "react";
import { Alert, App, Button, Card, Collapse, Space, Tag, Typography } from "antd";
import { EMPTY_OVERLAY, cleanOverlayDraft, overlayIssues, type WorkspaceOverlay } from "@grammer-hub/core";
import { api, type MyWorkspaceDto } from "@/lib/api";
import { errMsg } from "@/components/pages/_shared";
import { WorkspaceFields, fromKV, kvIssues, lines, toModel, type FormModel } from "@/components/settings/WorkspaceEditor";

const toOverlay = (m: FormModel): WorkspaceOverlay => cleanOverlayDraft({
  version: 1,
  repos: m.repos.map((r) => ({ name: r.name, what: r.what, stack: r.stack, aliases: r.aliases, verify: r.verify, entry: lines(r.entryText), notes: lines(r.notesText) })),
  projects: fromKV(m.projects), conventions: m.conventions, glossary: fromKV(m.glossary), defaults: m.defaults,
});

/**
 * 내 작업 공간: 팀 기본값(관리자가 관리하는 파일) 위에 얹는 개인 층.
 * 팀 저장소와 같은 이름이면 별칭·검증 명령 등만 더하고, 팀에 없는 저장소는 설명과 함께 추가한다. 검사는 서버와 같은 core 함수(overlayIssues).
 */
export function MyWorkspaceCard() {
  const { message } = App.useApp();
  const [data, setData] = useState<MyWorkspaceDto | null>(null);
  const [model, setModel] = useState<FormModel>(() => toModel(EMPTY_OVERLAY));
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = (d: MyWorkspaceDto) => { setData(d); setModel(toModel(d.overlay)); setIssues({}); setErr(null); setDirty(false); };
  useEffect(() => { api.me.workspace().then(load).catch((e) => setErr(errMsg(e))); }, []);
  const update = (fn: (m: FormModel) => FormModel) => { setModel(fn); setDirty(true); };

  const save = async () => {
    const team = data?.team ? { version: 1 as const, repos: data.team.repos.map((r) => ({ ...r, entry: [], notes: [] })), projects: {}, conventions: data.team.conventions, glossary: {}, defaults: data.team.defaults } : null;
    const found = overlayIssues(team, toOverlay(model));
    kvIssues(model.projects, "projects", found); kvIssues(model.glossary, "glossary", found);
    setIssues(found);
    if (Object.keys(found).length) { setErr(`${Object.keys(found).length}개 칸을 확인해 주세요(빨간 안내가 붙은 칸).`); return; }
    setSaving(true);
    try { const r = await api.me.saveWorkspace(toOverlay(model)); load(r); message.success("내 작업 공간을 저장했습니다"); }
    catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
  };

  const small = { fontSize: 12 } as const;
  const teamNames = data?.team?.repos.map((r) => r.name) ?? [];
  return (
    <Card size="small" title="내 작업 공간" data-testid="my-workspace-card"
      extra={<Typography.Text type="secondary" style={small}>팀 기본값 위에 얹힘 · 나에게만 적용{dirty ? " · 저장 안 됨" : ""}</Typography.Text>}>
      <Typography.Paragraph type="secondary" style={{ ...small, marginBottom: 8 }}>
        팀 기본값에 없는 저장소나, 나만 쓰는 별칭·검증 명령·규칙을 적어 둡니다. 스튜디오는 팀 기본값과 이것을 합쳐 씁니다. 티켓 검토 화면의 &lsquo;프로필에 추가&rsquo;도 여기에 쌓입니다.
      </Typography.Paragraph>
      {data && (
        <Collapse size="small" className="mb-3" items={[{ key: "team", label: <span data-testid="team-workspace-summary">팀 기본값 · {data.team ? `저장소 ${data.team.repos.length}개 · 규칙 ${data.team.conventions.length}개${data.team.team ? ` · ${data.team.team}` : ""}` : data.teamError ? `오류: ${data.teamError}` : "없음"}</span>,
          children: data.team?.repos.length ? (
            <div className="flex flex-col gap-1">{data.team.repos.map((r) => <Typography.Text key={r.name} style={{ fontSize: 12.5 }}><code>{r.name}</code> {r.what}{r.aliases.length ? <Typography.Text type="secondary" style={small}> · 별칭 {r.aliases.join(", ")}</Typography.Text> : null}</Typography.Text>)}</div>
          ) : <Typography.Text type="secondary" style={small}>팀 기본값은 관리자가 설정 화면에서 관리합니다.</Typography.Text> }]} />
      )}
      {data && data.drops.length > 0 && (
        <Alert type="warning" showIcon className="mb-2" data-testid="workspace-drops" message="적용되지 않은 내 설정이 있습니다(팀 기본값이 바뀌었습니다)"
          description={<ul className="m-0 pl-5">{data.drops.map((d, i) => <li key={i}><code>{d.repo}</code> — {d.reason}</li>)}</ul>} />
      )}
      {err && <Alert type="error" showIcon message={err} className="mb-2" data-testid="my-workspace-error" closable onClose={() => setErr(null)} />}
      <WorkspaceFields model={model} update={update} issues={issues} mode="mine" teamRepoNames={teamNames} />
      <Space className="mt-2">
        <Button data-testid="my-workspace-save" type="primary" loading={saving} disabled={!data} onClick={() => void save()}>검증 후 저장</Button>
        <Button type="text" disabled={!dirty || !data} onClick={() => data && load(data)}>되돌리기</Button>
        {data && data.workspace.repoNames.length > 0 && <Tag style={{ fontSize: 11 }}>합친 저장소 {data.workspace.repoNames.length}개</Tag>}
      </Space>
    </Card>
  );
}
