import { z } from "zod";
import { requireAdmin } from "@/lib/auth/user";
import { parseBody } from "@/lib/json";
import { serverLog } from "@/lib/log";
import { runProbe } from "@/lib/probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ target: z.enum(["cloud", "local", "jira", "oidc"]) });

/** 관리자 전용 연결 확인(대상별). 실제 외부 호출을 하므로 공개 경로에 두지 않는다. 비밀값은 응답·로그에 없다. */
export async function POST(req: Request): Promise<Response> {
  const denied = await requireAdmin(); if (denied) return denied;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const r = await runProbe(body.data.target, new URL(req.url).origin);
  serverLog("probe", `연결 확인 ${body.data.target}`, { ok: r.ok, steps: r.steps.length });
  return Response.json({ target: body.data.target, checkedAt: Date.now(), ...r });
}
