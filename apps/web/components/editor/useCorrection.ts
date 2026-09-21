"use client";
import { useCallback, useRef, useState } from "react";
import type { Level, LlmRewrite, ProviderId, Suggestion, Usage } from "@grammer-hub/core";
import { readSse } from "@/lib/sse-client";

export type CardState = "pending" | "accepted" | "rejected";
export interface EditItem { s: Suggestion; state: CardState }

export interface CorrectionState {
  status: "idle" | "running" | "done" | "error";
  runId: string | null;
  provider: ProviderId | null;
  model: string | null;
  sourceText: string;           // 교정 요청 시점의 원문(NFC) — 오프셋 기준
  edits: EditItem[];
  dropped: { id: string; reason: string }[];
  rewrites: (LlmRewrite & { index: number })[];
  correctedText: string | null;
  readerView: string | null;
  usage: Usage | null;
  error: { code: string; message: string } | null;
  /** 진행 표시: 단계, 시작 시각, 예상 소요(최근 중앙값, 없으면 null) */
  progress: { stage: "requesting" | "thinking" | "writing"; startedAt: number; expectedMs: number | null };
  /** 사람이 읽는 진행 로그(경과 ms, 메시지). 완료 후에도 남아 무엇이 언제 일어났는지 볼 수 있다. */
  log: { t: number; msg: string }[];
}

const STAGE_MSG: Record<CorrectionState["progress"]["stage"], string> = { requesting: "요청 보냄", thinking: "모델 검토 시작", writing: "교정 작성 시작(첫 토큰)" };
const withLog = (s: CorrectionState, msg: string): CorrectionState => ({ ...s, log: [...s.log, { t: Date.now() - s.progress.startedAt, msg }] });

const initial: CorrectionState = {
  status: "idle", runId: null, provider: null, model: null, sourceText: "", edits: [], dropped: [], rewrites: [],
  correctedText: null, readerView: null, usage: null, error: null,
  progress: { stage: "requesting", startedAt: 0, expectedMs: null },
  log: [],
};

export function useCorrection() {
  const [state, setState] = useState<CorrectionState>(initial);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => { abortRef.current?.abort(); abortRef.current = null; }, []);

  const run = useCallback(async (input: { text: string; profileId: string; level: Level; provider: ProviderId | null }) => {
    cancel();
    const ac = new AbortController();
    abortRef.current = ac;
    const sourceText = input.text.normalize("NFC");
    setState({ ...initial, status: "running", sourceText, progress: { stage: "requesting", startedAt: Date.now(), expectedMs: null }, log: [{ t: 0, msg: `교정 요청 · ${input.level} · ${input.provider ?? "기본"} · ${sourceText.length}자` }] });
    let res: Response;
    try {
      res = await fetch("/api/correct", {
        method: "POST", headers: { "content-type": "application/json" }, signal: ac.signal,
        body: JSON.stringify({ text: sourceText, profileId: input.profileId, level: input.level, provider: input.provider }),
      });
    } catch (e) {
      if (ac.signal.aborted) return;
      setState((s) => ({ ...s, status: "error", error: { code: "network", message: String(e) } }));
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setState((s) => ({ ...s, status: "error", error: body?.error ?? { code: String(res.status), message: res.statusText } }));
      return;
    }
    try {
      for await (const ev of readSse(res, ac.signal)) {
        setState((s) => {
          switch (ev.event) {
            case "progress": return withLog({ ...s, progress: { ...s.progress, stage: ev.data.stage, expectedMs: ev.data.expectedMs ?? s.progress.expectedMs } },
              `${STAGE_MSG[ev.data.stage]}${ev.data.stage === "requesting" && ev.data.expectedMs ? ` · 보통 ${Math.round(ev.data.expectedMs / 1000)}초` : ""}`);
            case "meta": return withLog({ ...s, runId: ev.data.runId, provider: ev.data.provider, model: ev.data.model }, `서버 준비 · ${ev.data.model}${ev.data.maskedSpans.length ? ` · 개인정보 ${ev.data.maskedSpans.length}곳 마스킹` : ""}`);
            case "edit": { const item: EditItem = { s: ev.data, state: "pending" }; return withLog({ ...s, edits: [...s.edits, item].sort((a, b) => a.s.start - b.s.start) }, `카드 ${s.edits.length + 1} · ${ev.data.original} → ${ev.data.replacement}`); }
            case "edit_dropped": return withLog({ ...s, dropped: [...s.dropped, ev.data] }, `위치 미확정 제안 1건 (${ev.data.reason})`);
            case "rewrite": return withLog({ ...s, rewrites: [...s.rewrites, ev.data] }, `톤 대안 · ${ev.data.label}`);
            case "text": return withLog({ ...s, correctedText: ev.data.corrected_text, readerView: ev.data.reader_view }, "교정문 확정");
            case "usage": return withLog({ ...s, usage: ev.data }, `완료 · ${(ev.data.latencyMs / 1000).toFixed(1)}초 · 출력 ${ev.data.outputTokens}토큰 · 캐시 ${ev.data.cachedTokens}`);
            case "done": return { ...s, status: "done" };
            case "error": return withLog({ ...s, status: "error", error: ev.data }, `오류 ${ev.data.code}: ${ev.data.message}`);
          }
        });
      }
    } catch (e) {
      if (!ac.signal.aborted) setState((s) => withLog({ ...s, status: "error", error: { code: "stream", message: String(e) } }, `스트림 오류: ${String(e)}`));
    } finally {
      setState((s) => (s.status === "running" ? { ...s, status: "done" } : s));
    }
  }, [cancel]);

  const setCard = useCallback((id: string, cardState: CardState) => {
    setState((s) => ({ ...s, edits: s.edits.map((e) => (e.s.id === id ? { ...e, state: cardState } : e)) }));
  }, []);
  const setAll = useCallback((cardState: CardState) => {
    setState((s) => ({ ...s, edits: s.edits.map((e) => ({ ...e, state: cardState })) }));
  }, []);
  const reset = useCallback(() => { cancel(); setState(initial); }, [cancel]);

  return { state, run, cancel, setCard, setAll, reset };
}
