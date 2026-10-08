"use client";
import { useCallback, useRef, useState } from "react";
import { PURPOSES, SLOT_KEYS, SLOT_KO, defaultLength, defaultRuntime, parseIssueKey, type CheckResult, type PlanQuestion, type PlanResult, type PromptSpec, type RenderedPrompt, type SlotKey, type StudioRequest, type Ticket, type TicketPlanResult } from "@grammer-hub/core";
import { api, type StudioUsage, type WorkspaceStatus } from "@/lib/api";
import { readSseRaw } from "@/lib/sse-client";
import { useAuth } from "@/components/providers/AppProviders";
import { draftKey } from "@/lib/studio-draft";

export type Phase = "form" | "planning" | "ask" | "ticket_review" | "generating" | "result";

export interface StudioState {
  phase: Phase;
  request: StudioRequest | null;         // 마지막으로 보낸 요청(재생성·보관에 재사용)
  plan: PlanResult | null;               // ask 단계에서는 지금까지 물은 질문 전체(회차가 지나도 위 질문이 남는다)
  replanning: boolean;                   // 답을 반영해 의도 정리를 다시 하는 중(질문 화면 유지)
  slots: Partial<Record<SlotKey, unknown>>; // 스트리밍 중 도착한 슬롯
  spec: PromptSpec | null;
  rendered: RenderedPrompt | null;
  checks: CheckResult[];
  usage: StudioUsage | null;
  meta: { promptVersion: string; provider: string; model: string } | null;
  savedId: string | null;                // 보관함에 저장된 프롬프트 id
  runId: string | null;                  // 이 결과를 만든 생성 실행 기록 id(보관할 때 잇는다)
  busySlot: SlotKey | null;              // 재생성 중인 슬롯
  error: string | null;
  progress: { stage: "requesting" | "thinking" | "writing"; startedAt: number; expectedMs: number | null };
  log: { t: number; msg: string }[];
  /** 의도 정리 결과가 올 때마다 1씩(확인 화면을 새 결과로 다시 그리는 키) */
  planSeq: number;
  /** 간단 흐름: 입력 화면이 읽은 작업 공간(확인 화면의 저장소 선택지) */
  workspace: WorkspaceStatus | null;
  /** 티켓 흐름: 가져온 티켓과 분류 결과(+작업 공간 프로필 요약) */
  ticket: { ticket: Ticket; plan: TicketPlanResult; workspace: WorkspaceStatus | null } | null;
}
const STAGE_MSG: Record<StudioState["progress"]["stage"], string> = { requesting: "요청 보냄", thinking: "모델 검토 시작", writing: "슬롯 작성 시작(첫 토큰)" };
/**
 * 생성이 실패하면 간단 흐름은 확인 화면으로(폼으로 가면 확인 화면에서 바꾼 설정·답이 사라진다).
 * 티켓 흐름은 지금처럼 폼으로 — 검토 화면은 오류를 보여 주지 않고 다시 마운트되면 고친 내용도 plan 값으로 돌아간다.
 */
const backPhase = (s: StudioState): Phase => (s.plan && !s.ticket ? "ask" : "form");
const withLog = (s: StudioState, msg: string): StudioState => ({ ...s, log: [...s.log, { t: Date.now() - s.progress.startedAt, msg }] });

// 프롬프트 언어는 사람이 거의 바꾸지 않으므로 이 브라우저에서 마지막에 고른 값을 기억한다
const LANG_KEY = "gh:studio:lang";
const lastLanguage = (): StudioRequest["promptLanguage"] | null => { try { const v = localStorage.getItem(LANG_KEY); return v === "ko" || v === "en" ? v : null; } catch { return null; } };
const rememberLanguage = (v: StudioRequest["promptLanguage"]) => { try { localStorage.setItem(LANG_KEY, v); } catch { /* 저장소를 못 쓰면 기억하지 않는다 */ } };

const initial: StudioState = { phase: "form", request: null, plan: null, replanning: false, slots: {}, spec: null, rendered: null, checks: [], usage: null, meta: null, savedId: null, runId: null, busySlot: null, error: null, progress: { stage: "requesting", startedAt: 0, expectedMs: null }, log: [], ticket: null, workspace: null, planSeq: 0 };

/** 만들기 흐름: plan(질문) → generate(스트리밍) → result(재생성·보관). */
export function useStudio() {
  const [state, setState] = useState<StudioState>(initial);
  const me = useAuth();
  const abortRef = useRef<AbortController | null>(null);
  const cancel = useCallback(() => { abortRef.current?.abort(); abortRef.current = null; }, []);

  const generate = useCallback(async (req: StudioRequest) => {
    cancel();
    const ac = new AbortController(); abortRef.current = ac;
    setState((s) => ({ ...s, phase: "generating", request: req, slots: {}, spec: null, rendered: null, checks: [], usage: null, savedId: null, runId: null, error: null, progress: { stage: "requesting", startedAt: Date.now(), expectedMs: null }, log: [...s.log, { t: 0, msg: `생성 요청 · ${req.purpose}${req.subtype ? `/${req.subtype}` : ""} · ${req.length} · ${req.promptLanguage}` }] }));
    let res: Response;
    try { res = await api.prompts.generate(req, ac.signal); }
    catch (e) { if (!ac.signal.aborted) setState((s) => ({ ...s, phase: backPhase(s), error: String(e) })); return; }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setState((s) => ({ ...s, phase: backPhase(s), error: body?.error?.message ?? res.statusText }));
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
            case "run": return { ...s, runId: (ev.data as { id: string }).id };
            case "done": return { ...s, phase: "result" };
            case "error": { const d = ev.data as { code: string; message: string }; return withLog({ ...s, phase: backPhase(s), error: d.message }, `오류 ${d.code}: ${d.message}`); }
            default: return s;
          }
        });
      }
    } catch (e) {
      if (!ac.signal.aborted) setState((s) => ({ ...s, phase: backPhase(s), error: String(e) }));
    } finally {
      setState((s) => (s.phase === "generating" ? { ...s, phase: s.spec ? "result" : backPhase(s), error: s.spec ? s.error : (s.error ?? "생성이 중단되었습니다") } : s));
    }
  }, [cancel]);

  /**
   * 의도 정리 한 회차 → 언제나 확인 화면(질문이 없어도). 이미 물은 질문(prev) 밖의 새 질문은 아래에 붙인다.
   * 답한 항목은 서버가 filled로 고정하므로 같은 질문이 돌아오지 않고, 장부 항목 수가 질문 총량의 상한이 된다.
   * 분류 모드(간단 흐름의 첫 회차)면 모델이 고른 목적으로 요청을 바꾸고, 사용자가 아직 고르지 않은 실행 환경·분량을 그 목적의 기본값으로 채운다.
   */
  const planRound = useCallback(async (req: StudioRequest, prev: PlanQuestion[], ac: AbortController, defaults?: WorkspaceStatus["defaults"]) => {
    const r = await api.prompts.plan(req, ac.signal);
    if (ac.signal.aborted) return;
    const fresh = r.plan.questions.filter((q) => !prev.some((p) => p.id === q.id));
    setState((s) => withLog(s, `의도 정리${req.classify ? ` · 목적 ${r.plan.purpose}/${r.plan.subtype ?? "-"}` : ""} ${fresh.length ? `→ ${prev.length ? "추가 " : ""}질문 ${fresh.length}개` : `→ 질문 없음(가정 ${r.plan.assumptions.length}개)`}${r.plan.verify_in_repo.length ? ` · 코드에서 확인 ${r.plan.verify_in_repo.length}개` : ""} · ${(r.usage.latencyMs / 1000).toFixed(1)}초`));
    // 장부에서 나온 대상 저장소·코드에서 확인할 것은 생성 단계의 힌트가 된다(사용자에게 묻지 않는다)
    const hints = { ...(req.hints ?? {}), ...(r.plan.repos.length ? { repos: r.plan.repos } : {}), ...(r.plan.verify_in_repo.length ? { verifyInRepo: r.plan.verify_in_repo } : {}) };
    const { classify, ...rest } = req;
    const p = r.plan.purpose;
    // 작업 공간 기본값(팀 + 내 것)은 개발 목적에만 — 티켓 검토 화면과 같은 규칙
    const dev = PURPOSES[p].domain === "dev";
    const next: StudioRequest = {
      ...rest, purpose: p, ...(r.plan.subtype ? { subtype: r.plan.subtype } : {}), ...(Object.keys(hints).length ? { hints } : {}),
      ...(classify ? { runtime: (dev && defaults?.runtime) || defaultRuntime(p), length: (dev && defaults?.length) || defaultLength(p) } : {}),
    };
    setState((s) => ({ ...s, phase: "ask", replanning: false, error: null, plan: { ...r.plan, questions: [...prev, ...fresh] }, request: next, planSeq: s.planSeq + 1 }));
  }, []);

  /** 간단 흐름: 목표 한 문장 → 의도 정리(목적까지 추론) → 확인 화면. 언어는 이 브라우저에서 마지막에 고른 값. */
  const start = useCallback(async (goal: string, ctx: { workspace: WorkspaceStatus | null } = { workspace: null }) => {
    cancel();
    const ac = new AbortController(); abortRef.current = ac;
    const defaults = ctx.workspace?.defaults;
    const lang = lastLanguage() ?? defaults?.promptLanguage ?? "ko";
    // purpose는 자리값(분류 모드에서 서버가 무시하고 모델이 고른다)
    const req: StudioRequest = { purpose: "investigate", subtype: null, goal, length: "standard", clarify: "ask_first", promptLanguage: lang, runtime: null, includeStyleRules: false, provider: null, classify: true };
    setState({ ...initial, phase: "planning", request: req, workspace: ctx.workspace, progress: { stage: "requesting", startedAt: Date.now(), expectedMs: null }, log: [{ t: 0, msg: "의도 정리 요청(목적 추론)" }] });
    try { await planRound(req, [], ac, defaults); }
    catch (e) { if (!ac.signal.aborted) setState((s) => ({ ...s, phase: "form", error: e instanceof Error ? e.message : String(e) })); }
  }, [cancel, planRound]);

  /** 확인 화면에서 바꾼 설정(재호출 없이 반영되는 것: 실행 환경·분량·질문 정책·언어·어투·저장소). */
  const updateRequest = useCallback((patch: Partial<StudioRequest>) => {
    if (patch.promptLanguage) rememberLanguage(patch.promptLanguage);
    setState((s) => (s.request ? { ...s, request: { ...s.request, ...patch } } : s));
  }, []);

  /** 목적·세부 유형을 바꾸면 질문 목록이 달라지므로 그 목적으로 고정해 의도 정리를 다시 한다(이전 답·질문은 버린다). */
  const replanAs = useCallback(async (purpose: StudioRequest["purpose"], subtype: string | null) => {
    const req = state.request; if (!req) return;
    cancel();
    const ac = new AbortController(); abortRef.current = ac;
    const changed = purpose !== req.purpose;
    const dev = PURPOSES[purpose].domain === "dev";
    const defaults = dev ? state.workspace?.defaults : undefined;
    const { answers: _a, assumptions: _s, ...base } = req;
    // 이전 장부의 코드에서 확인할 것은 버리고, 사용자가 고른 저장소는 개발 목적일 때만 남긴다(비개발에선 저장소 칩이 없어 지울 수 없다)
    const hints = dev && req.hints?.repos?.length ? { repos: req.hints.repos } : null;
    // 목적이 바뀌면 그 목적의 기본 실행 환경·분량(개발이면 작업 공간 기본값 우선). 같은 목적에서 세부 유형만 바꾸면 사용자가 고른 값 유지
    const next: StudioRequest = { ...base, purpose, subtype, hints, ...(changed ? { runtime: defaults?.runtime || defaultRuntime(purpose), length: defaults?.length || defaultLength(purpose) } : {}) };
    // 요청은 결과가 온 뒤에 바꾼다(planRound) — 실패하면 이전 목적의 요청·장부가 그대로 짝을 이룬다
    setState((s) => withLog({ ...s, replanning: true, error: null }, `목적 변경 → ${purpose}/${subtype ?? "-"} · 의도 정리 다시`));
    try { await planRound(next, [], ac); }
    catch (e) { if (!ac.signal.aborted) setState((s) => ({ ...s, replanning: false, error: e instanceof Error ? e.message : String(e) })); }
  }, [state.request, state.workspace, cancel, planRound]);

  /**
   * 질문에 답한 뒤. now=false면 답(위 질문을 고친 것 포함)을 반영해 의도 정리를 다시 하고, now=true면 즉시 생성한다.
   * 즉시 생성은 답하지 않은 질문을 장부의 기본값으로 가정한다. 질문 정책은 사용자가 고른 값 그대로 보낸다.
   */
  const answer = useCallback(async (answers: Record<string, string>, now: boolean) => {
    const req = state.request; const plan = state.plan;
    if (!req || !plan) return;
    // where 답이 대상 저장소다. 앞 회차가 남긴 hints.repos를 그대로 두면 서버가 그것을 '사용자 선택'으로 보고 고친 답을 덮는다
    // 단, 확인 화면에서 여러 저장소를 골랐고 where 답이 그중 하나면 고른 목록을 그대로 둔다
    const picked = req.hints?.repos ?? [];
    const hints = answers["where"] && !picked.includes(answers["where"]) ? { ...(req.hints ?? {}), repos: [answers["where"]] } : req.hints;
    // 실패한 생성이 남긴 가정은 버린다 — 의도 정리에 <assumptions>로 들어가면 모델이 그 항목을 채운 것으로 보고 질문을 지운다
    const { assumptions: _stale, ...clean } = req;
    const next: StudioRequest = { ...clean, answers, ...(hints ? { hints } : {}) };
    if (now) {
      const unanswered = plan.questions.filter((q) => !answers[q.id]);
      const assumptions = [...plan.assumptions, ...unanswered.map((q) => { const n = plan.needs.find((x) => x.id === q.id); return n?.value ? `${n.label}: ${n.value}` : `${q.question} → 기본값으로 가정`; })];
      await generate({ ...next, assumptions });
      return;
    }
    cancel();
    const ac = new AbortController(); abortRef.current = ac;
    setState((s) => withLog({ ...s, replanning: true, error: null }, `답변 ${Object.keys(answers).length}개 반영 · 남은 모호함 확인`));
    try { await planRound(next, plan.questions, ac); }
    catch (e) { if (!ac.signal.aborted) setState((s) => ({ ...s, replanning: false, error: e instanceof Error ? e.message : String(e) })); }
  }, [state.request, state.plan, cancel, generate, planRound]);

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
      const r = await api.prompts.regenerate({ request, spec, slot, instruction, promptId: state.savedId });
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
    const { request, spec, meta, usage, runId } = state;
    if (!request || !spec) return null;
    const r = await api.prompts.save({ purpose: request.purpose, subtype: request.subtype ?? null, language: request.promptLanguage, goal: request.goal, ticketKey: request.ticket ? parseIssueKey(request.ticket) : null, spec, studioVersion: meta?.promptVersion ?? "", provider: meta?.provider ?? null, model: meta?.model ?? null, usage, runId });
    setState((s) => ({ ...s, savedId: r.prompt.id, spec: r.version.spec, rendered: r.version.rendered, checks: r.version.checks }));
    try { localStorage.removeItem(draftKey(me)); } catch { /* 저장소를 못 쓰면 지울 것도 없다 */ }
    return r.prompt.id;
  }, [state, me]);

  const reset = useCallback(() => { cancel(); setState(initial); }, [cancel]);
  const backToForm = useCallback(() => { cancel(); setState((s) => ({ ...s, phase: "form", plan: null, replanning: false, ticket: null, error: null })); }, [cancel]);

  return { state, start, startFromTicket, generateFromTicket, setWorkspace, answer, updateRequest, replanAs, generate, regenerate, editSlot, save, reset, backToForm, cancel };
}
