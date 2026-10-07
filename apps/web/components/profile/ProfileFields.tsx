"use client";
import { Form, Input, Select, Slider, Switch } from "antd";
import type { SituationProfile } from "@grammer-hub/core";
import { AUDIENCE_KO, CHANNEL_KO, HONORIFIC_KO, INTENT_KO, LANG_KO, LENGTH_KO, TONE_KO, toOptions } from "@/components/pages/_shared";

/**
 * 상황 프로필 편집 폼의 필드와 값 변환. 프로필 화면과 에디터의 '새 상황 만들기'가 같이 쓴다.
 * Form 인스턴스·저장 버튼은 쓰는 쪽이 갖는다.
 */
export type ProfileDraft = Omit<SituationProfile, "userId">;
export type ProfileFormValues = Omit<ProfileDraft, "id" | "notes" | "temporary"> & { notes?: string };

export const blankProfile = (): ProfileDraft => ({ id: "", name: "", audience: "peer", channel: "messenger", lang: "ko", honorific: "haeyo", formality: 3, length: "concise", intent: "request", tone: "polite", isDefault: false, temporary: false });
export const toProfileForm = (p: ProfileDraft): ProfileFormValues => {
  const { id: _id, notes, temporary: _t, ...rest } = p;
  return { ...rest, notes: notes ?? "" };
};

/** 이름에서 id를 만들고, 이미 있는 id면 뒤에 번호를 붙인다(같은 이름으로 만들 때 기존 프로필을 덮어쓰지 않게). */
export function newProfileId(name: string, taken: ReadonlySet<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || `p-${Date.now().toString(36)}`;
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** 폼 값 → 저장할 프로필. 메모가 비면 넣지 않는다(exactOptionalPropertyTypes). */
export function fromProfileForm(values: ProfileFormValues, id: string, temporary: boolean): ProfileDraft {
  const { notes, ...rest } = values;
  const n = notes?.trim();
  return { ...rest, id, temporary, isDefault: temporary ? false : rest.isDefault, ...(n ? { notes: n } : {}) };
}

const FORMALITY_MARKS = { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5" };

export function ProfileFields({ showDefault = true, nameRequired = true }: { showDefault?: boolean; nameRequired?: boolean }) {
  return (
    <>
      <Form.Item name="name" label="이름" rules={[...(nameRequired ? [{ required: true, message: "이름을 입력하세요." }] : []), { max: 60, message: "60자 이내" }]}>
        <Input placeholder="예: 상급자 · 메시지" autoFocus />
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
      {showDefault && (
        <Form.Item name="isDefault" label="기본 프로필" valuePropName="checked" layout="horizontal">
          <Switch />
        </Form.Item>
      )}
    </>
  );
}
