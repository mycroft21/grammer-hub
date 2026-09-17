import { getRunContext, listOkRunIds, listSamples, type RunContext } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 학습용 데이터셋 내보내기(JSONL). Phase 2의 규칙 증류·예시 검색 입력이 되는 형태로 뽑는다.
 * 원문은 마스킹본을 우선 사용해 개인정보가 파일로 새지 않게 한다.
 */
function toRecords(ctx: RunContext) {
  const finalText = ctx.feedback.filter((f) => f.action === "edit" && f.finalText).at(-1)?.finalText ?? null;
  const byId = new Map(ctx.suggestions.map((s) => [s.id, s]));
  const decisions = ctx.feedback
    .filter((f) => f.suggestionId && (f.action === "accept" || f.action === "reject" || f.action === "mute"))
    .map((f) => {
      const s = byId.get(f.suggestionId!);
      return s ? { action: f.action, category: s.category, severity: s.severity, original: s.original, replacement: s.replacement, reason: s.reason, confidence: s.confidence } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const preferred = ctx.feedback.find((f) => f.action === "prefer");
  const rewrites = ctx.suggestions.filter((s) => s.kind === "rewrite")
    .map((s) => ({ index: s.altIndex, label: s.altLabel, text: s.replacement, chosen: preferred?.chosenIndex === s.altIndex }));
  return {
    type: "run" as const,
    runId: ctx.runId, at: new Date(ctx.createdAt).toISOString(), profileId: ctx.profileId, level: ctx.level,
    provider: ctx.provider, model: ctx.model,
    draft: ctx.textMasked ?? ctx.textNfc, masked: ctx.textMasked !== null,
    finalText, decisions, rewrites,
  };
}

export async function GET(): Promise<Response> {
  const db = getDb();
  const user = getUser();
  const lines: string[] = [];
  for (const s of listSamples(db, user.id)) {
    lines.push(JSON.stringify({ type: "sample", id: s.id, at: new Date(s.createdAt).toISOString(), channel: s.channel, audience: s.audience, note: s.note, text: s.text }));
  }
  for (const id of listOkRunIds(db)) {
    const ctx = getRunContext(db, id);
    if (!ctx) continue;
    const rec = toRecords(ctx);
    if (!rec.draft) continue;
    lines.push(JSON.stringify(rec));
  }
  const body = lines.join("\n") + (lines.length ? "\n" : "");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="grammer-hub-dataset-${stamp}.jsonl"`,
      "Cache-Control": "no-store",
    },
  });
}
