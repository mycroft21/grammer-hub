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
}

const initial: CorrectionState = {
  status: "idle", runId: null, provider: null, model: null, sourceText: "", edits: [], dropped: [], rewrites: [],
  correctedText: null, readerView: null, usage: null, error: null,
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
    setState({ ...initial, status: "running", sourceText });
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
            case "meta": return { ...s, runId: ev.data.runId, provider: ev.data.provider, model: ev.data.model };
            case "edit": { const item: EditItem = { s: ev.data, state: "pending" }; return { ...s, edits: [...s.edits, item].sort((a, b) => a.s.start - b.s.start) }; }
            case "edit_dropped": return { ...s, dropped: [...s.dropped, ev.data] };
            case "rewrite": return { ...s, rewrites: [...s.rewrites, ev.data] };
            case "text": return { ...s, correctedText: ev.data.corrected_text, readerView: ev.data.reader_view };
            case "usage": return { ...s, usage: ev.data };
            case "done": return { ...s, status: "done" };
            case "error": return { ...s, status: "error", error: ev.data };
          }
        });
      }
    } catch (e) {
      if (!ac.signal.aborted) setState((s) => ({ ...s, status: "error", error: { code: "stream", message: String(e) } }));
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
