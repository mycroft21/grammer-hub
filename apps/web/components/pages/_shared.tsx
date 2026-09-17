"use client";
import type { ReactNode } from "react";
import { Typography } from "antd";
import type { SituationProfile } from "@grammer-hub/core";

/** 프로필 enum → 한국어 라벨. 설정 페이지 공용. */
export const AUDIENCE_KO: Record<SituationProfile["audience"], string> = { boss: "상급자", peer: "동료", junior: "후배", customer: "고객·외부", public: "전체" };
export const CHANNEL_KO: Record<SituationProfile["channel"], string> = { messenger: "메신저", email: "이메일", report: "보고서", notice: "공지", minutes: "회의록" };
export const LANG_KO: Record<SituationProfile["lang"], string> = { ko: "한국어", en: "영어", mixed: "혼용" };
export const HONORIFIC_KO: Record<SituationProfile["honorific"], string> = { hasipsio: "하십시오체", haeyo: "해요체", hae: "해체", gaejo: "개조식" };
export const TONE_KO: Record<SituationProfile["tone"], string> = { neutral: "중립", polite: "정중", firm: "단호", friendly: "친근", indirect: "완곡" };
export const LENGTH_KO: Record<SituationProfile["length"], string> = { concise: "간결", normal: "보통", detailed: "상세" };
export const INTENT_KO: Record<SituationProfile["intent"], string> = { report: "보고", request: "요청", apology: "사과", persuade: "설득", inform: "안내", thanks: "감사" };

/** enum 라벨 맵 → Select options */
export function toOptions<K extends string>(map: Record<K, string>): { value: K; label: string }[] {
  return (Object.keys(map) as K[]).map((k) => ({ value: k, label: map[k] }));
}

/** 오류 객체 → 사용자 메시지 */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 페이지 상단 제목 + 짧은 설명 */
export function PageHeader({ title, description, extra }: { title: string; description?: string; extra?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 2 }}>{title}</Typography.Title>
        {description && <Typography.Text type="secondary">{description}</Typography.Text>}
      </div>
      {extra}
    </div>
  );
}
