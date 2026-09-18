import { DOMAINS, PURPOSES, UNIVERSAL_PRINCIPLES, findSubtype } from "./taxonomy";
import type { PromptLanguage, PromptLength, PromptSpec, Purpose, SlotKey } from "./spec";
import { SLOT_KEYS } from "./spec";
import type { SystemBlock } from "../prompt/build";

export const STUDIO_PROMPT_VERSION = "0.2.0";

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
    "- inputs: 프롬프트를 쓸 때마다 달라지는 것만 변수로. name은 영문 snake_case, label은 한국어. 목표 문장에 이미 고정된 내용은 변수가 아니라 context에 쓴다.",
    "- context: 목표 문장·답변에서 확정된 사실(스택, 범위, 독자 등). 없으면 null.",
    "- hard_rules: 최대 5개. '하지 말 것'을 포함.",
    "- process: 단계가 품질을 올리는 작업만. 단일 패스면 null.",
    "- output_contract: format + structure(섹션·표 구성) + length(분량 기준).",
    "- self_check: 답하기 전에 모델이 스스로 확인할 항목 2~8개. success_criteria와 겹쳐도 되지만 '확인 동작'으로 쓴다.",
    "- failure_guards: 이 종류의 작업에서 흔한 실패를 막는 지침. 목적별 씨앗을 반드시 반영하고 목표에 맞게 구체화한다.",
    "- examples: 형식이 특이하거나 판단이 미묘할 때만. 아니면 null.",
    "- rationale: 각 슬롯을 왜 그렇게 썼는지 한 문장씩. 사용자가 배우는 용도.",
    "- language: 요청의 <language> 값을 그대로 넣는다.",
    "",
    "## 언어",
    "- UI용 텍스트(title, inputs[].label, rationale, 의도 정리의 summary·questions·assumptions)는 항상 한국어.",
    "- 프롬프트 본문에 들어가는 슬롯(role, goal, success_criteria, inputs[].description·placeholder, context, hard_rules, process, output_contract, self_check, failure_guards, examples)은 요청의 <language>를 따른다. ko=한국어, en=영어.",
    "- en일 때: 영어 지시문이라도 최종 답변은 한국어로 해야 한다는 규칙은 프로그램이 출력 형식에 자동으로 넣는다. 슬롯에 같은 규칙을 중복해 쓰지 않는다. 사용자가 제공하는 입력이 한국어일 수 있음을 전제로 쓴다.",
    "- 코드 식별자·기술 용어는 언어와 무관하게 원어 유지.",
    "",
    "## 길이 모드",
    "- short: role, goal, success_criteria(2~3), inputs, output_contract, hard_rules(≤3)만 채우고 process·examples는 null, self_check 2개, failure_guards 1~2개.",
    "- standard: 모든 슬롯을 적정 수준으로. examples는 필요할 때만.",
    "- detailed: process를 반드시 채우고, failure_guards 3개 이상, self_check 4개 이상, 유용하면 examples 1개.",
  ].join("\n");
}

/** 목적별 블록: 원칙 + 세부 유형의 씨앗. 프로그램이 넣는 '최소 품질' 요구사항. */
export function studioPurposeBlock(purpose: Purpose, subtypeId: string | null | undefined): string {
  const p = PURPOSES[purpose];
  const s = findSubtype(purpose, subtypeId);
  const next = p.next ? PURPOSES[p.next] : null;
  const d = DOMAINS[p.domain];
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
    `- 보통 필요한 입력 변수: ${s.inputs.map((i) => `${i.name}(${i.label}${i.required ? ", 필수" : ""})`).join(", ")}`,
    s.seeds.handoff.length ? `- ${next ? "다음 단계로 넘길 것" : "결과에 반드시 포함할 것"}(출력 형식에 반드시 포함): ${s.seeds.handoff.join(" / ")}` : "",
  ].filter((l) => l !== "").join("\n");
}

export interface StudioContext {
  purpose: Purpose;
  subtype: string | null | undefined;
  goal: string;
  length: PromptLength;
  language: PromptLanguage;
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
      { text: studioPurposeBlock(ctx.purpose, ctx.subtype), cache: false },
    ],
    user,
  };
}

/** 2단계: PromptSpec 생성. */
export function buildGeneratePrompt(ctx: StudioContext): { system: SystemBlock[]; user: string } {
  const dyn = [studioPurposeBlock(ctx.purpose, ctx.subtype)];
  if (ctx.styleRules) dyn.push("## 사용자가 명시적으로 포함을 요청한 어투 규칙 (글쓰기 목적에만 반영)\n" + ctx.styleRules);
  const user = [
    `<length>${ctx.length}</length>`,
    `<language>${ctx.language}</language>`,
    `<goal>`, ctx.goal, `</goal>`,
    answersBlock(ctx),
    "",
    "위 목표를 달성하는 프롬프트의 PromptSpec을 채워라. 목적별 씨앗을 빠뜨리지 말고 목표에 맞게 구체화하라. 지정된 JSON 스키마로만 답한다.",
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
      { text: studioPurposeBlock(ctx.purpose, ctx.subtype), cache: false },
    ],
    user,
  };
}
