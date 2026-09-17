import { z } from "zod";
import { addSample, listSamples } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { parseBody } from "@/lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  text: z.string().min(1).max(20000),
  channel: z.string().max(40).optional(),
  audience: z.string().max(40).optional(),
  note: z.string().max(200).optional(),
});

export async function GET(): Promise<Response> {
  return Response.json(listSamples(getDb(), getUser().id));
}

export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  return Response.json(addSample(getDb(), { userId: getUser().id, ...body.data }));
}
