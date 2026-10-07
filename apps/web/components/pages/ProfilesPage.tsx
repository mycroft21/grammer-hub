"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Card, Collapse, Drawer, Form, Grid, Popconfirm, Skeleton, Tag, Typography, Tooltip } from "antd";
import { PlusOutlined, EditOutlined } from "@ant-design/icons";
import { renderProfile, type SituationProfile } from "@grammer-hub/core";
import { api } from "@/lib/api";
import { AUDIENCE_KO, CHANNEL_KO, HONORIFIC_KO, PageHeader, TONE_KO, errMsg } from "./_shared";
import { ProfileFields, blankProfile, fromProfileForm, newProfileId, toProfileForm as toForm, type ProfileDraft as P, type ProfileFormValues as FormValues } from "@/components/profile/ProfileFields";

export function ProfilesPage() {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.lg === false;
  const [form] = Form.useForm<FormValues>();
  const [list, setList] = useState<SituationProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<P | null>(null);
  const [draft, setDraft] = useState<FormValues | null>(null);

  const reload = useCallback(async () => {
    try { setList(await api.profiles.list()); } catch (e) { message.error(`프로필을 불러오지 못했습니다: ${errMsg(e)}`); } finally { setLoading(false); }
  }, [message]);
  useEffect(() => { void reload(); }, [reload]);

  // 이미 열린 카드(새 프로필 포함)를 다시 누르면 고치던 입력을 지우지 않는다
  const open = (p: P) => { if (edit && edit.id === p.id) return; setEdit(p); setDraft(toForm(p)); };
  // useForm 인스턴스는 Form이 다시 그려져도 이전 값을 들고 있고, 바뀐 initialValues는 그 값을 덮지 않는다. 선택이 바뀔 때마다 직접 채운다
  useEffect(() => { if (edit) form.setFieldsValue(toForm(edit)); }, [edit, form]);
  const close = () => { setEdit(null); setDraft(null); };
  const exists = edit ? list.some((p) => p.id === edit.id) : false;

  const save = async () => {
    if (!edit) return;
    let values: FormValues;
    try { values = await form.validateFields(); } catch { return; }
    // 새 프로필 id는 이름에서 만들되 기존 id와 겹치면 번호를 붙인다(같은 이름으로 만들어 기존 프로필을 덮어쓰지 않게). 임시 표시는 그대로 둔다
    const id = edit.id || newProfileId(values.name, new Set(list.map((p) => p.id)));
    const payload: P = fromProfileForm(values, id, edit.temporary);
    setSaving(true);
    try {
      if (exists) await api.profiles.save(payload); else await api.profiles.create(payload);
      message.success(exists ? "프로필을 저장했습니다." : "프로필을 만들었습니다.");
      close(); await reload();
    } catch (e) { message.error(`저장에 실패했습니다: ${errMsg(e)}`); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!edit) return;
    try { await api.profiles.remove(edit.id); message.success("프로필을 삭제했습니다."); close(); await reload(); }
    catch (e) { message.error(`삭제에 실패했습니다: ${errMsg(e)}`); }
  };

  const preview = useMemo(() => {
    if (!edit || !draft) return "";
    return renderProfile({ ...fromProfileForm(draft, edit.id || "new", edit.temporary), userId: "preview" });
  }, [edit, draft]);

  const editor = edit && (
    <Form<FormValues> key={edit.id || "new"} form={form} layout="vertical" size="middle" initialValues={toForm(edit)} onValuesChange={(_, all) => setDraft(all)} onFinish={() => void save()}>
      <ProfileFields />
      <Collapse size="small" ghost items={[{ key: "preview", label: "프롬프트 미리보기", children: <pre className="m-0 whitespace-pre-wrap rounded-md p-2 text-xs" style={{ background: "var(--ant-color-bg-layout)", color: "var(--ant-color-text-secondary)", fontFamily: "inherit" }}>{preview}</pre> }]} />
      <div className="mt-4 flex items-center gap-2">
        <Button type="primary" htmlType="submit" loading={saving}>저장</Button>
        <Button onClick={close}>닫기</Button>
        {exists && (
          <Popconfirm title="프로필을 삭제할까요?" description="이 프로필을 쓰는 기록은 남지만 다시 선택할 수 없습니다." okText="삭제" cancelText="취소" okButtonProps={{ danger: true }} onConfirm={() => void remove()}>
            <Button danger type="text" className="ml-auto">삭제</Button>
          </Popconfirm>
        )}
      </div>
    </Form>
  );
  const editorTitle = exists ? "프로필 편집" : "새 프로필";

  return (
    <div>
      <PageHeader title="상황 프로필" description="수신자·채널·높임 단계를 묶어 두면 교정 기준이 상황마다 바뀝니다." />
      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Card key={i} size="small"><Skeleton active paragraph={{ rows: 1 }} /></Card>)}</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map((p) => {
                const selected = edit?.id === p.id;
                return (
                  <Card key={p.id} size="small" hoverable onClick={() => open({ ...p })}
                    style={{ borderColor: selected ? "var(--ant-color-primary)" : undefined }}>
                    <div className="flex items-center gap-2">
                      <Typography.Text strong ellipsis className="flex-1">{p.name}</Typography.Text>
                      {p.isDefault && <Tag variant="filled" style={{ marginInlineEnd: 0 }}>기본</Tag>}
                      {p.temporary && <Tooltip title="에디터에서 '이번만 쓰기'로 만든 프로필. 다음에 에디터를 열면 저장할지 지울지 묻습니다"><Tag color="orange" style={{ marginInlineEnd: 0 }}>임시</Tag></Tooltip>}
                      <Tooltip title="이 프로필로 교정하러 가기">
                        <Link href={`/?profile=${encodeURIComponent(p.id)}`} onClick={(e) => e.stopPropagation()} aria-label={`${p.name} 프로필로 교정`}
                          className="grid h-6 w-6 place-items-center rounded-md" style={{ color: "var(--ant-color-primary)" }}>
                          <EditOutlined />
                        </Link>
                      </Tooltip>
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {AUDIENCE_KO[p.audience]} · {CHANNEL_KO[p.channel]} · {HONORIFIC_KO[p.honorific]} · 격식 {p.formality} · {TONE_KO[p.tone]}
                    </Typography.Text>
                  </Card>
                );
              })}
              <Card size="small" hoverable onClick={() => open(blankProfile())} style={{ borderStyle: "dashed", borderColor: edit && !exists ? "var(--ant-color-primary)" : undefined }}
                styles={{ body: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 64 } }}>
                <Typography.Text type="secondary"><PlusOutlined /> 새 프로필</Typography.Text>
              </Card>
            </div>
          )}
        </div>
        {!isNarrow && (
          <aside>
            {edit ? (
              <Card size="small" title={editorTitle} style={{ position: "sticky", top: 16 }}>{editor}</Card>
            ) : (
              <Card size="small" variant="outlined" style={{ borderStyle: "dashed" }}>
                <Typography.Text type="secondary">프로필을 선택하거나 새 프로필을 만들어 보세요.</Typography.Text>
              </Card>
            )}
          </aside>
        )}
      </div>
      {isNarrow && (
        <Drawer title={editorTitle} open={!!edit} onClose={close} placement="right" size={420} destroyOnHidden>
          {editor}
        </Drawer>
      )}
    </div>
  );
}
