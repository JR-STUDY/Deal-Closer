/**
 * 메일 발송 이력(EmailLog) 목록 — 조회 조건·정렬·표시 판정 **순수 함수** (F-234 · 메일-1).
 *
 * 열람에 관해서는 **"무엇으로 보여줄 것인가"** 만 다룬다(표시 상태·라벨·안내 문구).
 * "어떻게 기록되는가"(추적 픽셀 주소·태그·최초 열람 규칙)는 `@/lib/email-tracking` 이며,
 * 판정을 두 모듈에 나눠 두지 않는다 — 목록과 상세가 서로 다른 말을 하기 시작한다.
 *
 * `src/lib/opportunity.ts`(목록 조회 조건) + `src/lib/opportunity-sort.ts`(정렬)와 같은 설계다 —
 * 검색·필터·정렬 상태는 **URL 쿼리(`?q=&status=&opened=&sort=&dir=&page=`)** 로만 주고받고,
 * 서버 컴포넌트가 그 값을 그대로 Prisma 조건으로 바꿔 쓴다. 새로고침·뒤로가기·주소 공유에서
 * 같은 화면이 나오고, 페이지네이션(`@/lib/pagination`)과 자연히 함께 보존된다.
 *
 * DB 에 접근하지 않고 `server-only` 도 import 하지 않으므로 서버 컴포넌트·클라이언트 툴바·
 * `scripts/email-log.test.ts` 어디서든 쓴다. Prisma 타입은 `import type` 으로만 참조한다.
 *
 * **조직 범위는 문서를 경유한다.** `EmailLog` 에는 `orgId` 컬럼이 없고 `documentId` 만 있으므로
 * (스키마 참고) 인가 조건을 `{ document: { orgId } }` 관계 필터로 건다 — 지금은 데모 조직이
 * 하나라 노출이 없지만, 인증이 붙는 순간 남의 조직 발송 이력(수신자 주소·본문)이 그대로
 * 보이게 된다. 그래서 조건을 **화면이 아니라 이 함수 한 곳**에 둔다
 * (`findFirst({ where: { id, orgId } })` 규칙과 같은 이유).
 */

import type { Prisma } from "@/generated/prisma/client";
import { pageHref } from "./pagination";
import {
  SORT_DIR_PARAM,
  SORT_PARAM,
  type SortDirection,
  type SortState,
} from "./opportunity-sort";

/*
 * 정렬 쿼리 키(`sort`·`dir`)와 방향 타입은 기회 목록과 **같은 것을 쓴다**.
 * 목록마다 키를 새로 정하면 `?sort=` 의 뜻이 화면마다 달라지고, 표 머리글 공용 컴포넌트
 * (`@/components/list-sort-header`)가 기대하는 `SortState` 도 갈라진다.
 */
export { SORT_DIR_PARAM, SORT_PARAM };
export type { SortDirection, SortState };

// ────────────────────────── 발송 상태 ──────────────────────────

/**
 * `EmailLog.status` 에 저장되는 값 (SQLite 는 enum 이 없어 String 이다).
 * 발송 라우트(`POST /api/documents/:id/send`)가 성공 시 `SENT` 를 쓴다.
 *
 * **`@/lib/constants` 가 아니라 여기 둔다** — 이 값을 읽는 곳이 발송 이력 화면과 이 모듈뿐이고,
 * 문서 상태(`DOCUMENT_STATUSES`)의 `SENT` 와 이름이 겹쳐 같은 파일에 나란히 두면 어느 쪽
 * `SENT` 인지 부르는 곳에서 알 수 없다.
 */
export const EMAIL_LOG_STATUSES = ["SENT", "FAILED"] as const;
export type EmailLogStatus = (typeof EMAIL_LOG_STATUSES)[number];

/** 목록·상세에 그대로 쓰는 라벨 (정책 COPY-TONE) */
export const EMAIL_LOG_STATUS_LABELS: Record<EmailLogStatus, string> = {
  SENT: "성공",
  FAILED: "실패",
};

/** DB 의 `status` 는 String 이라 읽어온 값을 좁힐 때 쓴다 */
export function isEmailLogStatus(value: string): value is EmailLogStatus {
  return (EMAIL_LOG_STATUSES as readonly string[]).includes(value);
}

// ────────────────────────── 열람 상태 ──────────────────────────

/**
 * 한 건을 화면에 어떻게 적을지 정하는 **표시 상태**.
 *
 * 발송이 실패한 건에는 열람 여부를 적지 않는다(`failed`) — 나가지 않은 메일의 "미열람" 은
 * 사실이지만 오해를 부른다("보냈는데 아직 안 봤다" 로 읽힌다). 세 상태를 순수 함수로 뽑아
 * 목록·상세가 같은 판정을 쓰게 한다.
 */
export const EMAIL_OPEN_STATES = ["failed", "opened", "unopened"] as const;
export type EmailOpenState = (typeof EMAIL_OPEN_STATES)[number];

export function emailOpenState(log: {
  status: string;
  openedAt: Date | null;
}): EmailOpenState {
  if (log.status === "FAILED") return "failed";
  return log.openedAt ? "opened" : "unopened";
}

/*
 * ── 낱말: "열람 여부" 가 아니라 "열람 확인" 이다 ──
 *
 * 오픈 트래킹은 **원리적으로 부정확하다.** 기록은 수신자의 메일 앱이 본문의 1×1 추적
 * 이미지를 불러왔을 때만 남는다.
 *   - 거짓 음성: 대부분의 메일 앱이 이미지를 기본으로 차단한다 → **읽었는데 기록이 없다.**
 *   - 거짓 양성: 메일 앱·보안 프록시가 이미지를 미리 불러온다(Gmail 이미지 프록시) →
 *     **열어보지 않았는데 열람으로 잡힌다.**
 *
 * 그래서 화면은 **확인된 것만 주장한다** — 기록이 있으면 "열람 확인", 없으면 "기록 없음"
 * 이다. `미열람`(=읽지 않았다)이라고 적으면 우리가 알 수 없는 사실을 단정하는 것이고,
 * 담당자는 그 단정을 근거로 고객에게 다시 연락한다. 이 프로젝트가 금액에 대해 지키는
 * 태도("틀린 말을 하는 것이 아무 말도 하지 않는 것보다 나쁘다")와 같은 규칙이다.
 *
 * 라벨·안내 문구를 **여기 한 곳**에 둔다 — 목록 머리글·셀 툴팁·상세 필드·툴바 필터가
 * 같은 낱말을 써야 한다(툴바는 클라이언트 컴포넌트이므로 상수를 그쪽에 두지 않는다 —
 * AGENTS.md "서버가 읽는 상수는 use client 파일에서 export 하지 않는다").
 */

/** 목록 머리글·상세 필드 이름 */
export const EMAIL_OPEN_COLUMN_LABEL = "열람 확인";

/** 셀에 적는 낱말 (실패 건은 열람을 논하지 않는다) */
export const EMAIL_OPEN_STATE_LABELS: Record<EmailOpenState, string> = {
  failed: "—",
  opened: "열람 확인",
  unopened: "기록 없음",
};

/**
 * ⓘ 안내 — 무엇을 근거로 적는지, 왜 부정확한지 (정책 COPY-TONE).
 *
 * **마지막 문장은 실제 전송(F-233)이 붙는 날 지운다** — 그때부터는 픽셀이 함께 나가므로
 * 사실이 아니게 된다. 앞의 두 문장(양방향 부정확)은 그때도 그대로 남는다.
 */
export const EMAIL_OPEN_HINT =
  "열람은 수신자의 메일 앱이 본문의 추적 이미지를 불러올 때만 기록됩니다. " +
  "그래서 확인된 열람만 사실로 볼 수 있습니다 — 이미지를 차단하면 읽어도 기록이 남지 " +
  "않고(대부분의 메일 앱이 기본으로 차단합니다), 반대로 메일 앱·보안 프록시가 이미지를 " +
  "미리 불러오면 열어보지 않아도 열람으로 잡힙니다. " +
  "또한 실제 메일 전송이 연동되기 전까지는 추적 이미지가 함께 나가지 않아 기록이 쌓이지 않습니다.";

/** 열람 기록이 없는 칸의 툴팁 — "읽지 않았다" 로 단정하지 않는다 */
export const EMAIL_OPEN_UNOPENED_TOOLTIP =
  "열람 기록이 없습니다. 읽지 않았다는 뜻은 아닙니다 — 수신자의 메일 앱이 이미지를 " +
  "차단하면 읽어도 기록이 남지 않습니다.";

/** 열람 기록이 있는 칸의 툴팁에 덧붙이는 단서 — 거짓 양성을 숨기지 않는다 */
export const EMAIL_OPEN_OPENED_CAVEAT =
  "메일 앱이 이미지를 미리 불러온 기록일 수도 있습니다.";

/** 발송이 실패한 칸의 툴팁 */
export const EMAIL_OPEN_FAILED_TOOLTIP =
  "발송이 실패해 열람을 확인할 수 없습니다.";

// ────────────────────────── 수신자 ──────────────────────────

/**
 * 저장된 수신자 문자열 → 주소 목록.
 *
 * `EmailLog.recipients` 는 **세미콜론(`;`) 구분** 규약이다(스키마 주석 · 발송 라우트가
 * `valid.join("; ")` 로 만든다). 여기서는 그 규약만 되짚어 자르고 **형식 검증은 하지 않는다** —
 * `@/lib/validation` 의 `parseRecipients` 는 입력을 걸러내는 함수라 형식이 틀린 토큰을
 * 버리는데, 이미 저장된 값을 보여줄 때 버리면 무엇이 잘못 나갔는지 화면에서 확인할 수 없다.
 */
export function recipientList(recipients: string): string[] {
  return recipients
    .split(";")
    .map((one) => one.trim())
    .filter(Boolean);
}

// ────────────────────────── 검색·필터 ──────────────────────────

/** 열람 확인 필터 — 정렬 대상이 아니라 걸러내는 조건이다 (아래 정렬 주석 참고) */
export const EMAIL_OPEN_FILTERS = ["opened", "unopened"] as const;
export type EmailOpenFilter = (typeof EMAIL_OPEN_FILTERS)[number];

/**
 * 필터 라벨 — 표시 라벨과 같은 낱말을 쓴다.
 * `unopened` 를 "미열람" 이라고 적지 않는다 — 걸러내는 것은 **기록이 없는 건**이고,
 * 그것이 곧 읽지 않은 건은 아니다 (위 낱말 주석 참고).
 */
export const EMAIL_OPEN_FILTER_LABELS: Record<EmailOpenFilter, string> = {
  opened: "열람 확인됨",
  unopened: "열람 기록 없음",
};

export function isEmailOpenFilter(value: string): value is EmailOpenFilter {
  return (EMAIL_OPEN_FILTERS as readonly string[]).includes(value);
}

/** 쿼리 키 — 툴바(클라이언트)와 페이지(서버)가 같은 이름을 쓰도록 상수로 둔다 */
export const EMAIL_LOG_QUERY_PARAM = "q";
export const EMAIL_LOG_STATUS_PARAM = "status";
export const EMAIL_LOG_OPENED_PARAM = "opened";

export type EmailLogFilters = {
  /** 수신자·제목·문서 제목 부분 일치 검색어 (빈 문자열 = 검색 안 함) */
  query: string;
  status: EmailLogStatus | null;
  opened: EmailOpenFilter | null;
};

/**
 * URL 쿼리 → 필터.
 * 모르는 값은 **필터 해제**로 떨어뜨린다 — 주소를 손으로 고치거나 오래된 링크를 열어도
 * 빈 화면이 아니라 전체 목록이 나온다 (`parseOpportunityFilters` 와 같은 규칙).
 */
export function parseEmailLogFilters(params: {
  q?: string | null;
  status?: string | null;
  opened?: string | null;
}): EmailLogFilters {
  const status = params.status?.trim() ?? "";
  const opened = params.opened?.trim() ?? "";
  return {
    query: params.q?.trim() ?? "",
    status: isEmailLogStatus(status) ? status : null,
    opened: isEmailOpenFilter(opened) ? opened : null,
  };
}

/** 필터가 하나라도 걸려 있는지 (빈 목록 안내 문구 분기용) */
export function hasEmailLogFilter(filters: EmailLogFilters): boolean {
  return Boolean(filters.query || filters.status || filters.opened);
}

/**
 * 목록·건수 조회의 Prisma where 조건.
 *
 * 조직 범위(`document.orgId`)는 **항상** 걸린다. 검색어는 수신자·제목·문서 제목 부분 일치이며
 * (SQLite 의 LIKE 는 ASCII 대소문자를 구분하지 않으므로 `contains` 만으로 충분하다),
 * 관계 조건이 OR 안에 들어가도 상위 `document: { orgId }` 와 AND 로 묶이므로 범위는 유지된다.
 */
export function emailLogsWhere(
  orgId: string,
  filters: EmailLogFilters,
): Prisma.EmailLogWhereInput {
  const where: Prisma.EmailLogWhereInput = { document: { orgId } };
  if (filters.status) where.status = filters.status;
  // 열람 시각의 유무가 곧 "확인된 열람" 이다 (`openCount` 는 몇 번 불렸는지일 뿐이다)
  if (filters.opened === "opened") where.openedAt = { not: null };
  if (filters.opened === "unopened") where.openedAt = null;
  if (filters.query) {
    where.OR = [
      { recipients: { contains: filters.query } },
      { subject: { contains: filters.query } },
      { document: { title: { contains: filters.query } } },
    ];
  }
  return where;
}

// ────────────────────────── 정렬 ──────────────────────────

/**
 * 정렬할 수 있는 컬럼.
 *
 * **자연스러운 순서가 있는 값만 연다** (기회 목록과 같은 기준).
 * - `상태`·`열람 확인` 은 값이 두세 가지뿐이라 정렬해도 "성공 뭉치 / 실패 뭉치" 가 되고,
 *   보려던 것(실패한 건만)은 **필터가 더 정확히** 해결한다 — 그래서 툴바 필터로 두었다.
 * - `받는 사람` 은 세미콜론으로 이어 붙인 다중 값이라 첫 주소로만 서고, 특정 수신자를 찾는
 *   목적은 검색어가 맡는다.
 */
export const EMAIL_LOG_SORT_KEYS = ["sentAt", "document", "subject"] as const;
export type EmailLogSortKey = (typeof EMAIL_LOG_SORT_KEYS)[number];
export type EmailLogSort = { key: EmailLogSortKey; direction: SortDirection };

/**
 * 기본 정렬 — **보낸 날짜 내림차순**. 방금 보낸 메일이 위로 온다
 * (발송 이력을 여는 이유가 대개 "직전에 보낸 것" 확인이다).
 */
export const DEFAULT_EMAIL_LOG_SORT: EmailLogSort = {
  key: "sentAt",
  direction: "desc",
};

/** 그 컬럼을 **처음 눌렀을 때**의 방향 — 날짜는 최근 것 먼저, 글자는 가나다순 */
const FIRST_DIRECTION: Record<EmailLogSortKey, SortDirection> = {
  sentAt: "desc",
  document: "asc",
  subject: "asc",
};

export function isEmailLogSortKey(value: string): value is EmailLogSortKey {
  return (EMAIL_LOG_SORT_KEYS as readonly string[]).includes(value);
}

/** URL 쿼리(`?sort=&dir=`) → 정렬 상태. 모르는 키는 기본 정렬로 떨어진다. */
export function parseEmailLogSort(params: {
  sort?: string | null;
  dir?: string | null;
}): EmailLogSort {
  const key = params.sort?.trim() ?? "";
  if (!isEmailLogSortKey(key)) return DEFAULT_EMAIL_LOG_SORT;

  const dir = params.dir?.trim().toLowerCase() ?? "";
  const direction: SortDirection =
    dir === "asc" || dir === "desc" ? dir : FIRST_DIRECTION[key];
  return { key, direction };
}

/**
 * 머리글을 눌렀을 때의 다음 정렬 상태.
 * 같은 컬럼을 다시 누르면 방향만 뒤집어 **두 번 눌러 원래대로** 돌아올 수 있게 한다.
 */
export function nextEmailLogSort(
  current: EmailLogSort,
  key: EmailLogSortKey,
): EmailLogSort {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: FIRST_DIRECTION[key] };
}

export function isDefaultEmailLogSort(sort: EmailLogSort): boolean {
  return (
    sort.key === DEFAULT_EMAIL_LOG_SORT.key &&
    sort.direction === DEFAULT_EMAIL_LOG_SORT.direction
  );
}

/** 정렬 상태 → URL 파라미터. **기본 정렬이면 빈 값**이라 주소에 남지 않는다. */
export function emailLogSortParams(
  sort: EmailLogSort,
): Record<string, string> {
  if (isDefaultEmailLogSort(sort)) {
    return { [SORT_PARAM]: "", [SORT_DIR_PARAM]: "" };
  }
  return { [SORT_PARAM]: sort.key, [SORT_DIR_PARAM]: sort.direction };
}

/**
 * 머리글 링크의 주소 — 검색·필터는 그대로 두고 정렬만 바꾸며 **page 를 1로 되돌린다**
 * (`pageHref(..., 1)` 이 page 파라미터를 지운다). 3쪽에 머문 채 정렬만 바꾸면 보고 있던
 * 행과 무관한 구간이 뜬다.
 */
export function emailLogSortHref(
  basePath: string,
  query: Readonly<Record<string, string>>,
  sort: EmailLogSort,
): string {
  return pageHref(basePath, { ...query, ...emailLogSortParams(sort) }, 1);
}

/** `aria-sort` 에 넣을 값 — 지금 정렬 중인 컬럼만 방향을 알린다 (정책 ACC_*) */
export function emailLogSortStateOf(
  sort: EmailLogSort,
  key: EmailLogSortKey,
): SortState {
  return sort.key === key ? sort.direction : "none";
}

/**
 * 정렬 상태 → Prisma `orderBy`.
 *
 * 마지막에 `{ id: "asc" }` 를 붙인다 — 같은 값이 여러 행이면 DB 가 순서를 보장하지 않아
 * 페이지를 넘길 때 같은 행이 두 번 나오거나 빠진다. 보낸 날짜가 기준이 아닐 때는
 * 보낸 날짜 내림차순을 그 앞에 얹어 같은 문서·같은 제목 안에서 최근 발송이 위로 오게 한다.
 */
export function emailLogOrderBy(
  sort: EmailLogSort,
): Prisma.EmailLogOrderByWithRelationInput[] {
  const { direction } = sort;
  const primary: Prisma.EmailLogOrderByWithRelationInput =
    sort.key === "sentAt"
      ? { sentAt: direction }
      : sort.key === "subject"
        ? { subject: direction }
        : { document: { title: direction } };

  return [
    primary,
    // 보낸 날짜 자체가 기준이면 같은 값을 다시 얹을 이유가 없다
    ...(sort.key === "sentAt"
      ? []
      : [{ sentAt: "desc" } as Prisma.EmailLogOrderByWithRelationInput]),
    { id: "asc" },
  ];
}

// ────────────────────────── select ──────────────────────────

/**
 * 목록 한 행에 필요한 최소 필드.
 *
 * **본문(`body`)은 넣지 않는다** — 목록에 보이지 않는 값이고, 메일 본문은 서명·인용까지 붙어
 * 길어질 수 있어 한 페이지(10건)만 해도 조회량이 통째로 늘어난다. 본문은 상세에서만 읽는다.
 * 문서에 연결된 기회는 목록에서 바로 갈 수 있도록 함께 읽는다 (있으면 링크가 하나 더 생긴다).
 */
export const EMAIL_LOG_ROW_SELECT = {
  id: true,
  subject: true,
  recipients: true,
  attachmentName: true,
  status: true,
  sentAt: true,
  openedAt: true,
  openCount: true,
  document: {
    select: {
      id: true,
      title: true,
      type: true,
      opportunityId: true,
      opportunity: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.EmailLogSelect;

/** 상세 화면은 목록 필드에 **본문·보낸 사람**을 더해 읽는다 */
export const EMAIL_LOG_DETAIL_SELECT = {
  ...EMAIL_LOG_ROW_SELECT,
  body: true,
  sender: { select: { name: true, email: true } },
} satisfies Prisma.EmailLogSelect;
