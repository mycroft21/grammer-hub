import { DOMAINS, PURPOSES, UNIVERSAL_PRINCIPLES, findSubtype } from "./taxonomy";
import type { PromptLanguage, PromptLength, PromptSpec, Purpose, Runtime, SlotKey } from "./spec";
import { SLOT_KEYS, isAgentRuntime } from "./spec";
import { needsCatalog, needsRules } from "./needs";
import { hasProfile, workspaceBlock, type WorkspaceProfile } from "./workspace";
import { agentDefaultsFor } from "./agent-defaults";
import type { SystemBlock } from "../prompt/build";

export const STUDIO_PROMPT_VERSION = "0.5.0";

/**
 * 고정 블록(캐시 대상). 날짜·ID 같은 가변 값 금지.
 * v0.5: 코딩 에이전트(Claude Code·Codex) 대상 규칙을 벤치마크(docs/11)에 맞췄다 — 완료 조건은 실행해서 보일 수 있게, 범위 유지, 보고는 결과부터, 시작점은 '저장소: 대상'.
 */
export function studioStableSystem(): string {
  return [
    "당신은 프롬프트 설계자다. 사용자가 다른 AI(채팅 모델 또는 Claude Code·Codex 같은 코딩 에이전트)에게 줄 프롬프트를 만든다. 프롬프트 본문을 쓰지 않고, 정해진 슬롯(PromptSpec)을 채운다. 텍스트 조립은 프로그램이 한다.",
    "이 프롬프트는 스타터다: 받는 쪽이 저장소를 직접 읽고 조사할 수 있으므로, 사람에게 모든 정보를 요구하는 대신 어디서 시작해 무엇을 확인하고 무엇이 되면 끝인지를 준다.",
    "",
    "## 좋은 프롬프트의 조건 (반드시 지킨다)",
    ...UNIVERSAL_PRINCIPLES.map((p, i) => `${i + 1}. ${p}`),
    "",
    "## 중립성",
    "- 사용자의 개인 데이터, 과거 기록, 취향을 알지 못한다고 가정한다. 입력으로 받은 목표 문장·답변·티켓·작업 공간 블록만 근거로 쓴다.",
    "- 사용자의 조직·제품·고객에 대해 추측하지 않는다. 필요하면 입력 변수(chat) 또는 확인할 것(에이전트)으로 만든다.",
    "",
    "## 슬롯 작성 규칙",
    "- title: 보관함에서 알아볼 이름, 2~8단어.",
    "- role: 1문장(standard·detailed는 2문장까지). 직함이 아니라 판단 기준.",
    "- goal: 끝났을 때 손에 쥐는 결과물 + 왜 필요한지 한 구절. 1~3문장. 에이전트면 '무엇이 어떻게 보이면 된 것인지'가 드러나게(관찰 가능한 끝 상태).",
    "- success_criteria(에이전트에서는 '완료 조건'): 2~7개. 각각 제3자가 확인할 수 있어야 한다. 에이전트면 (1) 바깥에서 관찰되는 동작으로 쓰고 (2) 바뀌지 않아야 하는 것을 하나 넣고 (3) 실행해서 보일 수 있는 확인(테스트·빌드·재현 명령·화면)을 최소 하나 넣는다. 작업 공간에 검증 명령이 있으면 그것을 쓴다. 저장소에 테스트가 있는지 모르면 '기존 테스트가 있으면 통과, 없으면 재현 절차로 확인'.",
    "- inputs: 프롬프트를 쓸 때마다 달라지는 것만 변수로. name은 영문 snake_case, label은 한국어. 목표 문장에 이미 고정된 내용은 변수가 아니라 context에 쓴다. 에이전트면 코드·문서를 붙여넣게 하지 말고(변수로 만들지 말고) starting_points에 쓴다. 보통 빈 배열.",
    "- starting_points(에이전트만): '저장소: 대상' 형태로 한 줄에 하나. 대상은 클래스·메서드·파일 경로·화면 URL을 처리하는 컨트롤러·'X·Y 호출부 전체 검색'처럼 어디를 어떻게 볼지. 따를 기존 패턴(비슷한 구현)이 있으면 한 줄 넣는다. 단어 하나(cookie, session)는 시작점이 아니다. 목표·티켓·확정된 시작점에 나온 것을 그대로 옮기고 지어내지 않는다. chat이면 빈 배열.",
    "- context: 확정된 사실(스택, 정책, 계정 구조, 조사 결과)과 그 이유. goal·starting_points에 이미 쓴 내용(트리거 메서드, 하드코딩 위치 등)은 반복하지 않는다. 담당자 의견·인사말·추측은 넣지 않는다. 없으면 null.",
    "- 목적과 내용의 일치: 조사·계획·검토 목적에는 프로그램이 '코드를 수정하지 않는다'를 첫 규칙으로 넣는다. 그 목적에서 goal·process에 '구현한다·코드를 변경한다'를 쓰면 모순된 프롬프트가 된다. 요청이 설계+구현이면 스펙을 설계까지로 한정하고 rationale.goal에 '구현까지면 분류를 구현으로'라고 적는다(분류는 사용자가 바꾼다).",
    "- hard_rules(에이전트에서는 '범위와 제약'): 최대 5개(short는 3). 범위 경계(건드리지 말 것·함께 바꿀 것), 지켜야 할 제약, 필요하면 '왜'. 에이전트면 목적별 범위 유지 문장('요청된 변경만', '조사만 한다' 등)은 프로그램이 첫 줄에 넣으므로 같은 말을 다시 쓰지 않는다. 금지문이 꼭 필요할 때만 '…하지 않고 대신 …한다'로 쓴다.",
    "- process(에이전트에서는 '진행'): 순서가 품질을 올릴 때만. 2~5개의 결과 단위 이정표로 쓰고('파일을 연다', '테스트를 돌린다' 같은 동작 나열은 아니다), 확인할 것(verify_in_repo)이 있으면 첫 이정표에 넣는다. 구현 작업이고 여러 파일이 바뀌면 '읽고 파악 → 변경 계획 → 구현 → 검증' 순. 단일 패스면 null. Codex면 '계획을 먼저 보여 달라'는 단계를 넣지 않는다(Codex는 계획 요청을 받으면 거기서 멈추는 경향).",
    "- output_contract(에이전트에서는 '보고 형식'): format + structure(섹션 이름 나열) + length. 에이전트면 structure는 목적 블록의 '보고 기본 구성'을 따르고 이 목표에 맞게 항목 이름만 다듬는다. length는 프로그램이 목적별 표로 통일하므로 대략만 쓴다. '결과부터, 검증은 실행 결과로, 못 한 것은 따로'는 프로그램이 넣으므로 쓰지 않는다.",
    "- self_check(에이전트에서는 '끝내기 전에 검증'): 에이전트면 끝내기 전에 실행할 구체적 검증 2~3개 — 어떤 명령·확인을 하고 어떤 결과를 보고에 붙일지('./gradlew test 통과 출력', '변경 파일 목록과 diff 요약', '재현 절차를 다시 밟아 정상 동작 확인'). '…했는가?' 같은 되묻기 문장은 쓰지 않는다(일반적인 '다시 확인하라'는 과잉 검증만 부른다). chat이면 답하기 전에 할 확인 동작 2~3개. success_criteria·hard_rules를 되풀이하지 않는다.",
    "- failure_guards: 이 종류의 작업에서 흔한 실패를 막는 지침 1~3개. 목적별 씨앗 중 이 목표에 실제로 걸리는 것만 골라 구체화한다. hard_rules에 이미 쓴 것은 여기 다시 쓰지 않는다.",
    "- examples: 형식이 특이하거나 판단이 미묘할 때 권장(1~2개, 입력·출력 짝). 실제 입력과 같은 형태로 자신 있게 만들 수 있을 때만. 코딩 에이전트 프롬프트는 보통 null. 억지로 만든 예시는 없느니만 못하다.",
    "- clarify_policy: 요청의 값을 그대로. 에이전트면 프로그램이 '되돌리기 어려운 변경·범위 변경만 멈춘다'는 문장으로 렌더한다.",
    "- rationale: 각 슬롯을 왜 그렇게 썼는지 한 문장씩(context·examples가 null이면 왜 비웠는지). 사용자가 배우는 용도. 스키마에 없는 키를 추가하지 않는다.",
    "- language: 요청의 <language> 값을 그대로 넣는다. runtime: 요청의 <runtime> 값을 그대로 넣는다.",
    "",
    "## 중복 금지·간결",
    "- 한 아이디어는 한 슬롯에만 쓴다. 같은 내용이 hard_rules·failure_guards·self_check에 두 번 나오면 하나만 남긴다.",
    "- 프롬프트는 짧을수록 잘 지켜진다. 슬롯을 채우기 위해 내용을 만들지 않는다. 할 말이 없으면 배열을 짧게 두거나 null로 둔다.",
    "- 서로 모순되는 지시를 넣지 않는다(예: '묻지 말고 진행'과 '먼저 확인 요청'을 같이).",
    "- 받는 쪽이 저장소를 읽어 알 수 있는 사실(코드값·구현 위치·호출부·테스트 유무)은 프롬프트에 적지 않고 '확인할 것'으로 시킨다.",
    "",
    "## 어휘",
    "- 설계 용어를 프롬프트 본문에 쓰지 않는다: '결정 질문', '심볼', '핸드오프/넘김', '다음 단계의 입력', '씨앗', '슬롯', '장부'. 대신 '무엇을 확인할지', '파일·메서드', '다음에 쓸 사람이 필요한 것'처럼 평이하게 쓴다.",
    "- 사용자가 쓴 표현(제품명, 상태 이름, 정책 문장, 저장소 이름)은 바꾸지 말고 그대로 쓴다. 한 개념에는 한 용어만.",
    "- '철저히', '빠짐없이 전부' 같은 강조는 쓰지 않는다(에이전트가 과잉 탐색한다). 무엇을 볼지 구체적으로 쓰는 것으로 대신한다.",
    "",
    "## 실행 환경",
    "- claude_code / codex: 코딩 에이전트가 저장소·파일·셸에 직접 접근한다. 코드·문서를 붙여넣게 하지 않는다. starting_points를 주고, 어떤 파일을 읽고 어떤 명령을 돌릴지는 에이전트가 정하게 둔다(위임). inputs는 매번 정말 달라지는 것(이슈 번호 등)만, 보통 빈 배열. 두 환경의 슬롯은 같고 렌더만 다르다(Codex는 한 덩어리).",
    "- chat: 채팅창에 자료를 붙여넣는다. 자료는 inputs 변수로 받고 starting_points는 빈 배열.",
    "",
    "## 언어",
    "- UI용 텍스트(title, inputs[].label, rationale, 의도 정리의 summary·needs)는 항상 한국어.",
    "- 프롬프트 본문에 들어가는 슬롯(role, goal, success_criteria, inputs[].description·placeholder, context, hard_rules, process, output_contract, self_check, failure_guards, examples)은 요청의 <language>를 따른다. ko=한국어, en=영어.",
    "- en일 때: 영어 지시문이라도 최종 답변은 한국어로 해야 한다는 규칙은 프로그램이 출력 형식에 자동으로 넣는다. 슬롯에 같은 규칙을 중복해 쓰지 않는다. 사용자가 제공하는 입력이 한국어일 수 있음을 전제로 쓴다.",
    "- 코드 식별자·기술 용어·저장소 이름은 언어와 무관하게 원어 유지.",
    "",
    "## 길이 모드 (프롬프트의 길이. 결과물 분량과는 별개)",
    "- short: role 1문장, goal 1~2문장, success_criteria 2~4, hard_rules ≤3, process ≤4(없으면 null), self_check 2~3, failure_guards 1~2, examples null, structure는 섹션 이름 나열만. 프로그램이 넣는 고정 문장을 빼고 렌더 결과가 700자 안팎이 되게.",
    "- standard: 모든 슬롯을 적정 수준으로. examples는 필요할 때만.",
    "- detailed: process를 반드시 채우고, failure_guards 3개 이상, self_check 4개 이상. examples는 권장하되 확신이 없으면 null.",
  ].join("\n");
}

/** 목적별 블록: 원칙 + 세부 유형의 씨앗. 프로그램이 넣는 '최소 품질' 요구사항. */
export function studioPurposeBlock(purpose: Purpose, subtypeId: string | null | undefined, runtime: Runtime = "chat"): string {
  const p = PURPOSES[purpose];
  const s = findSubtype(purpose, subtypeId);
  const next = p.next ? PURPOSES[p.next] : null;
  const d = DOMAINS[p.domain];
  const inputsLine = isAgentRuntime(runtime)
    ? `- 실행 환경이 claude_code이므로 아래는 변수가 아니라 저장소에서 찾아 읽을 대상이다(starting_points·process에 반영): ${s.inputs.map((i) => i.label).join(", ")}`
    : `- 보통 필요한 입력 변수: ${s.inputs.map((i) => `${i.name}(${i.label}${i.required ? ", 필수" : ""})`).join(", ")}`;
  const ad = agentDefaultsFor(purpose, runtime);
  return [
    `## 목적: ${d.label} › ${p.label} › ${s.label}`,
    p.short + ".",
    next ? `이 결과물은 다음 단계 "${next.label}"의 입력이 된다.` : "이 결과물은 받는 사람이 다른 가공 없이 바로 쓸 수 있어야 한다.",
    "",
    "### 이 목적의 원칙",
    ...p.principles.map((x) => `- ${x}`),
    "",
    "### 세부 유형의 씨앗 (빠뜨리지 말고 목표에 맞게 구체화)",
    `- 성공 기준 씨앗: ${s.seeds.success.join(" / ")}`,
    `- 방어 지침 씨앗: ${s.seeds.guards.join(" / ")}`,
    `- 기본 과정: ${s.seeds.process ? s.seeds.process.join(" → ") : "단일 패스"}`,
    `- 기본 출력 형식: ${s.seeds.outputFormat}`,
    inputsLine,
    s.seeds.handoff.length ? `- ${next ? "다음 단계로 넘길 것" : "결과에 반드시 포함할 것"}(출력 형식에 반드시 포함): ${s.seeds.handoff.join(" / ")}` : "",
    ad ? `- 에이전트 보고 기본 구성(output_contract.structure의 기준): ${ad.report.structure.ko} · 분량은 프로그램이 "${ad.report.length.ko}"로 넣는다` : "",
    ad ? `- 범위 유지 문장(프로그램이 범위와 제약 첫 줄에 넣음. 다시 쓰지 말 것): "${ad.scope.ko}"` : "",
  ].filter((l) => l !== "").join("\n");
}

export interface StudioContext {
  purpose: Purpose;
  subtype: string | null | undefined;
  goal: string;
  length: PromptLength;
  language: PromptLanguage;
  runtime: Runtime;
  answers?: Record<string, string> | undefined;
  assumptions?: string[] | undefined;
  styleRules?: string | null | undefined;    // includeStyleRules일 때만 (글쓰기)
  ticket?: string | null | undefined;        // 이슈 트래커 티켓 텍스트(ticketToText). 있으면 맥락·시작점의 근거
  ticketKey?: string | null | undefined;     // 이슈 키(프로필의 프로젝트 뜻을 찾는 데 쓴다)
  /** 사용자가 확정한 시작점·맥락·대상 저장소·코드에서 확인할 것 */
  hints?: { startingPoints?: string[] | undefined; context?: string | undefined; repos?: string[] | undefined; verifyInRepo?: string[] | undefined } | null | undefined;
  /** 작업 공간 프로필(루트 studio.workspace.json). 없으면 null */
  profile?: WorkspaceProfile | null | undefined;
}

function hintsBlock(ctx: StudioContext): string {
  const h = ctx.hints; if (!h) return "";
  const parts: string[] = [];
  if (h.repos && h.repos.length) parts.push(`<repos>${h.repos.join(", ")}</repos>`);
  if (h.startingPoints && h.startingPoints.length) parts.push("<starting_points_confirmed>", ...h.startingPoints.map((x) => `- ${x}`), "</starting_points_confirmed>");
  if (h.context && h.context.trim()) parts.push("<context_confirmed>", h.context.trim(), "</context_confirmed>");
  if (h.verifyInRepo && h.verifyInRepo.length) parts.push("<verify_in_repo>", ...h.verifyInRepo.map((x) => `- ${x}`), "</verify_in_repo>");
  if (!parts.length) return "";
  parts.push("사용자가 확정한 것이다. repos는 starting_points의 저장소 접두어로, starting_points·context는 그대로(다듬기만), verify_in_repo는 사용자에게 묻지 않고 프롬프트 안에서 모델이 코드로 확인하도록 process의 앞 단계 또는 hard_rules('확인한 뒤 쓴다')에 반영한다.");
  return parts.join("\n");
}

/** 작업 공간 블록(있을 때만). 분류·의도 정리·생성·재생성이 같은 블록을 본다. */
function workspaceFor(ctx: StudioContext): string {
  if (!hasProfile(ctx.profile)) return "";
  return workspaceBlock(ctx.profile, { text: `${ctx.goal}\n${ctx.ticket ?? ""}`, repos: ctx.hints?.repos ?? [], issueKey: ctx.ticketKey ?? null });
}

function answersBlock(ctx: StudioContext): string {
  const parts: string[] = [];
  if (ctx.answers && Object.keys(ctx.answers).length > 0) {
    parts.push("<answers>", ...Object.entries(ctx.answers).map(([k, v]) => `- ${k}: ${v}`), "</answers>");
  }
  if (ctx.assumptions && ctx.assumptions.length > 0) {
    parts.push("<assumptions>", ...ctx.assumptions.map((a) => `- ${a}`), "</assumptions>");
  }
  return parts.join("\n");
}

/**
 * 1단계: 의도 정리. 세부 유형을 고르고 필요 정보 장부를 채운다. 질문·가정은 코드가 장부에서 만든다(needs.ts).
 * 장부 항목 = (개발 대분류이고 프로필에 저장소가 있으면) where + 세부 유형의 mustKnow.
 */
export function buildPlanPrompt(ctx: StudioContext): { system: SystemBlock[]; user: string } {
  const s = findSubtype(ctx.purpose, ctx.subtype);
  const dev = DOMAINS[PURPOSES[ctx.purpose].domain].id === "dev";
  const catalog = needsCatalog(s, dev ? ctx.profile : null, { universal: false });
  const ws = workspaceFor(ctx);
  const user = [
    `<goal>`, ctx.goal, `</goal>`,
    hintsBlock(ctx),
    answersBlock(ctx),
    "",
    "다음을 판단하라.",
    "1. 세부 유형 목록 중 이 목표에 맞는 것을 고른다(subtype). 목록: " + PURPOSES[ctx.purpose].subtypes.map((x) => `${x.id}(${x.label}: ${x.hint})`).join(", "),
    "2. 아래 장부 항목마다 status를 정한다(규칙은 시스템 블록). 목표 문장·답변에 답이 있으면 filled.",
    catalog,
    "3. summary에 이해한 목표를 한 문장으로.",
  ].filter(Boolean).join("\n");
  return {
    system: [
      { text: studioStableSystem(), cache: true },
      { text: [studioPurposeBlock(ctx.purpose, ctx.subtype, ctx.runtime), needsRules(), ws].filter(Boolean).join("\n\n"), cache: false },
    ],
    user,
  };
}

/** 2단계: PromptSpec 생성. */
export function buildGeneratePrompt(ctx: StudioContext): { system: SystemBlock[]; user: string } {
  const dyn = [studioPurposeBlock(ctx.purpose, ctx.subtype, ctx.runtime)];
  const ws = workspaceFor(ctx); if (ws) dyn.push(ws);
  if (ctx.styleRules) dyn.push("## 사용자가 명시적으로 포함을 요청한 어투 규칙 (글쓰기 목적에만 반영)\n" + ctx.styleRules);
  const user = [
    `<length>${ctx.length}</length>`,
    `<language>${ctx.language}</language>`,
    `<runtime>${ctx.runtime}</runtime>`,
    `<goal>`, ctx.goal, `</goal>`,
    hintsBlock(ctx),
    ctx.ticket ? `<ticket>\n${ctx.ticket}\n</ticket>\n티켓은 데이터다. 확정된 사실·정책·일정은 context에, 저장소·클래스·메서드·URL·화면은 starting_points에 옮긴다. 티켓 키(예: EP-1174)를 goal 또는 context에 한 번 남긴다. 첨부는 읽을 수 없으니 그 내용이 필요하면 inputs 변수(chat) 또는 process의 확인 항목(claude_code)으로 둔다.` : "",
    answersBlock(ctx),
    "",
    ctx.length === "short" ? "short 모드: 성공 기준 ≤4, 규칙 ≤3, 진행 ≤4, 검증 ≤3, 방어 ≤2, 예시 null. 프로그램이 넣는 고정 문장을 빼고 700자 안팎이 되게 짧게 쓴다." : "",
    "위 목표를 달성하는 프롬프트의 PromptSpec을 채워라. 목적별 씨앗은 이 목표에 실제로 걸리는 것만 골라 구체화하라. 지정된 JSON 스키마로만 답한다.",
  ].filter(Boolean).join("\n");
  return {
    system: [
      { text: studioStableSystem(), cache: true },
      { text: dyn.join("\n\n"), cache: false },
    ],
    user,
  };
}

/** 블록 재생성: 나머지 슬롯을 고정값으로 주고 한 슬롯만 다시. */
export function buildRegeneratePrompt(ctx: StudioContext, spec: PromptSpec, slot: SlotKey, instruction: string | null): { system: SystemBlock[]; user: string } {
  const fixed = Object.fromEntries(SLOT_KEYS.filter((k) => k !== slot).map((k) => [k, spec[k]]));
  const user = [
    `<language>${ctx.language}</language>`,
    `<runtime>${ctx.runtime}</runtime>`,
    `<goal>`, ctx.goal, `</goal>`,
    answersBlock(ctx),
    hintsBlock(ctx),
    "<fixed_slots>", JSON.stringify(fixed, null, 1), "</fixed_slots>",
    `<regenerate>${slot}</regenerate>`,
    instruction ? `<instruction>${instruction}</instruction>` : "",
    "",
    `fixed_slots는 그대로 두고 ${slot} 슬롯만 다시 작성하라. 다른 슬롯과 모순되지 않아야 한다. rationale.${slot}도 함께 갱신한다. 지정된 JSON 스키마로만 답한다.`,
  ].filter(Boolean).join("\n");
  const ws = workspaceFor(ctx);
  return {
    system: [
      { text: studioStableSystem(), cache: true },
      { text: [studioPurposeBlock(ctx.purpose, ctx.subtype, ctx.runtime), ws].filter(Boolean).join("\n\n"), cache: false },
    ],
    user,
  };
}
