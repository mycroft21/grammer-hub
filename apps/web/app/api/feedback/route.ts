import { Audience, Category, Channel, FeedbackRequest } from "@grammer-hub/core";
import { recordFeedback, runOwnerId, upsertRule } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { bad, parseBody } from "@/lib/json";

export const runtime = "nodejs";

/** accept/reject/edit/prefer 기록. mute는 category×scope demoted 규칙도 즉시 만든다. */
export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, FeedbackRequest.extend({
    category: Category.optional(), channel: Channel.optional(), audience: Audience.optional(),
  }));
  if (!body.ok) return body.res;
  const { category, channel, audience, ...feedback } = body.data;
  const db = getDb();
  const user = await getUser();
  if (runOwnerId(db, feedback.runId) !== user.id) return bad("실행을 찾을 수 없습니다", 404);
  const id = recordFeedback(db, feedback);
  let ruleId: string | null = null;
  if (feedback.action === "mute" && category) {
    const rule = upsertRule(db, {
      userId: user.id, text: `${category} 카테고리 제안을 하지 않는다`, status: "demoted", confidence: 0.9,
      scope: { category, ...(channel ? { channel } : {}), ...(audience ? { audience } : {}) },
    });
    ruleId = rule.id;
  }
  return Response.json({ id, ruleId });
}
