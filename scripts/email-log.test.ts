/**
 * `src/lib/email-log.ts` 검증 (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:email-log
 *
 * 지켜야 할 것을 집중적으로 본다 —
 * ① 조직 범위(`document.orgId`)가 **어떤 조합에서도** 빠지지 않는다 ·
 * ② 모르는 필터·정렬 값이 와도 안전하게 떨어진다 ·
 * ③ 같은 컬럼을 두 번 누르면 원래대로 돌아온다 ·
 * ④ 정렬을 바꾸면 page 가 1로 되돌아가고 검색·필터는 그대로 실려 간다 ·
 * ⑤ 모든 정렬의 마지막 기준이 `{ id: "asc" }` 다 (페이지를 넘길 때 행이 겹치거나 빠지지 않게) ·
 * ⑥ 발송 실패 건은 열람을 논하지 않는다("실패" 로 판정된다) ·
 * ⑥' 화면 낱말이 **확인된 것만 주장한다** ("미열람" = 읽지 않았다고 단정하지 않는다) ·
 * ⑦ 목록 select 에 본문(body)이 들어가지 않는다.
 */

import assert from "node:assert/strict";
import {
  DEFAULT_EMAIL_LOG_SORT,
  EMAIL_LOG_DETAIL_SELECT,
  EMAIL_LOG_ROW_SELECT,
  EMAIL_LOG_SORT_KEYS,
  EMAIL_LOG_STATUSES,
  EMAIL_LOG_STATUS_LABELS,
  EMAIL_OPEN_FILTERS,
  EMAIL_OPEN_FILTER_LABELS,
  EMAIL_OPEN_HINT,
  EMAIL_OPEN_OPENED_CAVEAT,
  EMAIL_OPEN_NOT_SENT_TOOLTIP,
  EMAIL_OPEN_STATE_LABELS,
  EMAIL_OPEN_UNOPENED_TOOLTIP,
  SORT_DIR_PARAM,
  SORT_PARAM,
  emailLogOrderBy,
  emailLogSortHref,
  emailLogSortParams,
  emailLogSortStateOf,
  emailLogsWhere,
  emailNotSentTooltip,
  emailOpenState,
  emailWasDelivered,
  hasEmailLogFilter,
  isDefaultEmailLogSort,
  isEmailLogSortKey,
  isEmailLogStatus,
  isEmailOpenFilter,
  nextEmailLogSort,
  parseEmailLogFilters,
  parseEmailLogSort,
  recipientList,
  type EmailLogSort,
  type EmailLogSortKey,
} from "../src/lib/email-log";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const ORG = "org_1";
const LIST = "/mail/sent";
/** 검색·필터가 걸린 상태 (정렬을 바꿔도 그대로 실려 가야 한다) */
const FILTERED = { q: "견적", status: "SENT", opened: "unopened" };

// ────────────────────────── 상태 값 ──────────────────────────
/*
 * 세 가지다 (F-233). `SKIPPED` 는 어댑터가 전송을 건너뛴 리허설(자격증명 없음 ·
 * `MAIL_DRY_RUN`)이고, 이 값이 없으면 라우트가 결과를 모른 채 `SENT` 를 적게 된다.
 */
check(
  [...EMAIL_LOG_STATUSES],
  ["SENT", "SKIPPED", "FAILED"],
  "발송 상태는 성공·건너뜀·실패 세 가지다",
);
check(
  EMAIL_LOG_STATUS_LABELS,
  { SENT: "성공", SKIPPED: "건너뜀", FAILED: "실패" },
  "상태 라벨은 성공·건너뜀·실패다",
);
for (const value of EMAIL_LOG_STATUSES) {
  check(isEmailLogStatus(value), true, `"${value}" 는 발송 상태다`);
}
for (const value of ["sent", "DRAFT", "VOID", "", "OPENED"]) {
  check(isEmailLogStatus(value), false, `"${value}" 는 발송 상태가 아니다`);
}
// 나간 것은 SENT 하나뿐이다 — 모르는 값은 "나가지 않았다" 로 떨어뜨린다 (덜 주장한다)
check(emailWasDelivered("SENT"), true, "SENT 만 실제로 나간 상태다");
for (const value of ["SKIPPED", "FAILED", "PENDING", ""]) {
  check(emailWasDelivered(value), false, `"${value}" 는 나간 상태가 아니다`);
}

// ────────────────────────── 열람 판정 ──────────────────────────
const OPENED_AT = new Date("2026-08-01T10:00:00+09:00");
check(
  emailOpenState({ status: "SENT", openedAt: OPENED_AT }),
  "opened",
  "성공 + 열람 시각 있음 → 열람",
);
check(
  emailOpenState({ status: "SENT", openedAt: null }),
  "unopened",
  "성공 + 열람 시각 없음 → 미열람",
);
// 나가지 않은 메일의 "미열람" 은 "보냈는데 아직 안 봤다" 로 읽힌다 — 따로 판정한다
check(
  emailOpenState({ status: "FAILED", openedAt: null }),
  "not-sent",
  "실패한 건은 미열람이 아니라 '나가지 않음' 이다",
);
check(
  emailOpenState({ status: "FAILED", openedAt: OPENED_AT }),
  "not-sent",
  "실패한 건은 열람 시각이 남아 있어도 나가지 않은 것으로 본다",
);
// 건너뛴 건도 나가지 않았다 — 예전에는 FAILED 만 걸러서 이 건이 "기록 없음" 으로 보였다
check(
  emailOpenState({ status: "SKIPPED", openedAt: null }),
  "not-sent",
  "건너뛴 건은 '기록 없음' 이 아니라 '나가지 않음' 이다",
);
// 툴팁은 **왜** 확인할 수 없는지 상태별로 다르게 말한다 (지어내지 않는다)
check(
  emailNotSentTooltip("FAILED").includes("실패"),
  true,
  "실패 툴팁이 실패했다고 밝힌다",
);
check(
  emailNotSentTooltip("SKIPPED").includes("보내지 않아"),
  true,
  "건너뜀 툴팁이 보내지 않았다고 밝힌다",
);
check(
  emailNotSentTooltip("WHATEVER"),
  EMAIL_OPEN_NOT_SENT_TOOLTIP,
  "모르는 상태는 뭉뚱그린 문장으로 떨어진다",
);

// ────────────────────────── 수신자 목록 ──────────────────────────
check(
  recipientList("a@x.com; b@y.com"),
  ["a@x.com", "b@y.com"],
  "세미콜론 구분 규약대로 자른다",
);
check(
  recipientList("  a@x.com ;; ; b@y.com ; "),
  ["a@x.com", "b@y.com"],
  "빈 토큰·앞뒤 공백은 버린다",
);
check(recipientList(""), [], "빈 문자열은 빈 목록이다");
// 표시는 검증이 아니다 — 형식이 이상한 값도 버리지 않고 그대로 보여준다
check(
  recipientList("깨진주소; b@y.com"),
  ["깨진주소", "b@y.com"],
  "형식이 틀린 값도 버리지 않는다",
);

// ────────────────────────── 필터 파싱 ──────────────────────────
check(
  parseEmailLogFilters({}),
  { query: "", status: null, opened: null },
  "파라미터가 없으면 필터 없음",
);
check(
  parseEmailLogFilters({ q: "  견적  ", status: " FAILED ", opened: " opened " }),
  { query: "견적", status: "FAILED", opened: "opened" },
  "앞뒤 공백을 털고 받는다",
);
check(
  parseEmailLogFilters({ status: "sent", opened: "READ" }),
  { query: "", status: null, opened: null },
  "모르는 값은 필터 해제로 떨어진다 (빈 화면이 아니라 전체 목록)",
);
for (const value of EMAIL_OPEN_FILTERS) {
  check(isEmailOpenFilter(value), true, `"${value}" 는 열람 필터다`);
}
check(isEmailOpenFilter("all"), false, `"all" 은 열람 필터가 아니다`);

check(hasEmailLogFilter(parseEmailLogFilters({})), false, "필터 없음");
for (const params of [
  { q: "가" },
  { status: "SENT" },
  { opened: "opened" },
] as const) {
  check(
    hasEmailLogFilter(parseEmailLogFilters(params)),
    true,
    `${JSON.stringify(params)} 는 필터가 걸린 상태다`,
  );
}
// 모르는 값만 들어온 경우는 "필터 없음" 이어야 한다 (빈 목록 안내 문구가 갈린다)
check(
  hasEmailLogFilter(parseEmailLogFilters({ status: "??" })),
  false,
  "모르는 필터 값은 걸린 것으로 세지 않는다",
);

// ────────────────────────── where 조건 ──────────────────────────
// 조직 범위는 EmailLog 에 orgId 가 없어 **문서를 경유**한다. 어떤 조합에서도 빠지지 않아야 한다.
check(
  emailLogsWhere(ORG, parseEmailLogFilters({})),
  { document: { orgId: ORG } },
  "필터가 없어도 조직 범위는 걸린다",
);
check(
  emailLogsWhere(ORG, parseEmailLogFilters({ status: "FAILED" })),
  { document: { orgId: ORG }, status: "FAILED" },
  "상태 필터",
);
check(
  emailLogsWhere(ORG, parseEmailLogFilters({ opened: "opened" })),
  { document: { orgId: ORG }, openedAt: { not: null } },
  "열람 필터 — 열람 시각이 있는 건",
);
/*
 * `열람 기록 없음` 은 **나갔는데 기록이 없는 건**이다. 발송 성공까지 함께 걸지 않으면
 * 실패·건너뜀 건도 걸려 나오는데, 그 행들은 목록에서 `—` 로 그려진다 —
 * 고른 낱말과 화면에 뜨는 행이 어긋난다.
 */
check(
  emailLogsWhere(ORG, parseEmailLogFilters({ opened: "unopened" })),
  { document: { orgId: ORG }, openedAt: null, AND: [{ status: "SENT" }] },
  "열람 기록 없음 필터 — 나갔는데 열람 시각이 없는 건",
);
{
  // 상태 필터를 **덮어쓰지 않는다** — 덮으면 고르지도 않은 성공 건이 목록에 뜬다
  const where = emailLogsWhere(
    ORG,
    parseEmailLogFilters({ status: "FAILED", opened: "unopened" }),
  );
  check(where.status, "FAILED", "고른 상태 필터가 그대로 남는다");
  check(where.AND, [{ status: "SENT" }], "열람 조건은 AND 로 얹힌다 (모순이면 0건)");
}
check(
  emailLogsWhere(ORG, parseEmailLogFilters({ q: "견적" })),
  {
    document: { orgId: ORG },
    OR: [
      { recipients: { contains: "견적" } },
      { subject: { contains: "견적" } },
      { document: { title: { contains: "견적" } } },
    ],
  },
  "검색은 수신자·제목·문서 제목 세 곳을 본다",
);
{
  // 검색어가 관계(document) 조건을 OR 안에 넣더라도 상위 조직 범위는 그대로 남아야 한다
  const where = emailLogsWhere(ORG, parseEmailLogFilters(FILTERED));
  check(where.document, { orgId: ORG }, "검색+필터 조합에서도 조직 범위 유지");
  check(where.status, "SENT", "검색+필터 조합의 상태 조건");
  check(where.openedAt, null, "검색+필터 조합의 열람 조건");
  check(Array.isArray(where.OR), true, "검색+필터 조합의 검색 조건");
}

// ────────────────────────── 정렬 키 ──────────────────────────
check(
  [...EMAIL_LOG_SORT_KEYS],
  ["sentAt", "document", "subject"],
  "정렬 가능한 컬럼은 세 개다",
);
// 상태·열람·받는 사람은 필터·검색이 맡는다 (값이 두세 가지뿐이거나 다중 값이다)
for (const key of ["status", "opened", "openedAt", "recipients", ""]) {
  check(isEmailLogSortKey(key), false, `"${key}" 는 정렬 키가 아니다`);
}
for (const key of EMAIL_LOG_SORT_KEYS) {
  check(isEmailLogSortKey(key), true, `"${key}" 는 정렬 키다`);
}

// ────────────────────────── 정렬 파싱 ──────────────────────────
check(
  DEFAULT_EMAIL_LOG_SORT,
  { key: "sentAt", direction: "desc" },
  "기본 정렬: 보낸 날짜 내림차순",
);
for (const params of [{}, { sort: "openedAt" }, { sort: "", dir: "asc" }]) {
  check(
    parseEmailLogSort(params),
    DEFAULT_EMAIL_LOG_SORT,
    `${JSON.stringify(params)} 는 기본 정렬로 떨어진다`,
  );
}
check(
  parseEmailLogSort({ sort: "subject", dir: "DESC" }),
  { key: "subject", direction: "desc" },
  "방향은 대소문자를 가리지 않는다",
);
check(
  parseEmailLogSort({ sort: "document", dir: "이상한값" }),
  { key: "document", direction: "asc" },
  "방향만 이상하면 그 컬럼의 기본 방향으로 본다",
);

// ────────────────────────── 머리글 전이 ──────────────────────────
for (const key of EMAIL_LOG_SORT_KEYS) {
  const once = nextEmailLogSort(DEFAULT_EMAIL_LOG_SORT, key);
  const twice = nextEmailLogSort(once, key);
  const thrice = nextEmailLogSort(twice, key);
  check(
    thrice,
    once,
    `"${key}" 를 두 번 더 누르면 원래 방향으로 돌아온다 (${key})`,
  );
  check(
    once.direction !== twice.direction,
    true,
    `"${key}" 를 다시 누르면 방향이 뒤집힌다`,
  );
}
check(
  nextEmailLogSort({ key: "sentAt", direction: "asc" }, "subject"),
  { key: "subject", direction: "asc" },
  "다른 컬럼으로 옮기면 그 컬럼의 기본 방향으로 간다",
);

// ────────────────────────── 정렬 상태 → 주소 ──────────────────────────
check(isDefaultEmailLogSort(DEFAULT_EMAIL_LOG_SORT), true, "기본 정렬 판정");
check(
  isDefaultEmailLogSort({ key: "sentAt", direction: "asc" }),
  false,
  "방향이 다르면 기본 정렬이 아니다",
);
check(
  emailLogSortParams(DEFAULT_EMAIL_LOG_SORT),
  { [SORT_PARAM]: "", [SORT_DIR_PARAM]: "" },
  "기본 정렬은 주소에 남지 않는다 (빈 값 = 파라미터 삭제)",
);
check(
  emailLogSortParams({ key: "subject", direction: "asc" }),
  { [SORT_PARAM]: "subject", [SORT_DIR_PARAM]: "asc" },
  "기본이 아니면 주소에 싣는다",
);

// 기본 정렬로 돌아가면 sort·dir 이 주소에서 사라진다
check(
  emailLogSortHref(LIST, { page: "3" }, DEFAULT_EMAIL_LOG_SORT),
  LIST,
  "기본 정렬 + 3쪽 → 파라미터가 모두 사라진다 (page 는 1로 리셋)",
);
{
  // 정렬을 바꾸면 page 를 1로 되돌리고, 검색·필터는 그대로 실려 간다
  const href = emailLogSortHref(
    LIST,
    { ...FILTERED, page: "3" },
    { key: "subject", direction: "desc" },
  );
  const url = new URL(href, "http://x");
  check(url.pathname, LIST, "경로는 그대로다");
  check(url.searchParams.get("page"), null, "정렬을 바꾸면 page 가 사라진다");
  check(url.searchParams.get("q"), "견적", "검색어는 유지된다");
  check(url.searchParams.get("status"), "SENT", "상태 필터는 유지된다");
  check(url.searchParams.get("opened"), "unopened", "열람 필터는 유지된다");
  check(url.searchParams.get(SORT_PARAM), "subject", "새 정렬 키");
  check(url.searchParams.get(SORT_DIR_PARAM), "desc", "새 정렬 방향");
}

// aria-sort 는 지금 정렬 중인 컬럼만 방향을 알린다 (ACC_*)
{
  const sort: EmailLogSort = { key: "document", direction: "asc" };
  check(emailLogSortStateOf(sort, "document"), "asc", "정렬 중인 컬럼");
  for (const key of ["sentAt", "subject"] as EmailLogSortKey[]) {
    check(emailLogSortStateOf(sort, key), "none", `"${key}" 는 정렬 중이 아니다`);
  }
}

// ────────────────────────── orderBy ──────────────────────────
check(
  emailLogOrderBy(DEFAULT_EMAIL_LOG_SORT),
  [{ sentAt: "desc" }, { id: "asc" }],
  "기본 정렬은 보낸 날짜 + 안정화 기준만",
);
check(
  emailLogOrderBy({ key: "subject", direction: "asc" }),
  [{ subject: "asc" }, { sentAt: "desc" }, { id: "asc" }],
  "제목 정렬 뒤에는 최근 발송이 온다",
);
check(
  emailLogOrderBy({ key: "document", direction: "desc" }),
  [{ document: { title: "desc" } }, { sentAt: "desc" }, { id: "asc" }],
  "문서 정렬은 관계 컬럼(document.title)을 본다",
);
// 마지막 기준은 언제나 { id: "asc" } — 없으면 페이지를 넘길 때 행이 겹치거나 빠진다
for (const key of EMAIL_LOG_SORT_KEYS) {
  for (const direction of ["asc", "desc"] as const) {
    const order = emailLogOrderBy({ key, direction });
    check(
      order[order.length - 1],
      { id: "asc" },
      `${key}/${direction} 정렬의 마지막 기준은 id 오름차순이다`,
    );
  }
}

// ────────────────────────── select ──────────────────────────
// 목록은 본문을 읽지 않는다 (한 페이지 10건이면 본문만으로 조회량이 통째로 늘어난다)
check("body" in EMAIL_LOG_ROW_SELECT, false, "목록 select 에는 body 가 없다");
check(
  "body" in EMAIL_LOG_DETAIL_SELECT,
  true,
  "상세 select 에는 body 가 있다",
);
// 목록에서 문서·기회로 갈 수 있어야 한다
check(
  EMAIL_LOG_ROW_SELECT.document.select.opportunity.select,
  { id: true, name: true },
  "문서에 연결된 기회도 함께 읽는다 (목록에서 기회로 이동)",
);
for (const field of [
  "id",
  "subject",
  "recipients",
  "status",
  "sentAt",
  "openedAt",
  "openCount",
] as const) {
  check(
    EMAIL_LOG_ROW_SELECT[field],
    true,
    `목록 select 에 ${field} 가 들어 있다`,
  );
}

// ────────────────────── 낱말: 확인된 것만 주장한다 ──────────────────────
/*
 * 오픈 트래킹은 원리적으로 부정확하다 — 이미지 차단으로 거짓 음성, 프리페치·프록시로
 * 거짓 양성이 모두 생긴다. 그래서 화면은 "열람 여부"·"미열람" 이라고 쓰지 않는다.
 * 문구가 되돌아가면 이 검사가 잡는다.
 */
check(
  EMAIL_OPEN_STATE_LABELS.opened,
  "열람 확인",
  "기록이 있으면 '열람 확인' 이다",
);
check(
  EMAIL_OPEN_STATE_LABELS.unopened,
  "기록 없음",
  "기록이 없으면 '기록 없음' 이다 — '미열람' 은 읽지 않았다는 단정이다",
);
for (const [key, label] of Object.entries({
  ...EMAIL_OPEN_STATE_LABELS,
  ...EMAIL_OPEN_FILTER_LABELS,
})) {
  check(
    label.includes("미열람"),
    false,
    `'미열람' 을 쓰지 않는다 (${key}: ${label})`,
  );
}
check(
  EMAIL_OPEN_FILTERS.every((value) => Boolean(EMAIL_OPEN_FILTER_LABELS[value])),
  true,
  "모든 열람 필터에 라벨이 있다",
);
// 안내는 **양방향 부정확**을 모두 말한다 (한쪽만 적으면 반대쪽을 사실로 믿는다)
check(
  EMAIL_OPEN_HINT.includes("차단"),
  true,
  "안내가 거짓 음성(이미지 차단)을 밝힌다",
);
check(
  EMAIL_OPEN_HINT.includes("미리 불러오"),
  true,
  "안내가 거짓 양성(프리페치·프록시)을 밝힌다",
);
check(
  EMAIL_OPEN_UNOPENED_TOOLTIP.includes("읽지 않았다는 뜻은 아닙니다"),
  true,
  "기록 없음 툴팁이 '읽지 않았다' 로 단정하지 않는다고 밝힌다",
);
check(
  EMAIL_OPEN_OPENED_CAVEAT.includes("미리 불러온"),
  true,
  "열람 기록 툴팁도 프리페치 가능성을 함께 적는다",
);

console.log(`email-log: ${checks} checks passed`);
