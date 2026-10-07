import { z } from "zod";
import { PresetSettings } from "@grammer-hub/core";
import { deletePreset, listPresets, savePreset } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { bad, parseBody } from "@/lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 내 설정 프리셋(사람별). 목표 문장은 받지도 저장하지도 않는다(PresetSettings가 strict). */
export async function GET(): Promise<Response> {
  const user = await getUser();
  // 저장 뒤 스키마·분류가 바뀌어 지금 모양과 맞지 않는 행은 settings를 null로 보낸다(화면은 고를 수 없게 표시하고 삭제만 허용)
  return Response.json(listPresets(getDb(), user.id).map((p) => { const v = PresetSettings.safeParse(p.settings); return { ...p, settings: v.success ? v.data : null }; }));
}

const Body = z.object({ id: z.string().max(60).nullable().optional(), name: z.string().trim().min(1).max(40), settings: PresetSettings });
/** 새로 만들기(id 없음) 또는 이름·설정 바꾸기(본인 것만). */
export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const user = await getUser();
  const row = savePreset(getDb(), { userId: user.id, id: body.data.id ?? null, name: body.data.name, settings: body.data.settings });
  if (!row) return bad("프리셋을 찾을 수 없습니다", 404);
  return Response.json(row);
}

export async function DELETE(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return bad("id가 필요합니다");
  const user = await getUser();
  return deletePreset(getDb(), user.id, id) ? Response.json({ ok: true }) : bad("프리셋을 찾을 수 없습니다", 404);
}
