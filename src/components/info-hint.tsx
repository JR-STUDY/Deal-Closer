"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * ⓘ 도움말 — 짧은 보충 설명을 아이콘 하나로 접어 둔다.
 *
 * 목록 상단 합계 옆의 "필터를 적용한 결과 기준" 같은 **조건에 따라 나타나는 문구**를 본문에
 * 그대로 붙이면, 필터를 켜고 끌 때마다 같은 줄에 있는 검색창·셀렉트의 폭이 함께 움직인다.
 * 아이콘은 폭이 고정돼 그 문제가 생기지 않는다 (기회-15 · A-5 보완).
 *
 * **마우스 hover 전용이 아니다** — 트리거가 버튼이라 Tab 으로 초점을 받고, 초점이 닿는 순간
 * 툴팁이 열리며 Radix 가 `aria-describedby` 로 내용을 이어 준다 (정책 ACC_*).
 * `label` 은 버튼 자체의 이름이라 툴팁이 열리기 전에도 무엇인지 읽힌다.
 *
 * Provider 를 이 컴포넌트가 직접 감싼다 — 툴팁 하나 쓰려고 루트 레이아웃을 건드리지 않도록,
 * 어디에 놓아도 그대로 동작하게 한다.
 */
export function InfoHint({
  label,
  children,
}: {
  /** 트리거 버튼의 접근성 이름 (예: "합계 기준 안내") */
  label: string;
  /** 툴팁에 보여줄 설명 (한국어 존댓말, COPY-TONE) */
  children: ReactNode;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={label}
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent side="top">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
