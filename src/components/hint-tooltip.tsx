"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * 표 안의 **값 자체**에 붙이는 툴팁 — 잘린 값·더 정밀한 값을 마우스와 키보드 양쪽에서
 * 확인한다 (4차 피드백 3 · 8).
 *
 * 왜 `title` 속성으로는 안 되는가 — 목록 행은 `RowLink` 의 `::after` 덮개가 행 전체를
 * 덮고 있어(행 어디를 눌러도 상세로 가게 하려고), 그 아래 칸의 `title` 에는 커서가 아예
 * 닿지 않는다. 지금까지 칸에 적어 둔 `title` 은 사실상 뜨지 않았다. 그래서 트리거만
 * `ROW_LINK_ABOVE`(=`relative z-10`) 로 덮개 위에 올려 준다 — **칸 전체가 아니라 글자만**
 * 올리므로 칸의 빈 자리를 누르면 여전히 상세로 간다.
 *
 * **호버 전용이 아니다** — 트리거가 `tabIndex=0` 이라 Tab 으로 초점을 받고, 초점이 닿는
 * 순간 툴팁이 열리며 Radix 가 `aria-describedby` 로 내용을 이어 준다 (정책 ACC_*).
 * `InfoHint` 와 같은 골격이며 Provider 도 스스로 감싼다(루트 레이아웃을 건드리지 않는다).
 *
 * **색은 `TooltipContent` 기본값을 그대로 쓴다** — `bg-foreground` / `text-background` 로
 * 토큰에서 파생돼 **라이트에서 검정 배경 · 흰 글씨**가 되고 다크에서 반전된다. 리터럴 색을
 * 박지 않으므로 테마를 바꿔도 대비가 유지된다. 두 목록(거래처·기회)이 이 컴포넌트 하나를
 * 공유하므로 툴팁 생김새가 화면마다 달라지지 않는다.
 */
export function HintTooltip({
  content,
  side = "top",
  className,
  children,
}: {
  /** 툴팁에 보여줄 내용 (한국어 존댓말, COPY-TONE) */
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  /** 트리거에 얹을 클래스 — 말줄임(`truncate`)·덮개 위로 올리기는 호출측이 정한다 */
  className?: string;
  /** 칸에 실제로 보이는 값 */
  children: ReactNode;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/*
            버튼이 아니라 `span` 이다 — 누르는 동작이 없고 값을 읽는 자리이므로,
            버튼으로 만들면 스크린리더가 칸마다 "버튼" 을 덧붙여 읽는다.
            대신 `tabIndex` 로 초점만 받게 해 키보드에서도 열린다.
          */}
          <span
            tabIndex={0}
            className={cn(
              "rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              className,
            )}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side={side}>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
