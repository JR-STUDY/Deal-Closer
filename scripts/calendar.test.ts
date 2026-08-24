/**
 * `src/lib/calendar.ts` 검증 (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:calendar
 *
 * 캘린더는 **경계에서만 틀린다** — 달의 첫날·마지막날, 주 시작 요일, 월 경계를 넘는 칸,
 * 잘못된 `?month=`, 마감일이 없는 기회, 그리고 시간대(로컬 자정 기준) 취급이다.
 * 그 여섯 자리를 집중적으로 본다.
 */

import assert from "node:assert/strict";
import { OPPORTUNITY_STAGE_LABELS } from "../src/lib/constants";
import { WEEK_START_DAY, monthRange } from "../src/lib/pipeline";
import {
  CALENDAR_OUTCOME_LABELS,
  DAY_EVENT_LIMIT,
  MONTH_PARAM,
  WEEK_DAYS,
  WEEK_DAY_LABELS,
  weekendKind,
  calendarGrid,
  dayKey,
  foldDayEvents,
  formatMonthParam,
  gridRange,
  isSameMonth,
  monthHref,
  monthLabel,
  monthOf,
  monthRevenue,
  opportunityHref,
  outcomeOfStage,
  parseMonthParam,
  shiftMonth,
  type CalendarDay,
  type CalendarOpportunity,
} from "../src/lib/calendar";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

/** 로컬 자정 — 캘린더가 날짜를 다루는 기준이다 */
function local(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

/** 그리드를 한 줄 문자열 배열로 펼친다 (칸 순서 검증용) */
function flatKeys(weeks: CalendarDay[][]): string[] {
  return weeks.flat().map((cell) => cell.key);
}

function opportunity(
  overrides: Partial<CalendarOpportunity> & Pick<CalendarOpportunity, "id">,
): CalendarOpportunity {
  return {
    name: `기회 ${overrides.id}`,
    stage: "PROPOSAL",
    expectedAmount: 1_000_000,
    expectedCloseDate: local(2026, 8, 14),
    ...overrides,
  };
}

// ────────────────────────── 잘못된 ?month= 쿼리 ──────────────────────────
// 주소를 손으로 고쳐도 화면이 깨지지 않아야 한다 — 이번 달로 떨어진다.
const TODAY = local(2026, 8, 22, 13, 45);
for (const raw of [
  undefined,
  null,
  "",
  "   ",
  "2026",
  "2026-",
  "2026-8", // 한 자리 월은 형식 밖이다 (주소는 항상 두 자리로 만든다)
  "26-08",
  "2026-13",
  "2026-00",
  "1900-05",
  "abcd-ef",
  "2026-08-01",
  "2026/08",
]) {
  check(
    parseMonthParam(raw, TODAY),
    { year: 2026, month: 8 },
    `parseMonthParam(${JSON.stringify(raw)}) → 이번 달`,
  );
}
check(parseMonthParam("2026-09", TODAY), { year: 2026, month: 9 }, "다음 달을 읽는다");
check(parseMonthParam(" 2025-12 ", TODAY), { year: 2025, month: 12 }, "공백은 다듬는다");
check(parseMonthParam("2026-01", TODAY), { year: 2026, month: 1 }, "1월 경계");
check(parseMonthParam("2026-12", TODAY), { year: 2026, month: 12 }, "12월 경계");

// ────────────────────────── 달 표기·이동 ──────────────────────────
check(formatMonthParam({ year: 2026, month: 8 }), "2026-08", "쿼리 값은 두 자리 월이다");
check(formatMonthParam({ year: 2026, month: 12 }), "2026-12", "12월 쿼리 값");
check(monthLabel({ year: 2026, month: 8 }), "2026년 8월", "화면 표기는 사람 기준");
check(monthOf(TODAY), { year: 2026, month: 8 }, "그 날짜가 속한 달");
check(isSameMonth({ year: 2026, month: 8 }, monthOf(TODAY)), true, "같은 달 판정");
check(isSameMonth({ year: 2025, month: 8 }, monthOf(TODAY)), false, "해가 다르면 다른 달");

// 연 경계에서 넘어가는지 (12월 +1 = 다음 해 1월, 1월 -1 = 지난 해 12월)
check(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 }, "12월 다음 달");
check(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 }, "1월 이전 달");
check(shiftMonth({ year: 2026, month: 8 }, 0), { year: 2026, month: 8 }, "0 이면 제자리");
check(shiftMonth({ year: 2026, month: 3 }, -14), { year: 2025, month: 1 }, "여러 달 이동");

// ────────────────────────── 달 이동 주소 ──────────────────────────
// 이번 달이면 파라미터를 지운다 (기본 상태의 주소를 지저분하게 하지 않는다).
check(
  monthHref("/dashboard", {}, { year: 2026, month: 8 }, TODAY),
  "/dashboard",
  "이번 달 주소에는 month 가 없다",
);
check(
  monthHref("/dashboard", {}, { year: 2026, month: 9 }, TODAY),
  `/dashboard?${MONTH_PARAM}=2026-09`,
  "다른 달은 month 를 싣는다",
);
check(
  monthHref("/dashboard", { tab: "pipeline", month: "2026-01" }, { year: 2026, month: 7 }, TODAY),
  `/dashboard?tab=pipeline&${MONTH_PARAM}=2026-07`,
  "다른 파라미터는 유지하고 month 만 새로 쓴다",
);
check(
  monthHref("/dashboard", { tab: "  " }, { year: 2026, month: 8 }, TODAY),
  "/dashboard",
  "빈 파라미터는 싣지 않는다",
);

// ────────────────────────── 주 시작 요일 ──────────────────────────
// 머리글은 `WEEK_START_DAY`(일요일)부터 돌아야 한다 — 손으로 적어 두면 여기만 어긋난다.
check(WEEK_DAY_LABELS.length, 7, "요일 머리글은 7칸");
check(WEEK_START_DAY, 0, "국내 달력 표기대로 주는 일요일에 시작한다");
check(
  [...WEEK_DAY_LABELS],
  ["일", "월", "화", "수", "목", "금", "토"],
  "머리글이 주 시작 요일부터 돌아간다",
);
// 색 표기의 단일 기준 — 머리글과 날짜 숫자가 같은 함수를 본다
check(weekendKind(0), "sunday", "일요일은 빨강 계열로 표기한다");
check(weekendKind(6), "saturday", "토요일은 파랑 계열로 표기한다");
check(weekendKind(3), null, "평일은 주말 색을 쓰지 않는다");
check(
  WEEK_DAYS.map((head) => head.weekday),
  [0, 1, 2, 3, 4, 5, 6],
  "머리글이 요일 번호를 함께 든다 (열 순번으로 색을 정하지 않는다)",
);

// ────────────────────────── 그리드 구간 ──────────────────────────
// 2026-08: 1일이 토요일 → 앞으로 6칸(7/26~7/31)을 끌어오고 6주로 그려진다.
const augRange = gridRange({ year: 2026, month: 8 });
check(dayKey(augRange.start), "2026-07-26", "그리드는 그 주의 일요일에서 시작한다");
check(dayKey(augRange.end), "2026-09-06", "구간 끝은 배타적이다 (마지막 칸 다음 날)");

const augGrid = calendarGrid({ target: { year: 2026, month: 8 }, opportunities: [], today: TODAY });
check(augGrid.weeks.length, 6, "8월은 6주로 그려진다");
check(augGrid.weeks.every((week) => week.length === 7), true, "모든 주가 7칸이다");
check(flatKeys(augGrid.weeks)[0], "2026-07-26", "첫 칸은 지난 달에서 끌어온 날");
check(flatKeys(augGrid.weeks).at(-1), "2026-09-05", "마지막 칸은 다음 달에서 끌어온 날");
check(
  flatKeys(augGrid.weeks).length,
  new Set(flatKeys(augGrid.weeks)).size,
  "같은 날짜가 두 칸에 들어가지 않는다",
);

// 달의 첫날·마지막날이 정확히 한 칸씩 있고 `inMonth` 로 구분된다
const augCells = augGrid.weeks.flat();
const firstDay = augCells.filter((cell) => cell.key === "2026-08-01");
const lastDay = augCells.filter((cell) => cell.key === "2026-08-31");
check(firstDay.length, 1, "첫날은 한 칸");
check(lastDay.length, 1, "마지막날은 한 칸");
check(firstDay[0]?.inMonth, true, "첫날은 이 달의 날짜다");
check(lastDay[0]?.inMonth, true, "마지막날도 이 달의 날짜다");
check(
  augCells.filter((cell) => cell.inMonth).length,
  31,
  "이 달 칸 수는 그 달의 날 수와 같다",
);
check(
  augCells.filter((cell) => !cell.inMonth).map((cell) => cell.key),
  ["2026-07-26", "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"],
  "월 경계를 넘는 칸은 앞뒤 달에서만 온다",
);
check(
  augCells.filter((cell) => cell.isToday).map((cell) => cell.key),
  ["2026-08-22"],
  "오늘 칸은 하나뿐이다",
);

// 2026-02: 1일이 일요일이고 28일 → 딱 4주. 짧은 달에 빈 주를 한 줄 남기지 않는다.
const febGrid = calendarGrid({ target: { year: 2026, month: 2 }, opportunities: [], today: TODAY });
check(febGrid.weeks.length, 4, "2026년 2월은 4주");
check(flatKeys(febGrid.weeks)[0], "2026-02-01", "2월 그리드의 첫 칸");
check(flatKeys(febGrid.weeks).at(-1), "2026-02-28", "2월 그리드의 마지막 칸");
check(
  febGrid.weeks.flat().every((cell) => cell.inMonth),
  true,
  "4주 그리드에는 다른 달 칸이 없다",
);

// 2021-02: 1일이 월요일 → 앞에서 한 칸(1/31 일요일)을 끌어와 5주가 된다.
// 주 시작을 바꾸면 같은 달의 주 수가 달라진다는 것을 못박아 둔다.
const feb2021 = calendarGrid({ target: { year: 2021, month: 2 }, opportunities: [], today: TODAY });
check(feb2021.weeks.length, 5, "월요일에 시작하는 28일 달은 일요일 시작 기준 5주");
check(flatKeys(feb2021.weeks)[0], "2021-01-31", "앞 달의 일요일 한 칸을 끌어온다");
check(feb2021.weeks.flat().some((cell) => cell.isToday), false, "다른 달에는 오늘 칸이 없다");

// 윤년 2월 29일도 칸을 얻는다
const feb2024 = calendarGrid({ target: { year: 2024, month: 2 }, opportunities: [], today: TODAY });
check(
  feb2024.weeks.flat().filter((cell) => cell.inMonth).length,
  29,
  "윤년 2월은 29칸",
);

// ────────────────────────── 시간대 (로컬 자정 기준) ──────────────────────────
// `toISOString()` 으로 칸을 정하면 UTC 로 밀려 하루 어긋난다. 로컬 날짜로만 판정한다.
const edgeGrid = calendarGrid({
  target: { year: 2026, month: 8 },
  opportunities: [
    opportunity({ id: "midnight", expectedCloseDate: local(2026, 8, 1, 0, 0) }),
    opportunity({ id: "lastMinute", expectedCloseDate: local(2026, 8, 1, 23, 59) }),
    opportunity({ id: "nextMidnight", expectedCloseDate: local(2026, 8, 2, 0, 0) }),
  ],
  today: TODAY,
});
const edgeCells = new Map(edgeGrid.weeks.flat().map((cell) => [cell.key, cell]));
check(
  edgeCells.get("2026-08-01")?.events.map((event) => event.id).sort(),
  ["lastMinute", "midnight"],
  "그날 자정과 23:59 는 같은 칸에 들어간다",
);
check(
  edgeCells.get("2026-08-02")?.events.map((event) => event.id),
  ["nextMidnight"],
  "다음 날 자정은 다음 칸이다",
);
check(dayKey(local(2026, 1, 1)), "2026-01-01", "dayKey 는 로컬 날짜를 두 자리로 적는다");
check(dayKey(local(2026, 12, 31, 23, 59)), "2026-12-31", "밤 늦은 시각도 그날이다");

// ────────────────────────── 일정 배치 ──────────────────────────
const events: CalendarOpportunity[] = [
  // 마감일이 없는 기회 — 놓을 근거가 없어 어느 칸에도 없다
  opportunity({ id: "no-date", expectedCloseDate: null }),
  // 정의 밖 단계 — 결말을 판정할 수 없어 놓지 않는다
  opportunity({ id: "unknown-stage", stage: "ARCHIVED", expectedCloseDate: local(2026, 8, 10) }),
  // 같은 칸에 여러 건 (금액 내림차순 → 이름 → id)
  opportunity({ id: "b", name: "나 프로젝트", expectedAmount: 5_000_000, expectedCloseDate: local(2026, 8, 14) }),
  opportunity({ id: "a", name: "가 프로젝트", expectedAmount: 9_000_000, expectedCloseDate: local(2026, 8, 14) }),
  opportunity({ id: "c2", name: "같은 금액", expectedAmount: 5_000_000, expectedCloseDate: local(2026, 8, 14) }),
  opportunity({ id: "c1", name: "같은 금액", expectedAmount: 5_000_000, expectedCloseDate: local(2026, 8, 14) }),
  // 월 경계를 넘는 칸의 일정 — 그리드에는 놓이지만 이 달 합계에는 들어가지 않는다
  opportunity({ id: "prev", stage: "WON", expectedAmount: 3_000_000, expectedCloseDate: local(2026, 7, 30) }),
  opportunity({ id: "next", stage: "NEGOTIATION", expectedAmount: 4_000_000, expectedCloseDate: local(2026, 9, 2) }),
  // 그리드 밖 (다다음 달) — 무시한다
  opportunity({ id: "far", expectedCloseDate: local(2026, 10, 5) }),
];

const placed = calendarGrid({ target: { year: 2026, month: 8 }, opportunities: events, today: TODAY });
const placedCells = new Map(placed.weeks.flat().map((cell) => [cell.key, cell]));
const placedIds = placed.weeks.flat().flatMap((cell) => cell.events.map((event) => event.id));

check(placedIds.includes("no-date"), false, "마감일 없는 기회는 배치하지 않는다");
check(placedIds.includes("unknown-stage"), false, "정의 밖 단계는 배치하지 않는다");
check(placedIds.includes("far"), false, "그리드 구간 밖 기회는 무시한다");
check(
  placedCells.get("2026-08-14")?.events.map((event) => event.id),
  ["a", "c1", "c2", "b"],
  "한 칸 안은 금액 내림차순 → 이름(가나다) → id 순이다",
);
check(
  placedCells.get("2026-07-30")?.events.map((event) => event.id),
  ["prev"],
  "지난 달 칸에도 일정이 놓인다 (그 주가 함께 보이므로)",
);
check(
  placedCells.get("2026-09-02")?.events.map((event) => event.id),
  ["next"],
  "다음 달 칸에도 일정이 놓인다",
);
check(
  placedCells.get("2026-08-14")?.events[0],
  {
    id: "a",
    name: "가 프로젝트",
    amount: 9_000_000,
    stage: "PROPOSAL",
    outcome: "open",
    href: "/opportunities/a",
  },
  "일정에는 기회명·금액·결말·상세 주소가 실린다",
);
check(opportunityHref("abc"), "/opportunities/abc", "기회 상세 주소");

// ────────────────────────── 결말 (색만으로 구분하지 않기 위한 근거) ──────────────────────────
check(outcomeOfStage("INITIAL"), "open", "초기는 진행 중");
check(outcomeOfStage("PROPOSAL"), "open", "제안은 진행 중");
check(outcomeOfStage("NEGOTIATION"), "open", "검토/협상은 진행 중");
check(outcomeOfStage("WON"), "won", "수주");
check(outcomeOfStage("LOST"), "lost", "실주");
check(outcomeOfStage("ARCHIVED"), null, "정의 밖 단계는 판정하지 않는다");
check(outcomeOfStage(""), null, "빈 문자열도 판정하지 않는다");
check(CALENDAR_OUTCOME_LABELS.won, OPPORTUNITY_STAGE_LABELS.WON, "수주 라벨은 단계 라벨에서 온다");
check(CALENDAR_OUTCOME_LABELS.lost, OPPORTUNITY_STAGE_LABELS.LOST, "실주 라벨도 단계 라벨에서 온다");
check(CALENDAR_OUTCOME_LABELS.open, "진행 중", "진행 중 라벨");

// ────────────────────────── 칸 접기 (+N건) ──────────────────────────
const dayEvents = placedCells.get("2026-08-14")?.events ?? [];
check(dayEvents.length, 4, "이 칸에는 4건이 있다");
const folded = foldDayEvents(dayEvents);
check(folded.visible.length, DAY_EVENT_LIMIT, "기본 상한만큼만 보여 준다");
check(folded.hiddenCount, 4 - DAY_EVENT_LIMIT, "나머지는 +N건 으로 접는다");
check(foldDayEvents(dayEvents, 4).hiddenCount, 0, "상한과 같으면 접지 않는다");
check(foldDayEvents(dayEvents, 9).visible.length, 4, "상한이 크면 전부 보여 준다");
check(foldDayEvents([], 2), { visible: [], hiddenCount: 0 }, "빈 칸은 접을 것이 없다");
check(foldDayEvents(dayEvents, 0).visible.length, 1, "상한 0 은 1로 올린다 (빈 칸이 되지 않게)");
check(
  foldDayEvents(dayEvents, 1).visible.map((event) => event.id),
  ["a"],
  "접어도 첫 칸에는 가장 큰 금액이 남는다",
);

// ───────────────────── 월 합계 (확정 · 전체 · 실주 포함) ─────────────────────
const revenueSample: CalendarOpportunity[] = [
  opportunity({ id: "open-1", stage: "INITIAL", expectedAmount: 1_000_000, expectedCloseDate: local(2026, 8, 1) }),
  opportunity({ id: "open-2", stage: "NEGOTIATION", expectedAmount: 2_500_000, expectedCloseDate: local(2026, 8, 31, 23, 59) }),
  opportunity({ id: "won-1", stage: "WON", expectedAmount: 7_000_000, expectedCloseDate: local(2026, 8, 20) }),
  opportunity({ id: "lost-1", stage: "LOST", expectedAmount: 6_000_000, expectedCloseDate: local(2026, 8, 21) }),
  // 합계에서 빠지는 것들 — 마감일 없음 · 정의 밖 단계 · 앞뒤 달(그리드에는 보인다)
  opportunity({ id: "no-date", expectedAmount: 9_000_000, expectedCloseDate: null }),
  opportunity({ id: "bad", stage: "???", expectedAmount: 9_000_000, expectedCloseDate: local(2026, 8, 5) }),
  opportunity({ id: "prev-month", expectedAmount: 9_000_000, expectedCloseDate: local(2026, 7, 31, 23, 59) }),
  opportunity({ id: "next-month", expectedAmount: 9_000_000, expectedCloseDate: local(2026, 9, 1) }),
];

const revenue = monthRevenue(revenueSample, { year: 2026, month: 8 });
check(revenue.expectedAmount, 3_500_000, "진행 중 합은 보조 표기로 남는다");
check(revenue.expectedCount, 2, "진행 중 건수");
check(revenue.confirmedAmount, 7_000_000, "확정 금액은 그 달 수주 기회의 합이다");
check(revenue.confirmedCount, 1, "확정 건수");
check(revenue.lostAmount, 6_000_000, "실주 금액도 센다 — 건수만 알리던 예전 판과 다르다");
check(revenue.lostCount, 1, "실주 건수");

// 전체 = 진행 중 + 수주 + 실주. 실주를 빼먹으면 그 달에 다룬 규모가 조용히 작아진다.
check(revenue.totalAmount, 16_500_000, "전체 기회 금액은 실주까지 포함한 합이다");
check(revenue.totalCount, 4, "전체 건수는 결말과 무관하게 그 달 마감 예정 전부다");
check(
  revenue.totalAmount,
  revenue.expectedAmount + revenue.confirmedAmount + revenue.lostAmount,
  "전체는 세 결말의 합과 어긋나지 않는다",
);
check(
  revenue.totalAmount !== revenue.confirmedAmount,
  true,
  "확정과 전체는 서로 다른 숫자다 (하나로 합치지 않는다)",
);
check(revenue.target, { year: 2026, month: 8 }, "어느 달의 합계인지 함께 돌려준다");

// 달의 첫날 00:00 과 마지막날 23:59 는 그 달이고, 그 양 옆은 아니다
const monthEdge = monthRange(2026, 8);
check(dayKey(monthEdge.start), "2026-08-01", "월 구간의 시작");
check(dayKey(monthEdge.end), "2026-09-01", "월 구간의 끝은 배타적이다");
check(
  monthRevenue(
    [opportunity({ id: "edge", expectedAmount: 100, expectedCloseDate: local(2026, 9, 1, 0, 0) })],
    { year: 2026, month: 8 },
  ).expectedCount,
  0,
  "다음 달 1일 자정은 이 달 합계가 아니다",
);
check(
  monthRevenue(
    [opportunity({ id: "edge", expectedAmount: 100, expectedCloseDate: local(2026, 8, 1, 0, 0) })],
    { year: 2026, month: 8 },
  ).expectedCount,
  1,
  "이 달 1일 자정은 이 달 합계다",
);

// 아무 기회도 없는 달 — 0 으로 채워 돌려준다 (화면이 undefined 를 만나지 않게)
const emptyRevenue = monthRevenue([], { year: 2026, month: 8 });
check(
  {
    expectedAmount: emptyRevenue.expectedAmount,
    expectedCount: emptyRevenue.expectedCount,
    confirmedAmount: emptyRevenue.confirmedAmount,
    confirmedCount: emptyRevenue.confirmedCount,
    lostAmount: emptyRevenue.lostAmount,
    lostCount: emptyRevenue.lostCount,
    totalAmount: emptyRevenue.totalAmount,
    totalCount: emptyRevenue.totalCount,
  },
  {
    expectedAmount: 0,
    expectedCount: 0,
    confirmedAmount: 0,
    confirmedCount: 0,
    lostAmount: 0,
    lostCount: 0,
    totalAmount: 0,
    totalCount: 0,
  },
  "빈 달의 합계는 모두 0",
);

console.log(`calendar: ${checks}건 검증 통과`);
