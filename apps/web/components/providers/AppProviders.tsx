"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App as AntApp, ConfigProvider } from "antd";
import koKR from "antd/locale/ko_KR";
import { antdTheme } from "@/lib/theme/tokens";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from "@/lib/theme/prefs";
import { api, type MeDto } from "@/lib/api";

type Mode = "light" | "dark";
interface ThemeCtxValue { mode: Mode; toggle: () => void; prefs: Prefs; setPrefs: (patch: Partial<Prefs>) => void }
const ThemeCtx = createContext<ThemeCtxValue>({ mode: "light", toggle: () => {}, prefs: DEFAULT_PREFS, setPrefs: () => {} });
export const useThemeMode = () => useContext(ThemeCtx);

/** 로그인 상태. 로그인 모드가 아니면 authEnabled=false·admin=true. 아직 모르면 null(메뉴는 기본값으로 그린다). */
const AuthCtx = createContext<MeDto | null>(null);
export const useAuth = () => useContext(AuthCtx);

/** AntD 레지스트리(SSR 스타일) + ConfigProvider(팔레트·한국어·밀도) + App(message 컨텍스트) + 화면 취향(테마·크기·밀도·대비). */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [systemDark, setSystemDark] = useState(false);
  const [me, setMe] = useState<MeDto | null>(null);
  useEffect(() => { api.auth.me().then(setMe).catch(() => setMe(null)); }, []);
  useEffect(() => {
    setPrefsState(loadPrefs());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const mode: Mode = prefs.theme === "system" ? (systemDark ? "dark" : "light") : prefs.theme;
  useEffect(() => {
    document.documentElement.dataset["theme"] = mode;
    document.documentElement.style.colorScheme = mode;
    // 확대율: zoom은 인라인 px(보조 텍스트 12px 등)까지 같이 키운다. 1이면 속성을 지워 기본으로.
    document.body.style.zoom = prefs.scale === 1 ? "" : String(prefs.scale);
    document.documentElement.dataset["density"] = prefs.density;
  }, [mode, prefs.scale, prefs.density]);
  const setPrefs = useCallback((patch: Partial<Prefs>) => setPrefsState((p) => { const n = { ...p, ...patch }; savePrefs(n); return n; }), []);
  const toggle = useCallback(() => setPrefs({ theme: mode === "dark" ? "light" : "dark" }), [mode, setPrefs]);
  const value = useMemo(() => ({ mode, toggle, prefs, setPrefs }), [mode, toggle, prefs, setPrefs]);
  const theme = useMemo(() => antdTheme(mode, { density: prefs.density, contrast: prefs.contrast }), [mode, prefs.density, prefs.contrast]);
  return (
    <AntdRegistry>
      <ConfigProvider locale={koKR} theme={theme}>
        <AntApp>
          <ThemeCtx.Provider value={value}><AuthCtx.Provider value={me}>{children}</AuthCtx.Provider></ThemeCtx.Provider>
        </AntApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
