"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type ProfileSection = {
  /** 탭 식별자 — 그대로 `?tab=` 에 실린다 (사이드바가 이 값으로 탭을 지목한다) */
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
 *
 * ## 열린 탭은 주소(`?tab=`)에 있다
 *
 * 목록 정렬·페이지·캘린더의 달과 같은 규칙이다 — **주소를 복사하거나 새로 고쳐도 같은 탭이
 * 열린다.** 세 탭 중 둘(`회사 정보`·`보안`)은 스크롤도 길어서, 새로 고칠 때마다 첫 탭으로
 * 돌아가면 고치던 자리를 다시 찾아 들어와야 한다. 링크로 특정 탭을 지목할 수 있다는 것도
 * 딸려 온다(지금 그렇게 하는 곳은 없다 — 사이드바는 이 화면을 통째로 가리킨다).
 *
 * **제어 컴포넌트다**(`value`). `defaultValue` 로 두면 이미 이 화면에 있는 상태에서 주소만
 * 바뀌는 이동(같은 라우트라 다시 마운트되지 않는다)에서 탭이 따라오지 않는다.
 *
 * 탭을 바꿀 때는 `router.replace` 가 아니라 **`history.replaceState`** 를 쓴다. App Router 는
 * 이 호출을 알아보고 `useSearchParams` 를 갱신하므로 주소는 맞춰지면서 **서버 왕복이 없다** —
 * `replace` 로 하면 탭을 누를 때마다 RSC 를 다시 받아 와 탭 전환이 느려진다. 되돌리기
 * (`pushState`)를 쓰지 않는 것은 탭 전환이 "뒤로 가기로 되짚을 이동"은 아니기 때문이다.
 */
export function ProfileTabs({
  name,
  email,
  roleLabel,
  sections,
}: ProfileTabsProps) {
  const searchParams = useSearchParams();
  /** 모르는 값·없는 값은 첫 탭으로 떨어뜨린다 (캘린더의 잘못된 `month` 와 같은 처리) */
  const requested = searchParams.get("tab");
  const active =
    sections.find((section) => section.value === requested)?.value ??
    sections[0]?.value;

  const selectTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    /*
      **쿼리만 있는 상대 주소**를 쓴다 — 현재 경로를 기준으로 해석되므로 `usePathname()`
      이 필요 없다. 경로는 핸들러에서만 쓸 값인데 렌더 중에 훅으로 읽으면 이 컴포넌트가
      경로 변화까지 구독한다 (react-doctor `rerender-defer-reads-hook`).
    */
    window.history.replaceState(null, "", `?${next}`);
  };
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
      <Tabs value={active} onValueChange={selectTab}>
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
