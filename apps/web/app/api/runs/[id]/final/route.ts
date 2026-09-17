import { z } from "zod";
import { applyEdits, type Suggestion } from "@grammer-hub/core";
import { getRunContext, newId, recordFinal, upsertEditFeedback } from "@grammer-hub/db";
import { getDb } from "@/lib/db";
import { parseBody } from "@/lib/json";

export const runtime = "nodejs";

/**
 * 복사 시점의 최종본을 기록한다. 수락한 제안만 적용한 결과와 최종본이 다르면
 * 사용자가 직접 고친 것이므로 edit 피드백(학습에서 가장 강한 신호)으로 함께 남긴다.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const body = await parseBody(req, z.object({ finalText: z.string().max(20000) }));
  if (!body.ok) return body.res;
  const db = getDb();
  const finalText = body.data.finalText;
  recordFinal(db, id, finalText);

  let edited = false;
  const run = getRunContext(db, id);
  const base = run?.textMasked ?? run?.textNfc ?? null;
  if (run && base) {
    const acceptedIds = new Set(run.feedback.filter((f) => f.action === "accept" && f.suggestionId).map((f) => f.suggestionId));
    const accepted = run.suggestions
      .filter((s) => s.kind === "edit" && !s.dropped && acceptedIds.has(s.id) && s.start !== null && s.end !== null)
      .map((s) => ({ start: s.start as number, end: s.end as number, replacement: s.replacement })) satisfies Array<Pick<Suggestion, "start" | "end" | "replacement">>;
    const expected = applyEdits(base, accepted).normalize("NFC");
    if (expected !== finalText.normalize("NFC")) {
      upsertEditFeedback(db, id, finalText, newId());
      edited = true;
    }
  }
  return Response.json({ ok: true, edited });
}
