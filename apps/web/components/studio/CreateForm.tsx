"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Space, Typography } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { parseIssueKey } from "@grammer-hub/core";
import { api, type JiraStatusDto, type WorkspaceStatus } from "@/lib/api";
import { useAuth } from "@/components/providers/AppProviders";
import { DRAFT_BASE, draftKey } from "@/lib/studio-draft";

/**
 * 한 칸에 이슈 키(대문자 프로젝트 키, EP-1174)나 Jira 이슈 링크 하나만 넣었으면 티켓에서 시작한다.
 * 문장 속 키는 목표의 일부로 보고, `utf-8`·`sha-256`·다른 URL처럼 키 모양만 닮은 한 덩어리는 티켓으로 보지 않는다.
 */
const KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
export const asTicket = (v: string): boolean => {
  const t = v.trim();
  if (KEY.test(t)) return true;
  return /^https?:\/\/\S+$/.test(t) && /\/browse\/[A-Z][A-Z0-9_]+-\d+|[?&]selectedIssue=[A-Z][A-Z0-9_]+-\d+/.test(t);
};

/**
 * 만들기 입력: 목표 한 칸. 목적·실행 환경·분량 같은 설정은 의도 정리가 추론하고 확인 화면에서 고친다(ConfirmStep).
 * 이슈 키·링크만 넣으면 티켓 흐름으로. 목표는 임시 저장(사람별 키)되어 새로고침해도 남고, 비우면 지운다.
 */
export function CreateForm({ busy, error, initialGoal, onSubmit, onTicket }: {
  busy: boolean; error: string | null; initialGoal?: string | null;
  onSubmit: (goal: string, ctx: { workspace: WorkspaceStatus | null }) => void; onTicket: (input: string) => void;
}) {
  const [goal, setGoal] = useState(() => initialGoal ?? "");
  const [restored, setRestored] = useState(false);
  // 연동 상태(Jira 연결, 작업 공간). 한 번만 읽는다. 실패해도 입력은 동작한다.
  const [status, setStatus] = useState<{ configured: boolean; jira?: JiraStatusDto; workspace: WorkspaceStatus } | null>(null);
  useEffect(() => { api.prompts.ticketConfigured().then(setStatus).catch(() => setStatus(null)); }, []);

  // 임시 저장 키는 로그인 상태를 안 뒤에 정해진다(그 전에는 읽지도 쓰지도 않는다)
  const me = useAuth();
  const key = me ? draftKey(me) : null;
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (!key || restoredOnce.current) return;
    restoredOnce.current = true;
    // 로그인 모드에서 예전 공용 키에 남은 입력은 누구 것인지 모르므로 버린다
    if (me?.authEnabled) { try { localStorage.removeItem(DRAFT_BASE); } catch { /* 저장소를 못 쓰면 지울 것도 없다 */ } }
    if (initialGoal) return;
    try {
      const d = JSON.parse(localStorage.getItem(key) ?? "null") as { goal?: string } | null;
      // 키가 정해지기 전에 이미 입력을 시작했으면 덮지 않는다
      if (d?.goal && !goal.trim()) { setGoal(d.goal); setRestored(true); }
    } catch { /* 깨진 임시 저장은 무시 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!key) return;
    // 목표가 비면 지운다 — 남겨 두면 지운 목표가 새로고침 뒤 되살아난다
    try { if (goal.trim()) localStorage.setItem(key, JSON.stringify({ goal })); else localStorage.removeItem(key); }
    catch { /* 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)면 임시 저장 없이 동작 */ }
  }, [key, goal]);

  const ticket = asTicket(goal);
  const canRun = !busy && (ticket || goal.trim().length >= 4);
  const submit = () => { if (!canRun) return; if (ticket) onTicket(goal.trim()); else onSubmit(goal.trim(), { workspace: status?.workspace ?? null }); };
  const jira = status?.jira;
  const ws = status?.workspace ?? null;

  return (
    <div className="flex flex-col gap-3">
      <Typography.Text strong>무엇을 하고 싶나요?</Typography.Text>
      <Input.TextArea data-testid="studio-goal" autoSize={{ minRows: 3, maxRows: 8 }} maxLength={2000} showCount allowClear value={goal} onChange={(e) => setGoal(e.target.value)}
        placeholder={"예: 결제 승인 모듈의 재시도 로직이 어떻게 동작하는지 파악해서, 타임아웃 버그를 고치기 전에 흐름을 정리하고 싶다\nJira 키나 링크(EP-1174)만 넣으면 티켓에서 시작합니다"}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }} />
      <Typography.Text type="secondary" style={{ fontSize: 12 }} data-testid="ticket-status">
        {ticket ? <>Jira 티켓 {parseIssueKey(goal.trim())}에서 시작합니다 · </> : null}
        {!status ? "연동 상태 확인 중…"
          : jira?.mode === "oauth" ? (jira.connected ? <>Jira 연결됨(내 권한)</> : <>Jira 연결 안 됨 — <a href="/me" data-testid="jira-connect-link">내 설정에서 연결</a>{jira.stale ? "(다시 연결 필요)" : ""}</>)
          : status.configured ? "Jira 연동 켜짐" : <>Jira 연동 꺼짐{jira?.reason ? ` — ${jira.reason}` : ""}</>}
        {" · 연결 없이 흐름만 보려면 "}<code>DEMO-1</code> / <code>DEMO-2</code>
        {ws ? (ws.repoNames.length ? <span data-testid="workspace-status"> · 작업 공간 저장소 {ws.repoNames.length}개{ws.summary?.team ? ` · ${ws.summary.team}` : ""}</span>
          : <span data-testid="workspace-status"> · 작업 공간 없음 — <a href="/me">내 설정</a>에 저장소·검증 명령을 적어 두면 매번 묻지 않습니다</span>) : null}
      </Typography.Text>
      {restored && !error && <Alert type="info" showIcon closable onClose={() => setRestored(false)} message="마지막에 입력하던 목표를 복원했습니다." style={{ padding: "6px 12px" }} />}
      {error && <Alert type="error" showIcon message="진행하지 못했습니다. 입력은 그대로 남아 있습니다." description={error}
        action={<Button size="small" type="primary" disabled={!canRun} onClick={submit}>다시 시도</Button>} />}
      <Space>
        <Button data-testid="studio-run" type="primary" icon={<ThunderboltOutlined />} loading={busy} disabled={!canRun} onClick={submit}>{ticket ? "티켓 가져오기" : "확인"}</Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>⌘⏎ · 목적·실행 환경·분량은 다음 화면에서 확인하고 고칩니다</Typography.Text>
      </Space>
    </div>
  );
}
