"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App as AntApp, ConfigProvider } from "antd";
import koKR from "antd/locale/ko_KR";
import { antdTheme } from "@/lib/theme/tokens";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from "@/lib/theme/prefs";

type Mode = "light" | "dark";
interface ThemeCtxValue { mode: Mode; toggle: () => void; prefs: Prefs; setPrefs: (patch: Partial<Prefs>) => void }
const ThemeCtx = createContext<ThemeCtxValue>({ mode: "light", toggle: () => {}, prefs: DEFAULT_PREFS, setPrefs: () => {} });
export const useThemeMode = () => useContext(ThemeCtx);

/** AntD 레지스트리(SSR 스타일) + ConfigProvider(팔레트·한국어·밀도) + App(message 컨텍스트) + 화면 취향(테마·크기·밀도·대비). */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [systemDark, setSystemDark] = useState(false);
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
          <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
        </AntApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
