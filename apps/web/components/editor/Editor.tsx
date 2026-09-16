"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyEdits, type Level, type ProviderId, type SituationProfile } from "@grammer-hub/core";
import { api } from "@/lib/api";
import { HighlightView } from "./HighlightView";
import { SuggestionCard } from "./SuggestionCard";
import { useCorrection } from "./useCorrection";

const LEVELS: { id: Level; label: string; hint: string }[] = [
  { id: "L1", label: "교정만", hint: "맞춤법·띄어쓰기·문장부호" },
  { id: "L2", label: "다듬기", hint: "높임 단계·문체·간결화" },
  { id: "L3", label: "다시 쓰기", hint: "톤 대안 3안" },
];

export function Editor({ profiles, defaultProvider }: { profiles: SituationProfile[]; defaultProvider: ProviderId }) {
  const [text, setText] = useState("");
  const [profileId, setProfileId] = useState(profiles.find((p) => p.isDefault)?.id ?? profiles[0]?.id ?? "");
  const [level, setLevel] = useState<Level>("L2");
  const [provider, setProvider] = useState<ProviderId>(defaultProvider);
  const [view, setView] = useState<"diff" | "result">("diff");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [manual, setManual] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { state, run, cancel, setCard, setAll, reset } = useCorrection();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const profile = profiles.find((p) => p.id === profileId);
  const accepted = useMemo(() => state.edits.filter((e) => e.state === "accepted").map((e) => e.s), [state.edits]);
  const resultText = manual ?? (state.sourceText ? applyEdits(state.sourceText, accepted) : "");

  const start = useCallback(() => {
    if (!text.trim() || !profileId) return;
    setManual(null); setView("diff"); setFocusIdx(0);
    void run({ text, profileId, level, provider });
  }, [text, profileId, level, provider, run]);

  const feedback = useCallback((id: string, action: "accept" | "reject") => {
    setCard(id, action === "accept" ? "accepted" : "rejected");
    if (state.runId) void api.feedback({ runId: state.runId, suggestionId: `${state.runId}:${id}`, action }).catch(() => {});
  }, [setCard, state.runId]);

  const mute = useCallback((id: string) => {
    const item = state.edits.find((e) => e.s.id === id);
    if (!item || !state.runId || !profile) return;
    setCard(id, "rejected");
    void api.feedback({ runId: state.runId, suggestionId: `${state.runId}:${id}`, action: "mute", category: item.s.category, channel: profile.channel, audience: profile.audience })
      .then(() => setToast(`${item.s.category} 제안을 이 채널·수신자 조합에서 끕니다`)).catch(() => {});
  }, [state.edits, state.runId, profile, setCard]);

  const copyFinal = useCallback(async () => {
    if (!resultText) return;
    await navigator.clipboard.writeText(resultText).catch(() => {});
    if (state.runId) void api.final(state.runId, resultText).catch(() => {});
    const a = state.edits.filter((e) => e.state === "accepted").length;
    const r = state.edits.filter((e) => e.state === "rejected").length;
    setToast(`복사됨 · 수락 ${a} · 무시 ${r}${manual !== null ? " · 직접 수정 포함" : ""}`);
  }, [resultText, state.runId, state.edits, manual]);

  // 키보드: 텍스트 입력 중이 아닐 때 j/k 이동, a 수락, x 무시, ⌘/Ctrl+Enter 교정
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") { ev.preventDefault(); start(); return; }
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      const n = state.edits.length; if (n === 0) return;
      if (ev.key === "j") setFocusIdx((i) => Math.min(n - 1, i + 1));
      else if (ev.key === "k") setFocusIdx((i) => Math.max(0, i - 1));
      else if (ev.key === "a" || ev.key === "x") {
        const item = state.edits[focusIdx]; if (!item) return;
        feedback(item.s.id, ev.key === "a" ? "accept" : "reject");
        setFocusIdx((i) => Math.min(n - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.edits, focusIdx, feedback, start]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    document.querySelector<HTMLElement>(`[data-card="${state.edits[focusIdx]?.s.id ?? ""}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focusIdx, state.edits]);

  const running = state.status === "running";
  const chars = text.normalize("NFC").length;

  return (
    <div className="flex flex-col gap-4">
      {/* 상단 바 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2">
        <select className="rounded border px-2 py-1 text-sm" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex rounded border text-sm">
          {LEVELS.map((l) => (
            <button key={l.id} title={l.hint} onClick={() => setLevel(l.id)}
              className={`px-3 py-1 ${level === l.id ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>{l.id} {l.label}</button>
          ))}
        </div>
        <button className="rounded border px-2 py-1 text-xs" title="provider 전환" onClick={() => setProvider((p) => (p === "cloud" ? "local" : "cloud"))}>
          {provider === "cloud" ? "☁ cloud · Sonnet 5" : "💻 local · Gemma 4"}
        </button>
        <span className="ml-auto text-xs text-neutral-500">{chars.toLocaleString()} / 4,000자</span>
        {running ? (
          <button className="rounded bg-neutral-200 px-3 py-1 text-sm" onClick={cancel}>취소</button>
        ) : (
          <button className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-40" disabled={!text.trim() || chars > 4000} onClick={start}>교정 <kbd className="ml-1 opacity-70">⌘↵</kbd></button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 좌: 원문 */}
        <section className="flex flex-col gap-2">
          <textarea ref={textareaRef} value={text} onChange={(e) => { setText(e.target.value); if (state.status !== "idle") reset(); }}
            placeholder="보낼 메시지나 보고 초안을 붙여넣으세요. ⌘/Ctrl+Enter로 교정."
            className="min-h-[320px] w-full resize-y rounded-lg border bg-white p-3 text-[15px] leading-7 focus:outline-none focus:ring-2 focus:ring-neutral-800" />
          {profile && <p className="text-xs text-neutral-500">{profile.name} · 높임 {profile.honorific} · 격식 {profile.formality}/5 · {profile.tone}</p>}
        </section>

        {/* 우: 결과 */}
        <section className="flex flex-col gap-3">
          <div className="rounded-lg border bg-white">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
              <button className={`rounded px-2 py-1 ${view === "diff" ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`} onClick={() => setView("diff")}>변경 보기</button>
              <button className={`rounded px-2 py-1 ${view === "result" ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`} onClick={() => setView("result")}>결과 보기</button>
              <span className="ml-auto text-neutral-500">
                {running && "교정 중…"}
                {state.status === "done" && state.usage && `${(state.usage.latencyMs / 1000).toFixed(1)}s · $${state.usage.costUsd.toFixed(4)} · 캐시 ${state.usage.cachedTokens.toLocaleString()}tok`}
              </span>
            </div>
            <div className="min-h-[200px] p-3 text-[15px]">
              {state.status === "idle" && <p className="text-sm text-neutral-400">교정 결과가 여기에 표시됩니다.</p>}
              {state.status === "error" && state.error && (
                <div className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
                  <b>{state.error.code}</b> · {state.error.message}
                  {state.error.code === "provider_unavailable" && provider === "local" && (
                    <button className="ml-2 underline" onClick={() => { setProvider("cloud"); }}>클라우드로 전환(원문이 외부로 전송됩니다)</button>
                  )}
                </div>
              )}
              {state.sourceText && state.status !== "error" && (view === "diff" ? (
                <HighlightView text={state.sourceText} edits={state.edits} hoverId={hoverId} onHover={setHoverId}
                  onClick={(id) => setFocusIdx(Math.max(0, state.edits.findIndex((e) => e.s.id === id)))} />
              ) : (
                <textarea value={resultText} onChange={(e) => setManual(e.target.value)}
                  className="min-h-[200px] w-full resize-y rounded border p-2 leading-7 focus:outline-none focus:ring-2 focus:ring-neutral-800" />
              ))}
            </div>
            {state.readerView && <p className="border-t px-3 py-2 text-xs text-neutral-600">ⓘ 수신자 관점: {state.readerView}</p>}
          </div>

          {state.edits.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-neutral-600">
              <span>변경 {state.edits.length}건{state.dropped.length > 0 && ` · 위치 미확정 ${state.dropped.length}건`}</span>
              <button className="ml-auto rounded border px-2 py-1" onClick={() => { setAll("accepted"); state.edits.forEach((e) => e.state !== "accepted" && state.runId && void api.feedback({ runId: state.runId, suggestionId: `${state.runId}:${e.s.id}`, action: "accept" }).catch(() => {})); }}>모두 수락</button>
              <button className="rounded border px-2 py-1" onClick={() => setAll("rejected")}>모두 무시</button>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {state.edits.map((item, i) => (
              <SuggestionCard key={item.s.id} item={item} focused={i === focusIdx} onHover={setHoverId}
                onAccept={() => feedback(item.s.id, "accept")} onReject={() => feedback(item.s.id, "reject")} onMute={() => mute(item.s.id)} />
            ))}
            {running && state.edits.length === 0 && <div className="h-16 animate-pulse rounded-md bg-neutral-200" />}
          </div>

          {state.rewrites.length > 0 && (
            <div className="rounded-lg border bg-white p-3">
              <p className="mb-2 text-xs font-medium text-neutral-600">톤 대안</p>
              <div className="flex flex-col gap-2">
                {state.rewrites.map((rw) => (
                  <div key={rw.index} className="rounded border p-2 text-sm">
                    <div className="flex items-center gap-2 text-xs"><span className="rounded bg-neutral-900 px-1.5 py-0.5 text-white">{String.fromCharCode(65 + rw.index)} {rw.label}</span><span className="text-neutral-500">{rw.rationale}</span></div>
                    <p className="mt-1 whitespace-pre-wrap leading-6">{rw.text}</p>
                    <button className="mt-1 rounded border px-2 py-0.5 text-xs" onClick={() => {
                      setManual(rw.text); setView("result");
                      if (state.runId) void api.feedback({ runId: state.runId, action: "prefer", chosenIndex: rw.index, rejectedIndexes: state.rewrites.filter((x) => x.index !== rw.index).map((x) => x.index) }).catch(() => {});
                    }}>이걸로 교체</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(state.status === "done" || accepted.length > 0) && (
            <button className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white" onClick={copyFinal}>최종본 복사</button>
          )}
        </section>
      </div>
      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded bg-neutral-900 px-3 py-2 text-sm text-white shadow">{toast}</div>}
    </div>
  );
}
