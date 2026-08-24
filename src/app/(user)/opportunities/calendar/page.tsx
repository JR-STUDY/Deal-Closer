import { getCurrentOrg } from "@/lib/session";
import {
  CALENDAR_HREF,
  MONTH_PARAM,
  isSameMonth,
  monthHref,
  monthLabel,
  monthOf,
  parseMonthParam,
  shiftMonth,
} from "@/lib/calendar";
import { loadOpportunityCalendar } from "@/lib/opportunity-calendar";
import { PageHeader } from "@/components/page-header";
import { OpportunityCalendar } from "@/components/opportunity/opportunity-calendar";

/**
 * 마감 캘린더 전용 페이지 (F-302) — 영업 기회의 **예상 마감일**을 달력에 올린다.
 *
 * 대시보드에도 같은 캘린더가 있지만 그쪽은 **컴팩트**다(결말 아이콘만). 시연 데이터처럼
 * 하루 1~3건이 쌓이면 full 캘린더가 대시보드 한 화면을 다 먹어, 정작 KPI·차트가 스크롤
 * 아래로 밀려났다. 그래서 "달 전체를 훑는" 일은 대시보드 카드가, "칸을 읽고 눌러 들어가는"
 * 일은 이 페이지가 맡는다.
 *
 * `영업 기회` 묶음 아래에 두는 이유는 이 화면이 보여주는 것이 **기회의 마감일**이기
 * 때문이다(문서도 메일도 아니다). 라우트가 `/opportunities/calendar` 라 `[opportunityId]`
 * 와 나란히 있지만, Next.js 는 정적 세그먼트를 동적보다 먼저 맞추므로 섞이지 않는다.
 *
 * 서버 컴포넌트다 — 보고 있는 달은 URL 쿼리(`?month=YYYY-MM`)에만 있고 월 이동은
 * `<Link>` 라, JS 없이 동작하며 새 탭·주소 복사가 그대로 된다.
 */
export default async function OpportunityCalendarPage({
  searchParams,
}: {
  // Next.js 16: searchParams 는 Promise 다
  searchParams: Promise<{ month?: string }>;
}) {
  const [org, query] = await Promise.all([getCurrentOrg(), searchParams]);

  const today = new Date();
  // 잘못된 값(13월·1899년·형식 아님)은 이번 달로 떨어뜨린다 — 주소를 손으로 고쳐도
  // 화면이 깨지지 않는 것이 우선이다
  const month = parseMonthParam(query[MONTH_PARAM], today);
  const { grid, revenue } = await loadOpportunityCalendar({
    orgId: org.id,
    month,
    today,
  });

  return (
    <>
      <PageHeader
        title="마감 캘린더"
        description={`${monthLabel(month)} 에 마감 예정인 영업 기회입니다. 날짜 칸의 기회명을 누르시면 상세로 이동합니다.`}
      />

      <div className="flex-1 overflow-auto p-8 [scrollbar-gutter:stable]">
        {/*
          이 페이지는 `full` 밀도다(기본값) — 칸마다 기회명·금액을 보여준다.
          `전체 보기` 링크는 주지 않는다: 여기가 그 전체다.
        */}
        <OpportunityCalendar
          grid={grid}
          revenue={revenue}
          prevHref={monthHref(CALENDAR_HREF, {}, shiftMonth(month, -1), today)}
          nextHref={monthHref(CALENDAR_HREF, {}, shiftMonth(month, 1), today)}
          todayHref={monthHref(CALENDAR_HREF, {}, monthOf(today), today)}
          isCurrentMonth={isSameMonth(month, monthOf(today))}
        />
      </div>
    </>
  );
}
