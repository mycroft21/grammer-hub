"use client";
import { useState } from "react";
import { Alert, Button, Collapse, Input, Radio, Segmented, Select, Space, Switch, Tag, Typography } from "antd";
import { DOMAINS, DOMAIN_LIST, PURPOSES, type ClarifyPolicy, type PlanResult, type PromptLanguage, type PromptLength, type Purpose, type Runtime, type StudioRequest } from "@grammer-hub/core";
import type { WorkspaceStatus } from "@/lib/api";
import { CLARIFY_KO, LANG_LABEL, LENGTH_KO, RUNTIME_LABEL, RUNTIME_LABEL_LONG } from "./labels";

// '전체 설정'을 펼친 상태는 다시 정리(재마운트)해도 유지한다(한 페이지 안에서만)
let settingsOpenMemo = false;

const purposeOptions = DOMAIN_LIST.map((d) => ({ label: DOMAINS[d].label, options: DOMAINS[d].purposes.map((p) => ({ value: p, label: `${DOMAINS[d].label} · ${PURPOSES[p].label}` })) }));

/**
 * 확인 화면(간단 흐름의 둘째 단계, 질문이 없어도 거친다). 의도 정리가 추론한 값을 보여 주고 바로 고치게 한다.
 * - 칩: 목적·실행 환경·대상 저장소(개발). 결과를 크게 바꾸는 값이라 늘 보인다.
 * - 한 줄 요약 + '전체 설정'(접힘): 세부 유형·분량·질문 정책·언어·어투(글쓰기)·저장소.
 * - 목적·세부 유형을 바꾸면 질문 목록이 달라져 의도 정리를 다시 한다(onReplan). 나머지는 재호출 없이 바로 반영(onChange).
 * - 질문(있으면): 답을 반영하면 남은 모호함을 다시 확인해 새 질문을 아래에 붙인다. '만들기'는 답하지 않은 질문을 기본값으로 가정한다.
 */
export function ConfirmStep({ request, plan, workspace, busy, error, onChange, onReplan, onAnswer, onBack }: {
  request: StudioRequest; plan: PlanResult; workspace: WorkspaceStatus | null; busy: boolean; error?: string | null;
  onChange: (patch: Partial<StudioRequest>) => void; onReplan: (purpose: Purpose, subtype: string | null) => void;
  onAnswer: (answers: Record<string, string>, now: boolean) => void; onBack: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(settingsOpenMemo);
  const initial = request.answers;
  // 다시 마운트돼도(탭 이동) 이미 반영한 답은 남긴다. 선택지에 없는 값은 직접 입력으로
  const isOption = (id: string, v: string) => plan.questions.some((q) => q.id === id && q.options.some((o) => o.value === v));
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial ?? {}).map(([id, v]) => [id, isOption(id, v) ? v : "__other"])));
  const [other, setOther] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial ?? {}).filter(([id, v]) => !isOption(id, v))));
  const merged = () => {
    const out: Record<string, string> = {};
    for (const q of plan.questions) {
      const v = answers[q.id];
      if (v === "__other") { if (other[q.id]?.trim()) out[q.id] = other[q.id]!.trim(); }
      else if (v) out[q.id] = v;
    }
    return out;
  };
  const showQuestions = request.clarify !== "never_ask" && plan.questions.length > 0;
  const allAnswered = plan.questions.every((q) => merged()[q.id]);

  const purpose = request.purpose;
  const def = PURPOSES[purpose];
  const dev = def.domain === "dev";
  const runtime: Runtime = request.runtime ?? "chat";
  const repos = request.hints?.repos ?? [];
  const repoNames = workspace?.repoNames ?? [];
  const setRepos = (v: string[]) => {
    const { repos: _r, ...h } = request.hints ?? {};
    onChange({ hints: v.length ? { ...h, repos: v } : (Object.keys(h).length ? h : null) });
    // 저장소 질문(where)이 떠 있으면 고른 저장소를 그 답으로
    const where = plan.questions.find((q) => q.id === "where");
    const first = v[0];
    if (where && first) {
      const isOpt = where.options.some((o) => o.value === first);
      setAnswers((a) => ({ ...a, where: isOpt ? first : "__other" }));
      if (!isOpt) setOther((o) => ({ ...o, where: first }));
    } else if (where) {
      // 선택을 비우면 그 선택으로 채웠던 답도 비운다(지운 저장소가 답으로 되살아나지 않게)
      setAnswers(({ where: _w, ...a }) => a); setOther(({ where: _o, ...o }) => o);
    }
  };
  const small = { fontSize: 12 } as const;

  return (
    <div className="flex flex-col gap-4" data-testid="studio-confirm">
      <div className="rounded-lg border p-3" style={{ borderColor: "var(--ant-color-border-secondary)" }}>
        <Typography.Text strong>이렇게 이해했습니다</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ ...small, margin: "2px 0 8px" }} data-testid="confirm-summary">{plan.summary}</Typography.Paragraph>
        <div className="flex flex-wrap items-center gap-2">
          <Select data-testid="confirm-purpose" size="small" style={{ minWidth: 190 }} value={purpose} options={purposeOptions} disabled={busy}
            onChange={(v: Purpose) => onReplan(v, null)} popupMatchSelectWidth={false} />
          <Select data-testid="confirm-runtime" size="small" style={{ minWidth: 130 }} value={runtime} disabled={busy}
            onChange={(v: Runtime) => onChange({ runtime: v })} options={(Object.keys(RUNTIME_LABEL) as Runtime[]).map((k) => ({ value: k, label: RUNTIME_LABEL[k] }))} popupMatchSelectWidth={false}
            optionRender={(o) => RUNTIME_LABEL_LONG[o.value as Runtime]} />
          {dev && repoNames.length > 0 && (
            <Select data-testid="confirm-repos" size="small" mode="multiple" allowClear style={{ minWidth: 180 }} placeholder="대상 저장소(비우면 목표에서 찾음)" value={repos} disabled={busy}
              onChange={(v: string[]) => setRepos(v)} options={repoNames.map((r) => ({ value: r, label: r }))} />
          )}
          <Typography.Text type="secondary" style={small} data-testid="confirm-line">
            {LENGTH_KO[request.length]} · {CLARIFY_KO[request.clarify ?? "ask_first"]} · {LANG_LABEL[request.promptLanguage]}{request.includeStyleRules ? " · 내 어투" : ""}
          </Typography.Text>
        </div>
        <Collapse ghost size="small" className="mt-1" data-testid="confirm-settings" activeKey={settingsOpen ? ["all"] : []}
          onChange={(k) => { const open = (Array.isArray(k) ? k : [k]).includes("all"); settingsOpenMemo = open; setSettingsOpen(open); }} items={[{ key: "all", label: <Typography.Text type="secondary" style={small}>전체 설정</Typography.Text>, children: (
          <div className="flex flex-col gap-3">
            <div>
              <Typography.Text type="secondary" style={small} className="block">세부 유형 <span style={{ opacity: .7 }}>(바꾸면 질문을 다시 정리합니다)</span></Typography.Text>
              <Select data-testid="confirm-subtype" size="small" className="w-full" {...(request.subtype ? { value: request.subtype } : {})} disabled={busy} onChange={(v: string) => onReplan(purpose, v)}
                options={def.subtypes.map((s) => ({ value: s.id, label: <span>{s.label} <span style={{ color: "var(--ant-color-text-tertiary)", fontSize: 12 }}>· {s.hint}</span></span> }))} />
            </div>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <Typography.Text type="secondary" style={small} className="block">분량</Typography.Text>
                <Segmented size="small" disabled={busy} value={request.length} onChange={(v) => onChange({ length: v as PromptLength })} options={(Object.keys(LENGTH_KO) as PromptLength[]).map((k) => ({ value: k, label: LENGTH_KO[k] }))} />
              </div>
              <div>
                <Typography.Text type="secondary" style={small} className="block">모호할 때</Typography.Text>
                <Select data-testid="confirm-clarify" size="small" style={{ width: 190 }} disabled={busy} value={request.clarify ?? "ask_first"} onChange={(v: ClarifyPolicy) => onChange({ clarify: v })} options={(Object.keys(CLARIFY_KO) as ClarifyPolicy[]).map((k) => ({ value: k, label: CLARIFY_KO[k] }))} />
              </div>
              <div>
                <Typography.Text type="secondary" style={small} className="block">프롬프트 언어</Typography.Text>
                <Segmented data-testid="studio-lang" size="small" disabled={busy} value={request.promptLanguage} onChange={(v) => onChange({ promptLanguage: v as PromptLanguage })} options={(Object.keys(LANG_LABEL) as PromptLanguage[]).map((k) => ({ value: k, label: LANG_LABEL[k] }))} />
              </div>
              {def.domain === "writing" && (
                <div className="flex items-center gap-2">
                  <Switch size="small" disabled={busy} checked={request.includeStyleRules} onChange={(v) => onChange({ includeStyleRules: v })} />
                  <Typography.Text type="secondary" style={small}>내 어투 규칙 포함</Typography.Text>
                </div>
              )}
            </div>
            {request.promptLanguage === "en" && <Typography.Text type="secondary" style={small}>지시문은 영어로, 답변은 한국어로 나오도록 규칙이 자동으로 들어갑니다.</Typography.Text>}
          </div>
        ) }]} />
      </div>

      {showQuestions && (
        <div className="flex flex-col gap-3" data-testid="studio-ask">
          <Typography.Text type="secondary" style={small}>확인할 것 {plan.questions.length}개 — 가정하면 결과가 크게 달라지는 것만 묻습니다. 답을 반영하면 남은 모호함을 다시 확인해 필요한 질문을 아래에 더합니다.</Typography.Text>
          {plan.questions.map((q, i) => (
            <div key={q.id} className="rounded-lg border p-3" style={{ borderColor: "var(--ant-color-border-secondary)" }}>
              <Typography.Text strong>{i + 1}. {q.question}</Typography.Text>
              <Typography.Text type="secondary" style={small} className="ml-2">{q.why}</Typography.Text>
              <div className="mt-2">
                <Radio.Group disabled={busy} value={answers[q.id]} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value as string }))}>
                  <Space wrap>
                    {q.options.map((o) => <Radio.Button key={o.value} value={o.value} data-testid="studio-option">{o.label}</Radio.Button>)}
                    {q.allow_other && <Radio.Button value="__other">직접 입력</Radio.Button>}
                  </Space>
                </Radio.Group>
                {answers[q.id] === "__other" && <Input className="mt-2" placeholder="직접 입력" value={other[q.id] ?? ""} onChange={(e) => setOther((o) => ({ ...o, [q.id]: e.target.value }))} />}
              </div>
            </div>
          ))}
        </div>
      )}
      {!showQuestions && plan.questions.length > 0 && <Typography.Text type="secondary" style={small}>질문 정책이 &lsquo;묻지 않기&rsquo;라 질문 {plan.questions.length}개를 기본값으로 가정합니다.</Typography.Text>}
      {(plan.verify_in_repo.length > 0 || plan.assumptions.length > 0) && (
        <div className="flex flex-wrap gap-1" style={small}>
          {plan.assumptions.map((a, i) => <Tag key={`a${i}`} style={{ fontSize: 11 }}>가정 · {a}</Tag>)}
          {plan.verify_in_repo.map((v, i) => <Tag key={`v${i}`} color="green" style={{ fontSize: 11 }}>코드에서 확인 · {v}</Tag>)}
        </div>
      )}
      {error && <Alert type="error" showIcon message={error} />}
      <Space wrap>
        <Button data-testid="studio-make" type="primary" loading={busy} disabled={busy} onClick={() => onAnswer(merged(), true)}>만들기</Button>
        {showQuestions && <Button data-testid="studio-answer" disabled={busy || !allAnswered} onClick={() => onAnswer(merged(), false)}>답변 반영(질문 더 보기)</Button>}
        <Button type="text" onClick={onBack} disabled={busy}>뒤로</Button>
      </Space>
    </div>
  );
}
