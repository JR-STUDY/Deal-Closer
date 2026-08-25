import "server-only";

import { prisma } from "./db";
import {
  calendarGrid,
  gridRange,
  monthRevenue,
  type CalendarGrid,
  type CalendarMonth,
  type MonthRevenue,
} from "./calendar";

/**
 * 캘린더가 그릴 데이터를 읽는 **단 하나의 조회** (F-302).
 *
 * 캘린더는 두 곳에 있다 — 대시보드 카드(컴팩트)와 전용 페이지(`/opportunities/calendar`).
 * 조회를 각자 적으면 두 화면이 **다른 범위·다른 필드**를 보게 되고, 그 순간 같은 달의
 * 같은 캘린더가 서로 다른 그림을 그린다. 특히 틀리기 쉬운 두 가지를 여기 못박는다.
 *
 * ① **범위는 그 달이 아니라 그리드 구간이다** (`gridRange`). 그 달만 읽으면 같은 주에
 *    걸친 앞뒤 달 칸이 늘 비어 보인다 — 8월 31일(금)과 9월 1일(토)이 한 줄에 있는데
 *    9월 일정이 사라진다.
 * ② **월 합계는 그리드가 아니라 그 달을 기준으로 낸다** (`monthRevenue` 가 다시 좁힌다).
 *    그리드로 합치면 앞뒤 달 칸의 금액이 이 달 합계에 섞인다.
 *
 * 계산은 하지 않는다 — 그리드·배치·합계는 `@/lib/calendar` 순수 함수가 정하고 이 모듈은
 * 조회와 그 함수들의 연결만 한다.
 */
export async function loadOpportunityCalendar(input: {
  orgId: string;
  month: CalendarMonth;
  today: Date;
}): Promise<{ grid: CalendarGrid; revenue: MonthRevenue }> {
  const { orgId, month, today } = input;
  const range = gridRange(month);

  const opportunities = await prisma.opportunity.findMany({
    where: {
      orgId,
      expectedCloseDate: { gte: range.start, lt: range.end },
    },
    select: {
      id: true,
      name: true,
      stage: true,
      expectedAmount: true,
      expectedCloseDate: true,
      // 툴팁이 "어느 회사의 건인지" 를 말한다 — 기회명은 거래처가 달라도 같은 문구가 반복된다
      account: { select: { companyName: true } },
    },
    // 칸 안의 순서는 `calendarGrid` 가 다시 정한다(금액 큰 순). 여기서 정렬하는 것은
    // 같은 값이 여럿일 때 페이지마다 순서가 흔들리지 않게 하는 마지막 기준이다.
    orderBy: [{ expectedCloseDate: "asc" }, { id: "asc" }],
  });

  // 순수 함수(`calendarGrid`)는 평탄한 값을 받는다 — 관계를 그대로 넘기면 그쪽이 Prisma
  // 응답 모양을 알아야 하고, 조회를 바꿀 때마다 순수 모듈이 따라 흔들린다.
  const flattened = opportunities.map(({ account, ...rest }) => ({
    ...rest,
    accountName: account?.companyName ?? null,
  }));

  return {
    grid: calendarGrid({ target: month, opportunities: flattened, today }),
    revenue: monthRevenue(flattened, month),
  };
}
