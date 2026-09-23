import type { CheckResult, DictionaryEntry, PlanResult, ProfileOp, PromptSpec, RenderedPrompt, SituationProfile, SlotKey, StudioRequest, StyleRule, Ticket, TicketPlanResult, WorkspaceProfile } from "@grammer-hub/core";

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  profiles: {
    list: () => fetch("/api/profiles").then(j<SituationProfile[]>),
    save: (p: Omit<SituationProfile, "userId">) => fetch(`/api/profiles/${encodeURIComponent(p.id)}`, json("PUT", { ...p, id: undefined })).then(j<SituationProfile>),
    create: (p: Omit<SituationProfile, "userId">) => fetch("/api/profiles", json("POST", p)).then(j<SituationProfile>),
    remove: (id: string) => fetch(`/api/profiles/${encodeURIComponent(id)}`, { method: "DELETE" }).then(j<{ ok: true }>),
  },
  rules: {
    list: () => fetch("/api/rules").then(j<StyleRule[]>),
    create: (r: Partial<StyleRule> & { text: string }) => fetch("/api/rules", json("POST", r)).then(j<StyleRule>),
    save: (id: string, r: Partial<StyleRule> & { text: string }) => fetch(`/api/rules/${id}`, json("PUT", r)).then(j<StyleRule>),
    remove: (id: string) => fetch(`/api/rules/${id}`, { method: "DELETE" }).then(j<{ ok: true }>),
  },
  dictionary: {
    list: () => fetch("/api/dictionary").then(j<DictionaryEntry[]>),
    create: (e: Partial<DictionaryEntry> & { term: string }) => fetch("/api/dictionary", json("POST", e)).then(j<DictionaryEntry>),
    remove: (id: string) => fetch(`/api/dictionary/${id}`, { method: "DELETE" }).then(j<{ ok: true }>),
  },
  feedback: (body: Record<string, unknown>) => fetch("/api/feedback", json("POST", body)).then(j<{ id: string; ruleId: string | null }>),
  final: (runId: string, finalText: string) => fetch(`/api/runs/${runId}/final`, json("POST", { finalText })).then(j<{ ok: true }>),
  runs: () => fetch("/api/runs").then(j<RunSummary[]>),
  stats: () => fetch("/api/stats").then(j<Stats>),
  prompts: {
    ticket: (ticket: string, signal?: AbortSignal) => fetch("/api/prompts/ticket", { ...json("POST", { ticket }), signal: signal ?? null }).then(j<{ ticket: Ticket; plan: TicketPlanResult; usage: StudioUsage; configured: boolean; workspace: WorkspaceStatus }>),
    /** Jira 설정 여부 + 작업 공간 프로필 요약(저장소 이름은 폼 선택지로) */
    ticketConfigured: () => fetch("/api/prompts/ticket").then(j<{ configured: boolean; workspace: WorkspaceStatus }>),
    plan: (req: StudioRequest, signal?: AbortSignal) => fetch("/api/prompts/plan", { ...json("POST", req), signal: signal ?? null }).then(j<{ plan: PlanResult; usage: StudioUsage }>),
    /** SSE 응답. 파싱은 호출자가 readSseRaw로. */
    generate: (req: StudioRequest, signal?: AbortSignal) => fetch("/api/prompts/generate", { ...json("POST", req), signal: signal ?? null }),
    regenerate: (body: { request: StudioRequest; spec: PromptSpec; slot: SlotKey; instruction?: string | null }) => fetch("/api/prompts/regenerate", json("POST", body)).then(j<{ spec: PromptSpec; rendered: RenderedPrompt; checks: CheckResult[] }>),
    list: (archived = false) => fetch(`/api/prompts${archived ? "?archived=1" : ""}`).then(j<{ items: PromptSummary[]; stats: PromptStats }>),
    get: (id: string) => fetch(`/api/prompts/${id}`).then(j<{ prompt: PromptRow; versions: PromptVersion[] }>),
    save: (body: { purpose: StudioRequest["purpose"]; subtype: string | null; language: "ko" | "en"; goal: string; ticketKey?: string | null; spec: PromptSpec; studioVersion: string; provider: string | null; model: string | null; usage: StudioUsage | null }) =>
      fetch("/api/prompts", json("POST", body)).then(j<{ prompt: PromptRow; version: PromptVersion }>),
    addVersion: (id: string, body: { spec: PromptSpec; source: "regenerate" | "edit"; slot?: SlotKey | null; provider?: string | null; model?: string | null }) =>
      fetch(`/api/prompts/${id}/versions`, json("POST", body)).then(j<PromptVersion>),
    patch: (id: string, body: { title?: string; archived?: boolean }) => fetch(`/api/prompts/${id}`, json("PATCH", body)).then(j<PromptRow>),
    remove: (id: string) => fetch(`/api/prompts/${id}`, { method: "DELETE" }).then(j<{ ok: true }>),
    event: (body: { promptId: string; versionId?: string | null; action: "copy" | "fill" | "view"; slot?: string | null; payload?: Record<string, unknown> | null }) =>
      fetch("/api/prompts/events", json("POST", body)).then(j<{ ok: true }>).catch(() => ({ ok: true as const })),
  },
  settings: {
    get: () => fetch("/api/settings").then(j<SettingsDto>),
    save: (values: Record<string, string>) => fetch("/api/settings", json("PUT", { values })).then(j<SettingsDto & { ok: true; restart: string[]; changed: string[] }>),
    workspace: () => fetch("/api/settings/workspace").then(j<WorkspaceFileDto>),
    saveWorkspace: (text: string) => fetch("/api/settings/workspace", json("PUT", { text })).then(j<WorkspaceFileDto & { ok: true; repos: number }>),
    saveWorkspaceProfile: (profile: WorkspaceProfile) => fetch("/api/settings/workspace", json("PUT", { profile })).then(j<WorkspaceFileDto & { ok: true; repos: number }>),
    /** 검토 화면의 "프로필에 추가" — 별칭·검증 명령·저장소를 파일에 병합 */
    patchWorkspace: (ops: ProfileOp[]) => fetch("/api/settings/workspace", json("PATCH", { ops })).then(j<{ ok: true; changes: string[]; repos: number; workspace: WorkspaceStatus }>),
    health: (probe: boolean) => fetch(`/api/health${probe ? "?probe=1" : ""}`).then(j<HealthDto>),
  },
  samples: {
    list: () => fetch("/api/samples").then(j<WritingSample[]>),
    add: (body: { text: string; channel?: string; audience?: string; note?: string }) => fetch("/api/samples", json("POST", body)).then(j<WritingSample>),
    remove: (id: string) => fetch(`/api/samples/${id}`, { method: "DELETE" }).then(j<{ ok: true }>),
  },
};

/** 서버 lib/settings.ts 의 응답 모양 */
export interface SettingDefDto { key: string; label: string; group: "backend" | "jira" | "behavior"; kind: "text" | "secret" | "select" | "bool"; help: string; options?: { value: string; label: string }[]; placeholder?: string; restart?: boolean; showWhen?: [string, string[]] }
export interface SettingsDto { items: { key: string; value: string; masked: boolean; set: boolean; source: "file" | "os" | "default" }[]; envFile: string; exists: boolean; defs: SettingDefDto[] }
export interface WorkspaceFileDto { path: string; exists: boolean; text: string; profile: WorkspaceProfile | null; error: string | null; summary: { repos: number } | null; example: string }
export interface HealthDto { ok: boolean; cloud: { backend: string; ready: boolean; model: string; cliPath?: string; hasApiKey?: boolean; health: { ok: boolean; detail?: string } | null }; defaultProvider: string; jira: { configured: boolean; baseUrl: string | null }; workspace: { exists: boolean; path: string; error: string | null; repos?: number; conventions?: number }; code: { branch: string | null; head: string | null; committedAt: string | null; dirtyFiles: number | null }; build: { id: string; builtAt: string; staleAgainstHead: boolean | null } | null; node: string }

/** 서버 lib/workspace.ts workspaceStatus()의 응답 모양 */
export interface WorkspaceStatus {
  exists: boolean;
  error: string | null;
  summary: { repos: number; conventions: number; glossary: number; team: string | null } | null;
  repoNames: string[];
  repos: { name: string; aliases: string[]; verify: string[] }[];
  defaults: { runtime?: "claude_code" | "codex" | "chat"; length?: "short" | "standard" | "detailed"; promptLanguage?: "ko" | "en" };
}

export interface RunSummary {
  id: string; createdAt: number; level: string; provider: string; model: string; latencyMs: number | null;
  costUsd: number; cachedTokens: number; status: string; accepted: number; rejected: number; edits: number;
}

export interface WritingSample { id: string; userId: string; text: string; chars: number; channel: string | null; audience: string | null; note: string | null; createdAt: number }
export interface WeeklyPoint { weekStart: number; runs: number; accepted: number; rejected: number; costUsd: number; edits: number }
export interface CategoryPoint { category: string; accepted: number; rejected: number }
export interface RecentRunPoint { id: string; createdAt: number; latencyMs: number | null; costUsd: number; level: string; cachedTokens: number; inputTokens: number }
export interface Collection { samples: number; sampleChars: number; feedback: Record<string, number>; finals: number; editPairs: number; runsOk: number }
export interface Stats { weekly: WeeklyPoint[]; byCategory: CategoryPoint[]; recent: RecentRunPoint[]; collection: Collection }

export interface StudioUsage { inputTokens: number; cachedTokens: number; cacheWriteTokens: number; outputTokens: number; costUsd: number; latencyMs: number }
export interface PromptRow { id: string; userId: string; title: string; purpose: string; subtype: string | null; language: string; goal: string; ticketKey: string | null; currentVersionId: string | null; archived: boolean; createdAt: number; updatedAt: number }
export interface PromptSummary extends PromptRow { versionCount: number; passed: number; total: number; variables: string[] }
export interface PromptVersion { id: string; promptId: string; versionNo: number; spec: PromptSpec; rendered: RenderedPrompt; checks: CheckResult[]; source: string; slot: string | null; studioVersion: string; provider: string | null; model: string | null; inputTokens: number; cachedTokens: number; outputTokens: number; costUsd: number; latencyMs: number | null; createdAt: number }
export interface PromptStats { byPurpose: Record<string, number>; copies: number; slotEdits: Record<string, number> }
