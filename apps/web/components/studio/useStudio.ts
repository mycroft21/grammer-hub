"use client";
import { useCallback, useRef, useState } from "react";
import { SLOT_KEYS, SLOT_KO, parseIssueKey, type CheckResult, type PlanResult, type PromptSpec, type RenderedPrompt, type SlotKey, type StudioRequest, type Ticket, type TicketPlanResult } from "@grammer-hub/core";
import { api, type StudioUsage, type WorkspaceStatus } from "@/lib/api";
import { readSseRaw } from "@/lib/sse-client";

export type Phase = "form" | "planning" | "ask" | "ticket_review" | "generating" | "result";

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
  progress: { stage: "requesting" | "thinking" | "writing"; startedAt: number; expectedMs: number | null };
  log: { t: number; msg: string }[];
  /** 티켓 흐름: 가져온 티켓과 분류 결과(+작업 공간 프로필 요약) */
  ticket: { ticket: Ticket; plan: TicketPlanResult; workspace: WorkspaceStatus | null } | null;
}
const STAGE_MSG: Record<StudioState["progress"]["stage"], string> = { requesting: "요청 보냄", thinking: "모델 검토 시작", writing: "슬롯 작성 시작(첫 토큰)" };
const withLog = (s: StudioState, msg: string): StudioState => ({ ...s, log: [...s.log, { t: Date.now() - s.progress.startedAt, msg }] });

const initial: StudioState = { phase: "form", request: null, plan: null, slots: {}, spec: null, rendered: null, checks: [], usage: null, meta: null, savedId: null, busySlot: null, error: null, progress: { stage: "requesting", startedAt: 0, expectedMs: null }, log: [], ticket: null };

/** 만들기 흐름: plan(질문) → generate(스트리밍) → result(재생성·보관). */
export function useStudio() {
  const [state, setState] = useState<StudioState>(initial);
  const abortRef = useRef<AbortController | null>(null);
  const cancel = useCallback(() => { abortRef.current?.abort(); abortRef.current = null; }, []);

  const generate = useCallback(async (req: StudioRequest) => {
    cancel();
    const ac = new AbortController(); abortRef.current = ac;
    setState((s) => ({ ...s, phase: "generating", request: req, slots: {}, spec: null, rendered: null, checks: [], usage: null, savedId: null, error: null, progress: { stage: "requesting", startedAt: Date.now(), expectedMs: null }, log: [...s.log, { t: 0, msg: `생성 요청 · ${req.purpose}${req.subtype ? `/${req.subtype}` : ""} · ${req.length} · ${req.promptLanguage}` }] }));
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
            case "progress": { const d = ev.data as { stage: StudioState["progress"]["stage"]; expectedMs?: number | null }; return withLog({ ...s, progress: { ...s.progress, stage: d.stage, expectedMs: d.expectedMs ?? s.progress.expectedMs } }, `${STAGE_MSG[d.stage]}${d.stage === "requesting" && d.expectedMs ? ` · 보통 ${Math.round(d.expectedMs / 1000)}초` : ""}`); }
            case "meta": { const d = ev.data as NonNullable<StudioState["meta"]>; return withLog({ ...s, meta: d }, `서버 준비 · ${d.model} · 스튜디오 v${d.promptVersion}`); }
            case "slot": { const d = ev.data as { key: SlotKey; value: unknown }; const n = Object.keys(s.slots).length + 1; return withLog({ ...s, slots: { ...s.slots, [d.key]: d.value } }, `슬롯 ${n}/${SLOT_KEYS.length} · ${SLOT_KO[d.key] ?? d.key}`); }
            case "spec": return withLog({ ...s, spec: ev.data as PromptSpec }, "스펙 검증 통과");
            case "rendered": return withLog({ ...s, rendered: ev.data as RenderedPrompt }, "프롬프트 렌더 완료");
            case "checks": { const c = ev.data as CheckResult[]; return withLog({ ...s, checks: c }, `규격 점검 ${c.filter((x) => x.ok).length}/${c.length}`); }
            case "usage": { const u = ev.data as StudioUsage; return withLog({ ...s, usage: u }, `완료 · ${(u.latencyMs / 1000).toFixed(1)}초 · 출력 ${u.outputTokens}토큰`); }
            case "done": return { ...s, phase: "result" };
            case "error": { const d = ev.data as { code: string; message: string }; return withLog({ ...s, phase: "form", error: d.message }, `오류 ${d.code}: ${d.message}`); }
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
    setState({ ...initial, phase: "planning", request: req, progress: { stage: "requesting", startedAt: Date.now(), expectedMs: null }, log: [{ t: 0, msg: "의도 정리 요청" }] });
    try {
      const r = await api.prompts.plan(req, ac.signal);
      if (ac.signal.aborted) return;
      setState((s) => withLog(s, `의도 정리 ${r.plan.mode === "ask" ? `→ 질문 ${r.plan.questions.length}개` : `→ 바로 생성(가정 ${r.plan.assumptions.length}개)`}${r.plan.verify_in_repo.length ? ` · 코드에서 확인 ${r.plan.verify_in_repo.length}개` : ""} · ${(r.usage.latencyMs / 1000).toFixed(1)}초`));
      // 장부에서 나온 대상 저장소·코드에서 확인할 것은 생성 단계의 힌트가 된다(사용자에게 묻지 않는다)
      const hints = { ...(req.hints ?? {}), ...(r.plan.repos.length ? { repos: r.plan.repos } : {}), ...(r.plan.verify_in_repo.length ? { verifyInRepo: r.plan.verify_in_repo } : {}) };
      const next: StudioRequest = { ...req, ...(r.plan.subtype ? { subtype: r.plan.subtype } : {}), ...(Object.keys(hints).length ? { hints } : {}) };
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

  /** 티켓 흐름 1단계: 가져오기 + 분류. 결과는 검토 화면으로. */
  const startFromTicket = useCallback(async (input: string) => {
    cancel();
    const ac = new AbortController(); abortRef.current = ac;
    setState({ ...initial, phase: "planning", progress: { stage: "requesting", startedAt: Date.now(), expectedMs: null }, log: [{ t: 0, msg: `티켓 가져오기 · ${input.trim()}` }] });
    try {
      const r = await api.prompts.ticket(input, ac.signal);
      if (ac.signal.aborted) return;
      setState((s) => withLog({ ...s, phase: "ticket_review", ticket: { ticket: r.ticket, plan: r.plan, workspace: r.workspace ?? null } },
        `${r.ticket.key} 분류 → ${r.plan.purpose}/${r.plan.subtype ?? "-"} · ${r.plan.repos.length ? `저장소 ${r.plan.repos.join(", ")} · ` : ""}${r.plan.mode === "ask" ? `질문 ${r.plan.questions.length}개` : "바로 생성 가능"} · 가정 ${r.plan.assumptions.length} · 코드에서 확인 ${r.plan.verify_in_repo.length} · ${(r.usage.latencyMs / 1000).toFixed(1)}초`));
    } catch (e) {
      if (!ac.signal.aborted) setState((s) => ({ ...s, phase: "form", error: e instanceof Error ? e.message : String(e) }));
    }
  }, [cancel]);

  /** 검토 화면의 "프로필에 추가"가 프로필을 바꾸면 선택지·별칭 정보를 최신으로 */
  const setWorkspace = useCallback((ws: WorkspaceStatus) => {
    setState((s) => (s.ticket ? { ...s, ticket: { ...s.ticket, workspace: ws } } : s));
  }, []);

  /** 티켓 검토 화면에서 확정 → 생성 */
  const generateFromTicket = useCallback(async (req: StudioRequest) => {
    await generate(req);
  }, [generate]);

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
    const r = await api.prompts.save({ purpose: request.purpose, subtype: request.subtype ?? null, language: request.promptLanguage, goal: request.goal, ticketKey: request.ticket ? parseIssueKey(request.ticket) : null, spec, studioVersion: meta?.promptVersion ?? "", provider: meta?.provider ?? null, model: meta?.model ?? null, usage });
    setState((s) => ({ ...s, savedId: r.prompt.id, spec: r.version.spec, rendered: r.version.rendered, checks: r.version.checks }));
    try { localStorage.removeItem("gh:studio:draft"); } catch { /* noop */ }
    return r.prompt.id;
  }, [state]);

  const reset = useCallback(() => { cancel(); setState(initial); }, [cancel]);
  const backToForm = useCallback(() => { cancel(); setState((s) => ({ ...s, phase: "form", plan: null, ticket: null, error: null })); }, [cancel]);

  return { state, start, startFromTicket, generateFromTicket, setWorkspace, answer, generate, regenerate, editSlot, save, reset, backToForm, cancel };
}
