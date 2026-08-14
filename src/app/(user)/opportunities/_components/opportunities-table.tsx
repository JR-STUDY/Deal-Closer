import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import {
  OPPORTUNITY_DTO_SELECT,
  toOpportunityDTO,
  type OpportunityOwnerOption,
} from "@/lib/opportunity";
import {
  nextOpportunitySort,
  opportunitySortHref,
  sortStateOf,
  type OpportunitySort,
  type OpportunitySortKey,
} from "@/lib/opportunity-sort";
import { formatDate, formatDateTimeSeconds, formatKRW } from "@/lib/format";
import { StageBadge } from "@/components/status-badge";
import { SortableHead } from "@/components/list-sort-header";
import { HintTooltip } from "@/components/hint-tooltip";
import {
  ROW_LINK_ABOVE,
  ROW_LINK_ROW,
  RowLink,
} from "@/components/list-row-link";
import { StageFilterHead, type StageFilterOption } from "./stage-filter-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OpportunityRowActions } from "./opportunity-row-actions";

/** 목록 한 행 — 페이지가 `OPPORTUNITY_DTO_SELECT` 로 읽은 그대로다 */
export type OpportunityRow = Prisma.OpportunityGetPayload<{
  select: typeof OPPORTUNITY_DTO_SELECT;
}>;

/**
 * 영업 기회 목록 표 (F-111 · 2차 피드백 15).
 *
 * 정렬은 **머리글을 눌러** 바꾸고 상태는 URL 쿼리에 남는다. 판정은 전부
 * `@/lib/opportunity-sort` 순수 함수가 하고, 이 컴포넌트는 결과를 받아 그리기만 한다.
 * 상호작용이 `⋯` 메뉴뿐이라 서버 컴포넌트이며 클라이언트 번들을 늘리지 않는다.
 */
export function OpportunitiesTable({
  opportunities,
  owners,
  sort,
  basePath,
  listQuery,
  stageOptions,
  activeStage,
}: {
  opportunities: OpportunityRow[];
  owners: OpportunityOwnerOption[];
  sort: OpportunitySort;
  /** 정렬 링크의 기준 경로 (예: `/opportunities`) */
  basePath: string;
  /** 정렬을 바꿔도 유지할 검색·필터 (page 는 `opportunitySortHref` 가 1로 되돌린다) */
  listQuery: Readonly<Record<string, string>>;
  /** 단계 머리글 필터의 선택지 — 주소는 서버가 미리 만든다 (4차 피드백 6) */
  stageOptions: readonly StageFilterOption[];
  /** 지금 걸린 단계 (없으면 빈 문자열) */
  activeStage: string;
}) {
  /**
   * 머리글 하나를 그릴 재료. 같은 컬럼이면 방향만 뒤집고, 다른 컬럼이면 그 컬럼의 기본
   * 방향으로 간다 — 규칙은 순수 함수가 정하고 화면은 결과만 받는다.
   */
  const sortHead = (key: OpportunitySortKey) => ({
    state: sortStateOf(sort, key),
    href: opportunitySortHref(
      basePath,
      listQuery,
      nextOpportunitySort(sort, key),
    ),
  });

  return (
    <div className="overflow-hidden rounded-lg border">
      {/*
        컬럼 폭을 고정한다 (A-5). 표 기본값(table-layout: auto)은 그 페이지에 실제로 담긴
        내용으로 폭을 다시 계산해서, 페이지를 넘기거나 필터를 걸 때마다 칸 경계가 옮겨간다.
        `table-fixed` 는 **머리행에 적힌 폭만** 보므로 행 내용과 무관하게 같은 자리에 선다.

        폭은 실제 값을 재서 잡았다. 남는 폭은 **기회명 한 칸만** 흡수한다(폭을 적지 않은
        유일한 칸) — 행의 정체이자 가장 길고 들쭉날쭉한 값이라 여기에 몰아주는 편이 낫고,
        나머지는 화면이 넓어져도 그대로라 시선 위치가 유지된다. 좁은 화면에서는 `min-w`
        아래로 눌리는 대신 표 컨테이너(`overflow-x-auto`)가 가로로 스크롤된다.

        정렬 머리글은 아이콘 자리를 **항상** 차지하므로(`SortableHead`) 눌러도 폭이
        흔들리지 않는다. 대신 아이콘(14px)+간격(4px) 만큼 머리글이 길어져, 값보다
        머리글이 폭을 정하던 날짜 칸 두 개를 112 → 124px 로 넓혔다.

        4차 피드백 5·6 으로 폭을 다시 나눴다 — 영업 담당자 칸(112px)을 지우고 단계 칸을
        필터 아이콘 자리만큼 104 → 128px 로 넓혔다. 순증감은 -88px 이라 `min-w` 를
        1096 → 1008px 로 낮춘다. **남는 폭은 그대로 기회명이 흡수한다** — 원래 잔여 폭을
        먹는 유일한 칸이고, 행의 정체이자 가장 길어 잘리면 손해가 큰 값이라 옮길 이유가 없다.
        (다른 칸에 나눠 주면 값보다 넓은 빈 칸만 늘어난다.)
      */}
      <Table className="min-w-[1008px] table-fixed">
        <TableHeader>
          <TableRow>
            {/* 폭 미지정 = 남는 폭 전부. `min-w` 에서 최소 224px 를 보장받는다 */}
            <SortableHead label="기회명" {...sortHead("name")} />
            {/* 208px: "(주)에이비씨 테크놀로지"·"Bluewave Systems Korea" 가 잘리지 않는 폭 */}
            <SortableHead
              label="거래처"
              className="w-[208px]"
              {...sortHead("account")}
            />
            {/*
              단계는 정렬하지 않는다 — DB 가 String 이라 알파벳 순으로 서고(파이프라인
              순서가 아니다). 대신 이 머리글이 **필터**를 맡는다 (4차 피드백 6): 정렬을
              애초에 하지 않는 칸이라 두 동작이 한 자리에서 부딪히지 않는다.
              128px: 가장 긴 배지/필터 라벨 "검토/협상" + 필터 아이콘(14px)+간격 기준
            */}
            <StageFilterHead
              options={stageOptions}
              activeValue={activeStage}
              className="w-[128px]"
            />
            {/* 144px: "₩1,800,000,000"(10억대)까지 한 줄로 들어가는 폭 */}
            <SortableHead
              label="예상 금액"
              align="right"
              className="w-[144px]"
              {...sortHead("amount")}
            />
            {/* 124px: 값 "2026.08.15" 보다 머리글 + 정렬 아이콘이 길어 그쪽이 폭을 정한다 */}
            <SortableHead
              label="예상 마감일"
              align="right"
              className="w-[124px]"
              {...sortHead("closeDate")}
            />
            {/*
              기본 정렬 기준을 화면에 세운다 (2차 피드백 14) — 순서만 바뀌고 근거가 되는
              값이 어디에도 없으면 왜 이 순서인지 확인할 방법이 없다.
            */}
            <SortableHead
              label="최근 수정일"
              align="right"
              className="w-[124px]"
              {...sortHead("updatedAt")}
            />
            {/*
              영업 담당자 칸은 뺐다 (4차 피드백 5) — 한 조직의 목록에서 담당자 이름이 매 행에
              반복되면 훑는 데 보탬이 되지 않는다. **툴바의 영업 담당자 필터는 남긴다**:
              거르는 것(누구의 기회만 볼지)과 보여주는 것(행마다 이름을 싣기)은 다른 요구다.
              정렬 대상도 아니었으므로 정렬 규칙은 그대로다.
            */}
            {/* 56px: ⋯ 버튼(32px) + 셀 좌우 여백(16px) */}
            <TableHead className="w-14">
              <span className="sr-only">관리</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {opportunities.map((opportunity) => (
            // 행 어디를 눌러도 상세로 간다 (거래처-1 과 같은 규칙) — 덮개는 기회명 링크가 만든다
            <TableRow key={opportunity.id} className={ROW_LINK_ROW}>
              {/* 말줄임·title 은 RowLink 안에서 처리된다 (덮개를 자르지 않는 자리) */}
              <TableCell className="font-medium">
                <RowLink
                  href={`/opportunities/${opportunity.id}`}
                  title={opportunity.name}
                >
                  {opportunity.name}
                </RowLink>
              </TableCell>
              {/*
                거래처 링크는 덮개 위로 올려 자기 목적지(거래처 상세)를 지킨다.
                말줄임은 링크가 아니라 **칸**에 건다 — 잘린 자리(…)에 커서를 올려도
                title 이 뜨고, 링크에 overflow 를 걸지 않아 덮개와도 무관하다.
              */}
              <TableCell
                className={`truncate ${ROW_LINK_ABOVE}`}
                title={opportunity.account.companyName}
              >
                <Link
                  href={`/accounts/${opportunity.accountId}`}
                  className="rounded text-muted-foreground transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {opportunity.account.companyName}
                </Link>
              </TableCell>
              <TableCell>
                <StageBadge stage={opportunity.stage} />
              </TableCell>
              {/*
                자릿수마다 글자폭이 같아야 칸을 고정한 보람이 있다 (tabular-nums).
                확정 문서가 없으면 0 원이다 (기회-6 ④) — 칸이 좁아 사유를 적을 자리가
                없으므로 흐린 글자 + title 로만 알리고, 자세한 안내는 상세에서 한다.
              */}
              <TableCell
                className={`text-right tabular-nums ${
                  opportunity.confirmedDocumentId ? "" : "text-muted-foreground"
                }`}
              >
                {opportunity.confirmedDocumentId ? (
                  formatKRW(opportunity.expectedAmount)
                ) : (
                  // 사유는 칸에 적을 자리가 없어 툴팁으로 접는다. `title` 로는 뜨지 않는다 —
                  // 행 덮개가 위를 지나가므로 트리거를 덮개 위로 올려야 한다 (HintTooltip 참고)
                  <HintTooltip
                    className={`inline-block ${ROW_LINK_ABOVE}`}
                    content="확정 문서가 없어 ₩0 입니다. 기회 상세에서 문서를 연결하시면 그 문서의 금액이 반영됩니다."
                  >
                    {formatKRW(opportunity.expectedAmount)}
                  </HintTooltip>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {opportunity.expectedCloseDate ? (
                  formatDate(opportunity.expectedCloseDate)
                ) : (
                  <HintTooltip
                    className={`inline-block ${ROW_LINK_ABOVE}`}
                    content="예상 마감일을 아직 정하지 않았습니다."
                  >
                    미정
                  </HintTooltip>
                )}
              </TableCell>
              {/*
                기본 정렬의 근거값. 시각까지 적으면 칸이 넘치므로 날짜만 보이고, 호버·초점에
                **초 단위까지** 툴팁으로 알린다 (4차 피드백 8) — 같은 날 여러 번 손댄 기회는
                날짜만으로 순서를 확인할 수 없고, 분까지 같아지는 경우도 있다.
                거래처 목록의 담당자 툴팁과 **같은 컴포넌트**라 생김새가 어긋나지 않는다.
              */}
              <TableCell className="text-right tabular-nums text-muted-foreground">
                <HintTooltip
                  className={`inline-block ${ROW_LINK_ABOVE}`}
                  content={`${formatDateTimeSeconds(opportunity.updatedAt)} 최근 수정`}
                >
                  {formatDate(opportunity.updatedAt)}
                </HintTooltip>
              </TableCell>
              {/* 덮개 위로 올려 메뉴 클릭이 상세로 새지 않게 한다 */}
              <TableCell className={`text-right ${ROW_LINK_ABOVE}`}>
                <OpportunityRowActions
                  opportunity={toOpportunityDTO(opportunity)}
                  // 담당자 후보는 페이지가 이미 조회한 값을 재사용한다
                  owners={owners}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
