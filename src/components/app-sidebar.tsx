"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { userNav, adminNav } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarFolders, type SidebarFolder } from "@/components/sidebar-folders";

type AppSidebarProps = {
  /** 콘솔 종류 — nav/라벨은 클라이언트에서 직접 선택한다 (함수 prop 전달 방지) */
  variant: "user" | "admin";
  user: { name: string; roleLabel: string };
  /** 영업 포털 사이드바의 문서함별 폴더 (user 전용) */
  folders?: SidebarFolder[];
};

export function AppSidebar({ variant, user, folders = [] }: AppSidebarProps) {
  const pathname = usePathname();
  const nav = variant === "admin" ? adminNav : userNav;
  const kicker = variant === "admin" ? "관리자 콘솔" : "영업 담당자 포털";

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <Link
        href="/"
        aria-label="SpecFlow AI 메인 페이지로 이동"
        className="flex h-16 items-center gap-2.5 border-b px-6 transition-colors hover:bg-sidebar-accent/60"
      >
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-4.5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">SpecFlow AI</div>
          <div className="text-[11px] text-muted-foreground">{kicker}</div>
        </div>
      </Link>

      <div className="border-b p-3">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <ArrowLeft className="size-4" />
          메인으로
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => {
          const Icon = item.icon;
          const hasChildren = !!item.children?.length;
          // 하위 항목이 있으면 부모는 강조 배경 대신 그룹 라벨로만 쓴다(중복 강조 방지).
          const active =
            !hasChildren &&
            (pathname === item.href || pathname.startsWith(item.href + "/"));
          const groupActive =
            hasChildren &&
            (pathname === item.href || pathname.startsWith(item.href + "/"));
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
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

              {hasChildren ? (
                <div className="mt-1 ml-4 space-y-1 border-l pl-3">
                  {item.children!.map((child) => {
                    const childActive = pathname === child.href;
                    const isCommonBox = child.href === "/library/common";
                    const isLibraryBox =
                      child.href === "/library" || isCommonBox;
                    const boxFolders = folders.filter((f) =>
                      isCommonBox ? f.isCommon : !f.isCommon,
                    );
                    return (
                      <div key={child.label}>
                        <Link
                          href={child.href}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
                            childActive
                              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                          )}
                        >
                          {child.label}
                        </Link>
                        {isLibraryBox ? (
                          <Suspense fallback={null}>
                            <SidebarFolders
                              key={boxFolders.map((f) => f.id).join("|")}
                              folders={boxFolders}
                              isCommon={isCommonBox}
                              basePath={child.href}
                            />
                          </Suspense>
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

      <div className="flex items-center gap-3 border-t p-4">
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary/10 text-xs text-primary">
            {user.name.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {user.roleLabel}
          </div>
        </div>
      </div>
    </aside>
  );
}
