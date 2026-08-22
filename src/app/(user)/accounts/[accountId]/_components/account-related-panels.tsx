import Link from "next/link";
import { StageBadge } from "@/components/status-badge";
import {
  EMAIL_OPEN_COLUMN_LABEL,
  EMAIL_OPEN_STATE_LABELS,
} from "@/lib/email-log";
import { formatDate, formatDateTime, formatKRW } from "@/lib/format";

/**
 * 거래처 상세의 연관 데이터 (F-103) — 영업 기회 · 이메일 이력.
 *
 * 예전에는 문서 탭까지 한 `Tabs` 안에 묶여 있었다. 이제 여닫이(드로어)와 탭 전환은
 * 공용 골격(`@/components/detail-shell`)이 맡고, 이 파일은 **패널 내용만** 그린다 —
 * 목록이 자기가 어디에 담기는지 알 필요가 없다.
 *
 * 문서 목록은 미리보기 팝업을 여느라 상태가 필요해 `account-document-list.tsx` 로
 * 갈라져 나갔다. 여기 남은 둘은 상호작용이 없으므로 **서버 컴포넌트**다
 * (클라이언트로 내려보내는 JS 를 늘리지 않는다).
 */

export type RelatedOpportunity = {
  id: string;
  name: string;
  stage: string;
  /** 확정 문서에서 파생된 예상 금액 (기회-6). 근거 문서가 없으면 0 이다. */
  expectedAmount: number;
  /** 금액의 근거가 된 문서. null 이면 확정 문서 없음 → 금액이 0 인 이유다. */
  confirmedDocumentId: string | null;
  expectedCloseDate: Date | null;
  owner: { name: string };
};

export type RelatedEmailLog = {
  id: string;
  subject: string;
  recipients: string;
  status: string;
  sentAt: Date;
  openedAt: Date | null;
  document: { title: string };
};

/** 패널 안의 빈 상태 안내 */
function EmptyPanel({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

export function AccountOpportunityList({
  opportunities,
}: {
  opportunities: RelatedOpportunity[];
}) {
  if (opportunities.length === 0) {
    return (
      <EmptyPanel message="아직 이 거래처에 등록된 영업 기회가 없습니다. 기회를 만들면 예상 금액·단계가 여기에 표시됩니다." />
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {opportunities.map((opportunity) => (
        <li
          key={opportunity.id}
          className="flex items-center justify-between gap-4 p-4"
        >
          <div className="min-w-0">
            <Link
              href={`/opportunities/${opportunity.id}`}
              className="truncate font-medium transition-colors hover:text-primary hover:underline"
            >
              {opportunity.name}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">
              담당 {opportunity.owner.name}
              {opportunity.expectedCloseDate
                ? ` · 예상 마감 ${formatDate(opportunity.expectedCloseDate)}`
                : " · 예상 마감 미정"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {/* 근거 문서가 없으면 0 원이다 (기회-6 ④) — 이유를 흐린 글자와 title 로 알린다 */}
            <span
              className={
                opportunity.confirmedDocumentId
                  ? "text-sm font-medium tabular-nums"
                  : "text-sm tabular-nums text-muted-foreground"
              }
              title={
                opportunity.confirmedDocumentId
                  ? undefined
                  : "확정 문서가 없어 0원입니다. 기회 상세에서 문서를 연결해주세요."
              }
            >
              {formatKRW(opportunity.expectedAmount)}
            </span>
            <StageBadge stage={opportunity.stage} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AccountEmailList({
  emailLogs,
}: {
  emailLogs: RelatedEmailLog[];
}) {
  if (emailLogs.length === 0) {
    return (
      <EmptyPanel message="이 거래처로 발송된 메일이 아직 없습니다. 문서를 발송하면 발송 시각과 열람 확인이 여기에 남습니다." />
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {emailLogs.map((log) => (
        <li key={log.id} className="p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="min-w-0 truncate font-medium">{log.subject}</p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDateTime(log.sentAt)}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {log.document.title} · 수신 {log.recipients}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {/*
             * 열람은 **확인된 것만** 주장한다 — 기록이 없다고 "읽지 않았다" 로 적지 않는다.
             * 추적 이미지를 차단하면 읽어도 기록이 남지 않으므로 그 문장은 틀린 말이 된다
             * (낱말은 발송 이력 화면과 같은 `@/lib/email-log` 상수를 쓴다 — 같은 사실을
             *  두 화면이 다른 말로 적으면 사용자가 둘 중 무엇을 믿을지 알 수 없다).
             */}
            {log.status === "FAILED"
              ? "발송 실패"
              : log.openedAt
                ? `${EMAIL_OPEN_STATE_LABELS.opened} ${formatDateTime(log.openedAt)}`
                : `${EMAIL_OPEN_COLUMN_LABEL} ${EMAIL_OPEN_STATE_LABELS.unopened}`}
          </p>
        </li>
      ))}
    </ul>
  );
}
