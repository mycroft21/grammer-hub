import { describe, expect, it } from "vitest";
import { FakeProvider } from "../../providers/fake";
import { PartialSlotParser } from "../partial";
import { runChecks } from "../checks";
import { fillVariables, renderClaude } from "../render/claude";
import { generatePrompt, planPrompt, regenerateSlot } from "../pipeline";
import { DOMAINS, DOMAIN_LIST, LIFECYCLE, PURPOSES, domainOf, findSubtype } from "../taxonomy";
import { PromptSpec, SLOT_KEYS, type StudioRequest } from "../spec";
import { buildGeneratePrompt, studioStableSystem, type StudioContext } from "../meta-prompt";

const ctx = (over: Partial<StudioContext> = {}): StudioContext => ({
  purpose: "investigate", subtype: "source", goal: "결제 승인 모듈의 재시도 로직을 파악해서 버그 수정 전에 흐름을 정리한 문서를 만든다", length: "standard", language: "ko", ...over,
});

const baseSpec = (): PromptSpec => ({
  language: "ko", title: "테스트", role: "당신은 코드를 직접 확인한 사실만으로 답하는 엔지니어다.",
  goal: "재시도 로직의 흐름을 정리한 문서를 만든다", success_criteria: ["파일·심볼 인용이 있다", "미확인 목록이 있다", "다음 단계가 쓸 수 있다"],
  inputs: [{ name: "code", label: "코드", description: "소스", required: true, multiline: true, placeholder: "" }],
  context: null, hard_rules: ["추측하지 않는다"], process: null,
  output_contract: { format: "markdown", structure: "요약/흐름/미확인", length: "800자 이내" },
  self_check: ["인용 확인", "미확인 확인"], failure_guards: ["이름만 보고 단정하지 않는다"], clarify_policy: "ask_first", examples: null,
  rationale: { role: "", goal: "", success_criteria: "", inputs: "", hard_rules: "", process: "", output_contract: "", self_check: "", failure_guards: "" },
});

describe("taxonomy", () => {
  it("lifecycle order is investigate → plan → build → review", () => {
    expect([...LIFECYCLE]).toEqual(["investigate", "plan", "build", "review"]);
    expect(PURPOSES.investigate.next).toBe("plan");
    expect(PURPOSES.review.next).toBeNull();
  });
  it("every purpose belongs to exactly one domain and every subtype has seeds, must-know and handoff", () => {
    const seen = new Set<string>();
    for (const d of DOMAIN_LIST) for (const pid of DOMAINS[d].purposes) {
      expect(seen.has(pid), `${pid} listed twice`).toBe(false); seen.add(pid);
      const p = PURPOSES[pid];
      expect(p.domain).toBe(d);
      expect(domainOf(pid)).toBe(d);
      expect(p.principles.length).toBeGreaterThanOrEqual(3);
      expect(p.subtypes.length).toBeGreaterThanOrEqual(1);
      for (const s of p.subtypes) {
        expect(s.seeds.success.length, `${p.id}/${s.id}`).toBeGreaterThanOrEqual(2);
        expect(s.seeds.guards.length, `${p.id}/${s.id}`).toBeGreaterThanOrEqual(1);
        expect(s.seeds.handoff.length, `${p.id}/${s.id}`).toBeGreaterThanOrEqual(1);
        expect(s.mustKnow.length, `${p.id}/${s.id}`).toBeGreaterThanOrEqual(1);
        expect(s.inputs.some((i) => i.required), `${p.id}/${s.id} needs a required input`).toBe(true);
      }
    }
    expect(seen.size).toBe(Object.keys(PURPOSES).length);
  });
  it("unknown subtype falls back to the first", () => {
    expect(findSubtype("build", "nope").id).toBe(PURPOSES.build.subtypes[0]!.id);
    expect(findSubtype("plan", null).id).toBe(PURPOSES.plan.subtypes[0]!.id);
  });
});

describe("render", () => {
  it("ko render puts inputs in delimiters and is deterministic", () => {
    const a = renderClaude(baseSpec()); const b = renderClaude(baseSpec());
    expect(a.combined).toBe(b.combined);
    expect(a.user).toContain("<code>\n{{code}}\n</code>");
    expect(a.system).toContain("## 절대 규칙");
    expect(a.variables).toEqual(["code"]);
    expect(a.system).not.toMatch(/Korean/);
  });
  it("en render uses English headings and always forces Korean answers", () => {
    const r = renderClaude({ ...baseSpec(), language: "en" });
    expect(r.language).toBe("en");
    expect(r.system).toContain("## Hard rules");
    expect(r.system).toContain("respond in Korean");
    expect(r.user).toContain("## Success criteria");
    expect(r.user).toContain("<code>\n{{code}}\n</code>");
  });
  it("fillVariables reports missing required vars", () => {
    const r = fillVariables("<code>\n{{code}}\n</code>\n{{note}}", { note: "x" }, ["code"]);
    expect(r.missing).toEqual(["code"]);
    expect(r.text).toContain("<code>\n\n</code>\nx");
  });
});

describe("checks", () => {
  it("passes a lean spec", () => {
    const c = runChecks(baseSpec());
    expect(c.filter((x) => !x.ok).map((x) => x.id)).toEqual([]);
  });
  it("flags vague criteria, too many rules, bad var names — in ko and en", () => {
    const bad = { ...baseSpec(), success_criteria: ["좋은 문서", "a", "b"], hard_rules: ["1", "2", "3", "4", "5", "6"], inputs: [{ ...baseSpec().inputs[0]!, name: "Code Block" }] };
    const ids = runChecks(bad).filter((x) => !x.ok).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["criteria_verifiable", "rules_lean", "inputs_delimited"]));
    const en = { ...baseSpec(), language: "en" as const, goal: "Produce a checklist for the migration", success_criteria: ["A good result", "x", "y"] };
    const enIds = runChecks(en).filter((x) => !x.ok).map((x) => x.id);
    expect(enIds).toContain("criteria_verifiable");
    expect(enIds).not.toContain("goal_is_outcome");
  });
});

describe("partial slot parser", () => {
  it("emits top-level keys as they close, in stream order", () => {
    const p = new PartialSlotParser(SLOT_KEYS);
    const json = JSON.stringify({ title: "t", role: "r", success_criteria: ["a", "b"], inputs: [], output_contract: { format: "markdown", structure: "s", length: "l" } });
    const seen: string[] = [];
    for (let i = 0; i < json.length; i += 7) for (const s of p.push(json.slice(i, i + 7))) seen.push(s.key);
    for (const s of p.finish()) seen.push(s.key);
    expect(seen).toEqual(["title", "role", "success_criteria", "inputs", "output_contract"]);
  });
});

describe("meta prompt", () => {
  it("stable block has no volatile values and passes the cache threshold", () => {
    const s = studioStableSystem();
    expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(s.length).toBeGreaterThan(1500);
  });
  it("generate prompt carries language and seeds", () => {
    const p = buildGeneratePrompt(ctx({ language: "en" }));
    expect(p.user).toContain("<language>en</language>");
    expect(p.system[1]!.text).toContain("다음 단계로 넘길 것");
    expect(p.system[0]!.cache).toBe(true);
  });
});

describe("pipeline with fake provider", () => {
  const provider = new FakeProvider(0);
  it("plan asks for short goals and is ready once answered", async () => {
    const a = await planPrompt(provider, ctx({ goal: "재시도 로직 조사" }));
    expect(a.plan?.mode).toBe("ask");
    expect(a.plan?.questions.length).toBe(1);
    const b = await planPrompt(provider, ctx({ goal: "재시도 로직 조사", answers: { depth: "deep" } }));
    expect(b.plan?.mode).toBe("ready");
    expect(b.plan?.subtype).toBe("source");
  });
  it("generate streams slots then spec/rendered/checks/usage/done", async () => {
    const events: string[] = [];
    const gen = generatePrompt(provider, ctx());
    let r = await gen.next();
    while (!r.done) { events.push(r.value.event); r = await gen.next(); }
    expect(events[0]).toBe("meta");
    expect(events.filter((e) => e === "slot").length).toBeGreaterThan(5);
    expect(events.slice(-5)).toEqual(["spec", "rendered", "checks", "usage", "done"]);
    expect(r.value.spec?.language).toBe("ko");
    expect(r.value.rendered?.user).toContain("{{code}}");
  });
  it("generate in English keeps the answer-language rule and code-enforced language", async () => {
    const gen = generatePrompt(provider, ctx({ language: "en" }));
    let r = await gen.next();
    while (!r.done) r = await gen.next();
    expect(r.value.spec?.language).toBe("en");
    expect(r.value.rendered?.system).toContain("respond in Korean");
    expect(r.value.rendered?.system).toContain("## Hard rules");
  });
  it("regenerate replaces only the requested slot", async () => {
    const spec = baseSpec();
    const r = await regenerateSlot(provider, ctx(), spec, "hard_rules", "더 짧게");
    expect(r.error).toBeNull();
    expect(r.spec?.hard_rules).not.toEqual(spec.hard_rules);
    expect(r.spec?.role).toBe(spec.role);
    expect(r.spec?.success_criteria).toEqual(spec.success_criteria);
  });
  it("masks PII in the goal and restores it", async () => {
    const goal = "홍길동(010-1234-5678) 고객 문의 응대 스크립트 초안을 만든다. 정중하고 간결하게.";
    const gen = generatePrompt(provider, ctx({ purpose: "write_business", subtype: null, goal }));
    let r = await gen.next();
    while (!r.done) r = await gen.next();
    expect(r.value.spec?.goal).toContain("010-1234-5678");
  });
  it("StudioRequest defaults", () => {
    const req: StudioRequest = { purpose: "build", goal: "로그인 실패 시 재시도 횟수 제한 구현", length: "standard", clarify: "ask_first", promptLanguage: "ko", includeStyleRules: false };
    expect(req.promptLanguage).toBe("ko");
  });
});
