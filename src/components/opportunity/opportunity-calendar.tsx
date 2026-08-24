import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleX,
  Sigma,
} from "lucide-react";
import { formatKRW } from "@/lib/format";
import {
  CALENDAR_OUTCOME_LABELS,
  COMPACT_DAY_EVENT_LIMIT,
  DAY_EVENT_LIMIT,
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
 * 계산(그리드·배치·합계)은 하지 않는다 — `@/lib/calendar` 순수 함수가 단독으로 정하고,
 * 조회는 `@/lib/opportunity-calendar` 하나를 지난다.
 *
 * 대시보드 카드와 전용 페이지가 **함께 쓰므로** 공용 컴포넌트다 (한때 대시보드의
 * `_components/` 에 있었다 — co-locate 는 그 화면만 쓰는 조각의 규칙이다).
 *
 * ## 밀도는 둘, 컴포넌트는 하나다
 *
 * `full` 은 전용 페이지(`/opportunities/calendar`)에서 칸마다 기회명·금액을 보여주고,
 * `compact` 는 대시보드 카드에서 **결말 아이콘만** 놓아 달 전체를 한 눈에 담는다.
 * 시연 데이터(하루 1~3건)에서 full 캘린더는 대시보드 한 화면을 다 먹었다.
 *
 * 그래도 **컴포넌트를 둘로 나누지 않는다.** 갈리는 것은 칸 안의 내용뿐이고, 격자·요일
 * 머리글·주말 색·월 이동·금액 타일은 완전히 같다 — 나누면 한쪽만 손봤을 때 두 캘린더가
 * 조용히 어긋난다(라벨/값 2열 표를 렌더러 하나로 둔 것과 같은 판단).
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

/**
 * 칸을 어떻게 채울지.
 *  - `full`: 기회명·금액을 링크로 (전용 페이지)
 *  - `compact`: 결말 아이콘만 (대시보드 카드)
 */
export type CalendarDensity = "full" | "compact";

export type OpportunityCalendarProps = {
  grid: CalendarGrid;
  revenue: MonthRevenue;
  /** 기본은 `full` — 밀도를 줄이는 쪽이 명시적으로 고르게 둔다 */
  density?: CalendarDensity;
  /**
   * 전용 캘린더 페이지 주소. 주면 헤더 오른쪽에 "전체 보기" 를 놓는다 —
   * 컴팩트 칸은 기회명을 감추므로 **더 볼 수 있는 곳**이 화면에 있어야 한다.
   */
  fullViewHref?: string;
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
  density = "full",
  fullViewHref,
  prevHref,
  nextHref,
  todayHref,
  isCurrentMonth,
}: OpportunityCalendarProps) {
  const label = monthLabel(grid.target);
  const isCompact = density === "compact";

  return (
    <Card>
      <CardHeader className="gap-4">
        {/*
          제목 · 월 이동 · (여백) 세 칸의 격자다. 월 이동을 `justify-between` 의
          오른쪽 끝이 아니라 **가운데**에 두는데, `flex` + `mx-auto` 로는 제목 길이가
          중심을 밀어 카드마다 위치가 달라진다. 양쪽 `1fr` 이 남는 폭을 똑같이 나눠
          가지므로 가운데 칸은 제목·번역 길이와 무관하게 카드 중앙에 선다.
          좁은 화면에서는 세 칸이 아래로 쌓이고 월 이동만 가운데 정렬을 유지한다.
        */}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4" />
            영업 기회 마감 캘린더
          </CardTitle>

          <nav
            aria-label="월 이동"
            className="flex items-center justify-center gap-1"
          >
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

          {/*
            오른쪽 칸 — 가운데 칸을 실제 중앙에 세우는 것이 이 칸의 첫 일이고, 컴팩트일
            때는 "전체 보기" 가 여기 앉는다. 양쪽이 같은 `1fr` 이라 링크가 들어와도
            가운데 정렬은 그대로다.
          */}
          <div className="hidden justify-end sm:flex">
            {fullViewHref ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={fullViewHref}>
                  전체 보기
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <MonthRevenueSummary label={label} revenue={revenue} />
      </CardHeader>

      <CardContent>
        <table className="w-full table-fixed border-collapse overflow-hidden rounded-lg border border-border">
          <caption className="sr-only">
            {label} 에 마감 예정인 영업 기회입니다.{" "}
            {isCompact
              ? "날짜 칸의 표식을 누르면 그 기회 상세로 이동합니다."
              : "날짜 칸의 기회명을 누르면 상세로 이동합니다."}
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
                  <DayCell key={cell.key} cell={cell} density={density} />
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
 * 그 달의 금액 요약 + 캘린더 범례.
 *
 * 큰 글씨 두 숫자는 **확정 금액**(수주 합)과 **전체 기회 금액**(진행 중 + 수주 + **실주**)이다.
 * 둘을 한 숫자로 합치지 않는다 — "된 돈"과 "그 달에 걸려 있던 판의 크기"는 다른 사실이다.
 * 실주를 전체에 넣는 이유는 그것도 그 달에 실제로 다룬 건이기 때문이고, 그래서 라벨에
 * `실주 포함` 을 적어 둔다(포함 여부를 숫자만 보고 알 수는 없다).
 *
 * 진행 중 합은 사라지지 않았다 — 전체 타일의 보조 줄에 금액으로 남는다.
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
      key: "confirmed",
      // 수주 결말과 같은 아이콘·색을 쓴다 — 범례·날짜 칸과 같은 표식이라야 이어 읽힌다
      Icon: OUTCOME_ICONS.won,
      iconClass: OUTCOME_ICON_CLASS.won,
      caption: `${label} 확정 금액`,
      hint: `수주 ${revenue.confirmedCount}건`,
      amount: revenue.confirmedAmount,
    },
    {
      key: "total",
      // 합계는 결말이 아니라 셋을 아우르는 값이라 결말 아이콘을 빌리지 않는다
      Icon: Sigma,
      iconClass: "text-muted-foreground",
      caption: `${label} 전체 기회 금액`,
      hint: `실주 포함 ${revenue.totalCount}건 · 진행 중 ${formatKRW(revenue.expectedAmount)}`,
      amount: revenue.totalAmount,
    },
  ];

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {tiles.map((tile) => (
          <div key={tile.key}>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <tile.Icon className={cn("size-3.5", tile.iconClass)} />
              {tile.caption}
            </dt>
            <dd className="text-2xl font-semibold">{formatKRW(tile.amount)}</dd>
            <dd className="text-xs text-muted-foreground">{tile.hint}</dd>
          </div>
        ))}
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

/**
 * 날짜 칸 하나.
 *
 * `full` 은 기회명 카드를 쌓고 넘치는 만큼을 `<details>` 로 접는다(JS 없이 펼쳐진다).
 * `compact` 는 결말 아이콘만 한 줄로 놓는다 — 접는 장치를 두지 않는다. 40px 칸 안에서
 * 펼쳐지면 아래 주(週)를 덮고, 컴팩트의 목적은 "이 날 무슨 일이 있는지" 이지 그 자리에서
 * 다 읽는 것이 아니다(전체는 헤더의 `전체 보기` 로 간다).
 */
function DayCell({
  cell,
  density,
}: {
  cell: CalendarDay;
  density: CalendarDensity;
}) {
  const isCompact = density === "compact";
  const { visible, hiddenCount } = foldDayEvents(
    cell.events,
    isCompact ? COMPACT_DAY_EVENT_LIMIT : DAY_EVENT_LIMIT,
  );

  return (
    <td
      className={cn(
        "border border-border align-top",
        cell.inMonth ? "bg-card" : "bg-muted/30",
        isCompact ? "h-12 p-1" : "h-24 space-y-1 p-1.5",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full tabular-nums",
            isCompact ? "size-4 text-[11px]" : "size-5 text-xs",
            cell.isToday && "bg-primary font-semibold text-primary-foreground",
            // 오늘은 채워진 원 안의 글자라 주말 색을 덮어쓰지 않는다 — 겹치면 대비가 무너진다.
            !cell.isToday &&
              dayTone(cell.date.getDay(), cell.inMonth),
          )}
        >
          {cell.day}
          {cell.isToday ? <span className="sr-only">(오늘)</span> : null}
        </span>
        {/*
          건수는 `full` 에만 적는다. 컴팩트는 표식 자체가 개수를 보여주므로 숫자를 겹쳐
          적으면 좁은 칸에서 날짜와 뒤섞여 읽힌다.
        */}
        {!isCompact && cell.events.length > 0 ? (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {cell.events.length}건
          </span>
        ) : null}
      </div>

      {isCompact ? (
        <div className="mt-0.5 flex items-center gap-0.5">
          {visible.map((event) => (
            <EventDot key={event.id} event={event} />
          ))}
          {hiddenCount > 0 ? (
            <span
              className="text-[10px] text-muted-foreground tabular-nums"
              // 감춘 것이 무엇인지 커서를 올리면 알 수 있다 — 링크는 아니다(전체 보기로 간다)
              title={cell.events
                .slice(visible.length)
                .map((event) => event.name)
                .join("\n")}
            >
              +{hiddenCount}
            </span>
          ) : null}
        </div>
      ) : (
        <>
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
        </>
      )}
    </td>
  );
}

/**
 * 컴팩트 칸의 일정 한 건 — **아이콘 하나가 곧 링크**다.
 *
 * 아이콘만 두고 이름을 감추므로 두 가지를 지킨다. ① 결말은 색이 아니라 **모양**으로
 * 구분한다(ACC_*) — 색만 다르면 컴팩트에서는 판별할 단서가 아예 없다. ② 링크의 접근성
 * 이름에 **기회명·금액·결말**을 모두 담는다. 화면 낭독기에게 "링크"만 읽히면 이 칸은
 * 통과할 수 없는 자리가 된다.
 *
 * 크기는 `size-5`(20px) 를 지킨다 — 아이콘은 12px 이지만 누를 자리가 그만큼이면
 * 손가락·마우스로 맞히기 어렵다.
 */
function EventDot({ event }: { event: CalendarEvent }) {
  const Icon = OUTCOME_ICONS[event.outcome];
  const outcomeLabel = CALENDAR_OUTCOME_LABELS[event.outcome];
  const amountLabel =
    event.amount > 0 ? formatKRW(event.amount) : "확정 문서 없음 · ₩0";
  const description = `${event.name} · ${amountLabel} · ${outcomeLabel}`;

  return (
    <Link
      href={event.href}
      title={description}
      aria-label={description}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Icon
        className={cn("size-3", OUTCOME_ICON_CLASS[event.outcome])}
        aria-hidden="true"
      />
    </Link>
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
