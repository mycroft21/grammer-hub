"use client";
import { useEffect, useState } from "react";
import { api, type RunSummary } from "@/lib/api";

export function RunsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  useEffect(() => { void api.runs().then(setRuns); }, []);
  const total = runs.reduce((a, r) => a + r.costUsd, 0);
  const acc = runs.reduce((a, r) => a + r.accepted, 0); const rej = runs.reduce((a, r) => a + r.rejected, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4 text-sm text-neutral-600">
        <span>최근 {runs.length}건</span><span>비용 ${total.toFixed(3)}</span>
        <span>수락률 {acc + rej > 0 ? Math.round((acc / (acc + rej)) * 100) : 0}% ({acc}/{acc + rej})</span>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500"><tr>{["시각", "강도", "provider", "모델", "지연", "비용", "캐시", "변경", "수락/무시", "상태"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-1.5 text-neutral-600">{new Date(r.createdAt).toLocaleString("ko-KR")}</td>
                <td className="px-3">{r.level}</td><td className="px-3">{r.provider}</td><td className="px-3 text-neutral-600">{r.model}</td>
                <td className="px-3">{r.latencyMs != null ? `${(r.latencyMs / 1000).toFixed(1)}s` : "-"}</td>
                <td className="px-3">${r.costUsd.toFixed(4)}</td><td className="px-3">{r.cachedTokens.toLocaleString()}</td>
                <td className="px-3">{r.edits}</td><td className="px-3">{r.accepted}/{r.rejected}</td>
                <td className="px-3">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && <p className="p-3 text-xs text-neutral-400">아직 실행 기록이 없습니다.</p>}
      </div>
    </div>
  );
}
