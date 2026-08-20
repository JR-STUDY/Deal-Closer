"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StageBadge } from "@/components/status-badge";
import { ROW_LINK_ABOVE } from "@/components/list-row-link";
import { formatNumber } from "@/lib/format";

/** 팝오버에 실어 내리는 기회 한 건 (직렬화 안전한 값만) */
export type PeekOpportunity = {
  id: string;
  name: string;
  stage: string;
};

/**
 * 한 거래처당 펼쳐 보여줄 기회 수의 **상한** (5차 피드백 2).
 *
 * 왜 상한이 필요한가 — 목록은 한 페이지에 거래처 10곳이라, 상한이 없으면 기회가 많은
 * 거래처 한 곳이 한 화면의 조회량을 통째로 끌어올린다. 왜 하필 5인가 — 팝오버는 **훑어보는
 * 자리**이지 목록을 대체하는 자리가 아니다. 5줄이면 패널이 행 아래 한 뼘에 들어가 뒤의 표를
 * 가리지 않는다. 넘치는 만큼은 "외 N건" 으로 **사실만 알리고** 거래처 상세로 보낸다 —
 * 패널에 스크롤을 넣어 전부 담으면 목록 화면이 두 개가 된다.
 */
export const OPPORTUNITY_PEEK_LIMIT = 5;

/**
 * 마우스가 트리거를 떠난 뒤 닫기까지의 유예 (ms).
 * 트리거와 패널 사이에는 `sideOffset` 만큼의 빈틈이 있어, 곧바로 닫으면 그 틈을 지나는 동안
 * 패널이 사라져 **제목을 누를 수 없다**. 유예 동안 패널에 포인터가 들어오면 닫기를 취소한다.
 */
const CLOSE_DELAY_MS = 140;

/**
 * 거래처 목록의 **기회 칸** — 건수를 누르거나 호버하면 그 거래처의 기회 제목이 펼쳐지고,
 * 제목을 누르면 기회 상세로 간다 (5차 피드백 2).
 *
 * **왜 툴팁(`HintTooltip`)이 아니라 팝오버인가.** 툴팁은 *읽는* 것이고 팝오버는 *조작하는*
 * 것이다. Radix Tooltip 의 콘텐츠에는 초점이 들어가지 않아 — 트리거에서 Tab 을 누르면 툴팁
 * 안이 아니라 다음 칸으로 넘어간다 — 안에 링크를 넣어도 **키보드로는 영영 누를 수 없다**.
 * 마우스로도 위태롭다: 툴팁은 포인터가 트리거를 벗어나면 닫히도록 만들어져 있어 링크까지
 * 손이 닿기 전에 사라진다. 팝오버는 열리면 초점을 안으로 옮기고, Tab 으로 링크를 훑고,
 * Esc 로 닫으며 트리거로 초점을 돌려준다 (정책 ACC_*). 값을 읽기만 하는 메모·담당자 칸은
 * 그대로 `HintTooltip` 을 쓴다 — 이 둘의 쓰임이 다르다.
 *
 * **호버로도 열린다.** 피드백이 요구한 것은 호버이고, 키보드 경로는 그 위에 얹는다.
 * 다만 포인터로 열렸을 때는 초점을 빼앗지 않는다(`onOpenAutoFocus` 를 막는다) — 스쳐 지나간
 * 마우스가 다른 곳에서 타이핑하던 초점을 끌어오면 안 된다.
 *
 * **행 덮개(`RowLink`)와의 충돌.** 이 행은 어디를 눌러도 거래처 상세로 가지만, 이 칸의
 * 링크들은 **기회 상세**로 가야 한다. 그래서 트리거만 `ROW_LINK_ABOVE` 로 덮개 위에 올린다 —
 * 칸 전체가 아니라 글자만 올리므로 칸의 빈 자리를 누르면 여전히 거래처 상세로 간다
 * (담당자 칸의 `HintTooltip` 과 같은 처리다). 패널 자체는 Portal 로 `body` 에 붙어 표 밖에
 * 그려지므로 덮개도, 표 컨테이너의 `overflow-hidden` 도 닿지 않는다.
 */
export function OpportunityPeek({
  accountId,
  companyName,
  totalCount,
  opportunities,
}: {
  accountId: string;
  companyName: string;
  /** 이 거래처의 기회 **전체** 건수 (상한에 걸려 잘린 수가 아니다) */
  totalCount: number;
  /** 펼쳐 보여줄 기회 (최대 `OPPORTUNITY_PEEK_LIMIT` 건) */
  opportunities: readonly PeekOpportunity[];
}) {
  const [open, setOpen] = useState(false);
  /** 이번 열림이 **포인터**로 시작됐는지 — 초점을 옮길지·닫을지의 판단이 갈린다 */
  const openedByPointer = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openByPointer = (event: React.PointerEvent) => {
    // 터치에는 호버가 없다 — 손가락이 닿는 것을 호버로 치면 탭 한 번에 열렸다 닫힌다.
    // 터치는 클릭 경로(아래 `onClick`)로만 연다.
    if (event.pointerType === "touch") return;
    cancelClose();
    if (!open) openedByPointer.current = true;
    setOpen(true);
  };

  const scheduleClose = (event: React.PointerEvent) => {
    if (event.pointerType === "touch") return;
    // 눌러서(또는 키보드로) 연 패널은 포인터가 떠났다고 닫지 않는다 — Esc·바깥 클릭·재클릭이
    // 닫는 길이다. 마우스가 스쳤다고 사용자가 고정해 둔 패널이 사라지면 안 된다.
    if (!openedByPointer.current) return;
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      // 안쪽 링크에 초점이 가 있으면 닫지 않는다 — 키보드로 훑는 중에 마우스가 지나갔다는
      // 이유로 패널을 걷어내면 이동 경로가 끊긴다.
      if (contentRef.current?.contains(document.activeElement)) return;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        cancelClose();
        setOpen(next);
      }}
    >
      <PopoverTrigger
        // 눌러서 연 것은 "고정" 이다 — 포인터가 떠나도 닫지 않고 초점을 안으로 옮긴다.
        onClick={() => {
          openedByPointer.current = false;
        }}
        onPointerEnter={openByPointer}
        onPointerLeave={scheduleClose}
        aria-label={`${companyName} 영업 기회 ${formatNumber(totalCount)}건 목록 열기`}
        className={`rounded px-1 tabular-nums underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${ROW_LINK_ABOVE}`}
      >
        {formatNumber(totalCount)}건
      </PopoverTrigger>

      <PopoverContent
        ref={contentRef}
        align="end"
        className="w-80 p-0"
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
        onOpenAutoFocus={(event) => {
          // 포인터로 열렸으면 초점을 그대로 둔다 (위 주석 참고)
          if (openedByPointer.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          // 키보드로 연 패널만 트리거로 초점을 돌려준다 (ACC_*). 호버로 열린 패널이 닫히며
          // 초점을 끌어오면 사용자가 있던 자리에서 커서가 튄다.
          if (openedByPointer.current) event.preventDefault();
          openedByPointer.current = false;
        }}
      >
        <div className="border-b px-3 py-2">
          <p className="truncate text-sm font-medium" title={companyName}>
            {companyName}
          </p>
          <p className="text-xs text-muted-foreground">
            영업 기회 {formatNumber(totalCount)}건
          </p>
        </div>

        <ul className="p-1">
          {opportunities.map((opportunity) => (
            <li key={opportunity.id}>
              <Link
                href={`/opportunities/${opportunity.id}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {/* 제목이 길면 잘린다 — 전체는 `title` 로 준다 (여기는 행 덮개 밖이라 뜬다) */}
                <span
                  className="min-w-0 flex-1 truncate"
                  title={opportunity.name}
                >
                  {opportunity.name}
                </span>
                {/* 단계는 색만이 아니라 글자로도 구분된다 (StageBadge, ACC_*) */}
                <StageBadge stage={opportunity.stage} />
              </Link>
            </li>
          ))}
        </ul>

        {totalCount > opportunities.length ? (
          <div className="border-t p-1">
            <Link
              href={`/accounts/${accountId}`}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span>
                외 {formatNumber(totalCount - opportunities.length)}건 — 거래처
                상세에서 모두 보기
              </span>
              <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
            </Link>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
