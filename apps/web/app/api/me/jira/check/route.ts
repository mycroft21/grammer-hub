import { probeJira, probeResult } from "@grammer-hub/core";
import { getUser } from "@/lib/db";
import { env } from "@/lib/env";
import { jiraGet, jiraMode } from "@/lib/jira-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 내 Jira 연결 확인: /myself로 누구로 연결됐는지 본다(이름은 저장하지 않고 이 응답에만). */
export async function POST(): Promise<Response> {
  const m = jiraMode();
  if (m.mode === "token") return Response.json(await probeJira({ baseUrl: env.jiraBaseUrl, email: env.jiraEmail, token: env.jiraApiToken }));
  if (m.mode === "off") return Response.json(probeResult([{ label: "설정", state: "fail", detail: m.reason ?? "Jira 연동이 꺼져 있습니다" }]));
  const r = await jiraGet((await getUser()).id, "/rest/api/3/myself");
  if (!r.ok) return Response.json(probeResult([{ label: "연결", state: "fail", detail: r.reason === "temporary" ? "Atlassian에 잠시 연결되지 않습니다" : "연결되지 않았거나 만료되었습니다. 다시 연결하세요" }]));
  if (!r.res.ok) return Response.json(probeResult([{ label: "계정", state: "fail", detail: `Jira 응답 ${r.res.status}` }]));
  const me = (await r.res.json().catch(() => null)) as { displayName?: string } | null;
  return Response.json(probeResult([{ label: "계정", state: "ok", detail: `연결됨 · ${me?.displayName ?? "이름 없음"} · ${r.siteUrl}` }]));
}
