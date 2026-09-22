/**
 * 화면 취향(이 브라우저에만 저장, localStorage `gh:prefs`). 서버 설정(.env)과 달리 사용자·기기마다 다르므로 서버에 두지 않는다.
 * - theme: system이면 OS 설정을 따라가고 바뀌면 같이 바뀐다
 * - scale: 전체 확대율. body에 zoom으로 적용해 px로 박힌 12px 보조 텍스트까지 같이 커진다
 * - density: compact(촘촘, AntD compactAlgorithm) / comfortable(보통)
 * - contrast: 보조 텍스트를 본문 색으로 올려 흐린 글자를 없앤다
 */
export type ThemePref = "system" | "light" | "dark";
export type Scale = 0.9 | 1 | 1.125 | 1.25 | 1.4;
export type Density = "compact" | "comfortable";
export interface Prefs { theme: ThemePref; scale: Scale; density: Density; contrast: boolean }

export const SCALES: { value: Scale; label: string }[] = [
  { value: 0.9, label: "작게" }, { value: 1, label: "보통" }, { value: 1.125, label: "크게" }, { value: 1.25, label: "더 크게" }, { value: 1.4, label: "아주 크게" },
];
export const DEFAULT_PREFS: Prefs = { theme: "system", scale: 1, density: "compact", contrast: false };
const KEY = "gh:prefs";

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>;
      return {
        theme: p.theme === "light" || p.theme === "dark" || p.theme === "system" ? p.theme : DEFAULT_PREFS.theme,
        scale: SCALES.some((s) => s.value === p.scale) ? (p.scale as Scale) : DEFAULT_PREFS.scale,
        density: p.density === "comfortable" ? "comfortable" : "compact",
        contrast: Boolean(p.contrast),
      };
    }
    // 예전 키(gh:theme = light|dark)에서 이어받는다
    const legacy = localStorage.getItem("gh:theme");
    if (legacy === "light" || legacy === "dark") return { ...DEFAULT_PREFS, theme: legacy };
  } catch { /* 저장소 없음(프라이빗 모드 등) */ }
  return DEFAULT_PREFS;
}
export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); localStorage.removeItem("gh:theme"); } catch { /* noop */ }
}
