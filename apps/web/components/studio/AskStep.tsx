"use client";
import { useState } from "react";
import { Alert, Button, Input, Radio, Space, Typography } from "antd";
import type { PlanResult } from "@grammer-hub/core";

/**
 * 의도 정리 질문. 선택지 버튼 + 필요 시 직접 입력.
 * 답을 반영하면 남은 모호함을 다시 확인해 새 질문을 아래에 붙인다(위 질문은 그대로 남아 고칠 수 있고, 최종 답이 생성에 들어간다).
 * '즉시 생성'은 언제든 누를 수 있고, 답하지 않은 질문은 기본값으로 가정한다.
 */
export function AskStep({ plan, initial, busy, error, onAnswer, onBack }: { plan: PlanResult; initial?: Record<string, string> | undefined; busy: boolean; error?: string | null; onAnswer: (answers: Record<string, string>, now: boolean) => void; onBack: () => void }) {
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
  const allAnswered = plan.questions.every((q) => merged()[q.id]);
  return (
    <div className="flex flex-col gap-4" data-testid="studio-ask">
      <Alert type="info" showIcon message={plan.summary} description="가정하면 결과가 크게 달라지는 것만 묻습니다. 답을 반영하면 남은 모호함을 다시 확인해 필요한 질문을 아래에 더합니다. '즉시 생성'을 누르면 답하지 않은 질문은 기본값으로 가정합니다." />
      {plan.questions.map((q, i) => (
        <div key={q.id} className="rounded-lg border p-3" style={{ borderColor: "var(--ant-color-border-secondary)" }}>
          <Typography.Text strong>{i + 1}. {q.question}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }} className="ml-2">{q.why}</Typography.Text>
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
      {plan.verify_in_repo.length > 0 && <Typography.Text type="secondary" style={{ fontSize: 12 }}>묻지 않고 코드에서 확인하도록 넘김: {plan.verify_in_repo.join(" · ")}</Typography.Text>}
      {plan.assumptions.length > 0 && <Typography.Text type="secondary" style={{ fontSize: 12 }}>가정: {plan.assumptions.join(" · ")}</Typography.Text>}
      {error && <Alert type="error" showIcon message={error} />}
      <Space wrap>
        <Button data-testid="studio-answer" type="primary" loading={busy} disabled={!allAnswered} onClick={() => onAnswer(merged(), false)}>답변 반영</Button>
        <Button data-testid="studio-now" disabled={busy} onClick={() => onAnswer(merged(), true)}>즉시 생성</Button>
        <Button type="text" onClick={onBack}>뒤로</Button>
      </Space>
    </div>
  );
}
