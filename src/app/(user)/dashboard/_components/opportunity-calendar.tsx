import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Circle, CircleCheck, CircleX } from "lucide-react";
import { formatKRW } from "@/lib/format";
import {
  CALENDAR_OUTCOME_LABELS,
  WEEK_DAYS,
  foldDayEvents,
  monthLabel,
  weekendKind,
  type CalendarDay,
  type CalendarEvent,
  type CalendarGrid,
  type CalendarOutcome,
  type MonthRevenue,
} from "@/lib/calendar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * 대시보드의 월 캘린더 (F-302) — 영업 기회의 **예상 마감일**을 날짜 칸에 올린다.
 *
 * 서버 컴포넌트다. 월 이동은 `<Link>` 이고 상태는 URL 쿼리(`?month=YYYY-MM`)에만 있어
 * JS 없이도 동작하며 새 탭·주소 복사가 그대로 된다 (목록 정렬 머리글과 같은 이유).
 * 칸이 넘칠 때 펼치는 것도 `<details>` 라 클라이언트 훅이 필요 없다.
 *
 * 계산(그리드·배치·합계)은 하지 않는다 — `@/lib/calendar` 순수 함수가 단독으로 정한다.
 */

/** 결말별 표시 — **모양(아이콘)과 라벨**로 먼저 구분하고 색은 거든다 (ACC_*) */
const OUTCOME_ICONS: Record<CalendarOutcome, typeof Circle> = {
  open: Circle,
  won: CircleCheck,
  lost: CircleX,
};

/**
 * 요일 색 — 국내 달력 관행대로 **일요일 빨강 · 토요일 파랑**이다.
 *
 * 색이 유일한 신호가 아니다: 요일은 머리글 글자(일·토)와 격자 위치가 이미 말해 주고,
 * 색은 훑을 때 주말 경계가 먼저 눈에 띄게 거들 뿐이다 (ACC_*).
 * 어두운 테마에서는 채도를 낮춘 밝은 색으로 바꿔 대비를 지킨다.
 */
const WEEKEND_HEAD_TONE = {
  sunday: "text-red-600 dark:text-red-400",
  saturday: "text-blue-600 dark:text-blue-400",
  weekday: "text-muted-foreground",
} as const;

/**
 * 날짜 숫자의 색. 앞뒤 달에서 끌어온 칸은 **흐리게** 유지하되 주말 색조는 남긴다 —
 * 전부 회색으로 눕히면 격자 좌우 끝의 주말 열이 끊겨 보이고, 그대로 진하게 두면
 * 이번 달 날짜와 구별이 사라진다.
 */
function dayTone(weekday: number, inMonth: boolean): string {
  const kind = weekendKind(weekday);
  if (!kind) return inMonth ? "text-foreground" : "text-muted-foreground";
  if (kind === "sunday") {
    return inMonth
      ? "text-red-600 dark:text-red-400"
      : "text-red-600/50 dark:text-red-400/50";
  }
  return inMonth
    ? "text-blue-600 dark:text-blue-400"
    : "text-blue-600/50 dark:text-blue-400/50";
}

/**
 * 결말별 아이콘 색. 수주·실주는 상태색(good·critical)이고 진행 중은 중립이다.
 * 색만으로는 구분하지 않으므로(아이콘 모양·라벨이 이미 구분한다) 라이트·다크 모두
 * 배경 대비를 확보하는 선에서 정한다.
 */
const OUTCOME_ICON_CLASS: Record<CalendarOutcome, string> = {
  open: "text-muted-foreground",
  won: "text-emerald-600 dark:text-emerald-400",
  lost: "text-rose-600 dark:text-rose-400",
};

export type OpportunityCalendarProps = {
  grid: CalendarGrid;
  revenue: MonthRevenue;
  /** 이전 달 · 다음 달 · 이번 달 주소 (계산은 `@/lib/calendar` 의 `monthHref`) */
  prevHref: string;
  nextHref: string;
  todayHref: string;
  /** 지금 보고 있는 달이 이번 달인지 — 맞으면 `이번 달` 버튼을 비활성화한다 */
  isCurrentMonth: boolean;
};

export function OpportunityCalendar({
  grid,
  revenue,
  prevHref,
  nextHref,
  todayHref,
  isCurrentMonth,
}: OpportunityCalendarProps) {
  const label = monthLabel(grid.target);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4" />
              영업 기회 마감 캘린더
            </CardTitle>
            <CardDescription>
              영업 기회의 예상 마감일을 달력에 올렸습니다. 아래 금액은 <strong>기회 기준</strong>{" "}
              집계라, 상단 KPI 의 계약 매출(문서 기준 누적)과는 다른 숫자입니다.
            </CardDescription>
          </div>

          <nav aria-label="월 이동" className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon">
              <Link href={prevHref} aria-label="이전 달 보기">
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
            <span
              aria-live="polite"
              className="min-w-28 text-center text-sm font-medium tabular-nums"
            >
              {label}
            </span>
            <Button asChild variant="outline" size="icon">
              <Link href={nextHref} aria-label="다음 달 보기">
                <ChevronRight className="size-4" />
              </Link>
            </Button>
            {isCurrentMonth ? (
              <Button variant="ghost" size="sm" disabled>
                이번 달
              </Button>
            ) : (
              <Button asChild variant="ghost" size="sm">
                <Link href={todayHref}>이번 달</Link>
              </Button>
            )}
          </nav>
        </div>

        <MonthRevenueSummary label={label} revenue={revenue} />
      </CardHeader>

      <CardContent>
        <table className="w-full table-fixed border-collapse overflow-hidden rounded-lg border border-border">
          <caption className="sr-only">
            {label} 에 마감 예정인 영업 기회입니다. 날짜 칸의 기회명을 누르면 상세로 이동합니다.
          </caption>
          <thead>
            <tr className="bg-muted/50">
              {WEEK_DAYS.map(({ label, weekday }) => (
                <th
                  key={label}
                  scope="col"
                  className={cn(
                    "border-b border-border px-2 py-1.5 text-center text-xs font-medium",
                    WEEKEND_HEAD_TONE[weekendKind(weekday) ?? "weekday"],
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.weeks.map((week) => (
              <tr key={week[0]?.key}>
                {week.map((cell) => (
                  <DayCell key={cell.key} cell={cell} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>

    </Card>
  );
}

/**
 * 그 달의 매출 요약 + 캘린더 범례.
 *
 * **예상과 확정을 한 숫자로 합치지 않는다** — "될 수도 있는 돈"과 "된 돈"은 다른 사실이다.
 * 범례를 같은 자리에 두어 칸의 아이콘이 무엇을 뜻하는지 캘린더 위에서 바로 읽히게 한다.
 */
function MonthRevenueSummary({
  label,
  revenue,
}: {
  label: string;
  revenue: MonthRevenue;
}) {
  const tiles = [
    {
      outcome: "open" as CalendarOutcome,
      caption: `${label} 예상 매출`,
      hint: `진행 중 ${revenue.expectedCount}건`,
      amount: revenue.expectedAmount,
    },
    {
      outcome: "won" as CalendarOutcome,
      caption: `${label} 확정 매출`,
      hint: `수주 ${revenue.confirmedCount}건`,
      amount: revenue.confirmedAmount,
    },
  ];

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {tiles.map((tile) => {
          const Icon = OUTCOME_ICONS[tile.outcome];
          return (
            <div key={tile.outcome}>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className={cn("size-3.5", OUTCOME_ICON_CLASS[tile.outcome])} />
                {tile.caption}
              </dt>
              <dd className="text-2xl font-semibold">{formatKRW(tile.amount)}</dd>
              <dd className="text-xs text-muted-foreground">{tile.hint}</dd>
            </div>
          );
        })}
      </dl>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(["open", "won", "lost"] as const).map((outcome) => {
          const Icon = OUTCOME_ICONS[outcome];
          const count =
            outcome === "open"
              ? revenue.expectedCount
              : outcome === "won"
                ? revenue.confirmedCount
                : revenue.lostCount;
          return (
            <li key={outcome} className="flex items-center gap-1.5">
              <Icon className={cn("size-3.5", OUTCOME_ICON_CLASS[outcome])} />
              <span className={outcome === "lost" ? "line-through" : undefined}>
                {CALENDAR_OUTCOME_LABELS[outcome]}
              </span>
              <span className="tabular-nums">{count}건</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 날짜 칸 하나 — 넘치는 일정은 `<details>` 로 접는다 (JS 없이 펼쳐진다) */
function DayCell({ cell }: { cell: CalendarDay }) {
  const { visible, hiddenCount } = foldDayEvents(cell.events);

  return (
    <td
      className={cn(
        "h-24 space-y-1 border border-border align-top p-1.5",
        cell.inMonth ? "bg-card" : "bg-muted/30",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
            cell.isToday && "bg-primary font-semibold text-primary-foreground",
            // 오늘은 채워진 원 안의 글자라 주말 색을 덮어쓰지 않는다 — 겹치면 대비가 무너진다.
            !cell.isToday &&
              dayTone(cell.date.getDay(), cell.inMonth),
          )}
        >
          {cell.day}
          {cell.isToday ? <span className="sr-only">(오늘)</span> : null}
        </span>
        {cell.events.length > 0 ? (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {cell.events.length}건
          </span>
        ) : null}
      </div>

      {visible.map((event) => (
        <EventLink key={event.id} event={event} />
      ))}

      {hiddenCount > 0 ? (
        <details className="group">
          <summary className="cursor-pointer list-none rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <span className="group-open:hidden">+{hiddenCount}건 더 보기</span>
            <span className="hidden group-open:inline">접기</span>
          </summary>
          <div className="mt-1 space-y-1">
            {cell.events.slice(visible.length).map((event) => (
              <EventLink key={event.id} event={event} />
            ))}
          </div>
        </details>
      ) : null}
    </td>
  );
}

/** 일정 한 건 — 기회 상세로 이동한다 */
function EventLink({ event }: { event: CalendarEvent }) {
  const Icon = OUTCOME_ICONS[event.outcome];
  const outcomeLabel = CALENDAR_OUTCOME_LABELS[event.outcome];
  const amountLabel =
    event.amount > 0 ? formatKRW(event.amount) : "확정 문서 없음 · ₩0";

  return (
    <Link
      href={event.href}
      title={`${event.name} · ${amountLabel} · ${outcomeLabel}`}
      className="block rounded border border-border bg-background px-1.5 py-1 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex items-center gap-1">
        <Icon className={cn("size-3 shrink-0", OUTCOME_ICON_CLASS[event.outcome])} />
        <span
          className={cn(
            "truncate text-[11px] font-medium",
            event.outcome === "lost" && "line-through",
          )}
        >
          {event.name}
        </span>
      </span>
      <span className="mt-0.5 flex items-baseline justify-between gap-1">
        <span className="truncate text-[11px] text-muted-foreground tabular-nums">
          {amountLabel}
        </span>
        {event.outcome === "open" ? (
          <span className="sr-only">{outcomeLabel}</span>
        ) : (
          <span className="shrink-0 text-[10px] text-muted-foreground">{outcomeLabel}</span>
        )}
      </span>
    </Link>
  );
}
