import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Paperclip, Target } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  EMAIL_LOG_DETAIL_SELECT,
  recipientList,
} from "@/lib/email-log";
import { DOCUMENT_TYPE_LABELS, isDocumentType } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/info-hint";
import {
  EmailStatusBadge,
  OpenStateCell,
} from "../../_components/email-log-badges";

const LIST_HREF = "/mail/sent";

/**
 * 발송 상세 — 한 건의 제목·본문·받는 사람·첨부·열람 시각을 확인한다 (F-234).
 *
 * **다이얼로그가 아니라 라우트다.** 목록 행 전체 클릭은 `@/components/list-row-link` 의
 * `<Link>` 덮개라 목적지가 주소여야 하고(JS 없이 동작 · Tab·Enter · 새 탭 · 주소 복사),
 * 본문은 서명·인용이 붙어 길어질 수 있어 **목록 10건의 본문을 미리 클라이언트로 내려보내지
 * 않는 편**이 낫다. 이 화면은 상호작용이 링크뿐이라 서버 컴포넌트다.
 *
 * 조회는 조직 범위로 좁힌다 — `EmailLog` 에 `orgId` 가 없으므로 `document.orgId` 를 경유한다.
 * **없는 이력과 남의 조직 이력은 같은 404** 다(존재 여부도 알려주지 않는다).
 */
export default async function SentMailDetailPage({
  params,
}: {
  params: Promise<{ logId: string }>;
}) {
  const [{ logId }, user] = await Promise.all([params, getCurrentUser()]);

  const log = await prisma.emailLog.findFirst({
    // findUnique({ where: { id } }) 를 쓰지 않는다 — 조직 범위가 빠진다
    where: { id: logId, document: { orgId: user.orgId } },
    select: EMAIL_LOG_DETAIL_SELECT,
  });
  if (!log) notFound();

  const recipients = recipientList(log.recipients);
  const typeLabel = isDocumentType(log.document.type)
    ? DOCUMENT_TYPE_LABELS[log.document.type]
    : log.document.type;
  const opportunity = log.document.opportunity;

  return (
    <>
      <PageHeader
        breadcrumb={[
          {
            caption: "발송 이력",
            captionHref: LIST_HREF,
            label: log.subject,
            href: LIST_HREF,
          },
        ]}
        title={log.subject}
        backHref={LIST_HREF}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/editor/${log.document.id}`}>
                <FileText className="size-4" aria-hidden="true" />
                문서 열기
              </Link>
            </Button>
            {/* 기회는 연결된 경우에만 버튼을 둔다 — 없는 곳으로 보내지 않는다 */}
            {opportunity ? (
              <Button asChild variant="outline">
                <Link href={`/opportunities/${opportunity.id}`}>
                  <Target className="size-4" aria-hidden="true" />
                  기회 보기
                </Link>
              </Button>
            ) : null}
          </>
        }
        meta={`${formatDateTime(log.sentAt)} 발송`}
      />

      <div className="flex-1 overflow-auto p-8 [scrollbar-gutter:stable]">
        {/*
          2단 구성 — 좌측은 "무엇을 보냈는지"(제목·본문·첨부), 우측은 "어떻게 나갔는지"
          (상태·받는 사람·열람·연결된 문서·기회). `lg` 미만에서는 한 단으로 쌓여 본문이
          먼저 온다 (기회 상세와 같은 규칙).
        */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>메일 본문</CardTitle>
              </CardHeader>
              <CardContent>
                {log.body?.trim() ? (
                  /*
                    본문은 발송 화면에서 입력한 **평문**이다 (HTML 로 저장하지 않는다).
                    그래서 그대로 글자로 그리고 줄바꿈만 살린다 — `dangerouslySetInnerHTML`
                    은 쓰지 않는다(본문은 전부 사용자 입력이라 스크립트가 섞일 여지를
                    남기지 않는다). `break-words` 로 긴 URL 이 칸을 넘지 않게 한다.
                  */
                  <p className="text-sm leading-6 break-words whitespace-pre-wrap">
                    {log.body}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    본문 없이 발송된 기록입니다. 저장된 본문이 없어 보여드릴
                    내용이 없습니다.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>첨부 파일</CardTitle>
              </CardHeader>
              <CardContent>
                {log.attachmentName ? (
                  <p className="flex items-center gap-2 text-sm break-all">
                    <Paperclip
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {log.attachmentName}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    첨부 파일 없이 발송된 기록입니다.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>발송 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <Field label="상태">
                  <EmailStatusBadge status={log.status} />
                </Field>
                <Field label="보낸 날짜">
                  <span className="tabular-nums">
                    {formatDateTime(log.sentAt)}
                  </span>
                </Field>
                <Field label="보낸 사람">
                  <span className="break-all">
                    {log.sender.name}
                    <span className="text-muted-foreground">
                      {" "}
                      · {log.sender.email}
                    </span>
                  </span>
                </Field>
                <Field
                  label={`받는 사람 (${recipients.length}명)`}
                  /* 여러 명이면 한 줄에 몰아 적지 않고 한 명씩 세로로 둔다 —
                     주소는 길고 서로 비슷해 이어 붙이면 어디까지가 한 사람인지 모른다 */
                >
                  {recipients.length > 0 ? (
                    <ul className="space-y-1">
                      {recipients.map((one) => (
                        <li key={one} className="break-all">
                          {one}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">
                      수신자 정보가 저장되지 않았습니다.
                    </span>
                  )}
                </Field>
                <Field
                  label="열람 여부"
                  hint={
                    <InfoHint label="열람 여부 기준 안내">
                      수신자가 메일 본문의 추적 이미지를 불러오면 열람 시각이
                      기록됩니다. 현재는 추적 이미지 삽입이 연동되지 않아 대부분
                      ‘미열람’ 으로 표시됩니다.
                    </InfoHint>
                  }
                >
                  <OpenStateCell log={log} />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>연결된 문서 · 기회</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <Field label={`문서 (${typeLabel})`}>
                  <Link
                    href={`/editor/${log.document.id}`}
                    className="rounded break-words transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {log.document.title}
                  </Link>
                </Field>
                <Field label="영업 기회">
                  {opportunity ? (
                    <Link
                      href={`/opportunities/${opportunity.id}`}
                      className="rounded break-words transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {opportunity.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">
                      이 문서는 영업 기회에 연결되어 있지 않습니다.
                    </span>
                  )}
                </Field>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

/** 라벨(작은 글씨) 위 · 값 아래 한 칸 — 카드 안의 정보 나열을 같은 모양으로 맞춘다 */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  /** 라벨 옆에 접어 둘 ⓘ 안내 (없으면 그리지 않는다) */
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}
        {hint}
      </p>
      <div>{children}</div>
    </div>
  );
}
