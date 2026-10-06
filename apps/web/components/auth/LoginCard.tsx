"use client";
import { Alert, Button, Card, Typography } from "antd";
import { LoginOutlined } from "@ant-design/icons";

const ERRORS: Record<string, string> = {
  not_allowed: "로그인한 계정이 허용 목록에 없습니다. 관리자에게 이메일(또는 도메인) 등록을 요청하세요.",
  state: "로그인 요청이 만료되었거나 일치하지 않습니다. 다시 시도하세요.",
  exchange: "IdP에서 토큰을 받지 못했습니다. 클라이언트 ID·시크릿·콜백 URL을 확인하세요.",
  token: "IdP가 준 토큰을 검증하지 못했습니다. 발급자(issuer) 주소와 클라이언트 ID를 확인하세요.",
  no_email: "IdP가 이메일을 주지 않았습니다. 앱 등록에서 email 스코프·클레임을 켜 주세요.",
  idp: "IdP에 연결하지 못했습니다. OIDC_ISSUER 주소와 서버의 외부 접속을 확인하세요.",
};

/** 회사 계정으로 로그인 버튼 하나. 오류 코드는 사람이 읽을 문장으로. */
export function LoginCard({ error, next, issuerHost }: { error: string | null; next: string; issuerHost: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md" data-testid="login-page">
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-[13px] font-bold text-white">교</span>
          <Typography.Title level={4} style={{ margin: 0 }}>Grammar Hub</Typography.Title>
        </div>
        <Typography.Paragraph type="secondary">팀 서버입니다. 회사 계정으로 로그인하면 교정 기록·프로필·보관함이 본인 것만 보입니다.</Typography.Paragraph>
        {error && <Alert type="error" showIcon className="mb-3" data-testid="login-error" message={ERRORS[error] ?? `로그인에 실패했습니다 (${error})`} />}
        <Button type="primary" size="large" block icon={<LoginOutlined />} data-testid="login-button" href={`/api/auth/login?next=${encodeURIComponent(next)}`}>회사 계정으로 로그인</Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }} className="mt-3 block">{issuerHost} 로 이동해 인증합니다. 비밀번호는 이 서버에 전달되지 않습니다.</Typography.Text>
      </Card>
    </div>
  );
}
