"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 폴더 패널 + 문서 영역 레이아웃 래퍼.
 * 폴더 패널을 토글로 접어 문서 영역을 넓게 쓸 수 있게 한다.
 *
 * 기본값은 JS 상태가 아니라 CSS 반응형으로 정한다(모바일 접힘·데스크톱 펼침).
 * → 마운트 이펙트로 상태를 초기화하지 않아 추가 렌더·하이드레이션 불일치가 없다.
 * 사용자가 토글하면 그때부터 명시적 boolean 상태로 고정한다.
 */
export function LibraryBrowser({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [choice, setChoice] = useState<boolean | null>(null);

  const panelClass =
    choice === null ? "hidden lg:block" : choice ? "block" : "hidden";

  function toggle() {
    setChoice((prev) => {
      if (prev !== null) return !prev;
      // 첫 토글: 현재 뷰포트의 CSS 기본값(데스크톱=펼침, 모바일=접힘)을 뒤집는다.
      return !window.matchMedia("(min-width: 1024px)").matches;
    });
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      <div className={cn("shrink-0 lg:w-60", panelClass)}>{sidebar}</div>

      <div className="min-w-0 flex-1 space-y-4">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          aria-expanded={choice ?? undefined}
          onClick={toggle}
        >
          {choice === null ? (
            // 초기 상태: 뷰포트별로 아이콘·라벨을 CSS 로 전환(하이드레이션 안전)
            <>
              <PanelLeftClose className="hidden size-4 lg:block" />
              <PanelLeftOpen className="size-4 lg:hidden" />
              <span className="hidden lg:inline">폴더 숨기기</span>
              <span className="lg:hidden">폴더 보기</span>
            </>
          ) : choice ? (
            <>
              <PanelLeftClose className="size-4" />
              폴더 숨기기
            </>
          ) : (
            <>
              <PanelLeftOpen className="size-4" />
              폴더 보기
            </>
          )}
        </Button>

        {children}
      </div>
    </div>
  );
}
