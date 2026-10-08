import { z } from "zod";
import { PromptLanguage, PromptLength, Runtime } from "./spec";

/**
 * 작업 공간 프로필 = "매번 질문으로 되돌아오는 것"을 미리 적어 두는 파일(루트 `studio.workspace.json`).
 * Claude Code의 CLAUDE.md, Codex의 AGENTS.md가 저장소 안에서 하는 일을, 이 도구는 저장소 밖(티켓 → 프롬프트 단계)에서 한다.
 * 프로필이 있으면: (1) 티켓의 태그·라벨·본문에서 대상 저장소를 코드가 먼저 확정하고, (2) 못 정할 때만 프로필의 저장소 목록을 선택지로 묻고,
 * (3) 저장소별 검증 명령·주의사항·팀 규칙이 프롬프트 재료로 들어간다. 없으면 지금처럼 모델이 티켓 텍스트만 보고 추측한다.
 */
export const WorkspaceRepo = z.object({
  name: z.string().min(1),                       // 저장소 이름. 시작점·질문 선택지에 그대로 쓴다
  what: z.string().min(1),                       // 한 줄: 무슨 시스템인지(어드민 API, 가맹점 프론트 …)
  stack: z.string().optional(),                  // "Java 17 / Spring Boot 3 / MyBatis"
  aliases: z.array(z.string()).default([]),      // 티켓에서 이 저장소를 가리키는 말: "[partner]", "리포터", "reporter"
  entry: z.array(z.string()).default([]),        // 어디부터 보면 되는지 관례: "*.do 화면 → 같은 이름의 *Controller"
  verify: z.array(z.string()).default([]),       // 검증 명령: "./gradlew test", "pnpm test"
  notes: z.array(z.string()).default([]),        // 저장소별 주의: "legacy엔 신규 로직을 넣지 않는다"
});
export type WorkspaceRepo = z.infer<typeof WorkspaceRepo>;

export const WorkspaceProfile = z.object({
  version: z.literal(1),
  team: z.string().optional(),
  repos: z.array(WorkspaceRepo).default([]),
  /** Jira 프로젝트 키 → 뜻. "ES": "보안 점검(스캐너 결과)" — 분류에 힌트가 된다 */
  projects: z.record(z.string(), z.string()).default({}),
  /** 모든 개발 프롬프트에 후보로 들어가는 팀 규칙. 5개 이하 권장(길면 아무것도 지켜지지 않는다) */
  conventions: z.array(z.string()).default([]),
  /** 용어 → 뜻. 텍스트에 등장하는 용어만 프롬프트에 넣는다 */
  glossary: z.record(z.string(), z.string()).default({}),
  defaults: z.object({ runtime: Runtime.optional(), length: PromptLength.optional(), promptLanguage: PromptLanguage.optional() }).default({}),
});
export type WorkspaceProfile = z.infer<typeof WorkspaceProfile>;

/** 프로필이 없을 때의 빈 값. 코드는 언제나 프로필이 있다고 가정하고 짤 수 있다. */
export const EMPTY_PROFILE: WorkspaceProfile = { version: 1, repos: [], projects: {}, conventions: [], glossary: {}, defaults: {} };

/** 파일 내용 → 프로필. 실패 이유를 사람이 읽을 수 있게 돌려준다. */
export function parseWorkspaceProfile(raw: string): { ok: true; profile: WorkspaceProfile } | { ok: false; message: string } {
  let json: unknown;
  try { json = JSON.parse(raw); } catch (e) { return { ok: false, message: `JSON 문법 오류: ${(e as Error).message}` }; }
  const r = WorkspaceProfile.safeParse(json);
  if (!r.success) return { ok: false, message: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
  const names = new Set<string>();
  for (const repo of r.data.repos) { if (names.has(repo.name)) return { ok: false, message: `repos.name 중복: ${repo.name}` }; names.add(repo.name); }
  return { ok: true, profile: r.data };
}

export interface RepoMatch { repo: WorkspaceRepo; evidence: string }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 이름·별칭이 텍스트에 나오는지. 영문은 단어 경계, 그 외(한글·괄호 태그)는 포함 여부. */
function mentions(text: string, term: string): boolean {
  if (!term.trim()) return false;
  // 경계에 - 와 . 도 포함: 별칭 "reporter"가 "reporter-legacy" 안에서 걸리지 않게
  if (/^[A-Za-z0-9_.-]+$/.test(term)) return new RegExp(`(^|[^A-Za-z0-9_.-])${escapeRe(term)}(?![A-Za-z0-9_.-])`, "i").test(text);
  return text.toLowerCase().includes(term.toLowerCase());
}

/**
 * 티켓(제목·라벨·컴포넌트·본문)이나 목표 문장에서 대상 저장소를 코드가 먼저 찾는다.
 * 제목·라벨·컴포넌트 일치를 본문 일치보다 앞에 둔다(본문은 다른 저장소를 언급만 할 수 있다).
 */
export function resolveRepos(profile: WorkspaceProfile, parts: { title?: string; labels?: string[]; components?: string[]; body?: string }): RepoMatch[] {
  const head = [parts.title ?? "", ...(parts.labels ?? []), ...(parts.components ?? [])].join("\n");
  const body = parts.body ?? "";
  const out: RepoMatch[] = [];
  for (const repo of profile.repos) {
    const terms = [repo.name, ...repo.aliases];
    const hit = terms.find((t) => mentions(head, t));
    if (hit) { out.push({ repo, evidence: `제목·라벨에 "${hit}"` }); continue; }
    const inBody = terms.find((t) => mentions(body, t));
    if (inBody) out.push({ repo, evidence: `본문에 "${inBody}"` });
  }
  // 제목·라벨 일치가 하나라도 있으면 본문 일치는 버린다(언급과 대상은 다르다)
  const strong = out.filter((m) => m.evidence.startsWith("제목"));
  return strong.length ? strong : out;
}

/** 텍스트에 등장하는 용어만 골라 "용어: 뜻" 목록으로. */
export function glossaryFor(profile: WorkspaceProfile, text: string, max = 8): string[] {
  return Object.entries(profile.glossary).filter(([term]) => mentions(text, term)).slice(0, max).map(([t, d]) => `${t}: ${d}`);
}

/** Jira 키(EP-1174)의 프로젝트 뜻. */
export function projectMeaning(profile: WorkspaceProfile, issueKey: string | null | undefined): string | null {
  const proj = issueKey?.split("-")[0];
  return proj && profile.projects[proj] ? `${proj} = ${profile.projects[proj]}` : null;
}

export const hasProfile = (p: WorkspaceProfile | null | undefined): p is WorkspaceProfile => Boolean(p && (p.repos.length || p.conventions.length || Object.keys(p.glossary).length));

/**
 * 모델에게 주는 작업 공간 블록. 분류(티켓 → 목표)와 생성(목표 → 스펙) 양쪽에 같은 내용을 넣는다.
 * `repos`를 주면 그 저장소의 진입점·검증·주의를 자세히, 나머지는 이름과 한 줄만.
 */
export function workspaceBlock(profile: WorkspaceProfile | null | undefined, opts: { text?: string; repos?: string[]; issueKey?: string | null } = {}): string {
  if (!hasProfile(profile)) return "";
  const focus = new Set(opts.repos ?? []);
  const lines: string[] = ["## 작업 공간(사용자 팀의 저장소·규칙. 추측 대신 여기 적힌 것을 쓴다)"];
  if (profile.team) lines.push(`팀: ${profile.team}`);
  if (profile.repos.length) {
    lines.push("저장소:");
    for (const r of profile.repos) {
      const head = `- ${r.name}: ${r.what}${r.stack ? ` (${r.stack})` : ""}`;
      if (!focus.has(r.name)) { lines.push(head); continue; }
      lines.push(head + " ← 이번 대상");
      if (r.entry.length) lines.push(`  - 어디부터: ${r.entry.join(" / ")}`);
      if (r.verify.length) lines.push(`  - 검증 명령: ${r.verify.join(" / ")}`);
      if (r.notes.length) lines.push(`  - 주의: ${r.notes.join(" / ")}`);
    }
  }
  const proj = projectMeaning(profile, opts.issueKey);
  if (proj) lines.push(`Jira 프로젝트: ${proj}`);
  if (profile.conventions.length) lines.push("팀 규칙(이 목표에 실제로 걸리는 것만 hard_rules 후보로. 전부 넣지 않는다):", ...profile.conventions.map((c) => `- ${c}`));
  const gl = opts.text ? glossaryFor(profile, opts.text) : [];
  if (gl.length) lines.push("용어:", ...gl.map((g) => `- ${g}`));
  return lines.join("\n");
}

/** 프로필 요약(상태 화면·health용). 비밀값 없음. */
export function profileSummary(profile: WorkspaceProfile | null | undefined): { repos: number; conventions: number; glossary: number; team: string | null } | null {
  if (!profile) return null;
  return { repos: profile.repos.length, conventions: profile.conventions.length, glossary: Object.keys(profile.glossary).length, team: profile.team ?? null };
}

/** 예시 파일(studio.workspace.example.json)과 테스트가 함께 쓰는 예시 프로필. 실제 팀 값이 아니라 형태를 보이는 자리표시자. */
export const EXAMPLE_PROFILE: WorkspaceProfile = WorkspaceProfile.parse({
  version: 1,
  team: "결제 플랫폼 개발팀",
  repos: [
    { name: "reporter-api", what: "가맹점 어드민(리포터) 백엔드 API. 서브몰·정산·카드사 상태 로직이 여기 있다", stack: "Java 17 / Spring Boot / MyBatis",
      aliases: ["reporter", "리포터", "[reporter]"], entry: ["어드민 화면 *.do → 같은 이름의 *Controller → *CommandService"], verify: ["./gradlew test"], notes: ["reporter-legacy에 있는 화면이라도 실제 로직은 대부분 reporter-api에 있다"] },
    { name: "reporter-legacy", what: "가맹점 어드민 화면(JSP)과 레거시 서비스", stack: "Java 8 / Spring MVC / JSP", aliases: ["legacy", "레거시"], entry: [], verify: [], notes: ["신규 비즈니스 로직을 넣지 않는다. 화면·호출부만 고친다"] },
    { name: "eximbay-partner", what: "파트너(제휴사) 포털", stack: "Java / Spring Boot", aliases: ["[partner]", "partner", "파트너"], entry: [], verify: ["./gradlew test"], notes: [] },
  ],
  projects: { EP: "결제 플랫폼 개발 요청", ES: "보안 점검 결과(스캐너 지적 사항)" },
  conventions: ["기존 동작은 바꾸지 않고 같은 방식으로 분기를 추가한다", "변경한 파일마다 기존 테스트가 있으면 함께 고친다", "티켓 범위 밖 리팩터링은 제안만 하고 코드로 쓰지 않는다"],
  glossary: { "서브몰": "가맹점 아래의 하위 상점 단위", "PSP": "Payment Service Provider. 결제대행사 모델", "SDD": "Solution Design Document(PayPal 측 설계 문서)" },
  defaults: { runtime: "claude_code", length: "short" },
});

// ─────────────────────────── 프로필 편집(설정 폼·검토 화면의 "프로필에 추가") ───────────────────────────
/** 파일에 쓰는 표준 형태. 폼·가져오기·자동 추가가 모두 이 형태로 저장해 diff가 깔끔하다. */
export function formatProfile(profile: WorkspaceProfile): string {
  return JSON.stringify(profile, null, 2) + "\n";
}

const trimList = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));
const trimRecord = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), v.trim()]).filter(([k, v]) => k && v));
/**
 * 폼 초안 정리: 공백만 있는 항목·빈 줄·빈 키를 버린다. 폼은 "추가" 버튼으로 빈 칸을 만들기 때문에 저장 직전에 한 번 거친다.
 * 이름이나 설명이 비어 있는 저장소는 남겨 두어 스키마 검증이 그 칸을 가리키게 한다.
 */
export function cleanProfileDraft(p: WorkspaceProfile): WorkspaceProfile {
  const team = p.team?.trim();
  return {
    version: 1,
    ...(team ? { team } : {}),
    repos: p.repos.map((r) => {
      const stack = r.stack?.trim();
      return { name: r.name.trim(), what: r.what.trim(), ...(stack ? { stack } : {}), aliases: trimList(r.aliases), entry: trimList(r.entry), verify: trimList(r.verify), notes: trimList(r.notes) };
    }),
    projects: trimRecord(p.projects),
    conventions: trimList(p.conventions),
    glossary: trimRecord(p.glossary),
    defaults: { ...(p.defaults.runtime ? { runtime: p.defaults.runtime } : {}), ...(p.defaults.length ? { length: p.defaults.length } : {}), ...(p.defaults.promptLanguage ? { promptLanguage: p.defaults.promptLanguage } : {}) },
  };
}

/** 검증 실패를 폼 칸 옆에 붙이기 위한 경로 → 메시지. 경로는 zod path("repos.1.name"). 이름 중복은 그 저장소의 name 칸에 붙인다. */
export function profileIssues(p: unknown): Record<string, string> {
  const r = WorkspaceProfile.safeParse(p);
  const out: Record<string, string> = {};
  if (!r.success) { for (const i of r.error.issues) { const k = i.path.join(".") || "(root)"; if (!out[k]) out[k] = i.message; } return out; }
  const seen = new Map<string, number>();
  r.data.repos.forEach((repo, idx) => { const key = repo.name.toLowerCase(); if (seen.has(key)) out[`repos.${idx}.name`] = `이름 중복: ${repo.name}`; else seen.set(key, idx); });
  return out;
}

/** 검토 화면에서 한 번 클릭으로 프로필에 넣는 작은 변경. 파일 전체를 다시 쓰지 않고 이 연산만 서버에 보낸다. */
export const ProfileOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_repo"), name: z.string().min(1).max(80), what: z.string().min(1).max(200), aliases: z.array(z.string().max(80)).max(10).default([]), verify: z.array(z.string().max(200)).max(5).default([]) }),
  z.object({ op: z.literal("add_alias"), repo: z.string().min(1), alias: z.string().min(1).max(80) }),
  z.object({ op: z.literal("add_verify"), repo: z.string().min(1), command: z.string().min(1).max(200) }),
]);
export type ProfileOp = z.infer<typeof ProfileOp>;

const sameTerm = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** 연산을 순서대로 적용한다. 이미 있는 값은 건너뛰고(changes에 안 남음), 없는 저장소를 가리키면 실패. 원본은 바꾸지 않는다. */
export function applyProfileOps(profile: WorkspaceProfile, ops: ProfileOp[]): { ok: true; profile: WorkspaceProfile; changes: string[] } | { ok: false; message: string } {
  const next: WorkspaceProfile = { ...profile, repos: profile.repos.map((r) => ({ ...r, aliases: [...r.aliases], entry: [...r.entry], verify: [...r.verify], notes: [...r.notes] })) };
  const changes: string[] = [];
  const find = (name: string) => next.repos.find((r) => sameTerm(r.name, name));
  for (const op of ops) {
    if (op.op === "add_repo") {
      const name = op.name.trim(), what = op.what.trim();
      if (find(name)) continue;
      next.repos.push({ name, what, aliases: trimList(op.aliases).filter((a) => !sameTerm(a, name)), entry: [], verify: trimList(op.verify), notes: [] });
      changes.push(`저장소 ${name} 추가`);
    } else if (op.op === "add_alias") {
      const repo = find(op.repo);
      if (!repo) return { ok: false, message: `프로필에 없는 저장소: ${op.repo}` };
      const alias = op.alias.trim();
      if (sameTerm(alias, repo.name) || repo.aliases.some((a) => sameTerm(a, alias))) continue;
      const taken = next.repos.find((r) => r !== repo && (sameTerm(r.name, alias) || r.aliases.some((a) => sameTerm(a, alias))));
      if (taken) return { ok: false, message: `"${alias}"는 이미 ${taken.name}의 이름·별칭입니다` };
      repo.aliases.push(alias);
      changes.push(`${repo.name} 별칭 "${alias}"`);
    } else {
      const repo = find(op.repo);
      if (!repo) return { ok: false, message: `프로필에 없는 저장소: ${op.repo}` };
      const cmd = op.command.trim();
      if (repo.verify.some((v) => sameTerm(v, cmd))) continue;
      repo.verify.push(cmd);
      changes.push(`${repo.name} 검증 명령 "${cmd}"`);
    }
  }
  return { ok: true, profile: next, changes };
}

/**
 * 코드가 저장소를 못 정해 사용자가 직접 골랐을 때, 다음엔 묻지 않게 해 줄 별칭 후보.
 * 티켓 제목의 대괄호 태그([partner]) → 라벨 → 컴포넌트 순. 이미 어떤 저장소의 이름·별칭인 것은 뺀다(그랬다면 코드가 확정했을 것이다).
 */
export function suggestAliases(profile: { repos: { name: string; aliases: string[] }[] }, ticket: { summary: string; labels: string[]; components: string[] }, max = 3): string[] {
  const known = (t: string) => profile.repos.some((r) => sameTerm(r.name, t) || r.aliases.some((a) => sameTerm(a, t)));
  const tags = (ticket.summary.match(/\[[^\]\n]{1,40}\]/g) ?? []).map((t) => t.trim());
  const out: string[] = [];
  for (const c of [...tags, ...ticket.labels, ...ticket.components]) {
    const t = c.trim();
    if (!t || t.length > 40 || known(t) || out.some((o) => sameTerm(o, t))) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

// ─────────────────────────── 개인 층(내 작업 공간) — 팀 기본값 위에 얹는다 ───────────────────────────
/**
 * 사람마다 DB에 두는 작업 공간. 팀 파일(WorkspaceProfile)과 모양이 같되 레포의 what이 선택이다.
 * - 팀 레포와 이름이 같으면(대소문자 무시) '얹기': 별칭·진입점·검증·주의만 더하고 what·stack은 팀 값을 쓴다(저장 시 what·stack을 주면 거부).
 * - 팀에 없는 레포는 what이 있어야 하는 '내 레포'.
 */
export const OVERLAY_MAX_CONVENTIONS = 5;
export const WorkspaceOverlayRepo = WorkspaceRepo.extend({ what: z.string().optional() });
export type WorkspaceOverlayRepo = z.infer<typeof WorkspaceOverlayRepo>;
export const WorkspaceOverlay = z.object({
  version: z.literal(1),
  repos: z.array(WorkspaceOverlayRepo).default([]),
  projects: z.record(z.string(), z.string()).default({}),
  conventions: z.array(z.string()).max(OVERLAY_MAX_CONVENTIONS, `개인 규칙은 ${OVERLAY_MAX_CONVENTIONS}개까지`).default([]),
  glossary: z.record(z.string(), z.string()).default({}),
  defaults: z.object({ runtime: Runtime.optional(), length: PromptLength.optional(), promptLanguage: PromptLanguage.optional() }).default({}),
});
export type WorkspaceOverlay = z.infer<typeof WorkspaceOverlay>;
export const EMPTY_OVERLAY: WorkspaceOverlay = { version: 1, repos: [], projects: {}, conventions: [], glossary: {}, defaults: {} };

/** 합칠 때 적용하지 못한 내 설정 한 건(내 설정 화면에 그대로 보여 준다). */
export interface OverlayDrop { repo: string; reason: string }

const hasOverlay = (o: WorkspaceOverlay | null | undefined): o is WorkspaceOverlay =>
  Boolean(o && (o.repos.length || o.conventions.length || Object.keys(o.projects).length || Object.keys(o.glossary).length || Object.keys(o.defaults).length));
const mergeList = (a: string[], b: string[]) => { const out = [...a]; for (const x of b) if (!out.some((y) => sameTerm(x, y))) out.push(x); return out; };

/**
 * 팀 기본값 + 내 층 → 실제로 쓰는 프로필. 팀이 나중에 바뀌어 어긋난 항목은 버리고 drops로 알린다(저장 시 검사만으로는 못 막는다).
 * - 고아: what 없이 얹어 둔 항목인데 팀에 그 레포가 없다.
 * - 이름 충돌: what이 있는 내 레포와 같은 이름을 팀이 추가했다 → 내 항목 전체를 버린다(다른 저장소일 수 있어 섞지 않는다).
 * - 별칭이 다른 레포의 이름·별칭과 겹치면 그 별칭만 버린다(팀 우선 — 겹치면 코드가 저장소를 확정하지 못한다).
 */
export function mergeWorkspace(team: WorkspaceProfile | null | undefined, mine: WorkspaceOverlay | null | undefined, opts: { teamUnreadable?: boolean } = {}): { profile: WorkspaceProfile | null; drops: OverlayDrop[] } {
  if (!hasOverlay(mine)) return { profile: team ?? null, drops: [] };
  const base = team ?? EMPTY_PROFILE;
  const repos: WorkspaceRepo[] = base.repos.map((r) => ({ ...r, aliases: [...r.aliases], entry: [...r.entry], verify: [...r.verify], notes: [...r.notes] }));
  const drops: OverlayDrop[] = [];
  const termOwner = (t: string, self: WorkspaceRepo | null) => repos.find((r) => r !== self && (sameTerm(r.name, t) || r.aliases.some((a) => sameTerm(a, t))));
  const addAliases = (target: WorkspaceRepo, aliases: string[]) => {
    for (const a of aliases) {
      if (sameTerm(a, target.name) || target.aliases.some((x) => sameTerm(x, a))) continue;
      const owner = termOwner(a, target);
      if (owner) { drops.push({ repo: target.name, reason: `별칭 "${a}"가 ${owner.name}의 이름·별칭과 겹쳐 빠졌습니다` }); continue; }
      target.aliases.push(a);
    }
  };
  for (const o of mine.repos) {
    const teamRepo = base.repos.length ? repos.slice(0, base.repos.length).find((r) => sameTerm(r.name, o.name)) : undefined;
    if (teamRepo) {
      if (o.what?.trim()) { drops.push({ repo: o.name, reason: "팀에 같은 이름의 저장소가 생겨 내 항목 전체가 빠졌습니다. 다른 저장소면 이름을 바꾸고, 같은 저장소면 설명을 지워 팀 저장소에 얹으세요" }); continue; }
      teamRepo.entry = mergeList(teamRepo.entry, o.entry); teamRepo.verify = mergeList(teamRepo.verify, o.verify); teamRepo.notes = mergeList(teamRepo.notes, o.notes);
      addAliases(teamRepo, o.aliases);
      continue;
    }
    if (!o.what?.trim()) { drops.push({ repo: o.name, reason: opts.teamUnreadable ? "팀 기본값 파일에 오류가 있어 잠시 적용되지 않습니다(관리자가 고치면 돌아옵니다)" : "얹어 둔 팀 저장소가 팀 설정에서 없어졌습니다(이름이 바뀌었을 수 있음)" }); continue; }
    if (termOwner(o.name, null)) { drops.push({ repo: o.name, reason: "이름이 다른 저장소의 별칭과 겹쳐 빠졌습니다" }); continue; }
    const stack = o.stack?.trim();
    const mineRepo: WorkspaceRepo = { name: o.name, what: o.what.trim(), ...(stack ? { stack } : {}), aliases: [], entry: [...o.entry], verify: [...o.verify], notes: [...o.notes] };
    repos.push(mineRepo);
    addAliases(mineRepo, o.aliases);
  }
  return {
    profile: {
      ...base, repos,
      projects: { ...base.projects, ...mine.projects },
      conventions: mergeList(base.conventions, mine.conventions),
      glossary: { ...base.glossary, ...mine.glossary },
      defaults: { ...base.defaults, ...mine.defaults },
    },
    drops,
  };
}

/** 내 층 폼 초안 정리(빈 칸 버리기). cleanProfileDraft와 같은 역할. */
export function cleanOverlayDraft(o: WorkspaceOverlay): WorkspaceOverlay {
  return {
    version: 1,
    repos: o.repos.map((r) => {
      const what = r.what?.trim(), stack = r.stack?.trim();
      return { name: r.name.trim(), ...(what ? { what } : {}), ...(stack ? { stack } : {}), aliases: trimList(r.aliases), entry: trimList(r.entry), verify: trimList(r.verify), notes: trimList(r.notes) };
    }),
    projects: trimRecord(o.projects), conventions: trimList(o.conventions), glossary: trimRecord(o.glossary),
    defaults: { ...(o.defaults.runtime ? { runtime: o.defaults.runtime } : {}), ...(o.defaults.length ? { length: o.defaults.length } : {}), ...(o.defaults.promptLanguage ? { promptLanguage: o.defaults.promptLanguage } : {}) },
  };
}

/**
 * 내 층을 저장하기 전 검사. 경로("repos.1.what") → 메시지(profileIssues와 같은 모양, 폼 칸 옆에 붙인다).
 * 팀 기준으로 본다: 팀 레포에 얹는 항목은 what·stack 금지, 내 레포는 what 필수, 별칭은 합친 결과에서 다른 레포와 겹치면 거부.
 */
export function overlayIssues(team: WorkspaceProfile | null | undefined, o: unknown): Record<string, string> {
  const r = WorkspaceOverlay.safeParse(o);
  const out: Record<string, string> = {};
  if (!r.success) { for (const i of r.error.issues) { const k = i.path.join(".") || "(root)"; if (!out[k]) out[k] = i.message; } return out; }
  const teamRepos = team?.repos ?? [];
  const seen = new Map<string, number>();
  // 이름·별칭 → 주인 레포 이름. 팀 것을 먼저 채운다
  const owner = new Map<string, string>();
  for (const t of teamRepos) for (const term of [t.name, ...t.aliases]) owner.set(term.trim().toLowerCase(), t.name);
  r.data.repos.forEach((repo, idx) => {
    const key = repo.name.trim().toLowerCase();
    if (!key) { out[`repos.${idx}.name`] = "이름을 입력하세요"; return; }
    if (seen.has(key)) { out[`repos.${idx}.name`] = `이름 중복: ${repo.name}`; return; }
    seen.set(key, idx);
    const onTeam = teamRepos.find((t) => sameTerm(t.name, repo.name));
    if (onTeam) {
      if (repo.what?.trim() || repo.stack?.trim()) out[`repos.${idx}.what`] = `팀 저장소 ${onTeam.name}에 얹는 항목은 설명·스택을 팀 값으로 씁니다. 다른 저장소면 이름을 바꾸세요`;
    } else {
      if (!repo.what?.trim()) out[`repos.${idx}.what`] = "팀에 없는 저장소는 설명이 필요합니다";
      const o2 = owner.get(key);
      if (o2) { out[`repos.${idx}.name`] = `"${repo.name}"는 이미 ${o2}의 별칭입니다`; return; }
      owner.set(key, repo.name);
    }
    const self = onTeam?.name ?? repo.name;
    repo.aliases.forEach((a, ai) => {
      const k = a.trim().toLowerCase(); if (!k) return;
      const o3 = owner.get(k);
      if (o3 && !sameTerm(o3, self)) out[`repos.${idx}.aliases.${ai}`] = `"${a}"는 이미 ${o3}의 이름·별칭입니다`;
      else owner.set(k, self);
    });
  });
  return out;
}

/**
 * 검토 화면의 '프로필에 추가'를 내 층에 적용한다. 대상 저장소는 합친 결과에서 찾고(팀 레포 포함), 팀 레포면 얹기 항목을 만든다.
 * 이미 있는 값은 건너뛴다. 원본은 바꾸지 않는다.
 */
export function applyOverlayOps(team: WorkspaceProfile | null | undefined, mine: WorkspaceOverlay, ops: ProfileOp[]): { ok: true; overlay: WorkspaceOverlay; changes: string[] } | { ok: false; message: string } {
  const next: WorkspaceOverlay = { ...mine, repos: mine.repos.map((r) => ({ ...r, aliases: [...r.aliases], entry: [...r.entry], verify: [...r.verify], notes: [...r.notes] })) };
  const changes: string[] = [];
  // 이미 있던 문제(팀이 바뀌어 생긴 고아·충돌)는 /me에 표시만 하고, 이번 연산이 새로 만든 문제만 거부한다
  const before = new Set(Object.keys(overlayIssues(team, mine)));
  const conflictMsg = (name: string) => `내 작업 공간의 ${name} 항목이 팀 저장소와 이름이 겹쳐 적용되지 않고 있습니다 — 내 설정 › 내 작업 공간에서 먼저 정리하세요`;
  for (const op of ops) {
    const merged = mergeWorkspace(team, next).profile ?? EMPTY_PROFILE;
    const findMerged = (name: string) => merged.repos.find((r) => sameTerm(r.name, name));
    const entryFor = (name: string) => {
      let e = next.repos.find((r) => sameTerm(r.name, name));
      if (!e) { e = { name, aliases: [], entry: [], verify: [], notes: [] }; next.repos.push(e); }
      return e;
    };
    if (op.op === "add_repo") {
      const name = op.name.trim();
      if (findMerged(name)) continue;
      // 같은 이름의 고아 얹기 항목이 있으면 새 행을 만들지 않고 그 항목을 내 저장소로 바꾼다(이름 중복 행 방지)
      const orphan = next.repos.find((r) => sameTerm(r.name, name));
      if (orphan) { orphan.what = op.what.trim(); orphan.aliases = mergeList(orphan.aliases, trimList(op.aliases).filter((a) => !sameTerm(a, name))); orphan.verify = mergeList(orphan.verify, trimList(op.verify)); }
      else next.repos.push({ name, what: op.what.trim(), aliases: trimList(op.aliases).filter((a) => !sameTerm(a, name)), entry: [], verify: trimList(op.verify), notes: [] });
      changes.push(`저장소 ${name} 추가`);
    } else if (op.op === "add_alias") {
      const repo = findMerged(op.repo);
      if (!repo) return { ok: false, message: `프로필에 없는 저장소: ${op.repo}` };
      const alias = op.alias.trim();
      if (sameTerm(alias, repo.name) || repo.aliases.some((a) => sameTerm(a, alias))) continue;
      const taken = merged.repos.find((r) => r !== repo && (sameTerm(r.name, alias) || r.aliases.some((a) => sameTerm(a, alias))));
      if (taken) return { ok: false, message: `"${alias}"는 이미 ${taken.name}의 이름·별칭입니다` };
      const e = entryFor(repo.name);
      if (e.what?.trim() && team?.repos.some((t) => sameTerm(t.name, repo.name))) return { ok: false, message: conflictMsg(repo.name) };
      e.aliases.push(alias);
      changes.push(`${repo.name} 별칭 "${alias}"`);
    } else {
      const repo = findMerged(op.repo);
      if (!repo) return { ok: false, message: `프로필에 없는 저장소: ${op.repo}` };
      const cmd = op.command.trim();
      if (repo.verify.some((v) => sameTerm(v, cmd))) continue;
      const e = entryFor(repo.name);
      if (e.what?.trim() && team?.repos.some((t) => sameTerm(t.name, repo.name))) return { ok: false, message: conflictMsg(repo.name) };
      e.verify.push(cmd);
      changes.push(`${repo.name} 검증 명령 "${cmd}"`);
    }
  }
  // 저장(PUT)과 같은 검사를 거친다 — 통과하지 못한 값은 합칠 때 빠지므로 '추가했다'고 답하면 안 된다
  if (changes.length) {
    const fresh = Object.entries(overlayIssues(team, next)).filter(([k]) => !before.has(k));
    if (fresh.length) return { ok: false, message: `${fresh[0]![1]} — 내 설정 › 내 작업 공간에서 확인하세요` };
  }
  return { ok: true, overlay: next, changes };
}
