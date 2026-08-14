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

const LIST_HREF = "/accounts";

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
                `min-w` 는 지운 칸만큼 줄여 880px — 좁은 화면에서 가로 스크롤이 더 늦게 시작된다.
              */}
              <Table className="min-w-[880px] table-fixed">
                <TableHeader>
                  <TableRow>
                    {/* 240px: 남는 폭을 먹지 않도록 명시 (4차 피드백 2) */}
                    <TableHead className="w-[240px]">회사명</TableHead>
                    {/* 208px: "한그레이스 · Sales Director"(이름+직함) 가 들어가는 폭 */}
                    <TableHead className="w-[208px]">담당자</TableHead>
                    {/* 폭 미지정 = 남는 폭 전부. `min-w` 에서 최소 288px 를 보장받는다 */}
                    <TableHead>연락처</TableHead>
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
                      {/* 자릿수마다 글자폭이 같아야 세로로 읽힌다 (tabular-nums) */}
                      <TableCell className="text-right tabular-nums">
                        {account._count.opportunities > 0 ? (
                          `${formatNumber(account._count.opportunities)}건`
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
