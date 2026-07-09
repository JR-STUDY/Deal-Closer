"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { userNav, adminNav } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type AppSidebarProps = {
  /** 콘솔 종류 — nav/라벨은 클라이언트에서 직접 선택한다 (함수 prop 전달 방지) */
  variant: "user" | "admin";
  user: { name: string; roleLabel: string };
};

export function AppSidebar({ variant, user }: AppSidebarProps) {
  const pathname = usePathname();
  const nav = variant === "admin" ? adminNav : userNav;
  const kicker = variant === "admin" ? "관리자 콘솔" : "영업 담당자 포털";
  // 프로필 설정 경로는 콘솔별로 다르다 (user-web 은 /account/profile 이 admin 과 충돌)
  const profileHref =
    variant === "admin" ? "/account/profile" : "/settings/profile";
  const profileActive =
    pathname === profileHref || pathname.startsWith(profileHref + "/");

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
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <Link
          href={profileHref}
          aria-label="프로필 설정 열기"
          className={cn(
            "flex items-center gap-3 rounded-md p-2 transition-colors",
            profileActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          )}
        >
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
        </Link>
      </div>
    </aside>
  );
}
