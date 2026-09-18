import { StudioRequest, planPrompt } from "@grammer-hub/core";
import { parseBody } from "@/lib/json";
import { studioProvider, toStudioContext } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 1단계: 의도 정리(ready | ask). */
export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, StudioRequest);
  if (!body.ok) return body.res;
  const p = studioProvider(body.data.provider);
  if (!p.ok) return p.res;
  const r = await planPrompt(p.provider, toStudioContext(body.data), req.signal);
  if (r.error) return Response.json({ error: r.error }, { status: 502 });
  return Response.json({ plan: r.plan, usage: r.usage });
}
