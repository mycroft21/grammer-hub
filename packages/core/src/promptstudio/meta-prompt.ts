import { DOMAINS, PURPOSES, UNIVERSAL_PRINCIPLES, findSubtype } from "./taxonomy";
import type { PromptLanguage, PromptLength, PromptSpec, Purpose, Runtime, SlotKey } from "./spec";
import { SLOT_KEYS } from "./spec";
import type { SystemBlock } from "../prompt/build";

export const STUDIO_PROMPT_VERSION = "0.4.0";

/** 고정 블록(캐시 대상). 날짜·ID 같은 가변 값 금지. */
export function studioStableSystem(): string {
  return [
    "당신은 프롬프트 설계자다. 사용자가 다른 AI 모델(Claude)에게 줄 프롬프트를 만든다. 프롬프트 본문을 쓰지 않고, 정해진 슬롯(PromptSpec)을 채운다. 텍스트 조립은 프로그램이 한다.",
    "",
    "## 좋은 프롬프트의 조건 (반드시 지킨다)",
    ...UNIVERSAL_PRINCIPLES.map((p, i) => `${i + 1}. ${p}`),
    "",
    "## 중립성",
    "- 사용자의 개인 데이터, 과거 기록, 취향을 알지 못한다고 가정한다. 입력으로 받은 목표 문장과 답변만 근거로 쓴다.",
    "- 사용자의 조직·제품·고객에 대해 추측하지 않는다. 필요하면 입력 변수로 만든다.",
    "",
    "## 슬롯 작성 규칙",
    "- title: 보관함에서 알아볼 이름, 2~8단어.",
    "- role: 1~2문장. 판단 기준이 드러나야 한다.",
    "- goal: 끝났을 때 손에 쥐는 결과물. 1~3문장.",
    "- success_criteria: 2~7개. 각각 검증 가능해야 한다.",
    "- inputs: 프롬프트를 쓸 때마다 달라지는 것만 변수로. name은 영문 snake_case, label은 한국어. 목표 문장에 이미 고정된 내용은 변수가 아니라 context에 쓴다. 실행 환경이 claude_code면 코드·문서를 붙여넣게 하지 말고(변수로 만들지 말고) starting_points에 쓴다.",
    "- starting_points: claude_code일 때 저장소에서 어디부터 볼지(URL이면 그 URL을 처리하는 컨트롤러, 파일 경로, 클래스·메서드 이름, 검색 키워드). 목표 문장에 나온 것을 그대로 옮기고, 없으면 목표에서 유추한 키워드 1~3개. chat이면 빈 배열.",
    "- context: 목표 문장·답변에서 확정된 사실(스택, 범위, 독자, 정책). 없으면 null.",
    "- hard_rules: 최대 5개(short는 3). 금지문이 꼭 필요할 때만 '…하지 않고 대신 …한다'로 쓴다. 긍정문 규칙에는 '대신'을 붙이지 않는다.",
    "- process: 단계가 품질을 올리는 작업만. claude_code면 '어디서 시작해 무엇을 따라가 무엇을 확인하는지' 순서로. 단일 패스면 null.",
    "- output_contract: format + structure(섹션 이름 나열. 괄호 설명은 꼭 필요할 때만) + length(분량 기준).",
    "- self_check: 답을 내기 전에 모델이 할 '확인 동작' 2~3개(detailed는 4개). success_criteria나 hard_rules를 되풀이하지 않는다.",
    "- failure_guards: 이 종류의 작업에서 흔한 실패를 막는 지침. 목적별 씨앗 중 이 목표에 실제로 걸리는 것만 골라 구체화한다. hard_rules에 이미 쓴 것은 여기 다시 쓰지 않는다.",
    "- examples: 형식이 특이하거나 판단이 미묘할 때 권장(1~2개, 입력·출력 짝). 단, 실제 입력과 같은 형태로 자신 있게 만들 수 있을 때만 넣는다. 억지로 만든 예시는 없느니만 못하므로 확신이 없으면 null. 예시 안의 이름·수치는 명백한 자리표시자로 쓰고 사실처럼 보이는 값을 지어내지 않는다.",
    "- rationale: 각 슬롯을 왜 그렇게 썼는지 한 문장씩(context·examples가 null이면 왜 비웠는지). 사용자가 배우는 용도. 스키마에 없는 키를 추가하지 않는다.",
    "- language: 요청의 <language> 값을 그대로 넣는다. runtime: 요청의 <runtime> 값을 그대로 넣는다.",
    "",
    "## 중복 금지",
    "- 한 아이디어는 한 슬롯에만 쓴다. 같은 내용이 hard_rules·failure_guards·self_check에 두 번 나오면 하나만 남긴다.",
    "- 프롬프트는 짧을수록 잘 지켜진다. 슬롯을 채우기 위해 내용을 만들지 않는다. 할 말이 없으면 배열을 짧게 두거나 null로 둔다.",
    "",
    "## 어휘",
    "- 설계 용어를 프롬프트 본문에 쓰지 않는다: '결정 질문', '심볼', '핸드오프/넘김', '다음 단계의 입력', '씨앗', '슬롯'. 대신 '무엇을 확인할지', '파일·메서드', '다음에 쓸 사람이 필요한 것'처럼 평이하게 쓴다.",
    "- 사용자가 쓴 표현(제품명, 상태 이름, 정책 문장)은 바꾸지 말고 그대로 쓴다.",
    "",
    "## 실행 환경",
    "- claude_code: 대상 모델이 저장소·파일·셸에 직접 접근한다. 코드·문서를 붙여넣게 하지 않는다. starting_points를 주고 process에 '거기서부터 따라가라'를 쓴다. inputs는 매번 정말 달라지는 것(이슈 번호, 질문 등)만, 보통은 빈 배열.",
    "- chat: 채팅창에 자료를 붙여넣는다. 자료는 inputs 변수로 받고 starting_points는 빈 배열.",
    "",
    "## 언어",
    "- UI용 텍스트(title, inputs[].label, rationale, 의도 정리의 summary·questions·assumptions)는 항상 한국어.",
    "- 프롬프트 본문에 들어가는 슬롯(role, goal, success_criteria, inputs[].description·placeholder, context, hard_rules, process, output_contract, self_check, failure_guards, examples)은 요청의 <language>를 따른다. ko=한국어, en=영어.",
    "- en일 때: 영어 지시문이라도 최종 답변은 한국어로 해야 한다는 규칙은 프로그램이 출력 형식에 자동으로 넣는다. 슬롯에 같은 규칙을 중복해 쓰지 않는다. 사용자가 제공하는 입력이 한국어일 수 있음을 전제로 쓴다.",
    "- 코드 식별자·기술 용어는 언어와 무관하게 원어 유지.",
    "",
    "## 길이 모드",
    "- short: role 1문장, goal 1~2문장, success_criteria 2~4, hard_rules ≤3, process ≤4단계(없으면 null), self_check 2~3, failure_guards 1~2, examples null, output_contract.structure는 섹션 이름 나열만. 전체 렌더가 600자 안팎이 되게.",
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
  const inputsLine = runtime === "claude_code"
    ? `- 실행 환경이 claude_code이므로 아래는 변수가 아니라 저장소에서 찾아 읽을 대상이다(starting_points·process에 반영): ${s.inputs.map((i) => i.label).join(", ")}`
    : `- 보통 필요한 입력 변수: ${s.inputs.map((i) => `${i.name}(${i.label}${i.required ? ", 필수" : ""})`).join(", ")}`;
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

/** 1단계: 의도 정리. 바로 발행 가능한지, 아니면 무엇을 물어야 하는지. */
export function buildPlanPrompt(ctx: StudioContext): { system: SystemBlock[]; user: string } {
  const s = findSubtype(ctx.purpose, ctx.subtype);
  const must = s.mustKnow.map((m) => `- ${m.id}: "${m.question}" 선택지: ${m.options.join(" | ")}`).join("\n");
  const user = [
    `<goal>`, ctx.goal, `</goal>`,
    answersBlock(ctx),
    "",
    "다음을 판단하라.",
    "1. 세부 유형 목록 중 이 목표에 맞는 것을 고른다(subtype). 목록: " + PURPOSES[ctx.purpose].subtypes.map((x) => `${x.id}(${x.label}: ${x.hint})`).join(", "),
    "2. 아래 '반드시 알아야 할 것' 중 목표 문장이나 답변에서 이미 답을 알 수 있는 것은 묻지 않는다.",
    must,
    "3. 남은 것이 없거나, 합리적 기본값을 가정해도 프롬프트 품질이 크게 떨어지지 않으면 mode=ready로 하고 assumptions에 가정을 적는다(각 가정은 사용자가 고칠 수 있게 한 문장으로).",
    "4. 가정하면 결과가 크게 달라지는 것이 있으면 mode=ask로 하고 questions에 최대 3개를 넣는다. 각 질문은 선택지형이며 '반드시 알아야 할 것'의 선택지를 쓰되 목표에 맞게 다듬어도 된다. allow_other는 자유 입력이 의미 있을 때만 true.",
    "5. summary에 이해한 목표를 한 문장으로.",
  ].filter(Boolean).join("\n");
  return {
    system: [
      { text: studioStableSystem(), cache: true },
      { text: studioPurposeBlock(ctx.purpose, ctx.subtype, ctx.runtime), cache: false },
    ],
    user,
  };
}

/** 2단계: PromptSpec 생성. */
export function buildGeneratePrompt(ctx: StudioContext): { system: SystemBlock[]; user: string } {
  const dyn = [studioPurposeBlock(ctx.purpose, ctx.subtype, ctx.runtime)];
  if (ctx.styleRules) dyn.push("## 사용자가 명시적으로 포함을 요청한 어투 규칙 (글쓰기 목적에만 반영)\n" + ctx.styleRules);
  const user = [
    `<length>${ctx.length}</length>`,
    `<language>${ctx.language}</language>`,
    `<runtime>${ctx.runtime}</runtime>`,
    `<goal>`, ctx.goal, `</goal>`,
    answersBlock(ctx),
    "",
    ctx.length === "short" ? "short 모드: 성공 기준 ≤4, 절대 규칙 ≤3, 진행 ≤4, 확인 ≤3, 방어 ≤2, 예시 null. 렌더 결과가 600자 안팎이 되게 짧게 쓴다." : "",
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
    "<fixed_slots>", JSON.stringify(fixed, null, 1), "</fixed_slots>",
    `<regenerate>${slot}</regenerate>`,
    instruction ? `<instruction>${instruction}</instruction>` : "",
    "",
    `fixed_slots는 그대로 두고 ${slot} 슬롯만 다시 작성하라. 다른 슬롯과 모순되지 않아야 한다. rationale.${slot}도 함께 갱신한다. 지정된 JSON 스키마로만 답한다.`,
  ].filter(Boolean).join("\n");
  return {
    system: [
      { text: studioStableSystem(), cache: true },
      { text: studioPurposeBlock(ctx.purpose, ctx.subtype, ctx.runtime), cache: false },
    ],
    user,
  };
}
