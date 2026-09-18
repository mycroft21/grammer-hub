"use client";
import { useCallback, useRef, useState } from "react";
import type { CheckResult, PlanResult, PromptSpec, RenderedPrompt, SlotKey, StudioRequest } from "@grammer-hub/core";
import { api, type StudioUsage } from "@/lib/api";
import { readSseRaw } from "@/lib/sse-client";

export type Phase = "form" | "planning" | "ask" | "generating" | "result";

export interface StudioState {
  phase: Phase;
  request: StudioRequest | null;         // 마지막으로 보낸 요청(재생성·보관에 재사용)
  plan: PlanResult | null;
  slots: Partial<Record<SlotKey, unknown>>; // 스트리밍 중 도착한 슬롯
  spec: PromptSpec | null;
  rendered: RenderedPrompt | null;
  checks: CheckResult[];
  usage: StudioUsage | null;
  meta: { promptVersion: string; provider: string; model: string } | null;
  savedId: string | null;                // 보관함에 저장된 프롬프트 id
  busySlot: SlotKey | null;              // 재생성 중인 슬롯
  error: string | null;
}

const initial: StudioState = { phase: "form", request: null, plan: null, slots: {}, spec: null, rendered: null, checks: [], usage: null, meta: null, savedId: null, busySlot: null, error: null };

/** 만들기 흐름: plan(질문) → generate(스트리밍) → result(재생성·보관). */
export function useStudio() {
  const [state, setState] = useState<StudioState>(initial);
  const abortRef = useRef<AbortController | null>(null);
  const cancel = useCallback(() => { abortRef.current?.abort(); abortRef.current = null; }, []);

  const generate = useCallback(async (req: StudioRequest) => {
    cancel();
    const ac = new AbortController(); abortRef.current = ac;
    setState((s) => ({ ...s, phase: "generating", request: req, slots: {}, spec: null, rendered: null, checks: [], usage: null, savedId: null, error: null }));
    let res: Response;
    try { res = await api.prompts.generate(req, ac.signal); }
    catch (e) { if (!ac.signal.aborted) setState((s) => ({ ...s, phase: "form", error: String(e) })); return; }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setState((s) => ({ ...s, phase: "form", error: body?.error?.message ?? res.statusText }));
      return;
    }
    try {
      for await (const ev of readSseRaw(res, ac.signal)) {
        setState((s) => {
          switch (ev.event) {
            case "meta": return { ...s, meta: ev.data as StudioState["meta"] };
            case "slot": { const d = ev.data as { key: SlotKey; value: unknown }; return { ...s, slots: { ...s.slots, [d.key]: d.value } }; }
            case "spec": return { ...s, spec: ev.data as PromptSpec };
            case "rendered": return { ...s, rendered: ev.data as RenderedPrompt };
            case "checks": return { ...s, checks: ev.data as CheckResult[] };
            case "usage": return { ...s, usage: ev.data as StudioUsage };
            case "done": return { ...s, phase: "result" };
            case "error": return { ...s, phase: "form", error: (ev.data as { message: string }).message };
            default: return s;
          }
        });
      }
    } catch (e) {
      if (!ac.signal.aborted) setState((s) => ({ ...s, phase: "form", error: String(e) }));
    } finally {
      setState((s) => (s.phase === "generating" ? { ...s, phase: s.spec ? "result" : "form", error: s.spec ? s.error : (s.error ?? "생성이 중단되었습니다") } : s));
    }
  }, [cancel]);

  /** 의도 정리. ready면 바로 생성으로, ask면 질문 단계로. never_ask면 plan을 건너뛴다. */
  const start = useCallback(async (req: StudioRequest) => {
    cancel();
    if (req.clarify === "never_ask") { await generate(req); return; }
    const ac = new AbortController(); abortRef.current = ac;
    setState({ ...initial, phase: "planning", request: req });
    try {
      const r = await api.prompts.plan(req, ac.signal);
      if (ac.signal.aborted) return;
      const next: StudioRequest = { ...req, ...(r.plan.subtype ? { subtype: r.plan.subtype } : {}) };
      if (r.plan.mode === "ask" && r.plan.questions.length > 0) { setState((s) => ({ ...s, phase: "ask", plan: r.plan, request: next })); return; }
      setState((s) => ({ ...s, plan: r.plan }));
      await generate({ ...next, assumptions: r.plan.assumptions });
    } catch (e) {
      if (!ac.signal.aborted) setState((s) => ({ ...s, phase: "form", error: e instanceof Error ? e.message : String(e) }));
    }
  }, [cancel, generate]);

  /** 질문에 답한 뒤(또는 가정으로 진행) 생성. */
  const answer = useCallback(async (answers: Record<string, string>, assumeRest: boolean) => {
    const req = state.request; const plan = state.plan;
    if (!req || !plan) return;
    const unanswered = plan.questions.filter((q) => !answers[q.id]);
    const assumptions = assumeRest ? [...plan.assumptions, ...unanswered.map((q) => `${q.question} → 기본값으로 가정`)] : plan.assumptions;
    await generate({ ...req, answers, assumptions, clarify: req.clarify === "ask_first" ? "assume_and_state" : req.clarify });
  }, [state.request, state.plan, generate]);

  const regenerate = useCallback(async (slot: SlotKey, instruction: string | null) => {
    const { request, spec } = state;
    if (!request || !spec) return;
    setState((s) => ({ ...s, busySlot: slot, error: null }));
    try {
      const r = await api.prompts.regenerate({ request, spec, slot, instruction });
      setState((s) => ({ ...s, spec: r.spec, rendered: r.rendered, checks: r.checks, busySlot: null }));
      if (state.savedId) await api.prompts.addVersion(state.savedId, { spec: r.spec, source: "regenerate", slot, provider: state.meta?.provider ?? null, model: state.meta?.model ?? null });
    } catch (e) {
      setState((s) => ({ ...s, busySlot: null, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [state]);

  /** 슬롯 직접 수정(텍스트/배열). 서버에서 다시 렌더·점검하기 위해 저장돼 있으면 새 버전을 만든다. */
  const editSlot = useCallback(async (slot: SlotKey, value: unknown) => {
    const spec = state.spec; if (!spec) return;
    const next = { ...spec, [slot]: value } as PromptSpec;
    if (state.savedId) {
      try {
        const v = await api.prompts.addVersion(state.savedId, { spec: next, source: "edit", slot });
        setState((s) => ({ ...s, spec: v.spec, rendered: v.rendered, checks: v.checks }));
        return;
      } catch (e) { setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) })); return; }
    }
    // 저장 전에는 재생성 API 없이 클라이언트에서 렌더할 수 없으므로 서버 저장 없이 spec만 바꾸고, 렌더는 저장 시 다시 계산된다.
    setState((s) => ({ ...s, spec: next, rendered: null }));
  }, [state.spec, state.savedId]);

  const save = useCallback(async () => {
    const { request, spec, meta, usage } = state;
    if (!request || !spec) return null;
    const r = await api.prompts.save({ purpose: request.purpose, subtype: request.subtype ?? null, language: request.promptLanguage, goal: request.goal, spec, studioVersion: meta?.promptVersion ?? "", provider: meta?.provider ?? null, model: meta?.model ?? null, usage });
    setState((s) => ({ ...s, savedId: r.prompt.id, spec: r.version.spec, rendered: r.version.rendered, checks: r.version.checks }));
    return r.prompt.id;
  }, [state]);

  const reset = useCallback(() => { cancel(); setState(initial); }, [cancel]);
  const backToForm = useCallback(() => { cancel(); setState((s) => ({ ...s, phase: "form", plan: null, error: null })); }, [cancel]);

  return { state, start, answer, generate, regenerate, editSlot, save, reset, backToForm, cancel };
}
