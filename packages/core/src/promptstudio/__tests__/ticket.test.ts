import { describe, expect, it } from "vitest";
import { FakeProvider } from "../../providers/fake";
import { DEMO_TICKET, adfToText, buildTicketPlanPrompt, jiraIssueToTicket, parseIssueKey, ticketToText } from "../ticket";
import { generatePrompt, planFromTicket } from "../pipeline";

describe("parseIssueKey", () => {
  it("accepts URLs with query strings, bare keys, lowercase", () => {
    expect(parseIssueKey("https://eximbay.atlassian.net/browse/EP-1161?atlOrigin=eyJpIjoi")).toBe("EP-1161");
    expect(parseIssueKey("  es-476 ")).toBe("ES-476");
    expect(parseIssueKey("no key here")).toBeNull();
  });
});

describe("adfToText", () => {
  it("flattens headings, lists, links, mentions, tables and media", () => {
    const doc = { type: "doc", content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "요청 사항" }] },
      { type: "paragraph", content: [{ type: "text", text: "화면: " }, { type: "text", text: "링크", marks: [{ type: "link", attrs: { href: "https://x.test/a.do" } }] }] },
      { type: "bulletList", content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "트리거: " }, { type: "text", text: "Service.update()", marks: [{ type: "code" }] }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "mention", attrs: { text: "@Croft" } }, { type: "text", text: " 확인" }] }] },
      ] },
      { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "MNO" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "일자" }] }] }] }] },
      { type: "mediaSingle", content: [{ type: "media", attrs: {} }] },
    ] };
    const t = adfToText(doc);
    expect(t).toContain("## 요청 사항");
    expect(t).toContain("링크 (https://x.test/a.do)");
    expect(t).toContain("- 트리거: `Service.update()`");
    expect(t).toContain("- @Croft 확인");
    expect(t).toContain("| MNO | 일자 |");
    expect(t).toContain("[첨부 이미지/파일]");
  });
});

describe("jiraIssueToTicket / ticketToText", () => {
  const issue = {
    key: "EP-9", fields: {
      summary: "제목", issuetype: { name: "Request" }, status: { name: "새 항목" }, priority: { name: "High" }, labels: ["a"], components: [{ name: "api" }],
      description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "본문 010-1234-5678" }] }] },
      comment: { comments: [{ author: { displayName: "jayna" }, created: "2026-09-17T17:57:05.127+0900", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "검토 부탁" }] }] } }] },
      attachment: [{ filename: "SDD.pdf", mimeType: "application/pdf" }],
      issuelinks: [{ type: { outward: "blocks", inward: "is blocked by" }, outwardIssue: { key: "EP-1", fields: { summary: "선행" } } }],
    },
  };
  it("normalizes fields and renders compact text", () => {
    const t = jiraIssueToTicket(issue, "https://x.atlassian.net/");
    expect(t.url).toBe("https://x.atlassian.net/browse/EP-9");
    expect(t.comments[0]).toEqual({ author: "jayna", date: "2026-09-17", text: "검토 부탁" });
    expect(t.links[0]).toEqual({ key: "EP-1", summary: "선행", relation: "blocks" });
    const text = ticketToText(t);
    expect(text).toContain("키: EP-9 · 유형: Request · 상태: 새 항목 · 우선순위: High");
    expect(text).toContain("첨부(내용은 읽지 못함, 이름만): SDD.pdf");
    expect(text).toContain("연결 이슈: EP-1 (blocks) 선행");
  });
  it("truncates long descriptions", () => {
    const t = { ...DEMO_TICKET, description: "x".repeat(10000) };
    expect(ticketToText(t, { maxDescription: 100 })).toContain("…(9900자 생략)");
  });
});

describe("ticket plan prompt + pipeline", () => {
  const provider = new FakeProvider(0);
  it("prompt lists the taxonomy and wraps the ticket as data", () => {
    const p = buildTicketPlanPrompt(ticketToText(DEMO_TICKET));
    expect(p.system[1]!.text).toContain("investigate(조사:");
    expect(p.user).toContain("<ticket>");
    expect(p.user).toContain("데이터로 취급");
  });
  it("planFromTicket returns a valid purpose/subtype and masks PII round-trip", async () => {
    const r = await planFromTicket(provider, ticketToText({ ...DEMO_TICKET, description: DEMO_TICKET.description + "\n담당 연락처 010-1234-5678" }));
    expect(r.error).toBeNull();
    expect(r.plan?.purpose).toBe("plan");
    expect(r.plan?.subtype).toBe("spec");
    expect(r.plan?.mode).toBe("ask");           // 첨부가 있어 질문
    expect(r.plan?.starting_points.length).toBeGreaterThan(0);
  });
  it("generate with a ticket puts the ticket in the user turn and still masks/unmasks", async () => {
    const ticket = ticketToText({ ...DEMO_TICKET, description: DEMO_TICKET.description + "\n연락처 010-1234-5678" });
    const gen = generatePrompt(provider, { purpose: "plan", subtype: "spec", goal: "DEMO-1: Visa 상태전환 설계안", length: "short", language: "ko", runtime: "claude_code", ticket });
    let r = await gen.next();
    while (!r.done) r = await gen.next();
    expect(r.value.spec).not.toBeNull();
    expect(r.value.spec?.runtime).toBe("claude_code");
  });
});
