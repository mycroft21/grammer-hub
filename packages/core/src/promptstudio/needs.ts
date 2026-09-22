import { MAX_QUESTIONS, type Need, type PlanQuestion } from "./spec";
import type { Subtype } from "./taxonomy";
import type { RepoMatch, WorkspaceProfile } from "./workspace";

/**
 * 질문 정책의 실체. 모델은 항목마다 상태만 고르고, 무엇을 묻고 무엇을 가정하고 무엇을 프롬프트로 넘길지는 여기서 정한다.
 * 기준 한 줄: **저장소를 읽어서 알 수 있는 것은 묻지 않는다. 사람만 아는 것 중 결과물을 바꾸는 것만, 둘까지 묻는다.**
 */

/** 모든 개발 요청에 공통인 필요 정보. 세부 유형의 mustKnow는 이 뒤에 붙는다. */
export const UNIVERSAL_NEEDS: { id: string; label: string; hint: string }[] = [
  { id: "where", label: "대상 저장소·서비스", hint: "어느 저장소(모듈)에서 작업하나. 프로필·제목·라벨로 정해지면 filled" },
  { id: "deliverable", label: "결과물 형태", hint: "설계안 / 코드 변경 / 조사 목록 / 검토 의견 중 무엇을 내야 하나" },
  { id: "done", label: "완료·검증 기준", hint: "무엇이 통과하면 끝인가(테스트·화면 확인·문서). 코드에 테스트가 있는지는 agent_can_find" },
  { id: "scope", label: "범위 경계", hint: "건드리지 말 것·함께 바꿀 것. 티켓에 없으면 '티켓 범위 밖은 제안만'으로 assume" },
  { id: "external", label: "첨부·외부 문서의 핵심 정보", hint: "첨부 이미지·PDF·다른 시스템에만 있는 정보가 결과물에 필수인가. 필수면 ask(allow_other)" },
  { id: "policy", label: "업무 규칙·우선순위 결정", hint: "코드로 알 수 없는 업무 판단(어느 쿠키를 대상으로, 어느 카드사부터). 결과물이 달라지면 ask" },
];

/** 질문으로 올릴 때의 우선순위. 상한을 넘으면 뒤쪽이 가정으로 내려간다. */
const ASK_PRIORITY = ["where", "external", "policy", "deliverable", "done", "scope"];
const rank = (id: string) => { const i = ASK_PRIORITY.indexOf(id); return i === -1 ? ASK_PRIORITY.length : i; };

/** 모델에게 주는 장부 작성 규칙(분류·의도 정리 양쪽에서 같은 문장을 쓴다). */
export function needsRules(): string {
  return [
    "## 필요 정보 장부(needs) 작성 규칙",
    "아래 항목마다 status를 정한다. 항목을 빼거나 새로 만들지 않는다.",
    "- filled: 목표 문장·티켓에 답이 있다 → value에 그 답.",
    "- agent_can_find: 저장소를 읽으면 알 수 있다(코드값, 구현 위치, 호출부, 현재 동작, 테스트 유무, 설정값) → 절대 묻지 않는다. value에 '무엇을 확인할지' 한 문장.",
    "- assume: 관례적 기본값이 있고 틀려도 프롬프트 한 줄만 고치면 된다 → value에 가정 문장.",
    "- ask: 사람만 답할 수 있고(어느 저장소인지, 업무 규칙·우선순위·범위 결정, 첨부에만 있는 핵심 정보) 답에 따라 결과물이 달라진다 → question에 사용자에게 보일 질문 한 문장(이 티켓의 말로, 예: 'Visa도 마스터카드와 같은 조건에서만 전환하나요?'), options에 선택지 2~4개, value에 못 물을 때 쓸 기본값. ask가 아니면 question은 null.",
    `- ask는 최대 ${MAX_QUESTIONS}개. 셋 이상이면 결과물을 가장 크게 바꾸는 둘만 ask로 두고 나머지는 assume.`,
    "- why: 그 상태로 둔 이유 한 문장. 사용자가 검토 화면에서 읽는다.",
  ].join("\n");
}

/** 장부 항목 목록(모델에게 보여 줄 형태). */
export function needsCatalog(subtype: Subtype | null, profile: WorkspaceProfile | null | undefined, opts: { universal?: boolean } = {}): string {
  const lines: string[] = [];
  if (opts.universal !== false) {
    for (const n of UNIVERSAL_NEEDS) {
      let hint = n.hint;
      if (n.id === "where" && profile?.repos.length) hint += `. 선택지는 프로필의 저장소: ${profile.repos.map((r) => r.name).join(", ")}`;
      lines.push(`- ${n.id} (${n.label}): ${hint}`);
    }
  } else if (profile?.repos.length) {
    lines.push(`- where (대상 저장소·서비스): 어느 저장소에서 작업하나. 선택지: ${profile.repos.map((r) => r.name).join(", ")}`);
  }
  if (subtype) for (const m of subtype.mustKnow) lines.push(`- ${m.id} (${m.question}): 선택지 ${m.options.join(" | ")}`);
  return lines.join("\n");
}

export interface DerivedNeeds {
  needs: Need[];
  mode: "ready" | "ask";
  questions: PlanQuestion[];
  assumptions: string[];
  verify_in_repo: string[];
  repos: string[];
  /** external 항목이 ask/assume면 UI 경고용 */
  missing_inputs: string[];
}

/**
 * 장부 → 질문·가정·확인 목록. 결정적이다.
 * - where는 프로필에서 코드가 확정한 값이 모델의 판단을 이긴다.
 * - ask가 상한을 넘으면 우선순위 뒤쪽을 assume으로 내린다(value가 기본값이 된다).
 * - agent_can_find는 어떤 경우에도 질문이 되지 않는다.
 */
export function deriveNeeds(raw: Need[], opts: { profile?: WorkspaceProfile | null | undefined; repoMatches?: RepoMatch[] | undefined; allowedIds?: string[] | undefined; /** 목표 문장 흐름처럼 모델이 본 텍스트를 코드도 봤을 때만 true */ trustModelWhere?: boolean | undefined } = {}): DerivedNeeds {
  const allowed = opts.allowedIds ? new Set(opts.allowedIds) : null;
  const seen = new Set<string>();
  const needs: Need[] = [];
  for (const n of raw) {
    if (!n.id || seen.has(n.id) || (allowed && !allowed.has(n.id))) continue;
    seen.add(n.id);
    needs.push({ ...n, options: n.options.filter((o) => o.trim()).slice(0, 4) });
  }
  const matches = opts.repoMatches ?? [];
  const where = needs.find((n) => n.id === "where");
  let repos: string[] = [];
  if (matches.length) {
    repos = matches.map((m) => m.repo.name);
    const value = `${repos.join(", ")} (${matches.map((m) => m.evidence).join("; ")})`;
    if (where) { where.status = "filled"; where.value = value; where.question = null; where.why = "프로필의 저장소 이름·별칭이 티켓에 있어 코드가 확정했다."; }
    else needs.unshift({ id: "where", label: "대상 저장소·서비스", status: "filled", value, options: [], question: null, why: "프로필의 저장소 이름·별칭이 티켓에 있어 코드가 확정했다." });
  } else if (where?.status === "filled" && where.value) {
    repos = extractRepoNames(where.value, opts.profile);
    // 프로필이 있는데 코드가 제목·라벨·본문 어디서도 찾지 못한 저장소를 모델이 '확정'했다면 믿지 않는다(티켓 텍스트가 유도했을 수 있다) → 선택지로 묻는다
    if (opts.profile?.repos.length && opts.trustModelWhere !== true) { where.status = "ask"; where.question = where.question ?? null; where.why = `모델은 "${where.value}"로 봤지만 티켓의 제목·라벨·본문에서 프로필의 저장소 이름·별칭을 찾지 못해 확인이 필요하다.`; repos = []; }
  }
  if (where?.status === "ask" && opts.profile?.repos.length) {
    where.options = opts.profile.repos.map((r) => r.name);
  }
  if (where && where.status === "agent_can_find") { where.status = "ask"; where.value = null; where.why = "어느 저장소에서 시작할지는 저장소를 읽기 전에 정해져야 한다."; if (opts.profile?.repos.length) where.options = opts.profile.repos.map((r) => r.name); }

  const asks = needs.filter((n) => n.status === "ask").sort((a, b) => rank(a.id) - rank(b.id));
  for (const n of asks.slice(MAX_QUESTIONS)) { n.status = "assume"; n.value = n.value || `${n.label}: 기본값으로 가정`; n.why = `질문 상한(${MAX_QUESTIONS}개)을 넘어 가정으로 둔다. ${n.why}`.trim(); }
  const questions: PlanQuestion[] = needs.filter((n) => n.status === "ask").sort((a, b) => rank(a.id) - rank(b.id)).map((n) => ({
    id: n.id,
    question: n.question?.trim() || (n.id === "where" ? "어느 저장소에서 작업하나요?" : n.id === "external" ? `${n.label} — 필요한 내용을 알려 주세요` : `${n.label}을(를) 정해 주세요`),
    options: n.options.map((o) => ({ value: o, label: o })),
    allow_other: true,
    why: n.why,
  }));
  const assumptions = needs.filter((n) => n.status === "assume").map((n) => (n.value ? (n.value.includes(n.label) ? n.value : `${n.label}: ${n.value}`) : `${n.label}: 기본값으로 가정`));
  const verify_in_repo = needs.filter((n) => n.status === "agent_can_find" && n.value).map((n) => n.value!);
  const missing_inputs = needs.filter((n) => n.id === "external" && n.status !== "filled" && n.status !== "agent_can_find").map((n) => n.value ?? n.why).filter(Boolean);
  return { needs, mode: questions.length ? "ask" : "ready", questions, assumptions, verify_in_repo, repos, missing_inputs };
}

/** "reporter-api, kyc-front (라벨)" 같은 값에서 프로필의 저장소 이름만 골라낸다. 프로필이 없으면 첫 토큰. */
function extractRepoNames(value: string, profile: WorkspaceProfile | null | undefined): string[] {
  if (profile?.repos.length) return profile.repos.filter((r) => new RegExp(`(^|[^A-Za-z0-9_-])${r.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_-])`, "i").test(value)).map((r) => r.name);
  const first = value.split(/[,(/\s]+/).find((t) => /^[A-Za-z][A-Za-z0-9_.-]{2,}$/.test(t));
  return first ? [first] : [];
}

/** 질문에 대한 답을 장부에 다시 반영한다(답한 항목은 filled). 생성 단계로 넘길 때 쓴다. */
export function applyAnswers(needs: Need[], answers: Record<string, string>): Need[] {
  return needs.map((n) => (answers[n.id] ? { ...n, status: "filled", value: answers[n.id]! } : n));
}
