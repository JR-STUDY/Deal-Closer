/**
 * `src/lib/pagination.ts` 검증 (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:pagination
 *
 * 경계를 집중적으로 본다 — 첫 페이지 · 마지막 페이지 · 빈 결과 · 범위 초과 ·
 * 검색·필터 변경 시 page 리셋 (거래처-3 · 기회-18).
 */

import assert from "node:assert/strict";
import { LIST_PAGE_SIZE } from "../src/lib/constants";
import {
  ALL_FILTER_VALUE,
  PAGE_GAP,
  PAGE_PARAM,
  nextListSearch,
  pageHref,
  pageItems,
  pageQueryRange,
  parsePageParam,
  resolvePagination,
  type PageItem,
} from "../src/lib/pagination";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

// ────────────────────────── parsePageParam ──────────────────────────
// 주소를 손으로 고쳐도 1페이지로 안전하게 떨어져야 한다.
for (const raw of [
  undefined,
  null,
  "",
  "   ",
  "0",
  "-3",
  "abc",
  "2.5",
  "1e3",
  "1,2",
]) {
  check(parsePageParam(raw), 1, `parsePageParam(${JSON.stringify(raw)}) → 1`);
}
check(parsePageParam("1"), 1, "1페이지");
check(parsePageParam("3"), 3, "3페이지");
check(parsePageParam(" 7 "), 7, "공백은 다듬는다");
check(parsePageParam("0007"), 7, "앞자리 0 도 정수로 읽는다");
check(
  parsePageParam("99999999999999999999"),
  1,
  "안전 정수를 벗어나면 1페이지로 본다",
);

// ────────────────────── resolvePagination — 기본 경계 ──────────────────────
/**
 * 아래 경계 검증은 페이지 크기를 **명시**한다. 기본값(`LIST_PAGE_SIZE`)과 일부러 다른 값을 써서,
 * 기본값이 바뀔 때 조용히 따라 흔들리는 기대값이 남아 있지 않은지 함께 잡는다.
 */
const SIZE = 20;

// 빈 결과: 페이지는 1, 표시 범위는 0 (총 0건인데 "1–0" 이 뜨면 안 된다)
const empty = resolvePagination({
  totalCount: 0,
  requestedPage: 1,
  pageSize: SIZE,
});
check(empty.page, 1, "빈 결과: 페이지 1");
check(empty.totalPages, 1, "빈 결과: 총 페이지 1 (빈 1페이지)");
check(empty.skip, 0, "빈 결과: skip 0");
check(empty.take, SIZE, "빈 결과: take 는 페이지 크기");
check(empty.from, 0, "빈 결과: from 0");
check(empty.to, 0, "빈 결과: to 0");
check(empty.hasPrev, false, "빈 결과: 이전 없음");
check(empty.hasNext, false, "빈 결과: 다음 없음");
check(empty.isOutOfRange, false, "빈 결과에서 1페이지는 범위 초과가 아니다");

// 빈 결과인데 ?page=5 로 들어온 경우 → 1페이지로 되돌릴 근거를 세운다
const emptyDeep = resolvePagination({
  totalCount: 0,
  requestedPage: 5,
  pageSize: SIZE,
});
check(emptyDeep.page, 1, "빈 결과 + 5페이지 요청 → 1페이지");
check(emptyDeep.isOutOfRange, true, "빈 결과 + 5페이지 요청 → 범위 초과");

// 45건 / 20 = 3페이지
const first = resolvePagination({
  totalCount: 45,
  requestedPage: 1,
  pageSize: SIZE,
});
check(first.totalPages, 3, "45건 → 3페이지");
check([first.skip, first.take], [0, 20], "첫 페이지: skip·take");
check([first.from, first.to], [1, 20], "첫 페이지: 1–20");
check(first.hasPrev, false, "첫 페이지: 이전 없음");
check(first.hasNext, true, "첫 페이지: 다음 있음");

const middle = resolvePagination({
  totalCount: 45,
  requestedPage: 2,
  pageSize: SIZE,
});
check([middle.skip, middle.take], [20, 20], "중간 페이지: skip·take");
check([middle.from, middle.to], [21, 40], "중간 페이지: 21–40");
check([middle.hasPrev, middle.hasNext], [true, true], "중간 페이지: 앞뒤 있음");

const last = resolvePagination({
  totalCount: 45,
  requestedPage: 3,
  pageSize: SIZE,
});
check([last.skip, last.take], [40, 20], "마지막 페이지: skip·take");
check([last.from, last.to], [41, 45], "마지막 페이지: 41–45 (남은 5건만)");
check(last.hasPrev, true, "마지막 페이지: 이전 있음");
check(last.hasNext, false, "마지막 페이지: 다음 없음");
check(last.isOutOfRange, false, "마지막 페이지는 범위 초과가 아니다");

// 딱 나눠지는 경우 — 빈 마지막 페이지가 생기면 안 된다
const exact = resolvePagination({
  totalCount: 40,
  requestedPage: 2,
  pageSize: SIZE,
});
check(exact.totalPages, 2, "40건 → 2페이지 (3페이지가 생기지 않는다)");
check([exact.from, exact.to], [21, 40], "딱 나눠지는 마지막 페이지: 21–40");
check(exact.hasNext, false, "딱 나눠지는 마지막 페이지: 다음 없음");

// 1건
const single = resolvePagination({
  totalCount: 1,
  requestedPage: 1,
  pageSize: SIZE,
});
check(single.totalPages, 1, "1건 → 1페이지");
check([single.from, single.to], [1, 1], "1건: 1–1");

// 범위 초과 → 마지막 페이지로 클램프
const beyond = resolvePagination({
  totalCount: 45,
  requestedPage: 9,
  pageSize: SIZE,
});
check(beyond.page, 3, "범위를 넘으면 마지막 페이지로 클램프");
check(beyond.isOutOfRange, true, "범위 초과 표식");
check([beyond.from, beyond.to], [41, 45], "클램프된 페이지의 표시 범위");

// 페이지 크기 방어 — 0·음수가 와도 최소 1로 본다
check(
  resolvePagination({ totalCount: 5, requestedPage: 1, pageSize: 0 }).pageSize,
  1,
  "페이지 크기 0 → 1",
);
check(
  resolvePagination({ totalCount: 5, requestedPage: 1, pageSize: -7 }).pageSize,
  1,
  "페이지 크기 음수 → 1",
);
check(
  resolvePagination({ totalCount: -3, requestedPage: 1 }).totalCount,
  0,
  "음수 건수 → 0",
);
check(
  resolvePagination({ totalCount: 25, requestedPage: 1 }).pageSize,
  LIST_PAGE_SIZE,
  "페이지 크기를 생략하면 LIST_PAGE_SIZE 를 쓴다",
);

// 모든 페이지를 이어 붙이면 전체 건수와 정확히 맞아야 한다 (총 건수 표시 정합성)
for (const total of [0, 1, 19, 20, 21, 45, 60, 101]) {
  const pages = resolvePagination({
    totalCount: total,
    requestedPage: 1,
  }).totalPages;
  let covered = 0;
  for (let page = 1; page <= pages; page += 1) {
    const view = resolvePagination({ totalCount: total, requestedPage: page });
    covered += view.to === 0 ? 0 : view.to - view.from + 1;
  }
  check(covered, total, `${total}건: 페이지별 표시 건수 합계 = 총 건수`);
}

// ───────────────────────────── pageQueryRange ─────────────────────────────
// 건수를 모르는 채로 병렬 조회에 쓸 구간. 클램프된 결과와 어긋나면 안 된다.
check(pageQueryRange(1, SIZE), { skip: 0, take: 20 }, "1페이지 조회 구간");
check(pageQueryRange(3, SIZE), { skip: 40, take: 20 }, "3페이지 조회 구간");
check(pageQueryRange(0, SIZE), { skip: 0, take: 20 }, "0페이지는 1페이지로 본다");
check(
  pageQueryRange(2).take,
  LIST_PAGE_SIZE,
  "페이지 크기를 생략하면 LIST_PAGE_SIZE 를 쓴다",
);
for (const page of [1, 2, 3]) {
  check(
    pageQueryRange(page, SIZE),
    {
      skip: resolvePagination({
        totalCount: 45,
        requestedPage: page,
        pageSize: SIZE,
      }).skip,
      take: SIZE,
    },
    `${page}페이지: 병렬 조회 구간과 클램프 결과가 일치한다`,
  );
}

// ────────────────────────────── pageItems ──────────────────────────────
check(pageItems(1, 1), [1], "1페이지뿐이면 [1]");
check(pageItems(3, 5), [1, 2, 3, 4, 5], "칸 수 안이면 전부 보여준다");
check(pageItems(1, 7), [1, 2, 3, 4, 5, 6, 7], "딱 7페이지면 전부");
check(pageItems(1, 10), [1, 2, 3, 4, PAGE_GAP, 10], "첫 페이지: 뒤만 생략");
check(pageItems(5, 10), [1, PAGE_GAP, 4, 5, 6, PAGE_GAP, 10], "중간: 양쪽 생략");
check(pageItems(10, 10), [1, PAGE_GAP, 7, 8, 9, 10], "마지막 페이지: 앞만 생략");
check(
  pageItems(99, 10),
  [1, PAGE_GAP, 7, 8, 9, 10],
  "범위를 넘는 현재 페이지도 마지막 기준으로 그린다",
);

// 어떤 조합에서도 첫·마지막 페이지가 있고, 번호는 오름차순이며 생략이 연달아 나오지 않는다
for (const total of [1, 2, 7, 8, 12, 40]) {
  for (let page = 1; page <= total; page += 1) {
    const items = pageItems(page, total);
    const numbers = items.filter((item): item is number => item !== PAGE_GAP);
    check(
      [numbers[0], numbers[numbers.length - 1]],
      [1, total],
      `${total}페이지 중 ${page}: 첫·마지막 페이지 포함`,
    );
    check(
      numbers.every(
        (value, index) => index === 0 || value > numbers[index - 1],
      ),
      true,
      `${total}페이지 중 ${page}: 번호 오름차순·중복 없음`,
    );
    check(
      items.some(
        (item: PageItem, index) =>
          item === PAGE_GAP && items[index + 1] === PAGE_GAP,
      ),
      false,
      `${total}페이지 중 ${page}: 생략 표식이 연달아 나오지 않는다`,
    );
    check(
      items.includes(page),
      true,
      `${total}페이지 중 ${page}: 현재 페이지가 보인다`,
    );
  }
}

// ────────────────────────────── pageHref ──────────────────────────────
check(
  pageHref("/accounts", {}, 1),
  "/accounts",
  "1페이지는 파라미터를 안 붙인다",
);
check(
  pageHref("/accounts", {}, 3),
  `/accounts?${PAGE_PARAM}=3`,
  "2페이지 이상은 page 를 붙인다",
);
check(
  pageHref("/opportunities", { q: "그룹웨어", stage: "PROPOSAL" }, 2),
  `/opportunities?q=%EA%B7%B8%EB%A3%B9%EC%9B%A8%EC%96%B4&stage=PROPOSAL&${PAGE_PARAM}=2`,
  "검색·필터를 유지한다",
);
check(
  pageHref("/opportunities", { q: "  ", stage: "" }, 2),
  `/opportunities?${PAGE_PARAM}=2`,
  "빈 값은 붙이지 않는다",
);
check(
  pageHref("/accounts", { q: "테크", [PAGE_PARAM]: "9" }, 1),
  "/accounts?q=%ED%85%8C%ED%81%AC",
  "넘어온 page 는 무시하고 인자로 받은 페이지만 쓴다",
);

// ──────────────────────────── nextListSearch ────────────────────────────
// 검색·필터를 바꾸면 page 를 되돌린다 — 3페이지에 머문 채 조건을 좁히면 빈 화면이 뜬다.
check(
  nextListSearch(`q=abc&${PAGE_PARAM}=3`, { q: "가나" }),
  "q=%EA%B0%80%EB%82%98",
  "검색어를 바꾸면 page 를 지운다",
);
check(
  nextListSearch(`stage=WON&${PAGE_PARAM}=4`, { stage: ALL_FILTER_VALUE }),
  "",
  "필터를 전체로 되돌리면 파라미터와 page 를 함께 지운다",
);
check(
  nextListSearch(`q=abc&${PAGE_PARAM}=2`, { q: "" }),
  "",
  "검색어를 비우면 q·page 를 지운다",
);
check(
  nextListSearch(`q=abc&${PAGE_PARAM}=3`, { owner: "user_1" }),
  "q=abc&owner=user_1",
  "영업 담당자 필터를 걸면 page 를 지우고 검색어는 남긴다",
);
check(
  nextListSearch(`q=abc&${PAGE_PARAM}=3`, { view: "board" }),
  `q=abc&${PAGE_PARAM}=3&view=board`,
  "보기 전환은 결과 집합을 바꾸지 않으므로 page 를 유지한다",
);
check(
  nextListSearch(`q=abc&view=board&${PAGE_PARAM}=3`, { view: "" }),
  `q=abc&${PAGE_PARAM}=3`,
  "목록으로 되돌려도 page 를 유지한다",
);
check(
  nextListSearch(`q=abc&${PAGE_PARAM}=3`, { [PAGE_PARAM]: "5" }),
  `q=abc&${PAGE_PARAM}=5`,
  "page 자체를 바꾸는 것은 리셋 대상이 아니다",
);
check(
  nextListSearch(`${PAGE_PARAM}=3`, { q: "가나", view: "board" }),
  "q=%EA%B0%80%EB%82%98&view=board",
  "여러 값을 한 번에 바꿀 때 검색어가 섞여 있으면 page 를 지운다",
);
check(
  nextListSearch("", { q: "테크" }),
  "q=%ED%85%8C%ED%81%AC",
  "빈 쿼리에서 시작해도 동작한다",
);
check(
  nextListSearch(`q=abc&stage=WON&owner=u1&${PAGE_PARAM}=2`, { q: "abc" }),
  "q=abc&stage=WON&owner=u1",
  "같은 값으로 다시 눌러도 page 는 되돌린다 (판정은 키 기준)",
);

// ───────────── 페이지 크기 · 상시 노출 규칙 (기회-18 · 거래처-3 보완) ─────────────
// 한 페이지 10건이다 — 20건은 한 화면이 길어 목록이 페이지로 나뉜다는 사실 자체가 드러나지 않았다.
check(LIST_PAGE_SIZE, 10, "목록 페이지 크기는 10건");

// 시드 기준 기회 12건 → 2페이지로 갈린다 (화면 확인 기준)
const twelveFirst = resolvePagination({ totalCount: 12, requestedPage: 1 });
check(twelveFirst.totalPages, 2, "12건 → 2페이지");
check([twelveFirst.from, twelveFirst.to], [1, 10], "12건 1페이지: 1–10번째");
check(twelveFirst.hasNext, true, "12건 1페이지: 다음 있음");
const twelveSecond = resolvePagination({ totalCount: 12, requestedPage: 2 });
check([twelveSecond.from, twelveSecond.to], [11, 12], "12건 2페이지: 11–12번째");
check(twelveSecond.hasNext, false, "12건 2페이지: 다음 없음");
check(twelveSecond.hasPrev, true, "12건 2페이지: 이전 있음");

// 페이지 크기 경계 — 딱 한 페이지 / 한 건 넘김
check(
  resolvePagination({ totalCount: LIST_PAGE_SIZE, requestedPage: 1 }).totalPages,
  1,
  "10건 → 1페이지",
);
check(
  resolvePagination({ totalCount: LIST_PAGE_SIZE + 1, requestedPage: 1 })
    .totalPages,
  2,
  "11건 → 2페이지",
);

// 1페이지뿐이어도 UI 를 노출한다 → 그 상태 값이 "비활성 이전·다음" 으로 읽혀야 한다
const onlyPage = resolvePagination({ totalCount: 5, requestedPage: 1 });
check(
  [onlyPage.hasPrev, onlyPage.hasNext],
  [false, false],
  "1페이지뿐: 이전·다음이 모두 비활성",
);
check(
  pageItems(onlyPage.page, onlyPage.totalPages),
  [1],
  "1페이지뿐: 번호는 1 하나",
);
check(
  [onlyPage.from, onlyPage.to],
  [1, 5],
  "1페이지뿐: 표시 범위가 총 건수와 같다",
);

// 결과 0건 — 페이지 UI 를 감추는 기준은 `totalCount` 다 (`totalPages` 는 빈 1페이지라 1이다)
const noResult = resolvePagination({ totalCount: 0, requestedPage: 1 });
check(noResult.totalCount, 0, "0건: 총 건수 0 — 페이지 UI 를 감추는 기준");
check(noResult.totalPages, 1, "0건: 총 페이지는 여전히 1 (빈 1페이지)");

console.log(`pagination: ${checks}건 검증 통과`);
