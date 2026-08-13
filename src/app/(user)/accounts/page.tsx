import { Suspense } from "react";
import Link from "next/link";
import { Building2, SearchX } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { accountsWhere, toAccountDTO } from "@/lib/account";
import { formatDate, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
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

/**
 * 거래처 목록 (F-102) — 회사명·담당자명·연락처·기회 수·최근 수정일.
 * 검색어는 URL 쿼리(`?q=`)로 받아 회사명·담당자명 부분 일치로 조회한다.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // searchParams 와 조직 조회는 서로 독립 → 병렬 처리
  const [{ q }, org] = await Promise.all([searchParams, getCurrentOrg()]);
  const query = q?.trim() ?? "";

  const accounts = await prisma.account.findMany({
    where: accountsWhere(org.id, query),
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { opportunities: true } } },
  });

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
          <AccountsToolbar />
        </Suspense>

        {accounts.length === 0 ? (
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
            <p className="text-xs text-muted-foreground">
              총 {formatNumber(accounts.length)}곳
              {isSearching ? ` (검색어: ${query})` : ""}
            </p>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>회사명</TableHead>
                    <TableHead>담당자</TableHead>
                    <TableHead>연락처</TableHead>
                    <TableHead className="text-right">기회</TableHead>
                    <TableHead className="text-right">최근 수정일</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">관리</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/accounts/${account.id}`}
                          className="rounded transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {account.companyName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {account.contactName ? (
                          <span>
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
                      <TableCell className="text-sm">
                        {account.phone || account.email ? (
                          <div className="leading-tight">
                            {account.phone ? <div>{account.phone}</div> : null}
                            {account.email ? (
                              <div className="text-muted-foreground">
                                {account.email}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {account._count.opportunities > 0 ? (
                          `${formatNumber(account._count.opportunities)}건`
                        ) : (
                          <span className="text-muted-foreground">0건</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDate(account.updatedAt)}
                      </TableCell>
                      {/* 회사명 링크와 영역을 분리해 메뉴 클릭이 상세로 새지 않게 한다 */}
                      <TableCell className="text-right">
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
          </>
        )}
      </div>
    </>
  );
}
