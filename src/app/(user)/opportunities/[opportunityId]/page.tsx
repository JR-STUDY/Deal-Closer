import Link from "next/link";
import { notFound } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { OPPORTUNITY_DTO_SELECT, toOpportunityDTO } from "@/lib/opportunity";
import { parseDetail } from "@/lib/opportunity-stage";
import {
  ACTIVITY_EVENT_LABELS,
  OPPORTUNITY_STAGE_LABELS,
  isOpportunityStage,
  type ActivityEventType,
} from "@/lib/constants";
import { formatDate, formatDateTime, formatKRW } from "@/lib/format";
import type { StageHistoryEntry } from "@/lib/opportunity-progress";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpportunityStageStepper } from "@/components/opportunity/opportunity-stage-stepper";
import { OpportunityDetailActions } from "./_components/opportunity-detail-actions";
import { OpportunityInlineFields } from "./_components/opportunity-inline-fields";
import {
  OpportunityDetailTabs,
  type TimelineEntry,
} from "./_components/opportunity-detail-tabs";

/** 이력 한 줄에 붙일 문서 요약 (기회-13) */
type TimelineDocumentInfo = {
  id: string;
  title: string;
  type: string;
  amount: number;
};

/** 단계 문자열 → 라벨 (정의 밖 값이면 원문 그대로) */
function stageLabel(stage: string): string {
  return isOpportunityStage(stage) ? OPPORTUNITY_STAGE_LABELS[stage] : stage;
}

/** detail 에서 문자열 필드를 꺼낸다 (없거나 빈 값이면 null) */
function text(
  detail: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = detail?.[key];
  return typeof value === "string" && value ? value : null;
}

/**
 * 수신자 요약 — 세미콜론 구분 목록을 "첫 주소 외 N명" 으로 줄인다.
 * 이력 한 줄에 주소가 길게 늘어지면 다른 정보가 밀린다.
 */
function summarizeRecipients(recipients: string): string {
  // 다듬기와 빈 값 제거를 한 번에 처리한다 (map + filter 로 두 번 돌지 않는다)
  const list = recipients.split(";").flatMap((one) => {
    const trimmed = one.trim();
    return trimmed ? [trimmed] : [];
  });
  if (list.length === 0) return "";
  return list.length === 1 ? list[0] : `${list[0]} 외 ${list.length - 1}명`;
}

/**
 * 활동 이력의 `detail`(JSON 문자열)을 사람이 읽을 한 줄로 옮긴다 (F-114).
 * 형식이 깨졌거나 표시할 내용이 없으면 null 을 돌려 이력이 라벨만 보이게 한다.
 *
 * **문서 정보(제목·종류·금액)는 여기서 다루지 않는다** — 아래 문서 요약 줄이 배지와 함께
 * 보여주므로 같은 내용을 두 줄에 겹쳐 적지 않는다 (기회-13).
 */
function describeActivity(
  eventType: string,
  detail: Record<string, unknown> | null,
): string | null {
  if (!detail) return null;

  const parts: string[] = [];

  const from = text(detail, "from");
  const to = text(detail, "to");
  if (from && to) parts.push(`${stageLabel(from)} → ${stageLabel(to)}`);

  const lostReason = text(detail, "lostReason");
  if (lostReason) parts.push(`사유 ${lostReason}`);

  const recipients = text(detail, "recipients");
  if (recipients) parts.push(`수신 ${summarizeRecipients(recipients)}`);

  if (
    parts.length === 0 &&
    eventType === "OPPORTUNITY_CREATED" &&
    typeof detail.expectedAmount === "number"
  ) {
    parts.push(`예상 금액 ${formatKRW(detail.expectedAmount)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * 영업 기회 상세 (F-111 · F-112 · F-114) — 진행 단계 · 기본 정보 · 메모 · 이력 · 연관 문서.
 *
 * **2단 레이아웃**이다 (기회-4) — 좌측은 이 기회가 "무엇인지"(단계·기본 정보·메모),
 * 우측은 "무슨 일이 있었는지"(이력·연관 문서)다. 좁은 화면에서는 좌 → 우 순서로 쌓인다.
 * 값은 좌측에서 인라인으로 바로 고치고(기회-7), 단계는 스테퍼 노드를 눌러 옮긴다(기회-1).
 *
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
        // 스테퍼가 실주 사유를 함께 보여주므로 그 필드만 더 읽는다 (F-117)
        select: { ...OPPORTUNITY_DTO_SELECT, lostReason: true },
      }),
      // 이력은 최신 활동이 위에 오도록 시간 역순으로 읽는다
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

  // 이력의 documentId 를 실제 문서와 맞춰 링크·요약을 만든다. 이 목록은 이미 orgId 로 좁혀
  // 조회했고, 여기 없는 id 도 아래에서 orgId 로 다시 확인한다 — 조직 밖 문서로 새지 않는다.
  const documentById = new Map<string, TimelineDocumentInfo>(
    documents.map((document) => [document.id, document]),
  );

  // detail 은 JSON 문자열이라 한 번만 파싱해 이력 표시와 진행 단계 계산이 함께 쓴다.
  const parsedLogs = activityLogs.map((log) => ({
    log,
    detail: parseDetail(log.detail),
  }));

  /**
   * 이력이 가리키지만 지금은 이 기회에 붙어 있지 않은 문서 (연결이 끊긴 경우).
   * 이력 줄마다 조회하면 N+1 이 되므로 **모아서 한 번에** 읽고, 없으면 조회를 건너뛴다.
   */
  const detachedIds = [
    ...new Set(
      parsedLogs.flatMap(({ detail }) => {
        const id = text(detail, "documentId");
        return id && !documentById.has(id) ? [id] : [];
      }),
    ),
  ];
  if (detachedIds.length > 0) {
    const detached = await prisma.document.findMany({
      where: { id: { in: detachedIds }, orgId: user.orgId },
      select: { id: true, title: true, type: true, amount: true },
    });
    for (const document of detached) documentById.set(document.id, document);
  }

  /**
   * 진행 단계 스테퍼가 쓸 전이 이력. **이미 조회한 활동 이력에서 파생**하므로 쿼리가 늘지 않는다.
   * 상단(진행 단계)과 하단(이력)이 같은 출처를 봐야 "제안에서 실주했는데 검토/협상까지
   * 지나온 것으로 보이는" 어긋남이 구조적으로 생기지 않는다.
   * 단계와 무관한 detail(문서 종류·수신자 등)은 순수 함수 쪽에서 무시한다.
   */
  const stageHistory: StageHistoryEntry[] = parsedLogs.map(({ detail }) => ({
    from: text(detail, "from"),
    to: text(detail, "to"),
  }));

  const timeline: TimelineEntry[] = parsedLogs.map(({ log, detail }) => {
    const linkedId = text(detail, "documentId");
    const document = linkedId ? documentById.get(linkedId) : undefined;
    return {
      id: log.id,
      eventType: log.eventType,
      label:
        ACTIVITY_EVENT_LABELS[log.eventType as ActivityEventType] ??
        log.eventType,
      actorName: log.actor.name,
      occurredAt: log.occurredAt,
      detailText: describeActivity(log.eventType, detail),
      documentHref: document ? `/editor/${document.id}` : null,
      // 제목·종류는 현재 문서 값을 우선 쓰고, 없으면 이력에 남긴 당시 값을 보여준다 (기회-13)
      documentTitle: document?.title ?? text(detail, "documentTitle"),
      documentType: document?.type ?? text(detail, "documentType"),
      // 금액은 이력에 남지 않으므로 문서를 찾은 경우에만 채운다 (0원과 "모름"은 다르다)
      documentAmount: document?.amount ?? null,
    };
  });

  const newDocumentHref = `/generator?opportunityId=${encodeURIComponent(dto.id)}`;

  return (
    <>
      <PageHeader
        title={dto.name}
        // 브레드크럼이 거래처를 상위로 두므로 되돌아갈 기본 위치도 그 거래처로 맞춘다
        backHref={`/accounts/${dto.accountId}`}
        breadcrumb={[
          { label: "거래처", href: "/accounts" },
          { label: dto.accountName, href: `/accounts/${dto.accountId}` },
          { label: dto.name },
        ]}
        description={`${formatDate(opportunity.createdAt)} 등록 · ${formatDateTime(opportunity.updatedAt)} 최근 수정`}
        actions={
          <>
            {/* 이 기회에 연결될 새 문서를 만들러 가는 동선 (기회-2) */}
            <Button variant="outline" asChild>
              <Link href={newDocumentHref}>
                <FilePlus2 className="size-4" aria-hidden="true" />
                문서 작성
              </Link>
            </Button>
            <OpportunityDetailActions
              opportunityId={dto.id}
              opportunityName={dto.name}
              documentCount={documents.length}
            />
          </>
        }
      />

      <div className="flex-1 overflow-auto p-8 [scrollbar-gutter:stable]">
        {/*
          2단 레이아웃 (기회-4) — 좌: 이 기회가 무엇인지 / 우: 무슨 일이 있었는지.
          lg 미만에서는 한 단으로 쌓여 좌측(단계·기본 정보·메모)이 먼저 보인다.
        */}
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">진행 단계</CardTitle>
              </CardHeader>
              <CardContent>
                <OpportunityStageStepper
                  stage={dto.stage}
                  lostReason={opportunity.lostReason}
                  history={stageHistory}
                  // 노드를 눌러 단계를 옮긴다 (기회-1) — 저장은 stage 전용 라우트만 경유한다
                  action={{ opportunityId: dto.id, name: dto.name }}
                />
              </CardContent>
            </Card>

            {/* 기본 정보·메모는 인라인으로 바로 고친다 (기회-7) */}
            <OpportunityInlineFields
              opportunity={dto}
              accounts={accounts}
              owners={owners}
            />
          </div>

          <div className="min-w-0">
            <OpportunityDetailTabs
              timeline={timeline}
              documents={documents}
              opportunityId={dto.id}
            />
          </div>
        </div>
      </div>
    </>
  );
}
