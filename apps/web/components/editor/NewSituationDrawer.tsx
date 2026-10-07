"use client";
import { useEffect, useState } from "react";
import { App, Button, Drawer, Form, Space, Typography } from "antd";
import type { SituationProfile } from "@grammer-hub/core";
import { api } from "@/lib/api";
import { errMsg } from "@/components/pages/_shared";
import { ProfileFields, blankProfile, fromProfileForm, newProfileId, toProfileForm, type ProfileFormValues } from "@/components/profile/ProfileFields";

/**
 * 에디터에서 바로 새 상황(프로필)을 만든다. 지금 고른 프로필 값으로 미리 채워 두어 다른 부분만 고치면 된다.
 * '저장하고 쓰기'는 일반 프로필, '이번만 쓰기'는 임시 표시(다음에 에디터를 열면 저장할지 지울지 묻는다). 둘 다 만든 즉시 선택된다.
 */
export function NewSituationDrawer({ open, base, takenIds, onClose, onCreated }: {
  open: boolean; base: SituationProfile | undefined; takenIds: ReadonlySet<string>;
  onClose: () => void; onCreated: (p: SituationProfile) => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ProfileFormValues>();
  const [busy, setBusy] = useState<"save" | "temp" | null>(null);
  const initial = toProfileForm({ ...(base ?? blankProfile()), id: "", name: "", isDefault: false, temporary: false });
  // useForm 인스턴스는 서랍이 닫혀도 지난 입력을 들고 있고, 다시 마운트돼도 initialValues가 그 값을 덮지 않는다 → 열 때마다 지금 프로필 값으로 다시 채운다
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, base?.id]);

  const create = async (temporary: boolean) => {
    let values: ProfileFormValues;
    try { values = await form.validateFields(); } catch { return; }
    const name = values.name?.trim() ?? "";
    if (!temporary && !name) { form.setFields([{ name: "name", errors: ["저장하려면 이름이 필요합니다. 이번만 쓸 거면 '이번만 쓰기'를 누르세요."] }]); return; }
    const finalName = name || `임시 · ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    // 임시 프로필 id는 이름과 상관없이 매번 새로 만든다(같은 시각에 만든 임시끼리 덮어쓰지 않게)
    const id = temporary ? newProfileId(`tmp-${Date.now().toString(36)}`, takenIds) : newProfileId(finalName, takenIds);
    setBusy(temporary ? "temp" : "save");
    try {
      const p = await api.profiles.create(fromProfileForm({ ...values, name: finalName }, id, temporary));
      message.success(temporary ? "이번만 쓰는 상황으로 골랐습니다. 다음에 에디터를 열면 저장할지 묻습니다." : "새 상황을 저장하고 골랐습니다.");
      onCreated(p);
    } catch (e) { message.error(`만들지 못했습니다: ${errMsg(e)}`); } finally { setBusy(null); }
  };

  return (
    <Drawer title="새 상황 만들기" open={open} onClose={onClose} placement="right" size={420} destroyOnHidden data-testid="new-situation-drawer">
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        지금 고른 &lsquo;{base?.name ?? "기본값"}&rsquo;의 값으로 채워 두었습니다. 다른 부분만 고치세요. 자주 쓸 상황이면 이름을 붙여 저장하고, 한 번만 쓸 거면 &lsquo;이번만 쓰기&rsquo;를 누릅니다.
      </Typography.Paragraph>
      <Form<ProfileFormValues> form={form} layout="vertical" size="middle" initialValues={initial}>
        <ProfileFields showDefault={false} nameRequired={false} />
      </Form>
      <Space className="mt-2">
        <Button data-testid="situation-save" type="primary" loading={busy === "save"} disabled={busy !== null} onClick={() => void create(false)}>저장하고 쓰기</Button>
        <Button data-testid="situation-temp" loading={busy === "temp"} disabled={busy !== null} onClick={() => void create(true)}>이번만 쓰기</Button>
        <Button type="text" onClick={onClose}>닫기</Button>
      </Space>
    </Drawer>
  );
}
