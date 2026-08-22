import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import {
  EMAIL_LOG_ROW_SELECT,
  EMAIL_OPEN_COLUMN_LABEL,
  EMAIL_OPEN_HINT,
  emailLogSortHref,
  emailLogSortStateOf,
  nextEmailLogSort,
  recipientList,
  type EmailLogSort,
  type EmailLogSortKey,
} from "@/lib/email-log";
import { DOCUMENT_TYPE_LABELS, isDocumentType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTimeSeconds } from "@/lib/format";
import { DocTypeBadge } from "@/components/status-badge";
import { SortableHead } from "@/components/list-sort-header";
import { HintTooltip } from "@/components/hint-tooltip";
import { InfoHint } from "@/components/info-hint";
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
import { EmailStatusBadge, OpenStateCell } from "../../_components/email-log-badges";

/** 목록 한 행 — 페이지가 `EMAIL_LOG_ROW_SELECT` 로 읽은 그대로다 */
export type EmailLogRow = Prisma.EmailLogGetPayload<{
  select: typeof EMAIL_LOG_ROW_SELECT;
}>;

/**
 * 메일 발송 이력 표.
 *
 * 정렬은 **머리글을 눌러** 바꾸고 상태는 URL 쿼리(`?sort=&dir=`)에 남는다. 판정은 전부
 * `@/lib/email-log` 순수 함수가 하고 이 컴포넌트는 결과를 받아 그리기만 한다 —
 * 상호작용이 링크·툴팁뿐이라 **서버 컴포넌트**이며 클라이언트 번들을 늘리지 않는다.
 *
 * 행 어디를 눌러도 그 발송의 상세(`/mail/sent/:id`)로 간다 (`RowLink`). 행 안의 문서·기회
 * 링크는 `ROW_LINK_ABOVE` 로 덮개 위에 올려 **자기 목적지를 지킨다** — 발송 이력에서 하고
 * 싶은 일은 "무엇을 보냈는지 보기"(상세)와 "그 문서·기회로 건너가기" 두 가지다.
 */
export function SentMailTable({
  logs,
  sort,
  basePath,
  listQuery,
}: {
  logs: EmailLogRow[];
  sort: EmailLogSort;
  /** 정렬 링크의 기준 경로 (`/mail/sent`) */
  basePath: string;
  /** 정렬을 바꿔도 유지할 검색·필터 (page 는 `emailLogSortHref` 가 1로 되돌린다) */
  listQuery: Readonly<Record<string, string>>;
}) {
  const sortHead = (key: EmailLogSortKey) => ({
    state: emailLogSortStateOf(sort, key),
    href: emailLogSortHref(basePath, listQuery, nextEmailLogSort(sort, key)),
  });

  return (
    <div className="overflow-hidden rounded-lg border">
      {/*
        컬럼 폭을 고정한다 (기회·거래처 목록과 같은 이유) — 표 기본값(table-layout: auto)은
        그 페이지에 실제로 담긴 값으로 폭을 다시 재서, 페이지를 넘기거나 필터를 걸 때마다
        칸 경계가 옮겨간다. `table-fixed` 는 머리행에 적힌 폭만 본다.

        남는 폭은 **메일 제목 한 칸만** 흡수한다(폭을 적지 않은 유일한 칸) — 행의 정체이자
        가장 길고 들쭉날쭉한 값이다. 좁은 화면에서는 `min-w` 아래로 눌리는 대신 표 컨테이너가
        가로로 스크롤된다.

        폭 근거 — 보낸 날짜 148px("2026.06.20 09:20" + 정렬 아이콘) · 문서 216px(견적서 제목
        대부분) · 기회 168px · 받는 사람 192px("purchasing@globalcommerce.co.kr" 은 넘치므로
        말줄임 + 툴팁) · 상태 96px("발송 성공" 배지) · 열람 여부 132px(날짜 + ⓘ).
      */}
      <Table className="min-w-[1176px] table-fixed">
        <TableHeader>
          <TableRow>
            <SortableHead
              label="보낸 날짜"
              className="w-[148px]"
              {...sortHead("sentAt")}
            />
            {/* 폭 미지정 = 남는 폭 전부 */}
            <SortableHead label="제목" {...sortHead("subject")} />
            <SortableHead
              label="문서"
              className="w-[216px]"
              {...sortHead("document")}
            />
            {/*
              기회·받는 사람·상태·열람 확인은 정렬하지 않는다 (`EMAIL_LOG_SORT_KEYS` 주석) —
              값이 두세 가지뿐이거나 다중 값이라 정렬해도 뭉치가 생길 뿐이고, 찾는 목적은
              툴바 필터·검색이 더 정확히 해결한다.
            */}
            <TableHead className="w-[168px]">기회</TableHead>
            <TableHead className="w-[192px]">받는 사람</TableHead>
            <TableHead className="w-[96px]">상태</TableHead>
            <TableHead className="w-[132px]">
              <span className="inline-flex items-center gap-1">
                {EMAIL_OPEN_COLUMN_LABEL}
                {/*
                  **확인된 것만 주장한다.** 오픈 트래킹은 원리적으로 부정확하다 —
                  이미지 차단으로 읽었는데 기록이 없고(거짓 음성), 메일 앱·프록시의
                  프리페치로 안 읽었는데 잡힌다(거짓 양성). 그래서 머리글도 "열람 여부"
                  가 아니라 "열람 확인" 이고, 왜 그런지를 ⓘ 로 밝힌다.
                  문구는 `@/lib/email-log` 한 곳에서 온다 (상세 화면과 같은 말을 쓴다).
                */}
                <InfoHint label="열람 확인 기준 안내">{EMAIL_OPEN_HINT}</InfoHint>
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            const recipients = recipientList(log.recipients);
            const [first, ...rest] = recipients;
            const typeLabel = isDocumentType(log.document.type)
              ? DOCUMENT_TYPE_LABELS[log.document.type]
              : log.document.type;

            return (
              <TableRow key={log.id} className={ROW_LINK_ROW}>
                {/* 목록 칸이 좁아 분까지만 보이고, 초까지는 툴팁으로 알린다 */}
                <TableCell className="tabular-nums text-muted-foreground">
                  <HintTooltip
                    className={`inline-block ${ROW_LINK_ABOVE}`}
                    content={`${formatDateTimeSeconds(log.sentAt)} 발송`}
                  >
                    {formatDate(log.sentAt)}
                  </HintTooltip>
                </TableCell>

                {/* 행의 정체 — 말줄임·title 은 RowLink 안에서 처리된다 */}
                <TableCell className="font-medium">
                  <RowLink href={`/mail/sent/${log.id}`} title={log.subject}>
                    {log.subject}
                  </RowLink>
                </TableCell>

                {/* 문서로 건너가기 — 덮개 위로 올려 자기 목적지를 지킨다 */}
                <TableCell className={ROW_LINK_ABOVE}>
                  <Link
                    href={`/editor/${log.document.id}`}
                    title={`${log.document.title} (${typeLabel})`}
                    className="block rounded transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="block truncate">{log.document.title}</span>
                  </Link>
                  <DocTypeBadge type={log.document.type} />
                </TableCell>

                {/*
                  기회는 있을 때만 링크다 — 없으면 사실만 적고 만들라고 채근하지 않는다.
                  덮개 위로 올리는 것도 **링크가 있을 때만**이다: 링크가 없는 칸을 올려 두면
                  그 칸의 빈 자리를 눌러도 상세로 가지 않는다 (행 전체 클릭이 반쯤 죽는다).
                */}
                <TableCell
                  className={cn(
                    "text-muted-foreground",
                    log.document.opportunity && ROW_LINK_ABOVE,
                  )}
                >
                  {log.document.opportunity ? (
                    <Link
                      href={`/opportunities/${log.document.opportunity.id}`}
                      title={log.document.opportunity.name}
                      className="block rounded transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="block truncate">
                        {log.document.opportunity.name}
                      </span>
                    </Link>
                  ) : (
                    <HintTooltip
                      className={`inline-block ${ROW_LINK_ABOVE}`}
                      content="이 문서는 영업 기회에 연결되어 있지 않습니다."
                    >
                      기회 미연결
                    </HintTooltip>
                  )}
                </TableCell>

                {/*
                  받는 사람은 여러 명일 수 있다(세미콜론 구분). 칸에는 **첫 주소 + 외 N명**만
                  적고 전체는 툴팁으로 접는다 — 주소를 다 늘어놓으면 이 칸 하나가 표 폭을
                  통째로 먹는다. 전체 목록은 상세에서 한 명씩 확인할 수 있다.
                */}
                <TableCell className="text-muted-foreground">
                  <HintTooltip
                    className={`inline-block max-w-full truncate ${ROW_LINK_ABOVE}`}
                    content={
                      recipients.length > 0
                        ? recipients.join(", ")
                        : "수신자 정보가 없습니다."
                    }
                  >
                    {first ?? "수신자 없음"}
                    {rest.length > 0 ? (
                      <span className="text-xs"> 외 {rest.length}명</span>
                    ) : null}
                  </HintTooltip>
                </TableCell>

                <TableCell>
                  <EmailStatusBadge status={log.status} />
                </TableCell>

                <TableCell>
                  <OpenStateCell log={log} inRow />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
