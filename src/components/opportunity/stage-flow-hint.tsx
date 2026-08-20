"use client";

import { Fragment } from "react";
import { ChevronRight, HelpCircle } from "lucide-react";
import {
  CLOSED_OPPORTUNITY_STAGES,
  OPEN_OPPORTUNITY_STAGES,
} from "@/lib/constants";
import { StageBadge } from "@/components/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * 영업 기회 단계 흐름 안내 — 검색칸 옆 **? 아이콘 툴팁** (4차 피드백 7).
 *
 * 전에는 목록 상단에 붙박이 배너였다. 단계가 몇 개인지는 한 번 익히면 끝인데 배너는 매번
 * 같은 자리를 차지해 표를 아래로 밀어냈다 — 처음 한 번만 필요한 설명에 세로 공간을 상시로
 * 내주지 않는다. 접어 두고 필요할 때 펴는 쪽이 맞다.
 *
 * 골격은 `@/components/info-hint` 와 같다 — 트리거가 **버튼**이라 Tab 으로 초점을 받고,
 * 초점이 닿는 순간 열리며 Radix 가 `aria-describedby` 로 내용을 이어 준다 (호버 전용이
 * 아니다, 정책 ACC_*). 아이콘만 `ⓘ` 대신 `?` 다 — "이 화면을 어떻게 읽나" 를 묻는 자리라서다.
 * Provider 도 스스로 감싸 어디에 놓아도 그대로 동작한다.
 *
 * 안내 내용은 배너에 있던 것을 그대로 옮겼다 — 진행 3단계는 화살표로 잇고, 마감 2개
 * (수주·실주)는 순차가 아니므로 "또는" 으로 병렬 표시하며, 자동 이동 규칙을 한 줄 덧붙인다.
 * 색은 목록 배지와 눈으로 이어져야 하므로 `StageBadge` 를 그대로 재사용한다(색을 새로
 * 정의하지 않는다).
 */
export function StageFlowHint() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label="영업 기회 단계 흐름 안내"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <HelpCircle className="size-4" aria-hidden="true" />
        </TooltipTrigger>
        {/* 배지가 한 줄에 다 들어가도록 기본 `max-w-xs` 를 넓힌다 */}
        <TooltipContent side="bottom" className="max-w-sm">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {OPEN_OPPORTUNITY_STAGES.map((stage, index) => (
                <Fragment key={stage}>
                  {index > 0 ? (
                    <ChevronRight
                      aria-hidden="true"
                      className="size-3.5 shrink-0 opacity-60"
                    />
                  ) : null}
                  <StageBadge stage={stage} />
                </Fragment>
              ))}

              <ChevronRight
                aria-hidden="true"
                className="size-3.5 shrink-0 opacity-60"
              />

              {CLOSED_OPPORTUNITY_STAGES.map((stage, index) => (
                <Fragment key={stage}>
                  {index > 0 ? <span className="text-xs">또는</span> : null}
                  <StageBadge stage={stage} />
                </Fragment>
              ))}
            </div>

            <p className="text-xs">
              견적서를 보내면 제안으로, 계약서를 보내면 검토/협상으로 자동
              이동합니다.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
