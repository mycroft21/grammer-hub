import type { CheckResult, PromptSpec } from "./spec";

const VAGUE = /(좋은|적절한|잘|충분히|알맞게|괜찮은)\s|\b(good|appropriate|proper|nice|well|sufficiently|adequate)\b/i;
const BARE_NEG = /(않는다|않을 것|말 것|금지|마라|말라)\.?$|^\s*(do not|don't|never|avoid)\b/i;
const ALT = /(대신|먼저|경우|때는|→|;|instead|rather|first|unless|when|if)/i;
const OUTCOME = /(문서|표|코드|목록|보고|초안|계획|리뷰|답변|요약|스펙|테스트|diff|비교|추천|정리|설명)|\b(document|table|code|list|report|draft|plan|review|answer|summary|spec|specification|tests?|diff|comparison|recommendation|analysis|explanation|patch|checklist)\b/i;

/** 코드 규칙 점검. LLM 판단이 아니라 결정적 검사라 일관된다. */
export function runChecks(spec: PromptSpec): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string) => out.push({ id, label, ok, detail });

  add("goal_is_outcome", "목표가 결과물로 쓰였다", OUTCOME.test(spec.goal) && spec.goal.length >= 10,
    "목표에 '무엇을 손에 쥐는지'가 드러나야 합니다.");
  add("criteria_verifiable", "성공 기준이 3개 이상이고 검증 가능하다", spec.success_criteria.length >= 3 && !spec.success_criteria.some((c) => VAGUE.test(c + " ")),
    `${spec.success_criteria.length}개. '좋은/적절한' 같은 말은 기준이 아닙니다.`);
  add("inputs_delimited", "입력이 변수로 분리되어 구분자로 감싸진다", spec.inputs.length > 0 && spec.inputs.every((i) => /^[a-z][a-z0-9_]*$/.test(i.name)),
    spec.inputs.length === 0 ? "입력 변수가 없습니다. 매번 달라지는 것이 정말 없는지 확인하세요." : "변수명은 영문 snake_case여야 렌더에서 태그로 쓸 수 있습니다.");
  add("rules_lean", "절대 규칙이 5개 이하다", spec.hard_rules.length <= 5, `${spec.hard_rules.length}개. 많으면 아무것도 지켜지지 않습니다.`);
  add("output_specified", "출력 형식에 구성과 분량이 있다", spec.output_contract.structure.trim().length >= 5 && spec.output_contract.length.trim().length >= 2,
    "'마크다운으로'는 형식이 아닙니다. 섹션·표 구성과 분량 기준이 필요합니다.");
  add("clarify_defined", "모호할 때의 행동이 정해져 있다", Boolean(spec.clarify_policy), "묻기 / 가정 후 진행 중 하나여야 합니다.");
  add("guards_present", "방어 지침이 있다", spec.failure_guards.length >= 1, "이 작업에서 모델이 흔히 틀리는 지점을 최소 하나는 막아야 합니다.");
  // 금지만 있는 규칙: '~하지 않는다'로 끝나고 대신 할 행동이 없는 것. 절반 넘으면 경고(공식 권고: 하지 말 것보다 할 것을).
  const rules = [...spec.hard_rules, ...spec.failure_guards];
  const bare = rules.filter((r) => BARE_NEG.test(r) && !ALT.test(r)).length;
  add("rules_actionable", "규칙이 '하지 말 것'만이 아니라 '대신 할 것'을 담는다", rules.length === 0 || bare * 2 <= rules.length,
    `${rules.length}개 중 ${bare}개가 금지만 있습니다. 'X 대신 Y', 'Y를 먼저 확인' 형태가 더 잘 지켜집니다.`);
  add("examples_paired", "예시가 있다면 입력·출력이 짝을 이룬다", !spec.examples || spec.examples.every((e) => e.input.trim() && e.output.trim()),
    "입력만 있거나 출력만 있는 예시는 오히려 혼란을 줍니다.");
  return out;
}

export const checksSummary = (checks: CheckResult[]) => ({ passed: checks.filter((c) => c.ok).length, total: checks.length });
