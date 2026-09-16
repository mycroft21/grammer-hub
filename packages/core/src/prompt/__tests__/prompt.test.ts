import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILES, SituationProfile, StyleRule } from "../../schema";
import { buildPrompt, buildStableSystem, CATEGORY_DEFS, renderProfile, renderRulesSnapshot } from "../index";

const profile = SituationProfile.parse({ ...DEFAULT_PROFILES[0]!, userId: "u1" });
const rule = (id: string, text: string, confidence: number, status: StyleRule["status"] = "active"): StyleRule =>
  StyleRule.parse({ id, userId: "u1", text, confidence, status });

const base = {
  profile, rules: [], rulesVersionId: null, dictionary: [], mutedCategories: [] as never[],
  level: "L2" as const, draft: "팀장님 자료 보내드릴께요.", sentenceCount: 1, omitCorrectedText: false, maxRewrites: 0 as const,
};

describe("prompt", () => {
  it("고정 블록은 결정적이며 Sonnet 5 캐시 최소(1,024토큰)를 넘길 만큼 길다", () => {
    const a = buildStableSystem(); const b = buildStableSystem();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(1500);            // 한글 1자≈1토큰 보수 가정
    for (const c of CATEGORY_DEFS) expect(a).toContain(c.name);
    expect(a).not.toMatch(/20\d\d-\d\d-\d\d/);          // 날짜 금지
  });

  it("system[0..1]만 캐시 대상이고 동적 블록에는 프로필이 들어간다", () => {
    const p = buildPrompt(base);
    expect(p.system.map((s) => s.cache)).toEqual([true, true, false]);
    expect(p.system[2]!.text).toContain("상황 프로필");
    expect(p.system[2]!.text).toContain("해요체");
    expect(p.user).toContain('<draft sentences="1">');
    expect(p.user).toContain("강도: L2.");
    expect(p.user).toContain("rewrites는 빈 배열");
  });

  it("규칙 스냅샷은 순서를 고정하고 demoted를 제외하며 pinned를 앞에 둔다", () => {
    const rules = [rule("b", "짧게 쓴다", 0.7), rule("a", "해요체 선호", 0.9), rule("c", "이모티콘 금지", 0.99, "demoted"), rule("d", "결론 먼저", 0.3, "pinned")];
    const s1 = renderRulesSnapshot(rules, "v1");
    const s2 = renderRulesSnapshot([...rules].reverse(), "v1");
    expect(s1).toBe(s2);
    expect(s1).not.toContain("이모티콘 금지");
    expect(s1.indexOf("결론 먼저")).toBeLessThan(s1.indexOf("해요체 선호"));
    expect(s1.indexOf("해요체 선호")).toBeLessThan(s1.indexOf("짧게 쓴다"));
  });

  it("L3·교정문 생략·mute가 프롬프트에 반영된다", () => {
    const p = buildPrompt({ ...base, level: "L3", maxRewrites: 1, omitCorrectedText: true, mutedCategories: ["CONCISENESS", "TONE"] });
    expect(p.user).toContain("rewrites는 최대 1개");
    expect(p.user).toContain("corrected_text는 null");
    expect(p.system[2]!.text).toContain("CONCISENESS, TONE");
  });

  it("프로필 렌더링에 채널 관례가 붙는다", () => {
    expect(renderProfile(profile)).toContain("채널 관례");
  });
});
