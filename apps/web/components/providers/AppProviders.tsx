"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App as AntApp, ConfigProvider } from "antd";
import koKR from "antd/locale/ko_KR";
import { antdTheme } from "@/lib/theme/tokens";

type Mode = "light" | "dark";
const ThemeCtx = createContext<{ mode: Mode; toggle: () => void }>({ mode: "light", toggle: () => {} });
export const useThemeMode = () => useContext(ThemeCtx);

/** AntD 레지스트리(SSR 스타일) + ConfigProvider(팔레트·한국어) + App(message/notification 컨텍스트) + 다크모드. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("light");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gh:theme") as Mode | null;
      const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      setMode(saved ?? prefers);
    } catch { /* noop */ }
  }, []);
  useEffect(() => {
    document.documentElement.dataset["theme"] = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);
  const toggle = useCallback(() => setMode((m) => { const n = m === "dark" ? "light" : "dark"; try { localStorage.setItem("gh:theme", n); } catch { /* noop */ } return n; }), []);
  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);
  return (
    <AntdRegistry>
      <ConfigProvider locale={koKR} theme={antdTheme(mode)}>
        <AntApp>
          <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
        </AntApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
