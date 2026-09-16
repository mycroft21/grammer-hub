import type { SituationProfile } from "../schema/profile";
import type { StyleRule } from "../schema/rules";
import type { DictionaryEntry } from "../schema/rules";
import type { Category } from "../schema/correction";
import { HONORIFIC_DEFS } from "./categories";

const AUDIENCE: Record<SituationProfile["audience"], string> = {
  boss: "상급자(팀장·임원)", peer: "동료", junior: "후배·부하", customer: "고객·외부 파트너", public: "불특정 다수(전사·팀 공지)",
};
const CHANNEL: Record<SituationProfile["channel"], string> = {
  messenger: "슬랙 등 업무 메신저", email: "이메일", report: "보고서·문서", notice: "공지", minutes: "회의록",
};
const LENGTH: Record<SituationProfile["length"], string> = { concise: "간결하게(핵심만)", normal: "보통", detailed: "상세하게" };
const INTENT: Record<SituationProfile["intent"], string> = {
  report: "보고", request: "요청", apology: "사과·해명", persuade: "설득", inform: "안내·공지", thanks: "감사",
};
const TONE: Record<SituationProfile["tone"], string> = { neutral: "중립", polite: "정중", firm: "단호", friendly: "친근", indirect: "완곡" };
const LANG: Record<SituationProfile["lang"], string> = { ko: "한국어", en: "영어", mixed: "한국어·영어 혼용" };

/** 상황 프로필을 프롬프트용 문장으로 렌더링. 사용자 화면의 '미리보기'에도 그대로 쓴다. */
export function renderProfile(p: SituationProfile): string {
  const h = HONORIFIC_DEFS[p.honorific];
  const lines = [
    `## 상황 프로필: ${p.name}`,
    `- 수신자: ${AUDIENCE[p.audience]}`,
    `- 채널: ${CHANNEL[p.channel]}`,
    `- 언어: ${LANG[p.lang]}`,
    `- 높임 단계: ${h.title} (${p.honorific})`,
    `- 격식: ${p.formality}/5`,
    `- 길이: ${LENGTH[p.length]}`,
    `- 의도: ${INTENT[p.intent]}`,
    `- 톤: ${TONE[p.tone]}`,
  ];
  if (p.channel === "messenger") lines.push("- 채널 관례: 여러 개의 짧은 메시지보다 한 메시지에 담고, 첫 문장에 결론·요청을 둔다. 이모티콘은 프로필 격식 3 이상이면 제거한다.");
  if (p.channel === "email") lines.push("- 채널 관례: 호칭+인사 → 본문 → 맺음 인사의 구조를 유지한다.");
  if (p.honorific === "gaejo") lines.push("- 채널 관례: 개조식이므로 서술식 문장(-습니다)이 섞이면 REGISTER로 지적한다.");
  if (p.notes) lines.push(`- 메모: ${p.notes}`);
  return lines.join("\n");
}

/** 시스템 블록 #2: 규칙 스냅샷. 정렬을 고정해 같은 규칙 집합은 항상 같은 바이트가 되게 한다(캐시). */
export function renderRulesSnapshot(rules: ReadonlyArray<StyleRule>, versionId: string | null): string {
  const usable = rules
    .filter((r) => r.status !== "demoted")
    .sort((a, b) => (a.status === "pinned" ? -1 : 0) - (b.status === "pinned" ? -1 : 0) || b.confidence - a.confidence || a.id.localeCompare(b.id))
    .slice(0, 20);
  const header = `## 사용자 스타일 규칙 (버전 ${versionId ?? "none"})`;
  if (usable.length === 0) return `${header}\n(아직 규칙 없음. 프로필만 따른다.)`;
  const body = usable.map((r) => {
    const scope = Object.entries(r.scope).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${String(v)}`).join(", ");
    return `- ${r.text}${scope ? ` [범위: ${scope}]` : ""}${r.status === "pinned" ? " [고정]" : ""}`;
  });
  return [header, "범위가 지정된 규칙은 그 범위에서 일반 규칙보다 우선한다.", ...body].join("\n");
}

export function renderDictionary(entries: ReadonlyArray<DictionaryEntry>): string {
  if (entries.length === 0) return "";
  const items = [...entries].sort((a, b) => a.term.localeCompare(b.term)).slice(0, 100)
    .map((e) => (e.note ? `${e.term} (${e.note})` : e.term));
  return `## 개인 사전 (오탈자로 보지 않을 용어)\n${items.join(", ")}`;
}

export function renderMuted(categories: ReadonlyArray<Category>): string {
  if (categories.length === 0) return "";
  return `## 제안하지 않을 카테고리\n${[...new Set(categories)].sort().join(", ")} 카테고리의 edit은 만들지 않는다.`;
}
