"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Settings2 } from "lucide-react";
import { userNav, adminNav, navHref } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";
import { SidebarFolders, type SidebarFolder } from "@/components/sidebar-folders";
import { AddFolderButton } from "@/components/add-folder-button";

type AppSidebarProps = {
  /** 콘솔 종류 — nav/라벨은 클라이언트에서 직접 선택한다 (함수 prop 전달 방지) */
  variant: "user" | "admin";
  /*
    이름만 받는다. 역할 라벨은 넘기지 않는다 — 아래 프로필 줄의 둘째 칸은 **여기를 누르면
    무엇이 열리는지**(`내 계정`)를 적는 자리가 됐고, 역할은 그 문 안쪽(프로필 히어로)의
    배지에 그대로 있다. 쓰지 않는 값을 계속 받으면 호출측이 매번 조회·계산해 넘기게 된다.
  */
  user: { name: string };
  /** 영업 포털 사이드바의 문서함별 폴더 (user 전용) */
  folders?: SidebarFolder[];
};

const EMPTY_FOLDERS: SidebarFolder[] = [];

export function AppSidebar({
  variant,
  user,
  folders = EMPTY_FOLDERS,
}: AppSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** 지금 열려 있는 탭 — 프로필 화면의 두 진입점을 가려내는 데만 쓴다 */
  const currentTab = searchParams.get("tab");
  const nav = variant === "admin" ? adminNav : userNav;
  const kicker = variant === "admin" ? "관리자 콘솔" : "영업 담당자 포털";
  /*
    맨 아래 프로필 영역은 **내 계정**(개인 값)으로 들어가는 문이다.

    예전에는 이 영역과 `설정 > 회사·프로필` 이 둘 다 `/settings/profile` 를 가리켜, 이름만
    다른 같은 링크가 사이드바에 두 개 있었다 (사용자 피드백: "회사 프로필과 하단 프로필
    고정영역이 동일하다"). 그 화면은 애초에 **개인이냐 회사냐**로 탭이 갈려 있으므로
    (설정 7), 두 진입점이 서로 다른 탭을 열게 해서 이름과 목적지를 맞췄다 — 아래는
    `계정 정보`, 설정 묶음은 `회사 정보` 다.

    경로는 콘솔별로 그대로 둔다. 관리자 콘솔의 `/account/profile` 은 담당자 포털로 보내는
    **리다이렉트**다 (2.0.0) — 프로필 화면을 두 벌 두면 어느 쪽이 저장되는지 알 수 없다.
  */
  const isAdmin = variant === "admin";
  const profileHref = isAdmin
    ? "/account/profile"
    : "/settings/profile?tab=account";
  /*
    강조는 **회사 정보 탭이 아닐 때만** 켠다. 개인 탭(`계정 정보`·`보안`)이 이 문의 안쪽이고
    회사 탭은 설정 묶음의 것이다 — 탭을 보지 않으면 한 화면에서 두 곳이 함께 켜져,
    갈라 놓은 두 진입점이 다시 같은 것처럼 보인다. 탭 없이 들어온 주소(관리자 콘솔
    리다이렉트 등)는 개인 쪽으로 본다 — 화면의 첫 탭이 `계정 정보` 다.
  */
  const profileActive = isAdmin
    ? pathname === "/account/profile"
    : pathname === "/settings/profile" && currentTab !== "company";
  // 접힌 문서함(내/공용) 경로 집합 — 기본은 모두 펼침
  const [collapsedBoxes, setCollapsedBoxes] = useState<Set<string>>(new Set());
  const toggleBox = (href: string) =>
    setCollapsedBoxes((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <Link
        href="/"
        aria-label="RAINMAKER 메인 페이지로 이동"
        // `shrink-0` — 없으면 세로가 좁을 때 로고 줄이 눌린다 (실측 700px 높이에서 63 → 35px)
        className="flex h-16 shrink-0 items-center gap-2.5 border-b px-6 transition-colors hover:bg-sidebar-accent/60"
      >
        <BrandMark className="size-8" />
        <div className="leading-tight">
          <BrandWordmark className="text-sm" />
          <div className="text-[11px] text-muted-foreground">{kicker}</div>
        </div>
      </Link>

      {/*
        `min-h-0` + `overflow-y-auto` 가 **함께** 있어야 한다. flex 자식의 기본
        `min-height: auto` 는 내용보다 작아지기를 거부하므로, `flex-1` 만 주면 이 칸이
        내용 높이(760px)로 버티며 넘쳐 흐르고 **스크롤이 생기지 않는다** — 실측(1440×700):
        `scrollHeight === clientHeight === 760`, `overflow-y: visible`, 그리고 아래 프로필
        영역이 `y=795` 로 밀려 화면(700) 밖으로 나가 통째로 잘렸다(바깥칸이
        `overflow-hidden` 이라 스크롤로 닿을 수도 없다). 사용자가 말한 "스크롤이 생기지
        않는다"와 "하단 프로필 고정영역이 그대로 내려간다"는 **같은 원인 하나**였다.
      */}
      <nav className="overlay-scroll min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const Icon = item.icon;
          const hasChildren = !!item.children?.length;
          // 하위 항목이 있으면 부모는 강조 배경 대신 그룹 라벨로만 쓴다(중복 강조 방지).
          const active =
            !hasChildren &&
            (pathname === item.href || pathname.startsWith(item.href + "/"));
          /*
            묶음 강조는 **하위 항목까지 본다.** 묶음의 부모 href 는 첫 하위 항목과 같게 두므로
            (`@/lib/nav`), 부모 경로만 비교하면 다른 하위 항목에 있을 때 묶음이 꺼진다 —
            `메일` 묶음에서 `/settings/email` 을 보고 있으면 부모(`/mail/sent`) 와 접두사가
            달라 어느 묶음에 있는지 사이드바가 알려주지 못한다.
          */
          const groupActive =
            hasChildren &&
            [item.href, ...item.children!.map((child) => child.href)].some(
              (href) => pathname === href || pathname.startsWith(href + "/"),
            );
          const parentLink = (
            <Link
              href={navHref(item)}
              className={cn(
                "flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : groupActive
                    ? "font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
          const groupKey = `group:${item.href}`;
          // 폴더 트리·폴더 추가가 붙는 묶음 (내 문서함 하나뿐이다)
          const isLibraryGroup = item.href === "/library";
          const groupCollapsed = collapsedBoxes.has(groupKey);
          return (
            <div key={item.href}>
              {hasChildren ? (
                <div className="flex items-center gap-0.5">
                  {parentLink}
                  <button
                    type="button"
                    aria-label={groupCollapsed ? "펼치기" : "접기"}
                    onClick={() => toggleBox(groupKey)}
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  >
                    <ChevronRight
                      className={cn(
                        "size-3.5 transition-transform",
                        !groupCollapsed && "rotate-90",
                      )}
                    />
                  </button>
                  {/*
                    폴더 추가는 **문서 보관함 묶음에만** 붙는다. 묶음이 있으면 무조건 그렸더니
                    메일·설정 묶음에도 폴더 추가 버튼이 따라 나왔다 — 폴더가 있는 곳은
                    내 문서함 하나뿐이다(`SidebarFolders` 도 같은 조건으로 붙는다).
                  */}
                  {isLibraryGroup ? (
                    <Suspense fallback={null}>
                      <AddFolderButton />
                    </Suspense>
                  ) : null}
                </div>
              ) : (
                parentLink
              )}

              {hasChildren && !groupCollapsed ? (
                <div className="mt-1 ml-4 space-y-1 border-l pl-3">
                  {item.children!.map((child) => {
                    /*
                      탭이 지정된 항목은 **탭까지 같아야** 켜진다 — 같은 화면의 다른 탭에서
                      켜지면 아래 프로필 영역과 함께 두 곳이 강조된다.
                    */
                    const childActive =
                      pathname === child.href &&
                      (!child.tab || currentTab === child.tab);
                    // 폴더 트리가 붙는 문서함은 '내 문서함' 하나뿐이다.
                    const isLibraryBox = child.href === "/library";
                    const collapsed = collapsedBoxes.has(child.href);
                    return (
                      <div key={child.label}>
                        <div
                          className={cn(
                            "flex items-center gap-0.5 rounded-md pr-1 text-sm transition-colors",
                            childActive
                              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                          )}
                        >
                          {isLibraryBox ? (
                            <button
                              type="button"
                              aria-label={collapsed ? "펼치기" : "접기"}
                              onClick={() => toggleBox(child.href)}
                              className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
                            >
                              <ChevronRight
                                className={cn(
                                  "size-3.5 transition-transform",
                                  !collapsed && "rotate-90",
                                )}
                              />
                            </button>
                          ) : null}
                          <Link
                            href={navHref(child)}
                            className="min-w-0 flex-1 truncate py-1.5"
                          >
                            {child.label}
                          </Link>
                        </div>
                        {isLibraryBox && !collapsed ? (
                          <div className="ml-2">
                            <Suspense fallback={null}>
                              <SidebarFolders
                                folders={folders}
                                basePath={child.href}
                              />
                            </Suspense>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      {/* `shrink-0` — 위 목록이 길어져도 이 줄은 제 높이를 지키고 제자리에 남는다 */}
      <div className="shrink-0 border-t p-3">
        <Link
          href={profileHref}
          aria-label="내 계정 설정 열기"
          className={cn(
            "group flex items-center gap-3 rounded-md p-2 transition-colors",
            profileActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          )}
        >
          <Avatar className="size-9 shrink-0">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {user.name.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-medium">{user.name}</div>
            {/*
              역할 대신 **여기를 누르면 무엇이 열리는지**를 적는다. 이 줄이 `영업 담당자`
              였을 때는 위쪽 브랜드 줄의 `영업 담당자 포털` 과 겹쳐 읽혀 같은 말이 두 번
              나왔고, 정작 이 영역이 하는 일(내 계정)은 아무 데도 적혀 있지 않았다.
              역할은 이 문 안쪽(프로필 히어로)에 배지로 그대로 있다.
            */}
            <div className="truncate text-xs text-muted-foreground">내 계정</div>
          </div>
          {/*
            설정으로 가는 문이라는 표시 — 아이콘 하나로 "이건 눌리는 줄" 임을 알린다
            (색 변화만으로 알리지 않는다, ACC_*). 이름은 `aria-label` 이 말하므로 감춘다.
          */}
          <Settings2
            aria-hidden="true"
            className="ml-auto size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-sidebar-accent-foreground"
          />
        </Link>
      </div>
    </aside>
  );
}
