import { describe, expect, it } from "vitest";
import { FakeProvider } from "../../providers/fake";
import { PartialSlotParser } from "../partial";
import { runChecks } from "../checks";
import { fillVariables, renderClaude } from "../render/claude";
import { generatePrompt, planPrompt, regenerateSlot } from "../pipeline";
import { DOMAINS, DOMAIN_LIST, LIFECYCLE, PURPOSES, defaultLength, defaultRuntime, domainOf, findSubtype } from "../taxonomy";
import { PromptSpec, SLOT_KEYS, type StudioRequest } from "../spec";
import { buildGeneratePrompt, studioStableSystem, type StudioContext } from "../meta-prompt";

const ctx = (over: Partial<StudioContext> = {}): StudioContext => ({
  purpose: "investigate", subtype: "source", goal: "결제 승인 모듈의 재시도 로직을 파악해서 버그 수정 전에 흐름을 정리한 문서를 만든다", length: "standard", language: "ko", runtime: "chat", ...over,
});

const baseSpec = (): PromptSpec => ({
  language: "ko", runtime: "chat", starting_points: [], title: "테스트", role: "당신은 코드를 직접 확인한 사실만으로 답하는 엔지니어다.",
  goal: "재시도 로직의 흐름을 정리한 문서를 만든다", success_criteria: ["파일·심볼 인용이 있다", "미확인 목록이 있다", "다음 단계가 쓸 수 있다"],
  inputs: [{ name: "code", label: "코드", description: "소스", required: true, multiline: true, placeholder: "" }],
  context: null, hard_rules: ["읽지 않은 파일은 추측하는 대신 '미확인'으로 표시한다"], process: null,
  output_contract: { format: "markdown", structure: "요약/흐름/미확인", length: "800자 이내" },
  self_check: ["인용 확인", "미확인 확인"], failure_guards: ["역할은 이름으로 단정하는 대신 호출 지점을 먼저 확인한다"], clarify_policy: "ask_first", examples: null,
  rationale: { role: "", goal: "", success_criteria: "", inputs: "", starting_points: "", context: "", hard_rules: "", process: "", output_contract: "", self_check: "", failure_guards: "", examples: "" },
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
  it("claude_code render gives starting points instead of pasted inputs", () => {
    const r = renderClaude({ ...baseSpec(), runtime: "claude_code", inputs: [], starting_points: ["/admin/submall_manage_list.do 를 처리하는 컨트롤러", "키워드: mastercard"] });
    expect(r.runtime).toBe("claude_code");
    expect(r.user).toContain("## 시작점");
    expect(r.user).toContain("저장소를 직접 읽는다");
    expect(r.user).toContain("## 완료 조건");
    expect(r.system).toContain("## 범위와 제약");
    expect(r.system).toContain("## 보고 형식");
    expect(r.system).toContain("결과부터 쓴다");
    expect(r.user).not.toContain("{{");
    expect(r.variables).toEqual([]);
    const en = renderClaude({ ...baseSpec(), language: "en", runtime: "claude_code", inputs: [], starting_points: ["keyword: retry"] });
    expect(en.user).toContain("## Where to start");
    expect(en.user).toContain("## Done when");
    expect(en.system).toContain("## Scope and constraints");
  });
  it("agent render inserts the purpose scope line first and Codex gets a single untagged block", () => {
    const build = renderClaude({ ...baseSpec(), runtime: "claude_code", inputs: [], starting_points: ["reporter-api: Foo.bar"] }, { purpose: "build" });
    expect(build.system).toContain("1. 요청된 변경만 한다");
    expect(build.system).toContain("2. 읽지 않은 파일은");
    const noPurpose = renderClaude({ ...baseSpec(), runtime: "claude_code", inputs: [], starting_points: ["reporter-api: Foo.bar"] });
    expect(noPurpose.system).toContain("1. 읽지 않은 파일은");
    const codex = renderClaude({ ...baseSpec(), runtime: "codex", inputs: [], starting_points: ["reporter-api: Foo.bar"] }, { purpose: "investigate" });
    expect(codex.target).toBe("codex");
    expect(codex.combined.startsWith("<system>")).toBe(false);
    expect(codex.combined).toContain("조사만 한다");
    expect(codex.combined).toContain("## 범위와 제약");
    const chat = renderClaude(baseSpec(), { purpose: "build" });
    expect(chat.system).toContain("## 절대 규칙");
    expect(chat.system).not.toContain("요청된 변경만");
    // 시작점이 없으면 '위 시작점부터'라고 가리키지 않는다
    const empty = renderClaude({ ...baseSpec(), runtime: "claude_code", inputs: [], starting_points: [] }, { purpose: "build" });
    expect(empty.user).not.toContain("위 시작점부터");
    expect(empty.user).toContain("## 시작점\n저장소를 직접 읽고 목표에 나온");
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
  it("claude_code needs starting points; duplicates across rule slots are flagged", () => {
    const cc = { ...baseSpec(), runtime: "claude_code" as const, inputs: [], starting_points: [] };
    expect(runChecks(cc).find((c) => c.id === "starting_points")?.ok).toBe(false);
    expect(runChecks(cc).find((c) => c.id === "inputs_delimited")).toBeUndefined();
    // 검색어 한 단어는 시작점이 아니다. '저장소: 대상'은 통과
    const bare = { ...cc, starting_points: ["cookie", "session"] };
    expect(runChecks(bare).find((c) => c.id === "starting_points")?.ok).toBe(false);
    expect(runChecks(bare).find((c) => c.id === "starting_points")?.detail).toContain("'cookie', 'session'");
    expect(runChecks({ ...cc, starting_points: ["updateMasterCardStatus"] }).find((c) => c.id === "starting_points")?.ok).toBe(false);   // 길어도 이름 하나면 실패
    expect(runChecks({ ...cc, starting_points: ["src/auth/AuthController.java"] }).find((c) => c.id === "starting_points")?.ok).toBe(true);   // 경로는 통과
    const good = { ...cc, starting_points: ["eximbay-partner: Set-Cookie·addCookie 호출부 전체 검색"] };
    expect(runChecks(good).find((c) => c.id === "starting_points")?.ok).toBe(true);
    // 완료 조건·검증에 실행 가능한 확인이 있어야 한다(에이전트만)
    expect(runChecks(good).find((c) => c.id === "verification_runnable")?.ok).toBe(false);
    const runnable = { ...good, self_check: ["./gradlew test 통과 출력을 보고에 붙인다", "변경 파일 목록"] };
    expect(runChecks(runnable).find((c) => c.id === "verification_runnable")?.ok).toBe(true);
    expect(runChecks(baseSpec()).find((c) => c.id === "verification_runnable")).toBeUndefined();
    const dup = { ...baseSpec(), hard_rules: ["이름만 보고 역할을 단정하지 않고 호출부를 먼저 본다"], failure_guards: ["이름만 보고 역할을 단정하지 않고 실제 호출부를 확인한다"] };
    expect(runChecks(dup).find((c) => c.id === "no_duplicates")?.ok).toBe(false);
    expect(runChecks(baseSpec()).find((c) => c.id === "no_duplicates")?.ok).toBe(true);
  });
  it("flags rule sets that are only prohibitions, passes 'X instead of Y' forms", () => {
    const neg = { ...baseSpec(), hard_rules: ["추측하지 않는다", "코드를 쓰지 않는다"], failure_guards: ["단정하지 않는다"] };
    expect(runChecks(neg).find((c) => c.id === "rules_actionable")?.ok).toBe(false);
    const en = { ...baseSpec(), language: "en" as const, hard_rules: ["Do not guess", "Never invent APIs"], failure_guards: ["Check call sites first instead of trusting names"] };
    expect(runChecks(en).find((c) => c.id === "rules_actionable")?.ok).toBe(false);
    const mixed = { ...baseSpec(), hard_rules: ["추측하지 않는다"], failure_guards: ["이름 대신 호출 지점을 먼저 본다", "수정 코드는 쓰지 않고 방향만 제안한다"] };
    expect(runChecks(mixed).find((c) => c.id === "rules_actionable")?.ok).toBe(true);
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
  it("generate in claude_code mode drops inputs and keeps starting points; runtime is code-enforced", async () => {
    const gen = generatePrompt(provider, ctx({ runtime: "claude_code" }));
    let r = await gen.next();
    while (!r.done) r = await gen.next();
    expect(r.value.spec?.runtime).toBe("claude_code");
    expect(r.value.spec?.starting_points.length).toBeGreaterThan(0);
    expect(r.value.rendered?.user).toContain("## 시작점");
    expect(r.value.rendered?.variables).toEqual([]);
    expect(buildGeneratePrompt(ctx({ runtime: "claude_code" })).user).toContain("<runtime>claude_code</runtime>");
    expect(buildGeneratePrompt(ctx({ runtime: "claude_code" })).system[1]!.text).toContain("저장소에서 찾아 읽을 대상");
    expect(buildGeneratePrompt(ctx({ runtime: "claude_code" })).system[1]!.text).toContain("범위 유지 문장");
    expect(r.value.spec?.output_contract.length).toBe("20~40줄. 목록 위주, 코드는 붙이지 말고 파일·메서드 이름으로 가리킨다");   // 결과물 분량은 목적별 표로 통일
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
  it("regenerate re-applies the code guarantees (agent report length, short caps)", async () => {
    const spec = { ...baseSpec(), runtime: "claude_code" as const, inputs: [], starting_points: ["reporter-api: Foo"] };
    const r = await regenerateSlot(provider, ctx({ runtime: "claude_code", length: "short" }), spec, "output_contract", null);
    expect(r.spec?.output_contract.length).toBe("20~40줄. 목록 위주, 코드는 붙이지 말고 파일·메서드 이름으로 가리킨다");
    expect(r.spec?.runtime).toBe("claude_code");
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
    expect(defaultRuntime("build")).toBe("claude_code");
    expect(defaultRuntime("write_business")).toBe("chat");
    expect(defaultLength("investigate")).toBe("short");
  });
});
