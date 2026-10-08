"use client";
import { Card, Segmented, Space, Switch, Typography } from "antd";
import { useThemeMode } from "@/components/providers/AppProviders";
import { SCALES, type Density, type Scale, type ThemePref } from "@/lib/theme/prefs";

/** 화면 취향: 이 브라우저에만 저장되고 바꾸는 즉시 반영된다(저장 버튼 없음). */
export function AppearanceCard() {
  const { prefs, setPrefs, mode } = useThemeMode();
  const small = { fontSize: 12 } as const;
  return (
    <Card size="small" title="화면" extra={<Typography.Text type="secondary" style={small}>이 브라우저에만 저장 · 바꾸는 즉시 반영</Typography.Text>} data-testid="appearance-card">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>테마</Typography.Text>
          <div className="mt-1"><Segmented data-testid="pref-theme" value={prefs.theme} onChange={(v) => setPrefs({ theme: v as ThemePref })} options={[{ value: "system", label: `시스템 따라가기 (지금 ${mode === "dark" ? "다크" : "라이트"})` }, { value: "light", label: "라이트" }, { value: "dark", label: "다크" }]} /></div>
          <Typography.Text type="secondary" style={small} className="mt-1 block">사이드바 아래 해/달 버튼은 라이트·다크를 바로 고정합니다.</Typography.Text>
        </div>
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>글자 크기</Typography.Text>
          <div className="mt-1"><Segmented data-testid="pref-scale" value={prefs.scale} onChange={(v) => setPrefs({ scale: v as Scale })} options={SCALES.map((s) => ({ value: s.value, label: `${s.label} ${Math.round(s.value * 100)}%` }))} /></div>
          <Typography.Text type="secondary" style={small} className="mt-1 block">화면 전체를 확대합니다(안내문·버튼·코드 포함). 브라우저 확대(⌘+)와 별개로 이 앱에만 기억됩니다.</Typography.Text>
        </div>
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>간격</Typography.Text>
          <div className="mt-1"><Segmented data-testid="pref-density" value={prefs.density} onChange={(v) => setPrefs({ density: v as Density })} options={[{ value: "compact", label: "촘촘하게" }, { value: "comfortable", label: "여유 있게" }]} /></div>
          <Typography.Text type="secondary" style={small} className="mt-1 block">여유 있게는 버튼·입력칸이 높아지고 줄 간격이 넓어집니다.</Typography.Text>
        </div>
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>글자 대비 높이기</Typography.Text>
          <div className="mt-1"><Space><Switch data-testid="pref-contrast" checked={prefs.contrast} onChange={(v) => setPrefs({ contrast: v })} /><Typography.Text type="secondary" style={small}>{prefs.contrast ? "켜짐 — 회색 안내문도 본문 색으로" : "꺼짐"}</Typography.Text></Space></div>
          <Typography.Text type="secondary" style={small} className="mt-1 block">회색으로 흐리게 보이던 보조 설명·라벨을 본문과 같은 진한 색으로 바꿉니다.</Typography.Text>
        </div>
      </div>
    </Card>
  );
}
