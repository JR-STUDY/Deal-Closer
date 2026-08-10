import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Building2, SearchX } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { accountsWhere, toAccountDTO } from "@/lib/account";
import {
  pageHref,
  pageQueryRange,
  parsePageParam,
  resolvePagination,
} from "@/lib/pagination";
import { formatDate, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { InfoHint } from "@/components/info-hint";
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
 * 거래처 목록 (F-102) — 회사명·담당자명·연락처·기회 수·최근 수정일.
 * 검색어는 URL 쿼리(`?q=`)로 받아 회사명·담당자명 부분 일치로 조회하고,
 * 페이지는 `?page=` 로 받아 서버에서 자른다 (거래처-3).
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  // searchParams 와 조직 조회는 서로 독립 → 병렬 처리
  const [params, org] = await Promise.all([searchParams, getCurrentOrg()]);
  const query = params.q?.trim() ?? "";
  const requestedPage = parsePageParam(params.page);
  // orgId 스코프는 목록·건수 양쪽에 같은 조건으로 걸린다
  const where = accountsWhere(org.id, query);
  const { skip, take } = pageQueryRange(requestedPage);

  // 건수는 페이지네이션과 "총 N곳" 표시가 함께 쓴다 → 목록 조회와 병렬로 돌린다
  const [totalCount, accounts] = await Promise.all([
    prisma.account.count({ where }),
    prisma.account.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take,
      include: { _count: { select: { opportunities: true } } },
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

      <div className="flex-1 space-y-4 overflow-auto p-8">
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
                남는 폭은 회사명 한 칸만 흡수하고(폭 미지정), 나머지는 실제 값을 재서 고정했다.
                `min-w` 는 기회 목록과 같은 960px — 두 목록의 인상이 어긋나지 않아야 한다.
              */}
              <Table className="min-w-[960px] table-fixed">
                <TableHeader>
                  <TableRow>
                    {/* 폭 미지정 = 남는 폭 전부. `min-w` 에서 최소 248px 를 보장받는다 */}
                    <TableHead>회사명</TableHead>
                    {/* 208px: "한그레이스 · Sales Director"(이름+직함) 가 들어가는 폭 */}
                    <TableHead className="w-[208px]">담당자</TableHead>
                    {/* 232px: 전화(010-0000-0000)보다 메일이 길다 — 30자 주소 기준 */}
                    <TableHead className="w-[232px]">연락처</TableHead>
                    {/* 88px: "12건" 은 아주 짧다 — 머리글 "기회" 가 폭의 하한이다 */}
                    <TableHead className="w-[88px] text-right">기회</TableHead>
                    {/* 128px: 값 "2026.08.10" 보다 머리글 "최근 수정일" 이 길다 */}
                    <TableHead className="w-[128px] text-right">
                      최근 수정일
                    </TableHead>
                    {/* 56px: ⋯ 버튼(32px) + 셀 좌우 여백(16px) — 기회 목록과 같다 */}
                    <TableHead className="w-14">
                      <span className="sr-only">관리</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
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
                      {/* 이름+직함이 길면 잘린다 — 전체는 title 로 확인한다 */}
                      <TableCell className="truncate">
                        {account.contactName ? (
                          <span
                            title={
                              account.position
                                ? `${account.contactName} · ${account.position}`
                                : account.contactName
                            }
                          >
                            {account.contactName}
                            {account.position ? (
                              <span className="text-muted-foreground">
                                {" "}
                                · {account.position}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* 두 줄이라 말줄임은 줄마다 건다 (메일 주소가 특히 길다) */}
                      <TableCell className="text-sm">
                        {account.phone || account.email ? (
                          <div className="leading-tight">
                            {account.phone ? (
                              <div
                                className="truncate tabular-nums"
                                title={account.phone}
                              >
                                {account.phone}
                              </div>
                            ) : null}
                            {account.email ? (
                              <div
                                className="truncate text-muted-foreground"
                                title={account.email}
                              >
                                {account.email}
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
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatDate(account.updatedAt)}
                      </TableCell>
                      {/* 덮개 위로 올려 메뉴 클릭이 상세로 새지 않게 한다 */}
                      <TableCell className={`text-right ${ROW_LINK_ABOVE}`}>
                        <AccountRowActions
                          account={toAccountDTO(account)}
                          // 목록이 이미 읽은 건수를 재사용한다 (삭제 차단 안내용)
                          opportunityCount={account._count.opportunities}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
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
