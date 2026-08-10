import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { OPPORTUNITY_DTO_SELECT, toOpportunityDTO } from "@/lib/opportunity";
import { parseDetail } from "@/lib/opportunity-stage";
import {
  ACTIVITY_EVENT_LABELS,
  DOCUMENT_TYPE_LABELS,
  OPPORTUNITY_STAGE_LABELS,
  isOpportunityStage,
  type ActivityEventType,
  type DocumentType,
} from "@/lib/constants";
import { formatDate, formatDateTime, formatKRW } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StageBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpportunityDetailActions } from "./_components/opportunity-detail-actions";
import {
  OpportunityDetailTabs,
  type TimelineEntry,
} from "./_components/opportunity-detail-tabs";

/** 기본 정보 한 줄 */
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-3 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/** 단계 문자열 → 라벨 (정의 밖 값이면 원문 그대로) */
function stageLabel(stage: string): string {
  return isOpportunityStage(stage) ? OPPORTUNITY_STAGE_LABELS[stage] : stage;
}

/**
 * 활동 이력의 `detail`(JSON 문자열)을 사람이 읽을 한 줄로 옮긴다 (F-114).
 * 형식이 깨졌거나 표시할 내용이 없으면 null 을 돌려 타임라인이 라벨만 보이게 한다.
 */
function describeActivity(
  eventType: string,
  detail: Record<string, unknown> | null,
): string | null {
  if (!detail) return null;

  if (typeof detail.from === "string" && typeof detail.to === "string") {
    const transition = `${stageLabel(detail.from)} → ${stageLabel(detail.to)}`;
    return typeof detail.lostReason === "string" && detail.lostReason
      ? `${transition} · 사유 ${detail.lostReason}`
      : transition;
  }

  if (typeof detail.documentType === "string") {
    return (
      DOCUMENT_TYPE_LABELS[detail.documentType as DocumentType] ??
      detail.documentType
    );
  }

  if (eventType === "OPPORTUNITY_CREATED") {
    return typeof detail.expectedAmount === "number"
      ? `예상 금액 ${formatKRW(detail.expectedAmount)}`
      : null;
  }

  return null;
}

/**
 * 영업 기회 상세 (F-111) — 기본 정보 + 수정·삭제 + 타임라인·연관 문서.
 *
 * 현재 단계는 표시만 하고 변경 UI 는 두지 않는다 (F-112 는 Phase 3 범위).
 * 다섯 조회는 서로 독립이라 병렬로 실행하고, 전부 orgId 로 스코프한다.
 */
export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const [{ opportunityId }, user] = await Promise.all([
    params,
    getCurrentUser(),
  ]);

  const [opportunity, activityLogs, documents, accounts, owners] =
    await Promise.all([
      prisma.opportunity.findFirst({
        where: { id: opportunityId, orgId: user.orgId },
        select: OPPORTUNITY_DTO_SELECT,
      }),
      // 타임라인은 최신 활동이 위에 오도록 시간 역순으로 읽는다
      prisma.activityLog.findMany({
        where: { opportunityId, orgId: user.orgId },
        orderBy: { occurredAt: "desc" },
        select: {
          id: true,
          eventType: true,
          detail: true,
          occurredAt: true,
          actor: { select: { name: true } },
        },
      }),
      prisma.document.findMany({
        where: { opportunityId, orgId: user.orgId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          amount: true,
          createdAt: true,
        },
      }),
      prisma.account.findMany({
        where: { orgId: user.orgId },
        orderBy: { companyName: "asc" },
        select: { id: true, companyName: true },
      }),
      prisma.user.findMany({
        where: { orgId: user.orgId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

  if (!opportunity) notFound();

  const dto = toOpportunityDTO(opportunity);
  const timeline: TimelineEntry[] = activityLogs.map((log) => ({
    id: log.id,
    label:
      ACTIVITY_EVENT_LABELS[log.eventType as ActivityEventType] ?? log.eventType,
    actorName: log.actor.name,
    occurredAt: log.occurredAt,
    detailText: describeActivity(log.eventType, parseDetail(log.detail)),
  }));

  return (
    <>
      <PageHeader
        title={dto.name}
        backHref="/opportunities"
        breadcrumb={[
          { label: "영업 기회", href: "/opportunities" },
          { label: dto.name },
        ]}
        description={`${formatDate(opportunity.createdAt)} 등록 · ${formatDateTime(opportunity.updatedAt)} 최근 수정`}
        actions={
          <OpportunityDetailActions
            opportunity={dto}
            accounts={accounts}
            owners={owners}
            documentCount={documents.length}
          />
        }
      />

      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">기본 정보</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <InfoRow label="거래처">
                  <Link
                    href={`/accounts/${dto.accountId}`}
                    className="rounded transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {dto.accountName}
                  </Link>
                </InfoRow>
                <InfoRow label="단계">
                  <StageBadge stage={dto.stage} />
                </InfoRow>
                <InfoRow label="예상 금액">
                  {formatKRW(dto.expectedAmount)}
                </InfoRow>
                <InfoRow label="예상 마감일">
                  {dto.expectedCloseDate ? (
                    formatDate(dto.expectedCloseDate)
                  ) : (
                    <span className="text-muted-foreground">
                      아직 정하지 않았습니다.
                    </span>
                  )}
                </InfoRow>
                <InfoRow label="담당자">{dto.ownerName}</InfoRow>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">메모</CardTitle>
            </CardHeader>
            <CardContent>
              {dto.memo ? (
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {dto.memo}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  아직 메모가 없습니다. 수정에서 상담 내용·경쟁사·결재 라인을
                  남겨두시면 팀원이 함께 볼 수 있습니다.
                </p>
              )}
            </CardContent>
          </Card>

          <OpportunityDetailTabs timeline={timeline} documents={documents} />
        </div>
      </div>
    </>
  );
}
