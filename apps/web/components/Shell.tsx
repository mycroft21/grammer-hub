"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layout, Menu, Tooltip, Button } from "antd";
import { EditOutlined, IdcardOutlined, HighlightOutlined, BookOutlined, HistoryOutlined, ExperimentOutlined, MoonOutlined, SunOutlined, MenuFoldOutlined, MenuUnfoldOutlined, SettingOutlined, LogoutOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { useAuth, useThemeMode } from "./providers/AppProviders";

const ITEMS = [
  { key: "/", label: "에디터", icon: <EditOutlined /> },
  { key: "/profiles", label: "프로필", icon: <IdcardOutlined /> },
  { key: "/style", label: "내 어투", icon: <HighlightOutlined /> },
  { key: "/dictionary", label: "사전", icon: <BookOutlined /> },
  { key: "/runs", label: "기록", icon: <HistoryOutlined /> },
  { key: "/prompts", label: "프롬프트", icon: <ExperimentOutlined /> },
  { key: "/settings", label: "설정", icon: <SettingOutlined /> },
];

/** 아이콘 레일 사이드바(접힘 기본) + 콘텐츠. 모바일(<lg)에서는 상단 가로 메뉴. 로그인 모드면 관리자에게만 설정 메뉴가 보이고 아래에 이메일·로그아웃. */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => { try { setCollapsed(localStorage.getItem("gh:sider") !== "open"); } catch { /* noop */ } }, []);
  const toggleCollapsed = () => setCollapsed((c) => { try { localStorage.setItem("gh:sider", c ? "open" : "closed"); } catch { /* noop */ } return !c; });
  const { mode, toggle } = useThemeMode();
  const me = useAuth();
  const items = ITEMS.filter((i) => i.key !== "/settings" || !me || me.admin);
  const selected = items.find((i) => i.key !== "/" && pathname.startsWith(i.key))?.key ?? "/";
  const logout = async () => { try { await api.auth.logout(); } finally { window.location.href = "/login"; } };
  if (pathname === "/login") return <Layout className="min-h-screen"><Layout.Content className="mx-auto w-full max-w-6xl px-4 py-4">{children}</Layout.Content></Layout>;
  return (
    <Layout className="min-h-screen">
      <Layout.Sider collapsible collapsed={collapsed} trigger={null} width={200} collapsedWidth={56} theme="light"
        className="!hidden lg:!block border-r" style={{ borderColor: "var(--ant-color-border-secondary)", position: "sticky", top: 0, height: "100vh" }}>
        <div className="flex h-full flex-col">
          <div className={`flex h-12 items-center transition-all duration-200 ${collapsed ? "justify-center" : "gap-2 px-4"}`}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-[12px] font-bold text-white">교</span>
            <span className="overflow-hidden font-semibold whitespace-nowrap transition-all duration-200" style={{ maxWidth: collapsed ? 0 : 140, opacity: collapsed ? 0 : 1 }}>Grammar Hub</span>
          </div>
          <Menu mode="inline" selectedKeys={[selected]} inlineCollapsed={collapsed} className="!border-e-0 flex-1"
            items={items.map((i) => ({ key: i.key, icon: i.icon, label: <Link href={i.key}>{i.label}</Link> }))} />
          <div className={`flex flex-col gap-1 border-t p-2 ${collapsed ? "items-center" : ""}`} style={{ borderColor: "var(--ant-color-border-secondary)" }}>
            {me?.authEnabled && (
              <Tooltip title={`${me.email}${me.admin ? " · 관리자" : ""} — 로그아웃`} placement="right">
                <Button type="text" size="small" icon={<LogoutOutlined />} onClick={() => void logout()} aria-label="로그아웃" data-testid="logout" className={collapsed ? "" : "!justify-start"}>
                  {!collapsed && <span className="max-w-[120px] truncate text-[12px]" data-testid="me-email">{me.email}</span>}
                </Button>
              </Tooltip>
            )}
            <Tooltip title={mode === "dark" ? "라이트 모드" : "다크 모드"} placement="right">
              <Button type="text" size="small" icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />} onClick={toggle} aria-label="테마 전환" />
            </Tooltip>
            <Tooltip title={collapsed ? "메뉴 펼치기" : "메뉴 접기"} placement="right">
              <Button type="text" size="small" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={toggleCollapsed} aria-label="메뉴 접기/펼치기" />
            </Tooltip>
          </div>
        </div>
      </Layout.Sider>
      <Layout>
        <header className="sticky top-0 z-20 flex h-11 items-center gap-1 overflow-x-auto border-b px-2 whitespace-nowrap lg:hidden"
          style={{ background: "var(--ant-color-bg-container)", borderColor: "var(--ant-color-border-secondary)" }}>
          <span className="mr-2 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-bold text-white">교</span>
          {items.map((i) => (
            <Link key={i.key} href={i.key} className={`rounded-md px-2.5 py-1 text-[13px] ${selected === i.key ? "font-semibold text-primary" : ""}`} style={{ color: selected === i.key ? undefined : "var(--ant-color-text-secondary)" }}>{i.label}</Link>
          ))}
          <Button type="text" size="small" className="ml-auto" icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />} onClick={toggle} aria-label="테마 전환" />
          {me?.authEnabled && <Button type="text" size="small" icon={<LogoutOutlined />} onClick={() => void logout()} aria-label="로그아웃" />}
        </header>
        <Layout.Content className="mx-auto w-full max-w-6xl px-4 py-4">{children}</Layout.Content>
      </Layout>
    </Layout>
  );
}
