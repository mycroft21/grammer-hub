import type { DictionaryEntry, SituationProfile, StyleRule } from "@grammer-hub/core";

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
  samples: {
    list: () => fetch("/api/samples").then(j<WritingSample[]>),
    add: (body: { text: string; channel?: string; audience?: string; note?: string }) => fetch("/api/samples", json("POST", body)).then(j<WritingSample>),
    remove: (id: string) => fetch(`/api/samples/${id}`, { method: "DELETE" }).then(j<{ ok: true }>),
  },
};

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
