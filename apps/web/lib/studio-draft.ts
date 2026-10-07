import type { MeDto } from "./api";

/**
 * 만들기 폼의 임시 저장(localStorage) 키. 로그인 모드에서는 사람마다 키를 나눠 같은 브라우저를 여럿이 써도 남의 입력이 보이지 않게 하고,
 * 로그아웃하면 지운다. 로그인 없는 단일 사용자 모드는 예전 키 그대로.
 */
export const DRAFT_BASE = "gh:studio:draft";
export const draftKey = (me: MeDto | null): string => (me?.authEnabled ? `${DRAFT_BASE}:${me.email}` : DRAFT_BASE);

/** 이 브라우저의 스튜디오 임시 저장을 모두 지운다(로그아웃). */
export function clearDrafts(): void {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(DRAFT_BASE)) localStorage.removeItem(k); } catch { /* 저장소를 못 쓰는 브라우저면 지울 것도 없다 */ }
}
