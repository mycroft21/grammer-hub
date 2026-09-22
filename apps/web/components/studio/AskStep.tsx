"use client";
import { useState } from "react";
import { Alert, Button, Input, Radio, Space, Typography } from "antd";
import type { PlanResult } from "@grammer-hub/core";

/** 의도 정리 질문. 선택지 버튼 + 필요 시 직접 입력. 답 없이도 '가정으로 진행' 가능. */
export function AskStep({ plan, busy, onAnswer, onBack }: { plan: PlanResult; busy: boolean; onAnswer: (answers: Record<string, string>, assumeRest: boolean) => void; onBack: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});
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
      <Alert type="info" showIcon message={plan.summary} description="가정하면 결과가 크게 달라지는 것만 묻습니다. 모르면 '가정으로 진행'을 눌러도 됩니다." />
      {plan.questions.map((q, i) => (
        <div key={q.id} className="rounded-lg border p-3" style={{ borderColor: "var(--ant-color-border-secondary)" }}>
          <Typography.Text strong>{i + 1}. {q.question}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }} className="ml-2">{q.why}</Typography.Text>
          <div className="mt-2">
            <Radio.Group value={answers[q.id]} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value as string }))}>
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
      <Space wrap>
        <Button data-testid="studio-answer" type="primary" loading={busy} disabled={!allAnswered} onClick={() => onAnswer(merged(), false)}>답변으로 생성</Button>
        <Button data-testid="studio-assume" loading={busy} onClick={() => onAnswer(merged(), true)}>가정으로 진행</Button>
        <Button type="text" onClick={onBack}>뒤로</Button>
      </Space>
    </div>
  );
}
