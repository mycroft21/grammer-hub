import type { CorrectionProvider, ProviderEvent, ProviderInput } from "./types";

/**
 * 개발·E2E 전용 결정적 provider. API 키 없이 전체 UI 흐름을 확인한다.
 * 규칙표 기반이며 실제 품질과 무관하다. 절대 운영 기본값으로 쓰지 않는다.
 */
const RULES: Array<{ re: RegExp; to: string; category: string; reason: string; severity: string }> = [
  { re: /드릴께요/g, to: "드릴게요", category: "SPELLING", reason: "'-ㄹ게요'가 표준 표기입니다(한글 맞춤법 제53항).", severity: "error" },
  { re: /할수있/g, to: "할 수 있", category: "SPACING", reason: "의존명사 '수'는 띄어 씁니다.", severity: "error" },
  { re: /나오셨습니다/g, to: "나왔습니다", category: "HONORIFIC", reason: "사물(커피)에 '-시-'를 쓰는 것은 과잉 존대입니다.", severity: "error" },
  { re: /\s*ㅎㅎ+/g, to: "", category: "REGISTER", reason: "상급자 채널 격식 기준으로 이모티콘성 표현을 제거합니다.", severity: "style" },
  { re: /부탁드리겟습니다|부탁드리겠습니다/g, to: "부탁드립니다", category: "CONCISENESS", reason: "'-겠-'은 불필요한 완곡 표현입니다.", severity: "style" },
];

export class FakeProvider implements CorrectionProvider {
  readonly id = "cloud" as const; // UI 관점에서는 cloud 자리를 대신한다
  readonly model = "fake-dev";
  constructor(private readonly delayMs = 60) {}

  async *correct(input: ProviderInput): AsyncIterable<ProviderEvent> {
    const studio = fakeStudio(input);
    if (studio) { yield* this.stream(studio, input); return; }
    const draft = /<draft[^>]*>\n([\s\S]*?)\n<\/draft>/.exec(input.user)?.[1] ?? "";
    const level = input.level;
    const edits: unknown[] = [];
    let corrected = draft;
    let n = 0;
    for (const r of RULES) {
      if (level === "L1" && !["SPELLING", "SPACING", "GRAMMAR", "PUNCTUATION"].includes(r.category)) continue;
      for (const m of draft.matchAll(r.re)) {
        n++;
        const idx = m.index ?? 0;
        edits.push({
          id: `e${n}`, sentence_index: 0, original: m[0], context_before: draft.slice(Math.max(0, idx - 6), idx),
          context_after: draft.slice(idx + m[0].length, idx + m[0].length + 6), replacement: m[0].replace(r.re, r.to),
          category: r.category, severity: r.severity, reason_ko: r.reason, rule_ref: null, confidence: 0.9,
        });
      }
      corrected = corrected.replace(r.re, r.to);
    }
    const rewrites = level === "L3" ? [
      { label: "더 정중", text: corrected.replace(/게요/g, "겠습니다"), rationale: "하십시오체로 통일" },
      { label: "더 간결", text: corrected.split(/(?<=\.)\s+/)[0] ?? corrected, rationale: "첫 문장만 남김" },
      { label: "더 친근", text: corrected + " 😊", rationale: "이모지 추가" },
    ] : [];
    const out = { corrected_text: corrected, edits, rewrites, reader_view: n > 0 ? "수신자는 시점 정보가 없어 재질문할 수 있습니다." : null, preserved_facts_check: { numbers: true, dates: true, commitments: true } };
    yield* this.stream(out, input);
  }

  private async *stream(out: unknown, input: ProviderInput): AsyncIterable<ProviderEvent> {
    const json = JSON.stringify(out);
    yield { type: "status", stage: "thinking" };
    await new Promise((r) => setTimeout(r, this.delayMs * 3));
    yield { type: "status", stage: "writing" };
    for (let i = 0; i < json.length; i += 40) {
      await new Promise((r) => setTimeout(r, this.delayMs));
      if (input.signal?.aborted) return;
      yield { type: "delta", text: json.slice(i, i + 40) };
    }
    yield { type: "final", raw: json, usage: { inputTokens: 2500 + input.user.length, cachedTokens: 2400, cacheWriteTokens: 0, outputTokens: Math.ceil(json.length / 3) }, stopReason: "end_turn" };
  }
  async health() { return { ok: true }; }
  cost() { return 0; }
}

/**
 * 프롬프트 스튜디오 요청(schema 모양으로 판별)에 대한 결정적 응답.
 * plan: 목표가 짧고 답변이 없으면 질문 1개, 아니면 ready. spec: 목표 문장을 그대로 넣은 최소 스펙.
 */
function fakeStudio(input: ProviderInput): unknown | null {
  const props = (input.schema as { properties?: Record<string, unknown> }).properties ?? {};
  const goal = /<goal>\n([\s\S]*?)\n<\/goal>/.exec(input.user)?.[1]?.trim() ?? "";
  const lang = /<language>(ko|en)<\/language>/.exec(input.user)?.[1] ?? "ko";
  const runtime = /<runtime>(claude_code|codex|chat)<\/runtime>/.exec(input.user)?.[1] ?? "chat";
  const answered = /<answers>|<assumptions>/.test(input.user);
  if ("purpose" in props && "starting_points" in props && "needs" in props) {
    const t = /<ticket>\n([\s\S]*?)\n<\/ticket>/.exec(input.user)?.[1] ?? "";
    const key = /키: ([A-Z][A-Z0-9_]+-\d+)/.exec(t)?.[1] ?? "DEMO-1";
    const hasAttachment = /첨부\(/.test(t);
    const resolved = /<repos_resolved>/.test(input.user);
    const terse = /secure/i.test(t);   // DEMO-2: 부실한 보안 티켓 → 어느 저장소인지 묻는다(프로필이 확정하면 filled)
    const needs = [
      { id: "where", label: "대상 저장소·서비스", status: resolved || !terse ? "filled" : "ask", value: resolved ? "프로필로 확정" : terse ? "eximbay-partner" : "reporter-api (본문에 명시)", options: terse && !resolved ? ["eximbay-partner", "reporter-api"] : [], question: terse && !resolved ? "어느 저장소의 쿠키인가요?" : null, why: resolved ? "코드가 확정" : terse ? "[partner] 표기만으로는 저장소를 특정할 수 없다" : "티켓 본문에 저장소가 적혀 있다" },
      { id: "deliverable", label: "결과물 형태", status: "filled", value: terse ? "누락 지점 목록과 수정 방향" : "설계안(일반화 vs 신설 비교)", options: [], question: null, why: "티켓 유형에서 정해진다" },
      { id: "done", label: "완료·검증 기준", status: "agent_can_find", value: terse ? "쿠키 설정 코드에 기존 테스트가 있는지 확인" : "updateMasterCardStatus의 기존 테스트 유무를 확인", options: [], question: null, why: "테스트 유무는 코드에서 알 수 있다" },
      { id: "scope", label: "범위 경계", status: "assume", value: "티켓 범위 밖 리팩터링은 제안만 한다", options: [], question: null, why: "티켓에 범위 언급이 없다" },
      { id: "external", label: "첨부·외부 문서의 핵심 정보", status: hasAttachment ? "ask" : "filled", value: hasAttachment ? "첨부 screen.png는 참고용으로 가정" : "첨부 없음", options: hasAttachment ? ["화면 캡처(참고용)", "양식·스펙(필수 정보)"] : [], question: hasAttachment ? "첨부 screen.png에 무엇이 있나요?" : null, why: hasAttachment ? "첨부는 읽을 수 없어 핵심 정보면 직접 적어 주셔야 한다" : "첨부가 없다" },
      { id: "policy", label: "업무 규칙·우선순위 결정", status: terse ? "ask" : "agent_can_find", value: terse ? "세션·인증 쿠키만 우선" : "CardCode.VISA 코드값과 activation() 내부 동작을 코드에서 확인", options: terse ? ["모든 쿠키", "세션·인증 쿠키만 우선"] : [], question: terse ? "모든 쿠키를 대상으로 할까요, 세션·인증 쿠키만 우선할까요?" : null, why: terse ? "조사 범위가 결과물 크기를 바꾼다" : "코드값·내부 동작은 저장소에서 확인할 수 있다" },
    ];
    return terse ? {
      purpose: "investigate", subtype: "source", summary: `${key}: 쿠키 secure 속성 누락 점검`,
      goal: `${key}: 쿠키를 설정하는 코드 위치를 모두 찾아 secure 속성 적용 여부와 누락 지점·수정 방향을 정리한 목록을 만든다`,
      starting_points: ["eximbay-partner: Set-Cookie·HttpServletResponse.addCookie 호출부 전체 검색"],
      context: "보안 스캐너 지적: 쿠키에 secure 속성이 없어 HTTP 전송 시 스니핑 위험. 해결책은 secure 적용과 민감 요청 HTTPS 강제.",
      needs,
    } : {
      purpose: "plan", subtype: "spec", summary: `${key}: Visa 상태전환 로직 추가 요청`,
      goal: `${key}: 서브몰 등록 완료 시 마스터카드에만 있는 '정지→정상' 상태전환을 Visa에도 적용하는 설계안을 정한다`,
      starting_points: ["reporter-api: AcquirerSubmallCommandService.updateAcquirerSubmallStatus", "reporter-api: MerchantServiceCommandService.updateMasterCardStatus()", "reporter-api: CardCode enum"],
      context: "마스터카드는 CardCode.MASTERCARD(\"C001\") 하드코딩. activation() 내부와 VISA 코드값은 미확인.",
      needs,
    };
  }
  if ("needs" in props && "subtype" in props) {
    // 의도 정리: 목표가 짧고 답변이 없으면 depth를 묻고, 아니면 전부 filled/assume.
    const short = !answered && goal.length < 30;
    return {
      summary: `이해한 목표: ${goal}`, subtype: null,
      needs: [
        { id: "next", label: "파악한 뒤 무엇을 하나요", status: "assume", value: "버그 수정 전 흐름 정리", options: [], question: null, why: "목표 문장에서 유추" },
        { id: "depth", label: "어느 깊이까지", status: short ? "ask" : "filled", value: short ? "진입점과 흐름만" : "분기·예외까지", options: short ? ["흐름만", "분기·예외까지"] : [], question: short ? "어느 깊이까지 다룰까요?" : null, why: short ? "깊이에 따라 성공 기준과 분량이 달라집니다." : "답변으로 정해졌다" },
      ],
    };
  }
  if ("success_criteria" in props && "hard_rules" in props) {
    const en = lang === "en";
    const cc = runtime !== "chat";
    return {
      language: lang,
      runtime,
      starting_points: cc ? (en ? ["Controller that handles the URL in the goal", "search keyword: retry"] : ["목표에 적힌 URL을 처리하는 컨트롤러", "검색 키워드: retry"]) : [],
      title: "테스트 프롬프트",
      role: en ? "You are a senior engineer who verifies claims against the actual code before answering." : "당신은 코드를 직접 확인한 사실만으로 답하는 시니어 엔지니어다.",
      goal: en ? `Deliver a markdown report that accomplishes: ${goal}` : `다음 목표를 달성하는 마크다운 보고서를 작성한다: ${goal}`,
      success_criteria: en ? ["Every claim cites a file or symbol", "Unverified items are listed separately", "The result can be used as-is by the next step"] : ["모든 주장에 파일·심볼 인용이 있다", "확인하지 못한 항목이 따로 목록으로 남는다", "다음 단계가 그대로 쓸 수 있는 형식이다"],
      inputs: cc ? [] : [{ name: "code", label: "코드", description: en ? "Source files or excerpts to inspect" : "확인할 소스 파일·발췌", required: true, multiline: true, placeholder: en ? "Paste code here" : "코드를 붙여 넣으세요" }],
      context: null,
      hard_rules: en ? ["Read a file before describing its behavior; if you cannot, mark it unverified instead of guessing", "Keep refactoring ideas in a separate final section instead of mixing them into findings"] : ["파일의 동작은 읽은 뒤에만 설명하고, 못 읽었으면 추측 대신 '미확인'으로 표시한다", "리팩터링 제안은 조사 결과에 섞지 않고 마지막 별도 절에 둔다"],
      process: null,
      output_contract: { format: "markdown", structure: en ? "Summary / Flow / Constraints / Open questions" : "요약 / 흐름 / 제약 / 미확인", length: en ? "Under 600 words" : "800자 이내" },
      self_check: en ? ["Is every claim backed by a citation?", "Are open questions listed?"] : ["모든 주장에 인용이 붙었는가?", "미확인 항목을 적었는가?"],
      failure_guards: en ? ["Check the call sites first instead of inferring a function's role from its name"] : ["함수 역할은 이름으로 단정하는 대신 실제 호출 지점을 먼저 확인한다"],
      clarify_policy: "assume_and_state",
      examples: null,
      rationale: { role: "판단 기준을 드러내는 역할", goal: "결과물을 명시", success_criteria: "검증 가능한 기준", inputs: "매번 달라지는 코드만 변수", starting_points: cc ? "URL에서 컨트롤러로" : "채팅이라 없음", context: "목표에 확정된 사실 없음", hard_rules: "흔한 실패 금지", process: "단일 패스", output_contract: "다음 단계 입력 형식", self_check: "확인 동작", failure_guards: "씨앗 반영", examples: "형식이 평범해 생략" },
    };
  }
  return null;
}
