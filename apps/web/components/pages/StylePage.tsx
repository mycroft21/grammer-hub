"use client";
import { useEffect, useState } from "react";
import type { StyleRule } from "@grammer-hub/core";
import { api } from "@/lib/api";

export function StylePage() {
  const [rules, setRules] = useState<StyleRule[]>([]);
  const [text, setText] = useState("");
  const [sample, setSample] = useState("");
  const reload = () => api.rules.list().then(setRules);
  useEffect(() => { void reload(); }, []);

  const add = async () => { if (!text.trim()) return; await api.rules.create({ text: text.trim(), confidence: 0.7 }); setText(""); await reload(); };
  const toggle = async (r: StyleRule, status: StyleRule["status"]) => { await api.rules.save(r.id, { ...r, status }); await reload(); };

  const groups: [string, StyleRule[]][] = [
    ["고정", rules.filter((r) => r.status === "pinned")],
    ["활성", rules.filter((r) => r.status === "active")],
    ["꺼진 제안", rules.filter((r) => r.status === "demoted")],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <input className="flex-1 rounded border bg-white px-3 py-2 text-sm" placeholder='예: 슬랙에서는 상급자에게도 "~습니다"보다 "~요"를 선호한다' value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="rounded bg-neutral-900 px-3 py-2 text-sm text-white" onClick={add}>규칙 추가</button>
        </div>
        {groups.map(([title, list]) => (
          <section key={title}>
            <h2 className="mb-2 text-xs font-medium text-neutral-500">{title} · {list.length}</h2>
            <div className="flex flex-col gap-2">
              {list.map((r) => (
                <div key={r.id} className="flex items-start gap-3 rounded-lg border bg-white p-3 text-sm">
                  <div className="flex-1">
                    <p>{r.text}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {Object.entries(r.scope).map(([k, v]) => <span key={k} className="mr-1 rounded bg-neutral-100 px-1.5 py-0.5">{k}={String(v)}</span>)}
                      <span className="ml-1">{r.createdBy === "distill" ? "자동 증류" : "직접 작성"}</span>
                    </p>
                    <div className="mt-2 h-1.5 w-40 rounded bg-neutral-200"><div className="h-1.5 rounded bg-neutral-800" style={{ width: `${Math.round(r.confidence * 100)}%` }} /></div>
                  </div>
                  <div className="flex flex-col gap-1 text-xs">
                    {r.status !== "pinned" && <button className="rounded border px-2 py-0.5" onClick={() => toggle(r, "pinned")}>고정</button>}
                    {r.status !== "active" && <button className="rounded border px-2 py-0.5" onClick={() => toggle(r, "active")}>활성</button>}
                    {r.status !== "demoted" && <button className="rounded border px-2 py-0.5" onClick={() => toggle(r, "demoted")}>끄기</button>}
                    <button className="rounded px-2 py-0.5 text-rose-700" onClick={() => api.rules.remove(r.id).then(reload)}>삭제</button>
                  </div>
                </div>
              ))}
              {list.length === 0 && <p className="text-xs text-neutral-400">없음</p>}
            </div>
          </section>
        ))}
      </div>
      <aside className="rounded-lg border bg-white p-3 text-sm">
        <h2 className="font-medium">내 글 샘플로 시작하기</h2>
        <p className="mt-1 text-xs text-neutral-500">내가 쓴 메시지·메일 300자 이상을 붙여넣으면 Phase 2에서 초기 규칙 초안을 만듭니다. 지금은 저장만 합니다.</p>
        <textarea className="mt-2 w-full rounded border p-2" rows={8} value={sample} onChange={(e) => setSample(e.target.value)} />
        <p className="mt-1 text-xs text-neutral-500">{sample.length}자</p>
        <button className="mt-2 rounded border px-3 py-1 text-sm disabled:opacity-40" disabled title="Phase 2에서 활성화">규칙 초안 생성 (준비 중)</button>
      </aside>
    </div>
  );
}
