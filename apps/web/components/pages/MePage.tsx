"use client";
import { PageHeader } from "./_shared";
import { AppearanceCard } from "@/components/me/AppearanceCard";
import { JiraCard } from "@/components/me/JiraCard";
import { MyWorkspaceCard } from "@/components/me/MyWorkspaceCard";

/** 내 설정: 나에게만 적용되는 것. 팀 전체 설정(모델·로그인·팀 작업 공간)은 관리자 '설정'. */
export function MePage() {
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="내 설정" description="나에게만 적용됩니다. 팀 전체 설정(모델·로그인·팀 작업 공간)은 관리자가 '설정'에서 바꿉니다." />
      <JiraCard />
      <MyWorkspaceCard />
      <AppearanceCard />
    </div>
  );
}
