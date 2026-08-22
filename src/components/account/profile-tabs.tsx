"use client";

import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type ProfileSection = {
  /** 탭 식별자 (URL 노출 없음, key·value 로 사용) */
  value: string;
  label: string;
  content: ReactNode;
};

type ProfileTabsProps = {
  name: string;
  email: string;
  roleLabel: string;
  sections: ProfileSection[];
};

/**
 * 프로필 설정 공용 셸 — 상단 프로필 히어로 + 섹션 탭.
 * 지금 쓰는 곳은 담당자 포털의 `회사·프로필 설정`(계정 정보 · 회사 정보 · 보안) 한 곳이다
 * (관리자 콘솔의 프로필 화면은 그 자리로 보내는 리다이렉트가 됐다 — 2.0.0).
 * `sections` 를 받는 형태는 유지한다 — 탭 구성이 화면마다 달라질 수 있는 자리다.
 */
export function ProfileTabs({
  name,
  email,
  roleLabel,
  sections,
}: ProfileTabsProps) {
  /*
    폭은 `max-w-5xl` 이다 — `회사 정보` 탭이 3열(입력 2열 + 미리보기) 격자를 쓰므로
    3xl 에서는 미리보기가 눌린다. 계정 정보·보안 탭은 카드가 그만큼 넓어질 뿐이다.
  */
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* 프로필 히어로 */}
      <div className="flex items-center gap-4 rounded-xl border bg-card p-6">
        <Avatar className="size-14">
          <AvatarFallback className="bg-primary/10 text-lg font-medium text-primary">
            {(name || "?").slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">
              {name || "이름 없음"}
            </h2>
            <Badge variant="outline" className="shrink-0 font-normal">
              {roleLabel}
            </Badge>
          </div>
          <p className="truncate text-sm text-muted-foreground">{email}</p>
        </div>
      </div>

      {/* 섹션 탭 */}
      <Tabs defaultValue={sections[0]?.value}>
        <TabsList variant="line">
          {sections.map((section) => (
            <TabsTrigger key={section.value} value={section.value}>
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {sections.map((section) => (
          <TabsContent key={section.value} value={section.value} className="mt-4">
            {section.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
