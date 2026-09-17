import { theme, type ThemeConfig } from "antd";

/** docs/07-design-tokens.md 의 팔레트 v1. 초록은 행동에만, 정보색은 회색. */
export const PALETTE = {
  primary: "#15803D", primaryHover: "#166534", primaryLine: "#4ADE80", primarySoft: "#F0FDF4",
  selection: "#FEF3C7", danger: "#DC2626", warning: "#B45309",
  ink: "#171717", muted: "#737373", disabled: "#A3A3A3",
  border: "#D4D4D4", line: "#E5E5E5", canvas: "#FAFAFA", panel: "#FFFFFF",
  cat: { accuracy: "#DC2626", register: "#7C3AED", clarity: "#2563EB", tone: "#C2410C" },
} as const;

export const DARK = {
  canvas: "#0A0A0A", panel: "#171717", line: "#262626", border: "#404040", ink: "#FAFAFA", muted: "#A3A3A3",
  primary: "#22C55E", primarySoft: "rgba(34,197,94,.12)", primaryLine: "#16A34A", selection: "rgba(251,191,36,.18)",
  cat: { accuracy: "#F87171", register: "#A78BFA", clarity: "#60A5FA", tone: "#FB923C" },
} as const;

const FONT = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

export function antdTheme(mode: "light" | "dark"): ThemeConfig {
  const dark = mode === "dark";
  return {
    cssVar: { key: "gh" },
    hashed: false,
    algorithm: dark ? [theme.darkAlgorithm, theme.compactAlgorithm] : [theme.compactAlgorithm],
    token: {
      colorPrimary: dark ? DARK.primary : PALETTE.primary,
      colorSuccess: dark ? DARK.primary : PALETTE.primary,
      colorError: PALETTE.danger,
      colorWarning: PALETTE.warning,
      colorInfo: PALETTE.muted,
      colorLink: dark ? DARK.primary : PALETTE.primary,
      colorText: dark ? DARK.ink : PALETTE.ink,
      colorTextSecondary: dark ? DARK.muted : PALETTE.muted,
      colorTextTertiary: PALETTE.disabled,
      colorBorder: dark ? DARK.border : PALETTE.border,
      colorBorderSecondary: dark ? DARK.line : PALETTE.line,
      colorBgLayout: dark ? DARK.canvas : PALETTE.canvas,
      colorBgContainer: dark ? DARK.panel : PALETTE.panel,
      colorBgElevated: dark ? DARK.panel : PALETTE.panel,
      borderRadius: 6,
      borderRadiusLG: 10,
      fontFamily: FONT,
      fontSize: 14,
      lineHeight: 1.6,
      controlHeight: 32,
      boxShadowTertiary: "0 1px 2px rgba(0,0,0,.04)",
    },
    components: {
      Button: { primaryShadow: "none", defaultShadow: "none", fontWeight: 600 },
      Card: { bodyPadding: 16, headerPadding: 12 },
      Layout: { siderBg: dark ? DARK.panel : PALETTE.panel, headerBg: dark ? DARK.panel : PALETTE.panel, bodyBg: dark ? DARK.canvas : PALETTE.canvas },
      Menu: { itemBg: "transparent", itemSelectedBg: dark ? DARK.primarySoft : PALETTE.primarySoft, itemSelectedColor: dark ? DARK.primary : PALETTE.primary, activeBarBorderWidth: 0 },
      Segmented: { itemSelectedBg: dark ? DARK.panel : PALETTE.panel, trackBg: dark ? DARK.line : "#F5F5F5" },
      Table: { headerBg: dark ? DARK.panel : PALETTE.canvas, cellPaddingBlock: 8 },
    },
  };
}
