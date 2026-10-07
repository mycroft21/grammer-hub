import { getTeamStats, teamStatsCsv } from "@grammer-hub/db";
import { requireAdmin } from "@/lib/auth/user";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 팀 화면(관리자): 사람별 사용량·수락률·비용. `?weeks=4|8|12`, `?format=csv`면 표를 파일로. 텍스트는 없다. */
export async function GET(req: Request): Promise<Response> {
  const denied = await requireAdmin(); if (denied) return denied;
  const u = new URL(req.url);
  const weeks = Math.min(26, Math.max(1, Number(u.searchParams.get("weeks")) || 8));
  const stats = getTeamStats(getDb(), weeks);
  if (u.searchParams.get("format") === "csv") {
    return new Response(teamStatsCsv(stats), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="grammer-hub-team-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
  }
  return Response.json(stats);
}
