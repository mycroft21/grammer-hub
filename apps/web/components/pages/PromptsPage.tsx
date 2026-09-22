"use client";
import { useCallback, useState } from "react";
import { Segmented, Spin, Typography } from "antd";
import { PageHeader } from "./_shared";
import { useStudio } from "@/components/studio/useStudio";
import { CreateForm } from "@/components/studio/CreateForm";
import { AskStep } from "@/components/studio/AskStep";
import { ResultPanel } from "@/components/studio/ResultPanel";
import { LibraryPanel } from "@/components/studio/LibraryPanel";
import { TicketReview } from "@/components/studio/TicketReview";
import { ProgressLine } from "@/components/ProgressLine";
import { RunLog } from "@/components/RunLog";

/** 프롬프트 스튜디오: 개발 생애주기(조사→계획→개발→검토) 목적의 프롬프트를 규격에 맞춰 만들고 보관한다. */
export function PromptsPage() {
  const [tab, setTab] = useState<"create" | "library">("create");
  const [refreshKey, setRefreshKey] = useState(0);
  const studio = useStudio();
  const { state } = studio;
  const busy = state.phase === "planning" || state.phase === "generating";

  const save = useCallback(async () => {
    const id = await studio.save();
    if (id) setRefreshKey((k) => k + 1);
    return id;
  }, [studio]);

  return (
    <div>
      <PageHeader title="프롬프트" description="목표 한 문장 → 규격화된 프롬프트. 내 데이터는 쓰지 않고(중립), 단계별 최소 품질을 코드가 보장합니다."
        extra={<Segmented data-testid="studio-tab" value={tab} onChange={(v) => setTab(v as typeof tab)} options={[{ value: "create", label: "만들기" }, { value: "library", label: "보관함" }]} />} />
      {tab === "create" ? (
        <div className="flex flex-col gap-4">
          {state.phase === "form" && <CreateForm busy={false} error={state.error} initial={state.request} onSubmit={(req) => void studio.start(req)} onTicket={(input) => void studio.startFromTicket(input)} />}
          {state.phase === "ticket_review" && state.ticket && (
            <TicketReview ticket={state.ticket.ticket} plan={state.ticket.plan} workspace={state.ticket.workspace} busy={busy} onGenerate={(req) => void studio.generateFromTicket(req)} onBack={studio.backToForm} />
          )}
          {state.phase === "planning" && (
            <div className="flex flex-col gap-2 py-6">
              <div className="flex items-center gap-3"><Spin /><Typography.Text type="secondary">{state.log[0]?.msg.startsWith("티켓") ? "티켓을 가져와 분류하는 중…" : "의도를 정리하는 중… 필요한 것만 묻습니다."}</Typography.Text></div>
              <ProgressLine compact stage="requesting" startedAt={state.progress.startedAt} expectedMs={null} />
              <RunLog entries={state.log} running compact />
            </div>
          )}
          {state.phase === "ask" && state.plan && <AskStep plan={state.plan} busy={busy} onAnswer={(a, assume) => void studio.answer(a, assume)} onBack={studio.backToForm} />}
          {(state.phase === "generating" || state.phase === "result") && (
            <ResultPanel state={state} onRegenerate={(s, i) => void studio.regenerate(s, i)} onEdit={(s, v) => void studio.editSlot(s, v)} onSave={save} onReset={studio.reset} />
          )}
        </div>
      ) : <LibraryPanel refreshKey={refreshKey} />}
    </div>
  );
}
