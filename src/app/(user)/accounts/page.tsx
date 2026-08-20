import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Building2, SearchX } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { accountsWhere, toAccountDTO } from "@/lib/account";
import { primaryContact } from "@/lib/contact";
import {
  pageHref,
  pageQueryRange,
  parsePageParam,
  resolvePagination,
} from "@/lib/pagination";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { InfoHint } from "@/components/info-hint";
import { HintTooltip } from "@/components/hint-tooltip";
import { ListPagination } from "@/components/list-pagination";
import {
  ROW_LINK_ABOVE,
  ROW_LINK_ROW,
  RowLink,
} from "@/components/list-row-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountsToolbar } from "./_components/accounts-toolbar";
import { AccountRowActions } from "./_components/account-row-actions";
import { NewAccountButton } from "./_components/new-account-button";
import {
  OPPORTUNITY_PEEK_LIMIT,
  OpportunityPeek,
} from "./_components/opportunity-peek";

const LIST_HREF = "/accounts";

/**
 * 표 한 칸에 담기 위해 메모를 **한 줄로 접는다** (5차 피드백 1).
 * 메모는 여러 줄일 수 있어 원문을 그대로 넣으면 행 높이가 메모 길이만큼 제각각이 되고,
 * 표를 세로로 훑을 때 눈이 걸린다. 줄바꿈·연속 공백은 공백 하나로 눕히고, 넘치는 부분은
 * 말줄임 + 툴팁이 맡는다 (기존 담당자 칸과 같은 처리).
 */
function collapseToLine(memo: string): string {
  return memo.replace(/\s+/g, " ").trim();
}

/**
 * 툴팁에 펼칠 메모 길이의 상한.
 * 메모는 2000자까지 저장된다(`ACCOUNT_MEMO_MAX`) — 툴팁도 긴 글을 읽는 자리는 아니라서,
 * 여기서 잘린 메모는 거래처 상세에서 마저 읽는다.
 */
const MEMO_TOOLTIP_MAX = 300;

/**
 * 거래처 목록 (F-102) — 회사명·담당자명·연락처·기회 수.
 * 검색어는 URL 쿼리(`?q=`)로 받아 회사명·담당자명 부분 일치로 조회하고,
 * 페이지는 `?page=` 로 받아 서버에서 자른다 (거래처-3).
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  // searchParams 와 세션 조회는 서로 독립 → 병렬 처리
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  const query = params.q?.trim() ?? "";
  const requestedPage = parsePageParam(params.page);
  // orgId 스코프는 목록·건수 양쪽에 같은 조건으로 걸린다
  const where = accountsWhere(user.orgId, query);
  const { skip, take } = pageQueryRange(requestedPage);

  // 건수는 페이지네이션과 "총 N곳" 표시가 함께 쓴다 → 목록 조회와 병렬로 돌린다.
  // 담당자 후보는 행의 `⋯ › 기회 생성` 다이얼로그가 쓴다 (거래처-2) — 행마다 조회하지 않도록
  // 여기서 한 번만 읽어 내려보낸다.
  const [totalCount, accounts, owners] = await Promise.all([
    prisma.account.count({ where }),
    prisma.account.findMany({
      where,
      /**
       * 회사명 가나다순 (4차 피드백 4).
       *
       * 전에는 `updatedAt desc` 였는데, 그 근거가 되던 "최근 수정일" 칸을 지웠다.
       * 화면에 없는 값으로 줄을 세우면 왜 이 순서인지 확인할 방법이 없다 — 순서의 근거는
       * 보이는 값이어야 한다(2차 피드백 14 에서 기회 목록에 최근 수정일 칸을 세운 것과 같은
       * 원칙). 회사명은 이 목록에서 사람이 실제로 찾아 내려가는 값이라 가나다순이 맞다.
       * 같은 이름이 여럿일 때 페이지를 넘기며 행이 겹치거나 빠지지 않도록 `id` 를 마지막
       * 기준으로 붙인다(DB 는 동순위 순서를 보장하지 않는다).
       */
      orderBy: [{ companyName: "asc" }, { id: "asc" }],
      skip,
      take,
      include: {
        _count: { select: { opportunities: true, contacts: true } },
        // 목록에 노출하는 담당자는 **대표 1명뿐**이다 (거래처-8).
        // 전원을 실어 오면 행마다 조회량이 담당자 수만큼 늘고, 보여줄 곳도 없다.
        contacts: { where: { isPrimary: true } },
        /**
         * 기회 칸 팝오버가 펼칠 **제목 몇 건** (5차 피드백 2).
         *
         * 건수만 필요할 때는 `_count` 로 충분했지만, 제목을 보여주려면 기회를 실제로 읽어야
         * 한다. **거래처마다 따로 조회하지 않는다** — 이 `include` 는 목록 조회에 딸린 관계
         * 로드라 Prisma 가 한 페이지분(거래처 10곳)을 **한 번의 질의**로 가져온다. 행을
         * 그리며 `prisma` 를 다시 부르는 것이 N+1 이고, 여기서는 그 길을 열지 않는다.
         *
         * `take` 로 **거래처당 상한을 DB 에서 건다** — 기회가 200건인 거래처 한 곳이 한
         * 화면의 조회량을 통째로 끌어올리지 못한다. 전체 건수는 위의 `_count` 가 이미 들고
         * 있으므로, 잘린 만큼은 팝오버가 "외 N건" 으로 알린다.
         *
         * 정렬은 **기회 목록의 기본 정렬과 같은 `updatedAt desc`** 다
         * (`DEFAULT_OPPORTUNITY_SORT`). 두 화면이 다른 순서를 주장하면 "이 거래처의 기회
         * 5건" 이 기회 목록에서 본 차례와 달라 같은 데이터로 읽히지 않는다. 최근에 손댄
         * 기회가 대체로 지금 들여다보는 기회이기도 하다. 같은 시각이 여럿일 때를 대비해
         * `id` 를 마지막 기준으로 붙인다(DB 는 동순위 순서를 보장하지 않는다).
         */
        opportunities: {
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          take: OPPORTUNITY_PEEK_LIMIT,
          select: { id: true, name: true, stage: true },
        },
      },
    }),
    prisma.user.findMany({
      where: { orgId: user.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const pagination = resolvePagination({ totalCount, requestedPage });
  // 범위를 벗어난 페이지(주소를 고쳤거나 그새 건수가 줄었을 때)는 빈 표를 보여주지 않고 되돌린다
  if (pagination.isOutOfRange) {
    redirect(pageHref(LIST_HREF, { q: query }, pagination.page));
  }

  const isSearching = query.length > 0;

  return (
    <>
      <PageHeader
        title="거래처"
        description="영업 대상 회사를 등록해 두면 기회·문서·발송 이력이 이 거래처에 모입니다."
        actions={<NewAccountButton />}
      />

      {/* scrollbar-gutter: 스크롤바가 생겼다 사라지며 본문 폭이 통째로 흔들리는 것을 막는다.
          표 폭을 고정해도 이 컨테이너가 좁아지면 잔여 폭을 흡수하는 칸이 따라 움직인다. */}
      <div className="flex-1 space-y-4 overflow-auto p-8 [scrollbar-gutter:stable]">
        <Suspense fallback={<div className="h-9" />}>
          {/* 총 건수는 검색란과 같은 줄 우측에 둔다 — 세로 공간을 아낀다 (기회-15 와 같은 규칙) */}
          <AccountsToolbar>
            {totalCount > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>총 {formatNumber(totalCount)}곳</span>
                {/*
                  검색어를 문구로 되풀이하면(검색어: …) 입력한 글자 수만큼 이 줄이 늘어나
                  검색창 폭이 흔들린다. 검색어는 바로 옆 입력에 그대로 보이므로 되풀이하지 않고,
                  건수의 기준만 폭이 고정된 ⓘ 로 알린다 (A-5 보완).
                */}
                {isSearching ? (
                  <InfoHint label="건수 기준 안내">
                    검색을 적용한 결과 전체를 기준으로 낸 건수입니다. 현재
                    페이지에 보이는 행 수가 아닙니다.
                  </InfoHint>
                ) : null}
              </p>
            ) : null}
          </AccountsToolbar>
        </Suspense>

        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
            {isSearching ? (
              <>
                <SearchX className="size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  &ldquo;{query}&rdquo; 와 일치하는 거래처가 없습니다. 회사명이나
                  담당자명의 일부만 입력해 다시 찾아보세요.
                </p>
              </>
            ) : (
              <>
                <Building2 className="size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  아직 등록된 거래처가 없습니다. 첫 거래처를 등록하시면 여기에
                  모입니다.
                </p>
                <NewAccountButton label="첫 거래처 등록" variant="outline" />
              </>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border">
              {/*
                컬럼 폭 고정 — 기회 목록과 **같은 규칙**이다 (A-5). 표 기본값은 그 페이지에 담긴
                내용으로 폭을 다시 계산해 검색·페이지 이동 때마다 칸 경계가 옮겨간다.

                4차 피드백 2·4 로 폭을 다시 나눴다. 회사명이 남는 폭을 전부 먹어 넓은 화면에서
                한 칸만 휑하게 늘어났다 — **회사명에 240px 를 명시**해 절반 수준으로 줄이고
                (한글 13~14자가 들어간다. 넘치면 말줄임 + 툴팁으로 확인한다),
                **남는 폭은 연락처가 흡수**한다(폭을 적지 않은 유일한 칸으로 자리를 넘겼다).
                왜 연락처인가 — 이메일은 한 글자씩 읽고 복사하는 값이라 잘리면 손해가 크고,
                담당자 칸은 이번에 툴팁이 붙어 잘려도 전체를 되찾을 수 있다.
                최근 수정일(128px)은 통째로 지웠다.

                5차 피드백 1 로 **메모 칸이 들어오면서 잔여 폭의 주인이 바뀌었다.**
                직전까지는 연락처가 남는 폭을 흡수했는데, 이제 **연락처에 240px 를 명시하고
                잔여 폭은 메모가 가진다.** 근거는 "폭을 더 줘서 얻는 것이 있는 칸인가" 하나다 —
                연락처는 전화번호(13자)와 이메일(대개 30자 안쪽)이라 길이 상한이 예측되고,
                240px 를 넘겨 줘도 오른쪽이 빈 채로 남는다. 메모는 2000자까지 저장되므로
                (`ACCOUNT_MEMO_MAX`) 넓어지는 만큼 실제로 더 읽히는 유일한 칸이다.
                넘치는 몫은 두 칸 모두 말줄임 + 툴팁으로 되찾는다.
                `min-w` 는 고정 폭 합(240+208+240+88+56=832)에 메모 최소 208px 를 더해 1040px.
              */}
              <Table className="min-w-[1040px] table-fixed">
                <TableHeader>
                  <TableRow>
                    {/* 240px: 남는 폭을 먹지 않도록 명시 (4차 피드백 2) */}
                    <TableHead className="w-[240px]">회사명</TableHead>
                    {/* 208px: "한그레이스 · Sales Director"(이름+직함) 가 들어가는 폭 */}
                    <TableHead className="w-[208px]">담당자</TableHead>
                    {/* 240px: 이메일 30자 안쪽이 들어간다 — 더 넓혀도 오른쪽이 빈다 */}
                    <TableHead className="w-[240px]">연락처</TableHead>
                    {/* 폭 미지정 = 남는 폭 전부 (5차 피드백 1) */}
                    <TableHead>메모</TableHead>
                    {/* 88px: "12건" 은 아주 짧다 — 머리글 "기회" 가 폭의 하한이다 */}
                    <TableHead className="w-[88px] text-right">기회</TableHead>
                    {/* 56px: ⋯ 버튼(32px) + 셀 좌우 여백(16px) — 기회 목록과 같다 */}
                    <TableHead className="w-14">
                      <span className="sr-only">관리</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => {
                    // 대표 담당자 1명만 노출한다 (거래처-8). 나머지는 "외 N명" 으로만 알린다 —
                    // 담당자를 여러 명 넣었는데 목록에 한 명만 보이면 나머지가 사라진 것처럼 읽힌다.
                    const primary = primaryContact(account.contacts);
                    const otherCount = Math.max(
                      account._count.contacts - (primary ? 1 : 0),
                      0,
                    );
                    // 메모는 표에서 한 줄로 접는다 (위 `collapseToLine` 주석 참고).
                    // 공백만 들어 있던 메모는 접고 나면 빈 문자열이라 `—` 로 떨어진다.
                    const memo = account.memo ?? "";
                    const memoLine = collapseToLine(memo);
                    return (
                    // 행 어디를 눌러도 상세로 간다 (거래처-1) — 덮개는 회사명 링크가 만든다
                    <TableRow key={account.id} className={ROW_LINK_ROW}>
                      {/* 말줄임·title 은 RowLink 안에서 처리된다 (덮개를 자르지 않는 자리) */}
                      <TableCell className="font-medium">
                        <RowLink
                          href={`/accounts/${account.id}`}
                          title={account.companyName}
                        >
                          {account.companyName}
                        </RowLink>
                      </TableCell>
                      {/*
                        이름+직함이 길면 잘린다 — 호버·초점 시 툴팁으로 **대표 담당자의 전체
                        정보**(이름·직책·연락처·이메일)를 편다 (4차 피드백 3).
                        `title` 로는 뜨지 않는다: 행 덮개가 위를 지나가므로 트리거만 덮개 위로
                        올려야 한다. 칸 전체가 아니라 글자만 올려 빈 자리는 여전히 상세로 간다.

                        **나머지 담당자의 상세는 담지 않는다.** 목록은 대표 1명만 조회한다
                        (전원을 실어 오면 행마다 조회량이 담당자 수만큼 늘어난다 — 거래처-8).
                        툴팁을 채우려고 그 규칙을 뒤집지 않고, 나머지는 상세로 안내한다.
                      */}
                      <TableCell className="truncate">
                        {primary ? (
                          <HintTooltip
                            className={`inline-block max-w-full truncate align-middle ${ROW_LINK_ABOVE}`}
                            content={
                              <div className="space-y-1">
                                <p className="font-medium">
                                  {primary.name}
                                  {primary.position
                                    ? ` · ${primary.position}`
                                    : ""}
                                  <span className="opacity-70"> (대표)</span>
                                </p>
                                <p className="tabular-nums">
                                  {primary.phone || "연락처 미등록"}
                                </p>
                                <p>{primary.email || "이메일 미등록"}</p>
                                {otherCount > 0 ? (
                                  <p className="opacity-70">
                                    담당자 {otherCount}명이 더 있습니다. 거래처
                                    상세에서 확인하실 수 있습니다.
                                  </p>
                                ) : null}
                              </div>
                            }
                          >
                            {primary.name}
                            {primary.position ? (
                              <span className="text-muted-foreground">
                                {" "}
                                · {primary.position}
                              </span>
                            ) : null}
                            {otherCount > 0 ? (
                              <span className="text-muted-foreground">
                                {" "}
                                외 {otherCount}명
                              </span>
                            ) : null}
                          </HintTooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* 두 줄이라 말줄임은 줄마다 건다 (메일 주소가 특히 길다) */}
                      <TableCell className="text-sm">
                        {primary?.phone || primary?.email ? (
                          <div className="leading-tight">
                            {primary.phone ? (
                              <div
                                className="truncate tabular-nums"
                                title={primary.phone}
                              >
                                {primary.phone}
                              </div>
                            ) : null}
                            {primary.email ? (
                              <div
                                className="truncate text-muted-foreground"
                                title={primary.email}
                              >
                                {primary.email}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/*
                        메모 칸 (5차 피드백 1) — 표에서는 **한 줄로 접어** 보여주고 전체는
                        툴팁으로 편다. 툴팁은 담당자 칸과 **같은 `HintTooltip`** 이라
                        생김새·여는 방법(호버·Tab 초점)이 칸마다 달라지지 않는다.
                        `title` 속성으로는 뜨지 않는다 — 행 덮개가 위를 지나가므로 트리거만
                        덮개 위로 올린다(칸 전체가 아니라 글자만, 빈 자리는 상세로 간다).
                        메모가 비면 다른 칸과 같은 관례대로 `—` 를 놓는다.
                      */}
                      <TableCell className="text-sm">
                        {memoLine ? (
                          <HintTooltip
                            className={`inline-block max-w-full truncate align-middle ${ROW_LINK_ABOVE}`}
                            content={
                              // 줄바꿈은 툴팁에서 되살린다 — 접은 것은 표 안에서뿐이다
                              <p className="whitespace-pre-wrap">
                                {memo.slice(0, MEMO_TOOLTIP_MAX)}
                                {memo.length > MEMO_TOOLTIP_MAX
                                  ? " … (거래처 상세에서 전체를 보실 수 있습니다)"
                                  : ""}
                              </p>
                            }
                          >
                            {memoLine}
                          </HintTooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/*
                        기회 칸 — 건수를 누르거나 호버하면 기회 제목이 펼쳐지고 제목을 누르면
                        기회 상세로 간다 (5차 피드백 2). 자릿수마다 글자폭이 같아야 세로로
                        읽힌다(tabular-nums — 트리거 쪽에 걸려 있다).

                        **0건이면 열 것이 없으므로 팝오버를 붙이지 않는다.** 눌러도 빈 패널이
                        뜨는 트리거는 사용자를 한 번 속인다. 겸사겸사 기회가 없는 행은
                        클라이언트 컴포넌트를 아예 싣지 않는다.
                      */}
                      <TableCell className="text-right tabular-nums">
                        {account._count.opportunities > 0 ? (
                          <OpportunityPeek
                            accountId={account.id}
                            companyName={account.companyName}
                            totalCount={account._count.opportunities}
                            opportunities={account.opportunities}
                          />
                        ) : (
                          <span className="text-muted-foreground">0건</span>
                        )}
                      </TableCell>
                      {/* 최근 수정일 칸은 뺐다 (4차 피드백 4) — 거래처는 회사 정보라 언제
                          손댔는지가 목록에서 판단에 쓰이지 않는다. 정렬 기준도 회사명으로 옮겼다 */}
                      {/* 덮개 위로 올려 메뉴 클릭이 상세로 새지 않게 한다 */}
                      <TableCell className={`text-right ${ROW_LINK_ABOVE}`}>
                        <AccountRowActions
                          account={toAccountDTO(account)}
                          // 목록이 이미 읽은 건수를 재사용한다 (삭제 차단 안내용)
                          opportunityCount={account._count.opportunities}
                          // `⋯ › 기회 생성` 이 쓸 담당자 후보 (거래처-2)
                          owners={owners}
                          defaultOwnerId={user.id}
                        />
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <ListPagination
              pagination={pagination}
              basePath={LIST_HREF}
              query={{ q: query }}
              label="거래처 목록 페이지"
              unit="곳"
            />
          </>
        )}
      </div>
    </>
  );
}
