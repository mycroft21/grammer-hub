"use client";
import { useEffect, useState } from "react";
import type { DictionaryEntry } from "@grammer-hub/core";
import { api } from "@/lib/api";

export function DictionaryPage() {
  const [list, setList] = useState<DictionaryEntry[]>([]);
  const [term, setTerm] = useState(""); const [note, setNote] = useState(""); const [mask, setMask] = useState(false);
  const reload = () => api.dictionary.list().then(setList);
  useEffect(() => { void reload(); }, []);
  const add = async () => { if (!term.trim()) return; await api.dictionary.create({ term: term.trim(), note: note || undefined, mask }); setTerm(""); setNote(""); setMask(false); await reload(); };
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap gap-2 rounded-lg border bg-white p-3 text-sm">
        <input className="rounded border px-2 py-1" placeholder="용어 (예: 엑심베이, PG사명)" value={term} onChange={(e) => setTerm(e.target.value)} />
        <input className="flex-1 rounded border px-2 py-1" placeholder="메모" value={note} onChange={(e) => setNote(e.target.value)} />
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={mask} onChange={(e) => setMask(e.target.checked)} />외부 전송 시 마스킹</label>
        <button className="rounded bg-neutral-900 px-3 py-1 text-white" onClick={add}>추가</button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-neutral-500"><tr><th className="py-1">용어</th><th>메모</th><th>마스킹</th><th /></tr></thead>
        <tbody>
          {list.map((e) => (
            <tr key={e.id} className="border-t bg-white"><td className="py-2 font-medium">{e.term}</td><td className="text-neutral-600">{e.note}</td><td>{e.mask ? "예" : ""}</td>
              <td className="text-right"><button className="text-xs text-rose-700" onClick={() => api.dictionary.remove(e.id).then(reload)}>삭제</button></td></tr>
          ))}
        </tbody>
      </table>
      {list.length === 0 && <p className="text-xs text-neutral-400">등록된 용어가 없습니다. 고유명사·사내 용어·제품명을 넣으면 오탈자로 잡히지 않습니다.</p>}
    </div>
  );
}
