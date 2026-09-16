"use client";
import { useEffect, useState } from "react";
import { Audience, Channel, Honorific, Intent, Lang, LengthPref, Tone, renderProfile, type SituationProfile } from "@grammer-hub/core";
import { api } from "@/lib/api";

type P = Omit<SituationProfile, "userId">;
const blank = (): P => ({ id: "", name: "", audience: "peer", channel: "messenger", lang: "ko", honorific: "haeyo", formality: 3, length: "concise", intent: "request", tone: "polite", isDefault: false });

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-600">{label}
      <select className="rounded border px-2 py-1 text-sm text-neutral-900" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

export function ProfilesPage() {
  const [list, setList] = useState<SituationProfile[]>([]);
  const [edit, setEdit] = useState<P | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = () => api.profiles.list().then(setList).catch((e) => setErr(String(e)));
  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!edit) return;
    try {
      const exists = list.some((p) => p.id === edit.id);
      const id = edit.id || edit.name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").slice(0, 40) || `p-${Date.now()}`;
      if (exists) await api.profiles.save({ ...edit, id }); else await api.profiles.create({ ...edit, id });
      setEdit(null); await reload();
    } catch (e) { setErr(String(e)); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((p) => (
          <button key={p.id} onClick={() => setEdit({ ...p })} className="rounded-lg border bg-white p-3 text-left text-sm hover:ring-2 hover:ring-neutral-800">
            <div className="flex items-center gap-2"><span className="font-medium">{p.name}</span>{p.isDefault && <span className="rounded bg-neutral-900 px-1.5 text-xs text-white">기본</span>}<span className="ml-auto text-xs text-neutral-400">{p.id}</span></div>
            <p className="mt-1 text-xs text-neutral-600">{p.audience} · {p.channel} · {p.honorific} · 격식 {p.formality} · {p.tone}</p>
          </button>
        ))}
        <button onClick={() => setEdit(blank())} className="rounded-lg border border-dashed p-3 text-sm text-neutral-500 hover:bg-white">+ 새 프로필</button>
      </div>
      {edit && (
        <aside className="flex flex-col gap-3 rounded-lg border bg-white p-3">
          <label className="flex flex-col gap-1 text-xs text-neutral-600">이름<input className="rounded border px-2 py-1 text-sm text-neutral-900" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <Select label="수신자" value={edit.audience} options={Audience.options} onChange={(v) => setEdit({ ...edit, audience: v })} />
            <Select label="채널" value={edit.channel} options={Channel.options} onChange={(v) => setEdit({ ...edit, channel: v })} />
            <Select label="언어" value={edit.lang} options={Lang.options} onChange={(v) => setEdit({ ...edit, lang: v })} />
            <Select label="높임 단계" value={edit.honorific} options={Honorific.options} onChange={(v) => setEdit({ ...edit, honorific: v })} />
            <Select label="길이" value={edit.length} options={LengthPref.options} onChange={(v) => setEdit({ ...edit, length: v })} />
            <Select label="의도" value={edit.intent} options={Intent.options} onChange={(v) => setEdit({ ...edit, intent: v })} />
            <Select label="톤" value={edit.tone} options={Tone.options} onChange={(v) => setEdit({ ...edit, tone: v })} />
            <label className="flex flex-col gap-1 text-xs text-neutral-600">격식 {edit.formality}/5<input type="range" min={1} max={5} value={edit.formality} onChange={(e) => setEdit({ ...edit, formality: Number(e.target.value) })} /></label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-neutral-600">메모<textarea className="rounded border px-2 py-1 text-sm text-neutral-900" rows={2} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value || undefined })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} />기본 프로필</label>
          <details className="text-xs text-neutral-600"><summary className="cursor-pointer">프롬프트 미리보기</summary>
            <pre className="mt-1 whitespace-pre-wrap rounded bg-neutral-50 p-2">{renderProfile({ ...edit, userId: "preview", id: edit.id || "new" })}</pre></details>
          <div className="flex gap-2">
            <button className="rounded bg-neutral-900 px-3 py-1 text-sm text-white" onClick={save}>저장</button>
            <button className="rounded border px-3 py-1 text-sm" onClick={() => setEdit(null)}>닫기</button>
            {list.some((p) => p.id === edit.id) && <button className="ml-auto rounded px-3 py-1 text-sm text-rose-700" onClick={() => api.profiles.remove(edit.id).then(() => { setEdit(null); return reload(); })}>삭제</button>}
          </div>
        </aside>
      )}
      {err && <p className="text-sm text-rose-700">{err}</p>}
    </div>
  );
}
