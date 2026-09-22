import { theme, type ThemeConfig } from "antd";

/** docs/07-design-tokens.md 의 팔레트 v1. 초록은 행동에만, 정보색은 회색. */
export const PALETTE = {
  primary: "#15803D", primaryHover: "#166534", primaryLine: "#4ADE80", primarySoft: "#F0FDF4",
  selection: "#FEF3C7", danger: "#DC2626", warning: "#B45309",
  ink: "#171717", muted: "#737373", disabled: "#A3A3A3",
  border: "#D4D4D4", line: "#E5E5E5", canvas: "#FAFAFA", panel: "#FFFFFF",
  cat: { accuracy: "#DC2626", register: "#7C3AED", clarity: "#2563EB", tone: "#C2410C" },
} as const;

/**
 * 다크 팔레트 v2. v1(#0A0A0A 바탕·#171717 패널·#262626 선)은 표면끼리 구분이 안 되고 12px 보조 텍스트가 묻혔다.
 * 바탕과 패널을 두 단계 올리고, 선·테두리를 보이게, 보조 텍스트를 밝게(WCAG AA 4.5:1 이상), 채움(fill) 토큰을 뚜렷하게.
 */
export const DARK = {
  canvas: "#161618", panel: "#1F1F23", elevated: "#26262B", line: "#34343A", border: "#55555E",
  ink: "#F4F4F5", muted: "#C6C6CD", tertiary: "#9A9AA3", placeholder: "#80808A",
  primary: "#34D399", primaryHover: "#6EE7B7", primarySoft: "rgba(52,211,153,.16)", primaryLine: "#10B981", selection: "rgba(251,191,36,.22)",
  fill: { quaternary: "rgba(255,255,255,.06)", tertiary: "rgba(255,255,255,.10)", secondary: "rgba(255,255,255,.14)" },
  cat: { accuracy: "#F87171", register: "#A78BFA", clarity: "#60A5FA", tone: "#FB923C" },
} as const;

const FONT = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

export interface ThemeOptions { density?: "compact" | "comfortable"; contrast?: boolean }
export function antdTheme(mode: "light" | "dark", opts: ThemeOptions = {}): ThemeConfig {
  const dark = mode === "dark";
  const compact = (opts.density ?? "compact") === "compact";
  // 고대비: 보조 텍스트를 본문 색으로 올린다(흐린 12px 안내문이 사라진다)
  const muted = opts.contrast ? (dark ? DARK.ink : PALETTE.ink) : dark ? DARK.muted : PALETTE.muted;
  const tertiary = opts.contrast ? (dark ? DARK.muted : PALETTE.muted) : dark ? DARK.tertiary : PALETTE.disabled;
  return {
    cssVar: { key: "gh" },
    hashed: false,
    algorithm: [...(dark ? [theme.darkAlgorithm] : []), ...(compact ? [theme.compactAlgorithm] : [])],
    token: {
      colorPrimary: dark ? DARK.primary : PALETTE.primary,
      colorSuccess: dark ? DARK.primary : PALETTE.primary,
      colorError: PALETTE.danger,
      colorWarning: PALETTE.warning,
      colorInfo: dark ? DARK.tertiary : PALETTE.muted,
      colorLink: dark ? DARK.primary : PALETTE.primary,
      colorText: dark ? DARK.ink : PALETTE.ink,
      colorTextSecondary: muted,
      colorTextTertiary: tertiary,
      ...(dark ? { colorTextQuaternary: DARK.placeholder, colorTextPlaceholder: DARK.placeholder } : {}),
      colorBorder: dark ? DARK.border : PALETTE.border,
      colorBorderSecondary: dark ? DARK.line : PALETTE.line,
      colorBgLayout: dark ? DARK.canvas : PALETTE.canvas,
      colorBgContainer: dark ? DARK.panel : PALETTE.panel,
      colorBgElevated: dark ? DARK.elevated : PALETTE.panel,
      ...(dark ? { colorFillQuaternary: DARK.fill.quaternary, colorFillTertiary: DARK.fill.tertiary, colorFillSecondary: DARK.fill.secondary, colorBgSpotlight: DARK.elevated } : {}),
      borderRadius: 6,
      borderRadiusLG: 10,
      fontFamily: FONT,
      fontSize: 14,
      lineHeight: 1.6,
      controlHeight: compact ? 32 : 36,
      boxShadowTertiary: "0 1px 2px rgba(0,0,0,.04)",
    },
    components: {
      Button: { primaryShadow: "none", defaultShadow: "none", fontWeight: 600 },
      Card: { bodyPadding: 16, headerPadding: 12 },
      Layout: { siderBg: dark ? DARK.panel : PALETTE.panel, headerBg: dark ? DARK.panel : PALETTE.panel, bodyBg: dark ? DARK.canvas : PALETTE.canvas },
      Menu: { itemBg: "transparent", itemSelectedBg: dark ? DARK.primarySoft : PALETTE.primarySoft, itemSelectedColor: dark ? DARK.primary : PALETTE.primary, activeBarBorderWidth: 0 },
      Segmented: { itemSelectedBg: dark ? "#3A3A42" : PALETTE.panel, trackBg: dark ? "#2A2A30" : "#F5F5F5", ...(dark ? { itemColor: DARK.muted, itemSelectedColor: DARK.ink } : {}) },
      Table: { headerBg: dark ? DARK.elevated : PALETTE.canvas, cellPaddingBlock: 8 },
      Input: dark ? { colorBgContainer: "#18181B", activeBorderColor: DARK.primary, hoverBorderColor: "#6B6B75" } : {},
      Select: dark ? { colorBgContainer: "#18181B", optionSelectedBg: DARK.primarySoft } : {},
      Collapse: dark ? { headerBg: "transparent" } : {},
      Alert: dark ? { colorInfoBg: "rgba(154,154,163,.12)", colorInfoBorder: "#44444C", colorWarningBg: "rgba(251,191,36,.12)", colorWarningBorder: "#6B5A2A", colorErrorBg: "rgba(248,113,113,.12)", colorErrorBorder: "#6B3A3A", colorSuccessBg: DARK.primarySoft, colorSuccessBorder: "#1F6F4E" } : {},
    },
  };
}
