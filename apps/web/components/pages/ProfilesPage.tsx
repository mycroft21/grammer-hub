"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Card, Collapse, Drawer, Form, Grid, Input, Popconfirm, Select, Skeleton, Slider, Switch, Tag, Typography, Tooltip } from "antd";
import { PlusOutlined, EditOutlined } from "@ant-design/icons";
import { renderProfile, type SituationProfile } from "@grammer-hub/core";
import { api } from "@/lib/api";
import { AUDIENCE_KO, CHANNEL_KO, HONORIFIC_KO, INTENT_KO, LANG_KO, LENGTH_KO, PageHeader, TONE_KO, errMsg, toOptions } from "./_shared";

type P = Omit<SituationProfile, "userId">;
type FormValues = Omit<P, "id" | "notes"> & { notes?: string };

const blank = (): P => ({ id: "", name: "", audience: "peer", channel: "messenger", lang: "ko", honorific: "haeyo", formality: 3, length: "concise", intent: "request", tone: "polite", isDefault: false });
const FORMALITY_MARKS = { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5" };
const toForm = (p: P): FormValues => {
  const { id: _id, notes, ...rest } = p;
  return { ...rest, notes: notes ?? "" };
};

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

  const open = (p: P) => { setEdit(p); setDraft(toForm(p)); };
  const close = () => { setEdit(null); setDraft(null); };
  const exists = edit ? list.some((p) => p.id === edit.id) : false;

  const save = async () => {
    if (!edit) return;
    let values: FormValues;
    try { values = await form.validateFields(); } catch { return; }
    const { notes, ...rest } = values;
    const trimmedNotes = notes?.trim();
    const slug = rest.name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    const id = edit.id || slug || `p-${Date.now()}`;
    const payload: P = { ...rest, id, ...(trimmedNotes ? { notes: trimmedNotes } : {}) };
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
    const { notes, ...rest } = draft;
    const n = notes?.trim();
    return renderProfile({ ...rest, userId: "preview", id: edit.id || "new", ...(n ? { notes: n } : {}) });
  }, [edit, draft]);

  const editor = edit && (
    <Form<FormValues> key={edit.id || "new"} form={form} layout="vertical" size="middle" initialValues={toForm(edit)} onValuesChange={(_, all) => setDraft(all)} onFinish={() => void save()}>
      <Form.Item name="name" label="이름" rules={[{ required: true, message: "이름을 입력하세요." }, { max: 60, message: "60자 이내" }]}>
        <Input placeholder="예: 상급자 · 슬랙 보고" autoFocus />
      </Form.Item>
      <div className="grid grid-cols-2 gap-x-3">
        <Form.Item name="audience" label="수신자"><Select options={toOptions(AUDIENCE_KO)} /></Form.Item>
        <Form.Item name="channel" label="채널"><Select options={toOptions(CHANNEL_KO)} /></Form.Item>
        <Form.Item name="lang" label="언어"><Select options={toOptions(LANG_KO)} /></Form.Item>
        <Form.Item name="honorific" label="높임 단계"><Select options={toOptions(HONORIFIC_KO)} /></Form.Item>
        <Form.Item name="length" label="길이"><Select options={toOptions(LENGTH_KO)} /></Form.Item>
        <Form.Item name="intent" label="의도"><Select options={toOptions(INTENT_KO)} /></Form.Item>
        <Form.Item name="tone" label="톤"><Select options={toOptions(TONE_KO)} /></Form.Item>
      </div>
      <Form.Item name="formality" label="격식" extra="1 가벼움 · 5 매우 격식">
        <Slider min={1} max={5} step={1} marks={FORMALITY_MARKS} />
      </Form.Item>
      <Form.Item name="notes" label="메모" rules={[{ max: 500, message: "500자 이내" }]}>
        <Input.TextArea rows={2} placeholder="이 상황에서 특별히 지킬 점 (프롬프트에 포함됩니다)" />
      </Form.Item>
      <Form.Item name="isDefault" label="기본 프로필" valuePropName="checked" layout="horizontal">
        <Switch />
      </Form.Item>
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
              <Card size="small" hoverable onClick={() => open(blank())} style={{ borderStyle: "dashed", borderColor: edit && !exists ? "var(--ant-color-primary)" : undefined }}
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
