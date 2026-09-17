"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyEdits, type Level, type ProviderId, type SituationProfile } from "@grammer-hub/core";
import { api } from "@/lib/api";
import { HighlightView } from "./HighlightView";
import { SuggestionCard } from "./SuggestionCard";
import { useCorrection } from "./useCorrection";

const LEVELS: { id: Level; label: string; hint: string }[] = [
  { id: "L1", label: "맞춤법만", hint: "맞춤법·띄어쓰기·문장부호만 고칩니다" },
  { id: "L2", label: "다듬기", hint: "높임 단계·문체·간결함까지 프로필에 맞춥니다" },
  { id: "L3", label: "다시 쓰기", hint: "다듬기 + 톤이 다른 대안 3안" },
];
const SAMPLE = "팀장님 어제 말씀하신 정산 자료 정리해서 보내드릴께요. 커피 나오셨습니다 ㅎㅎ\n확인 부탁드리겠습니다.";
const KRW = 1380;

export function Editor({ profiles, defaultProvider }: { profiles: SituationProfile[]; defaultProvider: ProviderId }) {
  const [text, setText] = useState("");
  const [profileId, setProfileId] = useState(profiles.find((p) => p.isDefault)?.id ?? profiles[0]?.id ?? "");
  const [level, setLevel] = useState<Level>("L2");
  const [provider, setProvider] = useState<ProviderId>(defaultProvider);
  const [view, setView] = useState<"diff" | "result">("diff");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [manual, setManual] = useState<string | null>(null);
  const [rewriteIdx, setRewriteIdx] = useState(0);
  const [sourceOpen, setSourceOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const { state, run, cancel, setCard, setAll, reset } = useCorrection();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const profile = profiles.find((p) => p.id === profileId);
  const accepted = useMemo(() => state.edits.filter((e) => e.state === "accepted").map((e) => e.s), [state.edits]);
  const resultText = manual ?? (state.sourceText ? applyEdits(state.sourceText, accepted) : "");
  const running = state.status === "running";
  const done = state.status === "done";
  const chars = text.normalize("NFC").length;
  const nAccepted = state.edits.filter((e) => e.state === "accepted").length;
  const nRejected = state.edits.filter((e) => e.state === "rejected").length;
  const nPending = state.edits.length - nAccepted - nRejected;

  const start = useCallback(() => {
    if (!text.trim() || !profileId) return;
    setManual(null); setView("diff"); setFocusIdx(0); setRewriteIdx(0);
    if (typeof window !== "undefined" && window.innerWidth < 1024) setSourceOpen(false);
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
      .then(() => setToast("이 프로필에서 같은 종류의 제안을 더 이상 하지 않습니다")).catch(() => {});
  }, [state.edits, state.runId, profile, setCard]);

  const acceptAll = useCallback(() => {
    const pending = state.edits.filter((e) => e.state !== "accepted");
    setAll("accepted");
    if (state.runId) for (const e of pending) void api.feedback({ runId: state.runId, suggestionId: `${state.runId}:${e.s.id}`, action: "accept" }).catch(() => {});
  }, [state.edits, state.runId, setAll]);

  const copyFinal = useCallback(async () => {
    if (!resultText) return;
    await navigator.clipboard.writeText(resultText).catch(() => {});
    if (state.runId) void api.final(state.runId, resultText).catch(() => {});
    setToast(`복사했습니다 · 수락 ${nAccepted} · 무시 ${nRejected}${manual !== null ? " · 직접 수정 포함" : ""}`);
  }, [resultText, state.runId, nAccepted, nRejected, manual]);

  const pickRewrite = useCallback((i: number) => {
    setRewriteIdx(i);
  }, []);
  const applyRewrite = useCallback(() => {
    const rw = state.rewrites[rewriteIdx]; if (!rw) return;
    setManual(rw.text); setView("result");
    if (state.runId) void api.feedback({ runId: state.runId, action: "prefer", chosenIndex: rw.index, rejectedIndexes: state.rewrites.filter((x) => x.index !== rw.index).map((x) => x.index) }).catch(() => {});
    setToast(`"${rw.label}" 안을 결과에 넣었습니다`);
  }, [state.rewrites, state.runId, rewriteIdx]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") { ev.preventDefault(); start(); return; }
      if ((ev.metaKey || ev.ctrlKey) && ev.shiftKey && ev.key.toLowerCase() === "c") { ev.preventDefault(); void copyFinal(); return; }
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT" || t.isContentEditable)) return;
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
  }, [state.edits, focusIdx, feedback, start, copyFinal]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    document.querySelector<HTMLElement>(`[data-card="${state.edits[focusIdx]?.s.id ?? ""}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focusIdx, state.edits]);

  const focusedId = state.edits[focusIdx]?.s.id ?? null;
  const currentRewrite = state.rewrites[rewriteIdx];

  return (
    <div className="flex flex-col gap-3">
      {/* 툴바 */}
      <div className="panel flex flex-wrap items-center gap-2 px-3 py-2">
        <select className="field max-w-[220px]" value={profileId} onChange={(e) => setProfileId(e.target.value)} aria-label="상황 프로필">
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="seg" role="group" aria-label="교정 강도">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" title={l.hint} aria-pressed={level === l.id} onClick={() => setLevel(l.id)}>{l.label}</button>
          ))}
        </div>
        <span className="ml-auto hidden text-[12px] text-neutral-400 sm:inline">{chars.toLocaleString()} / 4,000</span>
        {running ? (
          <button className="btn" onClick={cancel}>취소</button>
        ) : (
          <button data-testid="run" className="btn btn-primary" disabled={!text.trim() || chars > 4000} onClick={start}>교정 <kbd className="ml-0.5 border-neutral-700 bg-neutral-800 text-neutral-300">⌘↵</kbd></button>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        {/* 원문 */}
        <section className="panel flex flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2 text-[12px] text-neutral-500">
            <span className="font-medium text-neutral-700">원문</span>
            {profile && <span>· {profile.name}</span>}
            <button className="btn btn-ghost ml-auto h-6 px-2 text-[12px] lg:hidden" onClick={() => setSourceOpen((v) => !v)}>{sourceOpen ? "접기" : "펼치기"}</button>
          </div>
          {sourceOpen ? (
            <>
              <textarea ref={textareaRef} value={text} onChange={(e) => { setText(e.target.value); if (state.status !== "idle") reset(); }}
                placeholder="보낼 메시지나 보고 초안을 붙여넣으세요."
                className="min-h-[360px] w-full resize-y bg-transparent p-3 text-[16px] leading-[1.75] focus:outline-none" />
              {!text && (
                <div className="border-t px-3 py-2 text-[12px] text-neutral-500">
                  <button className="underline hover:text-neutral-900" onClick={() => setText(SAMPLE)}>예시 문장 넣기</button>
                  <span className="mx-2 text-neutral-300">|</span>
                  <kbd>⌘↵</kbd> 교정 · <kbd>j</kbd><kbd>k</kbd> 이동 · <kbd>a</kbd> 수락 · <kbd>x</kbd> 무시 · <kbd>⌘⇧C</kbd> 복사
                </div>
              )}
            </>
          ) : (
            <p className="line-clamp-2 px-3 py-2 text-[13px] text-neutral-500">{text}</p>
          )}
        </section>

        {/* 결과 */}
        <section className="flex flex-col gap-3">
          <div className="panel">
            <div className="flex items-center gap-1 border-b px-3 py-2">
              <div className="seg" role="group" aria-label="보기">
                <button type="button" aria-pressed={view === "diff"} onClick={() => setView("diff")}>변경 보기</button>
                <button type="button" aria-pressed={view === "result"} onClick={() => setView("result")}>결과 보기</button>
              </div>
              {running && <span className="ml-2 text-[12px] text-neutral-400">교정 중…</span>}
              <button className={`btn ml-auto ${done ? "btn-success" : ""}`} disabled={!state.sourceText || running} onClick={copyFinal} title="최종본을 클립보드에 복사 (⌘⇧C)">최종본 복사</button>
            </div>
            <div className="min-h-[220px] p-3">
              {state.status === "idle" && (
                <div className="flex h-full min-h-[190px] flex-col items-center justify-center gap-1 text-center text-[13px] text-neutral-400">
                  <p>교정 결과가 여기에 표시됩니다.</p>
                  <p className="text-[12px]">변경마다 이유를 보여주고, 수락한 것만 결과에 반영됩니다.</p>
                </div>
              )}
              {state.status === "error" && state.error && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-800">
                  <b>{state.error.code}</b> · {state.error.message}
                  {state.error.code === "provider_unavailable" && provider === "local" && (
                    <button className="ml-2 underline" onClick={() => setProvider("cloud")}>클라우드로 전환 (원문이 외부로 전송됩니다)</button>
                  )}
                </div>
              )}
              {state.sourceText && state.status !== "error" && (view === "diff" ? (
                <HighlightView text={state.sourceText} edits={state.edits} hoverId={hoverId ?? focusedId} onHover={setHoverId}
                  onClick={(id) => setFocusIdx(Math.max(0, state.edits.findIndex((e) => e.s.id === id)))} />
              ) : (
                <textarea value={resultText} onChange={(e) => setManual(e.target.value)} aria-label="결과 (직접 수정 가능)"
                  className="min-h-[190px] w-full resize-y rounded-md bg-neutral-50 p-2 text-[16px] leading-[1.75] focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-800/60" />
              ))}
            </div>
            {(state.readerView || state.usage) && (
              <div className="flex items-center gap-3 border-t px-3 py-1.5 text-[12px] text-neutral-500">
                {state.readerView && <span className="min-w-0 truncate" title={state.readerView}>ⓘ {state.readerView}</span>}
                {state.usage && (
                  <span className="ml-auto shrink-0 text-neutral-400" title={`입력 ${state.usage.inputTokens.toLocaleString()} · 캐시 ${state.usage.cachedTokens.toLocaleString()} · 출력 ${state.usage.outputTokens.toLocaleString()} 토큰 · ${state.model}`}>
                    {(state.usage.latencyMs / 1000).toFixed(1)}초 · ₩{Math.round(state.usage.costUsd * KRW)}
                    {state.usage.cachedTokens + state.usage.inputTokens > 0 && ` · 캐시 ${Math.round((state.usage.cachedTokens / (state.usage.cachedTokens + state.usage.inputTokens)) * 100)}%`}
                  </span>
                )}
              </div>
            )}
          </div>

          {(state.edits.length > 0 || running) && (
            <div className="panel">
              <div className="flex items-center gap-2 border-b px-3 py-2 text-[12px]">
                <span className="font-medium text-neutral-700">변경 {state.edits.length}</span>
                {nPending > 0 && <span className="text-neutral-400">· 대기 {nPending}</span>}
                {state.dropped.length > 0 && <span className="text-neutral-400" title="원문에서 위치를 확정하지 못한 제안">· 미확정 {state.dropped.length}</span>}
                <button className="btn btn-ghost ml-auto h-6 px-2 text-[12px]" onClick={acceptAll} disabled={nPending === 0}>모두 수락</button>
                <button className="btn btn-ghost h-6 px-2 text-[12px]" onClick={() => setAll("rejected")} disabled={nPending === 0}>모두 무시</button>
              </div>
              <div className="flex max-h-[52vh] flex-col gap-1.5 overflow-y-auto p-2">
                {state.edits.map((item, i) => (
                  <SuggestionCard key={item.s.id} item={item} focused={i === focusIdx} expanded={i === focusIdx || hoverId === item.s.id}
                    onHover={setHoverId} onFocus={() => setFocusIdx(i)}
                    onAccept={() => feedback(item.s.id, "accept")} onReject={() => feedback(item.s.id, "reject")} onMute={() => mute(item.s.id)} />
                ))}
                {running && state.edits.length === 0 && <div className="h-10 animate-pulse rounded-md bg-neutral-100" />}
                {done && state.edits.length === 0 && <p className="p-3 text-center text-[13px] text-neutral-500">고칠 곳이 없습니다. 그대로 보내도 됩니다.</p>}
              </div>
            </div>
          )}

          {state.rewrites.length > 0 && (
            <div className="panel">
              <div className="flex items-center gap-2 border-b px-3 py-2 text-[12px]">
                <span className="font-medium text-neutral-700">톤 대안</span>
                <div className="seg ml-1" role="group" aria-label="톤 대안 선택">
                  {state.rewrites.map((rw, i) => (
                    <button key={rw.index} type="button" data-rewrite={rw.index} aria-pressed={i === rewriteIdx} onClick={() => pickRewrite(i)}>{rw.label}</button>
                  ))}
                </div>
                <button className="btn ml-auto h-6 px-2 text-[12px]" onClick={applyRewrite}>이걸로 교체</button>
              </div>
              {currentRewrite && (
                <div className="p-3">
                  <p className="whitespace-pre-wrap text-[15px] leading-[1.75]">{currentRewrite.text}</p>
                  <p className="mt-1.5 text-[12px] text-neutral-400">{currentRewrite.rationale}</p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="flex items-center gap-2 text-[12px] text-neutral-400">
        <button className="flex items-center gap-1.5 hover:text-neutral-700" onClick={() => setProvider((p) => (p === "cloud" ? "local" : "cloud"))} title="클릭해서 처리 위치를 바꿉니다">
          <span className={`inline-block h-2 w-2 rounded-full ${provider === "local" ? "bg-emerald-500" : "bg-sky-500"}`} />
          {provider === "local" ? "내 Mac에서 처리" : "클라우드에서 처리 (개인정보는 마스킹 후 전송)"}
        </button>
      </div>

      {toast && <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-md bg-neutral-900 px-3 py-2 text-[13px] text-white shadow-lg">{toast}</div>}
    </div>
  );
}
