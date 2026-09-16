import { DEFAULT_PROFILES } from "@grammer-hub/core";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Grammar Hub</h1>
      <p className="mt-2 text-sm text-neutral-600">Phase 1 스캐폴딩. 에디터는 WBS 11에서 구현.</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {DEFAULT_PROFILES.map((p) => (
          <li key={p.id} className="rounded border bg-white p-3 text-sm">
            <span className="font-medium">{p.name}</span>
            <span className="ml-2 text-neutral-500">{p.honorific} · 격식 {p.formality}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
