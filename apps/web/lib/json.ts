import type { ZodType } from "zod";

export function bad(message: string, status = 400): Response {
  return Response.json({ error: { code: "bad_request", message } }, { status });
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  let json: unknown;
  try { json = await req.json(); } catch { return { ok: false, res: bad("JSON 본문이 필요합니다") }; }
  const r = schema.safeParse(json);
  if (!r.success) return { ok: false, res: bad(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")) };
  return { ok: true, data: r.data };
}
