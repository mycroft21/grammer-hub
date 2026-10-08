"use client";
import { useEffect, useState } from "react";
import { Alert, App, Button, Card, Popconfirm, Space, Tag, Typography } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, LinkOutlined } from "@ant-design/icons";
import { api, type JiraStatusDto, type ProbeDto } from "@/lib/api";
import { errMsg } from "@/components/pages/_shared";

const ERRORS: Record<string, string> = {
  state: "연결이 만료되었거나 다른 계정으로 시작되었습니다. 다시 눌러 주세요.",
  denied: "Atlassian 동의 화면에서 취소했습니다. 연결하려면 다시 눌러 주세요.",
  exchange: "Atlassian이 연결을 거부했습니다. 관리자에게 OAuth 앱 설정을 확인해 달라고 하세요.",
  offline: "앱 권한에 offline_access가 없어 연결을 유지할 수 없습니다(관리자 설정).",
  site: "동의 화면에서 회사 Jira 사이트를 골라 주세요.",
  resources: "Atlassian에서 사이트 목록을 받지 못했습니다. 잠시 후 다시 시도하세요.",
  unavailable: "로그인 모드에서 관리자가 Jira 앱을 설정해야 연결할 수 있습니다.",
};

/**
 * 내 Jira 연결. 로그인 모드에서는 사람마다 Atlassian OAuth로 연결해 내 권한으로만 티켓을 본다.
 * 단일 사용자 모드에서는 관리자 설정의 API 토큰을 그대로 쓴다(연결 버튼 없음).
 */
export function JiraCard() {
  const { message } = App.useApp();
  const [st, setSt] = useState<JiraStatusDto | null>(null);
  const [check, setCheck] = useState<ProbeDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    api.me.jira().then(setSt).catch(() => setSt(null));
    // 콜백 결과는 쿼리로 온다(토큰·계정 없음). 읽고 나면 주소에서 지운다
    const q = new URLSearchParams(window.location.search);
    if (q.get("jira") === "connected") setNotice({ ok: true, text: "Jira를 연결했습니다. 이제 내 권한으로 티켓을 가져옵니다." });
    const err = q.get("jira_error");
    if (err) setNotice({ ok: false, text: ERRORS[err] ?? `연결하지 못했습니다(${err})` });
    if (q.has("jira") || q.has("jira_error")) window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const runCheck = async () => { setBusy(true); setCheck(null); try { setCheck(await api.me.jiraCheck()); } catch (e) { message.error(errMsg(e)); } finally { setBusy(false); } };
  const disconnect = async () => { try { setSt(await api.me.jiraDisconnect()); setCheck(null); message.success("연결을 끊었습니다"); } catch (e) { message.error(errMsg(e)); } };

  const small = { fontSize: 12 } as const;
  return (
    <Card size="small" title="Jira 연결" data-testid="jira-card"
      extra={st && <Tag color={st.connected ? "green" : "default"} data-testid="jira-state">{st.connected ? "연결됨" : "연결 안 됨"}</Tag>}>
      {notice && <Alert type={notice.ok ? "success" : "error"} showIcon closable onClose={() => setNotice(null)} message={notice.text} className="mb-2" data-testid="jira-notice" />}
      {!st ? <Typography.Text type="secondary" style={small}>확인 중…</Typography.Text>
        : st.mode === "token" ? <Typography.Text type="secondary" style={small}>로그인 없는 단일 사용자 모드 — 관리자 설정의 Jira API 토큰으로 가져옵니다.</Typography.Text>
        : st.mode === "off" ? <Typography.Text type="secondary" style={small} data-testid="jira-off">Jira 연동이 꺼져 있습니다 — {st.reason}</Typography.Text>
        : (
          <div className="flex flex-col gap-2">
            <Typography.Text type="secondary" style={small}>
              티켓은 <b>내 Jira 권한</b>으로만 가져옵니다(내가 볼 수 없는 티켓은 여기서도 안 보입니다). 사이트: <code>{st.site}</code>
              {st.connectedAt ? ` · ${new Date(st.connectedAt).toLocaleDateString("ko-KR")} 연결` : ""}
            </Typography.Text>
            {st.stale && <Alert type="warning" showIcon message="이전 연결을 더 쓸 수 없습니다(사이트나 암호화 키가 바뀜). 다시 연결하세요." data-testid="jira-stale" />}
            <Space wrap>
              <Button type={st.connected ? "default" : "primary"} icon={<LinkOutlined />} href="/api/me/jira/connect" data-testid="jira-connect">{st.connected ? "다시 연결" : "Jira 연결"}</Button>
              {st.connected && <Button loading={busy} onClick={() => void runCheck()} data-testid="jira-check">연결 확인</Button>}
              {st.connected && (
                <Popconfirm title="연결을 끊을까요?" description="저장한 토큰을 지웁니다. Atlassian 계정 › 연결된 앱에서도 해제하세요." okText="끊기" cancelText="취소" onConfirm={() => void disconnect()}>
                  <Button danger type="text" data-testid="jira-disconnect">연결 끊기</Button>
                </Popconfirm>
              )}
            </Space>
            {check && (
              <Typography.Text style={{ fontSize: 12.5 }} data-testid="jira-check-result">
                {check.ok ? <CheckCircleOutlined style={{ color: "var(--ant-color-success)" }} /> : check.steps.some((s) => s.state === "fail") ? <CloseCircleOutlined style={{ color: "var(--ant-color-error)" }} /> : <ExclamationCircleOutlined style={{ color: "var(--ant-color-warning)" }} />} {check.summary}
              </Typography.Text>
            )}
            <Typography.Text type="secondary" style={small}>끊으면 저장한 토큰만 지웁니다. Atlassian 쪽 접근은 id.atlassian.com › 계정 설정 › 연결된 앱에서 해제하세요.</Typography.Text>
          </div>
        )}
    </Card>
  );
}
