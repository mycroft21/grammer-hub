import { getStats } from "@grammer-hub/db";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(getStats(getDb(), 8, 30));
}
