"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Segmented, Select, Splitter, Tooltip } from "antd";
import { CopyOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { applyEdits, type Level, type ProviderId, type SituationProfile } from "@grammer-hub/core";
import { api } from "@/lib/api";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { HighlightView } from "./HighlightView";
import { SuggestionCard } from "./SuggestionCard";
import { useCorrection } from "./useCorrection";

const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: "L1", label: "맞춤법만", hint: "맞춤법·띄어쓰기·문장부호만 고칩니다" },
  { value: "L2", label: "다듬기", hint: "높임 단계·문체·간결함까지 프로필에 맞춥니다" },
  { value: "L3", label: "다시 쓰기", hint: "다듬기 + 톤이 다른 대안 3안" },
];
const SAMPLE = "팀장님 어제 말씀하신 정산 자료 정리해서 보내드릴께요. 커피 나오셨습니다 ㅎㅎ\n확인 부탁드리겠습니다.";
const KRW = 1380;
const muted: React.CSSProperties = { color: "var(--ant-color-text-secondary)" };
const faint: React.CSSProperties = { color: "var(--ant-color-text-tertiary)" };
const divider: React.CSSProperties = { borderColor: "var(--ant-color-border-secondary)" };

export function Editor({ profiles, defaultProvider, initialProfileId }: { profiles: SituationProfile[]; defaultProvider: ProviderId; initialProfileId?: string }) {
  const { message } = App.useApp();
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const [text, setText] = useState("");
  const [profileId, setProfileId] = useState(initialProfileId ?? profiles.find((p) => p.isDefault)?.id ?? profiles[0]?.id ?? "");
  const [level, setLevel] = useState<Level>("L2");
  const [provider, setProvider] = useState<ProviderId>(defaultProvider);
  const [view, setView] = useState<"diff" | "result">("diff");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [manual, setManual] = useState<string | null>(null);
  const [rewriteIdx, setRewriteIdx] = useState(0);
  const [sourceOpen, setSourceOpen] = useState(true);
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
    if (!isDesktop) setSourceOpen(false);
    void run({ text, profileId, level, provider });
  }, [text, profileId, level, provider, run, isDesktop]);

  const feedback = useCallback((id: string, action: "accept" | "reject") => {
    setCard(id, action === "accept" ? "accepted" : "rejected");
    if (state.runId) void api.feedback({ runId: state.runId, suggestionId: `${state.runId}:${id}`, action }).catch(() => {});
  }, [setCard, state.runId]);

  const mute = useCallback((id: string) => {
    const item = state.edits.find((e) => e.s.id === id);
    if (!item || !state.runId || !profile) return;
    setCard(id, "rejected");
    void api.feedback({ runId: state.runId, suggestionId: `${state.runId}:${id}`, action: "mute", category: item.s.category, channel: profile.channel, audience: profile.audience })
      .then(() => message.success("이 프로필에서 같은 종류의 제안을 더 이상 하지 않습니다")).catch(() => message.error("저장에 실패했습니다"));
  }, [state.edits, state.runId, profile, setCard, message]);

  const acceptAll = useCallback(() => {
    const pending = state.edits.filter((e) => e.state !== "accepted");
    setAll("accepted");
    if (state.runId) for (const e of pending) void api.feedback({ runId: state.runId, suggestionId: `${state.runId}:${e.s.id}`, action: "accept" }).catch(() => {});
  }, [state.edits, state.runId, setAll]);

  const copyFinal = useCallback(async () => {
    if (!resultText) return;
    await navigator.clipboard.writeText(resultText).catch(() => {});
    if (state.runId) void api.final(state.runId, resultText).catch(() => {});
    message.success(`복사했습니다 · 수락 ${nAccepted} · 무시 ${nRejected}${manual !== null ? " · 직접 수정 포함" : ""}`);
  }, [resultText, state.runId, nAccepted, nRejected, manual, message]);

  const applyRewrite = useCallback(() => {
    const rw = state.rewrites[rewriteIdx]; if (!rw) return;
    setManual(rw.text); setView("result");
    if (state.runId) void api.feedback({ runId: state.runId, action: "prefer", chosenIndex: rw.index, rejectedIndexes: state.rewrites.filter((x) => x.index !== rw.index).map((x) => x.index) }).catch(() => {});
    message.success(`"${rw.label}" 안을 결과에 넣었습니다`);
  }, [state.rewrites, state.runId, rewriteIdx, message]);

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

  useEffect(() => {
    document.querySelector<HTMLElement>(`[data-card="${state.edits[focusIdx]?.s.id ?? ""}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focusIdx, state.edits]);

  const focusedId = state.edits[focusIdx]?.s.id ?? null;
  const currentRewrite = state.rewrites[rewriteIdx];

  const sourcePane = (
    <section className="panel flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-[12px]" style={{ ...divider, ...muted }}>
        <span className="font-semibold" style={{ color: "var(--ant-color-text)" }}>원문</span>
        {profile && <span>· {profile.name}</span>}
        {!isDesktop && <Button type="text" size="small" className="ml-auto" onClick={() => setSourceOpen((v) => !v)}>{sourceOpen ? "접기" : "펼치기"}</Button>}
      </div>
      {sourceOpen ? (
        <>
          <textarea ref={textareaRef} value={text} onChange={(e) => { setText(e.target.value); if (state.status !== "idle") reset(); }}
            placeholder="보낼 메시지나 보고 초안을 붙여넣으세요."
            className="min-h-[360px] w-full flex-1 resize-none border-0 bg-transparent p-3 text-[16px] leading-[1.75] outline-none" style={{ color: "var(--ant-color-text)" }} />
          {!text && (
            <div className="border-t px-3 py-2 text-[12px]" style={{ ...divider, ...muted }}>
              <Button type="link" size="small" className="!px-0" onClick={() => setText(SAMPLE)}>예시 문장 넣기</Button>
              <span className="mx-2" style={faint}>|</span>
              <kbd>⌘↵</kbd> 교정 · <kbd>j</kbd><kbd>k</kbd> 이동 · <kbd>a</kbd> 수락 · <kbd>x</kbd> 무시 · <kbd>⌘⇧C</kbd> 복사
            </div>
          )}
        </>
      ) : (
        <p className="line-clamp-2 m-0 px-3 py-2 text-[13px]" style={muted}>{text}</p>
      )}
    </section>
  );

  const resultPane = (
    <section className="flex h-full flex-col gap-3">
      <div className="panel">
        <div className="flex items-center gap-2 border-b px-3 py-2" style={divider}>
          <Segmented size="small" value={view} onChange={(v) => setView(v as "diff" | "result")}
            options={[{ value: "diff", label: "변경 보기" }, { value: "result", label: "결과 보기" }]} />
          {running && <span className="ml-1 text-[12px]" style={faint}>교정 중…</span>}
          <Tooltip title="최종본을 클립보드에 복사 (⌘⇧C)">
            <Button data-testid="copy" data-done={done ? "1" : "0"} className="ml-auto" type={done ? "primary" : "default"} icon={<CopyOutlined />}
              disabled={!state.sourceText || running} onClick={copyFinal}>최종본 복사</Button>
          </Tooltip>
        </div>
        <div className="min-h-[220px] p-3">
          {state.status === "idle" && (
            <div className="flex min-h-[190px] flex-col items-center justify-center gap-1 text-center text-[13px]" style={faint}>
              <p className="m-0">교정 결과가 여기에 표시됩니다.</p>
              <p className="m-0 text-[12px]">변경마다 이유를 보여주고, 수락한 것만 결과에 반영됩니다.</p>
            </div>
          )}
          {state.status === "error" && state.error && (
            <Alert type="error" showIcon message={state.error.code} description={state.error.message}
              action={state.error.code === "provider_unavailable" && provider === "local" ? <Button size="small" onClick={() => setProvider("cloud")}>클라우드로 전환 (원문이 외부로 전송됩니다)</Button> : undefined} />
          )}
          {state.sourceText && state.status !== "error" && (view === "diff" ? (
            <HighlightView text={state.sourceText} edits={state.edits} hoverId={hoverId ?? focusedId} onHover={setHoverId}
              onClick={(id) => setFocusIdx(Math.max(0, state.edits.findIndex((e) => e.s.id === id)))} />
          ) : (
            <textarea data-testid="result-text" value={resultText} onChange={(e) => setManual(e.target.value)} aria-label="결과 (직접 수정 가능)"
              className="min-h-[190px] w-full resize-y rounded-md border p-2 text-[16px] leading-[1.75] outline-none focus:border-primary"
              style={{ background: "var(--ant-color-bg-layout)", color: "var(--ant-color-text)", borderColor: "var(--ant-color-border-secondary)" }} />
          ))}
        </div>
        {(state.readerView || state.usage) && (
          <div className="flex items-center gap-3 border-t px-3 py-1.5 text-[12px]" style={{ ...divider, ...muted }}>
            {state.readerView && <span className="min-w-0 truncate" title={state.readerView}>ⓘ {state.readerView}</span>}
            {state.usage && (
              <span className="ml-auto shrink-0" style={faint} title={`입력 ${state.usage.inputTokens.toLocaleString()} · 캐시 ${state.usage.cachedTokens.toLocaleString()} · 출력 ${state.usage.outputTokens.toLocaleString()} 토큰 · ${state.model}`}>
                {(state.usage.latencyMs / 1000).toFixed(1)}초 · ₩{Math.round(state.usage.costUsd * KRW)}
                {state.usage.cachedTokens + state.usage.inputTokens > 0 && ` · 캐시 ${Math.round((state.usage.cachedTokens / (state.usage.cachedTokens + state.usage.inputTokens)) * 100)}%`}
              </span>
            )}
          </div>
        )}
      </div>

      {(state.edits.length > 0 || running) && (
        <div className="panel">
          <div className="flex items-center gap-2 border-b px-3 py-2 text-[12px]" style={divider}>
            <span className="font-semibold">변경 {state.edits.length}</span>
            {nPending > 0 && <span style={faint}>· 대기 {nPending}</span>}
            {state.dropped.length > 0 && <Tooltip title="원문에서 위치를 확정하지 못한 제안"><span style={faint}>· 미확정 {state.dropped.length}</span></Tooltip>}
            <Button type="text" size="small" className="ml-auto" onClick={acceptAll} disabled={nPending === 0}>모두 수락</Button>
            <Button type="text" size="small" onClick={() => setAll("rejected")} disabled={nPending === 0}>모두 무시</Button>
          </div>
          <div className="flex max-h-[52vh] flex-col gap-1.5 overflow-y-auto p-2">
            {state.edits.map((item, i) => (
              <SuggestionCard key={item.s.id} item={item} focused={i === focusIdx} expanded={i === focusIdx || hoverId === item.s.id}
                onHover={setHoverId} onFocus={() => setFocusIdx(i)}
                onAccept={() => feedback(item.s.id, "accept")} onReject={() => feedback(item.s.id, "reject")} onUndo={() => setCard(item.s.id, "pending")} onMute={() => mute(item.s.id)} />
            ))}
            {running && state.edits.length === 0 && <div className="h-10 animate-pulse rounded-md" style={{ background: "var(--ant-color-fill-tertiary, #f5f5f5)" }} />}
            {done && state.edits.length === 0 && <p className="m-0 p-3 text-center text-[13px]" style={muted}>고칠 곳이 없습니다. 그대로 보내도 됩니다.</p>}
          </div>
        </div>
      )}

      {state.rewrites.length > 0 && (
        <div className="panel">
          <div className="flex items-center gap-2 border-b px-3 py-2 text-[12px]" style={divider}>
            <span className="font-semibold">톤 대안</span>
            <Segmented size="small" value={rewriteIdx} onChange={(v) => setRewriteIdx(Number(v))}
              options={state.rewrites.map((rw, i) => ({ value: i, label: <span data-rewrite={rw.index}>{rw.label}</span> }))} />
            <Button size="small" className="ml-auto" onClick={applyRewrite}>이걸로 교체</Button>
          </div>
          {currentRewrite && (
            <div className="p-3">
              <p className="m-0 whitespace-pre-wrap text-[15px] leading-[1.75]">{currentRewrite.text}</p>
              <p className="mt-1.5 mb-0 text-[12px]" style={faint}>{currentRewrite.rationale}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="panel flex flex-wrap items-center gap-2 px-3 py-2">
        <Select aria-label="상황 프로필" value={profileId} onChange={setProfileId} className="min-w-[200px]" showSearch optionFilterProp="label"
          options={profiles.map((p) => ({ value: p.id, label: p.name }))} />
        <Segmented value={level} onChange={(v) => setLevel(v as Level)}
          options={LEVELS.map((l) => ({ value: l.value, label: <Tooltip title={l.hint}><span>{l.label}</span></Tooltip> }))} />
        <span className="ml-auto hidden text-[12px] sm:inline" style={faint}>{chars.toLocaleString()} / 4,000</span>
        {running ? (
          <Button onClick={cancel}>취소</Button>
        ) : (
          <Button data-testid="run" type="primary" icon={<ThunderboltOutlined />} disabled={!text.trim() || chars > 4000} onClick={start}>교정 <kbd className="ml-1 !border-transparent !bg-white/20 !text-white">⌘↵</kbd></Button>
        )}
      </div>

      {isDesktop ? (
        <Splitter className="min-h-[520px]" style={{ background: "transparent" }}>
          <Splitter.Panel defaultSize="46%" min="30%" max="65%">{sourcePane}</Splitter.Panel>
          <Splitter.Panel><div className="pl-3">{resultPane}</div></Splitter.Panel>
        </Splitter>
      ) : (
        <div className="flex flex-col gap-3">{sourcePane}{resultPane}</div>
      )}

      <div className="flex items-center gap-2 text-[12px]" style={faint}>
        <Tooltip title="클릭해서 처리 위치를 바꿉니다">
          <button type="button" className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0" style={faint} onClick={() => setProvider((p) => (p === "cloud" ? "local" : "cloud"))}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: provider === "local" ? "var(--color-primary)" : "var(--ant-color-text-tertiary)" }} />
            {provider === "local" ? "내 Mac에서 처리" : "클라우드에서 처리 (개인정보는 마스킹 후 전송)"}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
