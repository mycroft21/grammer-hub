import { describe, it } from "vitest";
import { resolveRepos, EXAMPLE_PROFILE, redactPeople, deriveNeeds, renderClaude, runChecks, glossaryFor, jiraIssueToTicket, adfToText } from "./promptstudio/index";
import type { Need } from "./promptstudio/spec";

describe("probe", () => {
  it("resolveRepos alias boundary", () => {
    console.log("A:", JSON.stringify(resolveRepos(EXAMPLE_PROFILE, { title: "[reporter-legacy] JSP 화면 수정" })));
    console.log("B:", JSON.stringify(resolveRepos(EXAMPLE_PROFILE, { title: "reporter-legacy 화면 수정" })));
    console.log("C:", JSON.stringify(resolveRepos(EXAMPLE_PROFILE, { title: "legacy 코드 정리", body: "" })));
    console.log("D:", JSON.stringify(resolveRepos(EXAMPLE_PROFILE, { title: "partner 포털", body: "" })));
    console.log("E:", JSON.stringify(resolveRepos(EXAMPLE_PROFILE, { title: "reporter-api 수정", body: "" })));
  });
  it("glossary substring", () => {
    console.log("G1:", glossaryFor(EXAMPLE_PROFILE, "PSPS 처리"));
    console.log("G2:", glossaryFor(EXAMPLE_PROFILE, "서브몰 등록"));
  });
  it("redactPeople", () => {
    console.log("R1:", JSON.stringify(redactPeople("개발팀 회의에서 정했다. 개발팀 김철수가 담당.", [{ name: "개발팀 김철수", role: "보고자" }])));
    console.log("R2:", JSON.stringify(redactPeople("https://github.com/croft/repo 와 croft_config 를 보라", [{ name: "Croft Lee", role: "보고자" }])));
    console.log("R3:", JSON.stringify(redactPeople("Lee-Service.java 를 고친다", [{ name: "Lee Croft", role: "담당자" }])));
    console.log("R4:", JSON.stringify(redactPeople("김철수 과장이 말했다", [{ name: "김철수 과장", role: "보고자" }])));
    console.log("R5:", JSON.stringify(redactPeople("Sun 서버와 sun 모듈", [{ name: "Sun", role: "담당자" }])));
    console.log("R6:", JSON.stringify(redactPeople("정산 로직 확인", [{ name: "정산우", role: "보고자" }])));
    console.log("R7:", JSON.stringify(redactPeople("정산우 확인", [{ name: "정산우", role: "보고자" }])));
  });
  it("deriveNeeds", () => {
    const n = (id: string, status: Need["status"], extra: Partial<Need> = {}): Need => ({ id, label: id, status, value: null, options: [], question: status === "ask" ? `${id}?` : null, why: "w", ...extra });
    const r1 = deriveNeeds([n("where", "ask"), n("external", "ask"), n("policy", "ask"), n("done", "ask")], { profile: EXAMPLE_PROFILE });
    console.log("N1 questions:", r1.questions.map((q) => q.id), "assumptions:", r1.assumptions, "mode:", r1.mode);
    const r2 = deriveNeeds([n("where", "agent_can_find", { value: "저장소 구조 확인" })], { profile: null });
    console.log("N2:", JSON.stringify(r2));
    const r3 = deriveNeeds([n("where", "filled", { value: "reporter-api" }), n("where", "ask")], { profile: EXAMPLE_PROFILE });
    console.log("N3 repos:", r3.repos, "needs:", r3.needs.length);
    const r4 = deriveNeeds([n("external", "ask", { value: "첨부 없이 진행" })], {});
    console.log("N4 missing_inputs:", r4.missing_inputs, "q:", r4.questions.length);
    const r5 = deriveNeeds([n("where", "filled", { value: "reporter" })], { profile: EXAMPLE_PROFILE });
    console.log("N5 repos:", r5.repos);
    const r6 = deriveNeeds([n("where", "filled", { value: "리포터 어드민" })], { profile: EXAMPLE_PROFILE });
    console.log("N6 repos:", r6.repos);
    const r7 = deriveNeeds([n("scope", "ask"), n("done", "ask"), n("where", "ask")], { profile: null });
    console.log("N7 q:", r7.questions.map((q) => q.id), "a:", r7.assumptions);
  });
  it("render no starting points", () => {
    const spec: any = { title: "t", role: "역할", goal: "목표 문서를 만든다", success_criteria: ["a", "b", "c"], inputs: [], context: null, hard_rules: [], process: null, output_contract: { format: "markdown", structure: "s1", length: "10줄" }, self_check: [], failure_guards: [], examples: null, clarify_policy: "assume_and_state", language: "ko", runtime: "claude_code", starting_points: [], rationale: {} };
    const r = renderClaude(spec, { purpose: "build" });
    console.log("RENDER USER:\n" + r.user);
    console.log("CHECKS:", runChecks(spec).filter((c) => !c.ok).map((c) => c.id));
    const spec2 = { ...spec, starting_points: ["reporter-api", "AuthController", "쿠키"] };
    console.log("CHECKS2:", JSON.stringify(runChecks(spec2).find((c) => c.id === "starting_points")));
    const spec3 = { ...spec, success_criteria: ["실패 시나리오를 적는다", "x", "y"] };
    console.log("CHECKS3 runnable:", runChecks(spec3).find((c) => c.id === "verification_runnable")?.ok);
  });
  it("jira redaction fields", () => {
    const issue = {
      key: "EP-1", fields: {
        summary: "개발팀 김철수 요청", reporter: { displayName: "개발팀 김철수" },
        description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "개발팀 규칙에 따라 진행" }] }] },
        issuelinks: [{ outwardIssue: { key: "EP-2", fields: { summary: "김철수 후속" } }, type: { outward: "blocks" } }],
      },
    };
    const t = jiraIssueToTicket(issue, "https://x.atlassian.net");
    console.log("TICKET:", JSON.stringify({ summary: t.summary, desc: t.description, links: t.links, redacted: t.redactedPeople }));
    console.log("ADF table:", JSON.stringify(adfToText({ type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] }] }] }] })));
  });
});
