import { StudioRequest, generatePrompt } from "@grammer-hub/core";
import { parseBody } from "@/lib/json";
import { sseResponse } from "@/lib/sse";
import { studioProvider, toStudioContext } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2단계: Spec 생성을 슬롯 단위 SSE로 흘린다. 저장은 클라이언트가 결과를 보고 POST /api/prompts로. */
export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, StudioRequest);
  if (!body.ok) return body.res;
  const p = studioProvider(body.data.provider);
  if (!p.ok) return p.res;
  const ac = new AbortController();
  return sseResponse(generatePrompt(p.provider, toStudioContext(body.data), ac.signal), () => ac.abort());
}
