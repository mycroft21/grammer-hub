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
