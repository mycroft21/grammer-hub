import type { Category, Level } from "../schema/correction";
import type { SituationProfile } from "../schema/profile";
import type { DictionaryEntry, StyleRule } from "../schema/rules";
import { renderDictionary, renderMuted, renderProfile, renderRulesSnapshot } from "./profile";
import { buildStableSystem, PROMPT_VERSION } from "./system";

export interface SystemBlock { text: string; cache: boolean }
export interface BuiltPrompt { system: SystemBlock[]; user: string; promptVersion: string }

export interface BuildPromptInput {
  profile: SituationProfile;
  rules: ReadonlyArray<StyleRule>;
  rulesVersionId: string | null;
  dictionary: ReadonlyArray<DictionaryEntry>;
  mutedCategories: ReadonlyArray<Category>;
  level: Level;
  draft: string;           // NFC + 마스킹 완료
  sentenceCount: number;
  omitCorrectedText: boolean;   // 로컬 provider: 출력 토큰 절약
  maxRewrites: 0 | 1 | 2 | 3;
}

/**
 * 프롬프트 조립. system[0..1]은 캐시 대상(고정 지침, 규칙 스냅샷), system[2]는 동적.
 * 어떤 블록에도 시각·요청 ID 같은 가변 값을 넣지 않는다.
 */
export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const dynamic = [
    renderProfile(input.profile),
    renderDictionary(input.dictionary),
    renderMuted(input.mutedCategories),
  ].filter((s) => s.length > 0).join("\n\n");

  const instructions: string[] = [`강도: ${input.level}.`];
  if (input.level === "L3") instructions.push(`rewrites는 최대 ${input.maxRewrites}개.`);
  else instructions.push("rewrites는 빈 배열.");
  if (input.omitCorrectedText) instructions.push("교정문 생략: corrected_text는 null로 둔다.");

  const user = [
    `<level>${input.level}</level>`,
    `<draft sentences="${input.sentenceCount}">`,
    input.draft,
    `</draft>`,
    `요청: 위 초안을 상황 프로필과 스타일 규칙에 맞게 교정하라. ${instructions.join(" ")}`,
  ].join("\n");

  return {
    system: [
      { text: buildStableSystem(), cache: true },
      { text: renderRulesSnapshot(input.rules, input.rulesVersionId), cache: true },
      { text: dynamic, cache: false },
    ],
    user,
    promptVersion: PROMPT_VERSION,
  };
}
