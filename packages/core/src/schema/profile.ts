import { z } from "zod";

/** 상황 프로필: 대상·채널·언어·높임 단계·격식·길이·의도·톤의 기본값 묶음. */
export const Audience = z.enum(["boss", "peer", "junior", "customer", "public"]);
export const Channel = z.enum(["messenger", "email", "report", "notice", "minutes"]);
export const Lang = z.enum(["ko", "en", "mixed"]);
/** 하십시오체 / 해요체 / 해체 / 개조식(명사형 종결) */
export const Honorific = z.enum(["hasipsio", "haeyo", "hae", "gaejo"]);
export const LengthPref = z.enum(["concise", "normal", "detailed"]);
export const Intent = z.enum(["report", "request", "apology", "persuade", "inform", "thanks"]);
export const Tone = z.enum(["neutral", "polite", "firm", "friendly", "indirect"]);

export const SituationProfile = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1).max(60),
  audience: Audience,
  channel: Channel,
  lang: Lang,
  honorific: Honorific,
  formality: z.number().int().min(1).max(5),
  length: LengthPref,
  intent: Intent,
  tone: Tone,
  notes: z.string().max(500).optional(),
  isDefault: z.boolean().default(false),
});
export type SituationProfile = z.infer<typeof SituationProfile>;
export type SituationProfileInput = z.input<typeof SituationProfile>;

/** 기본 프로필 3종 시드: 사용자가 직접 만들기 전에 보는 예시. 사용자마다 같은 id로 심는다(키는 user_id + id). userId는 시드 시점에 채운다. */
export const DEFAULT_PROFILES: ReadonlyArray<Omit<SituationProfileInput, "userId">> = [
  { id: "boss-slack", name: "상급자 · 메시지", audience: "boss", channel: "messenger", lang: "ko", honorific: "haeyo", formality: 3, length: "concise", intent: "report", tone: "polite", isDefault: true },
  { id: "boss-report", name: "상급자 · 보고용", audience: "boss", channel: "report", lang: "ko", honorific: "gaejo", formality: 5, length: "normal", intent: "report", tone: "neutral" },
  { id: "customer-email", name: "고객 · 이메일 안내", audience: "customer", channel: "email", lang: "ko", honorific: "hasipsio", formality: 5, length: "normal", intent: "inform", tone: "polite" },
];
