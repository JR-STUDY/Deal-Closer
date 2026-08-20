import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Building2, SearchX } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ACCOUNT_LIST_INCLUDE, accountsWhere } from "@/lib/account";
import {
  pageHref,
  pageQueryRange,
  parsePageParam,
  resolvePagination,
} from "@/lib/pagination";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { InfoHint } from "@/components/info-hint";
import { ListPagination } from "@/components/list-pagination";
import { AccountsToolbar } from "./_components/accounts-toolbar";
import { AccountsTable } from "./_components/accounts-table";
import { NewAccountButton } from "./_components/new-account-button";

const LIST_HREF = "/accounts";

/**
 * 거래처 목록 (F-102) — 회사명·담당자명·연락처·기회 수.
 * 검색어는 URL 쿼리(`?q=`)로 받아 회사명·담당자명 부분 일치로 조회하고,
 * 페이지는 `?page=` 로 받아 서버에서 자른다 (거래처-3).
 *
 * **이 파일은 조회와 골격만 맡는다** — 표의 행·셀 렌더는
 * `_components/accounts-table` 이 그린다(그쪽도 서버 컴포넌트다).
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
      // 표가 쓰는 관계 데이터의 모양은 `@/lib/account` 한 곳에 있다 (조회는 여기서 한다)
      include: ACCOUNT_LIST_INCLUDE,
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
                  &ldquo;{query}&rdquo; 와 일치하는 거래처가 없습니다.
                  회사명이나 담당자명의 일부만 입력해 다시 찾아보세요.
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
            <AccountsTable
              accounts={accounts}
              owners={owners}
              defaultOwnerId={user.id}
            />

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
