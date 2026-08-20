import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toAccountDTO } from "@/lib/account";
import { toContactDTO } from "@/lib/contact";
import { PageHeader } from "@/components/page-header";
import { DetailShell } from "@/components/detail-shell";
import { NewOpportunityButton } from "@/components/opportunity/new-opportunity-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountContacts } from "./_components/account-contacts";
import { AccountDetailActions } from "./_components/account-detail-actions";
import { AccountDocumentList } from "./_components/account-document-list";
import {
  AccountEmailList,
  AccountOpportunityList,
} from "./_components/account-related-panels";

/** 기본 정보 한 줄 (값이 없으면 안내 문구를 대신 보여준다) */
function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">
        {value ? (
          value
        ) : (
          <span className="text-muted-foreground">입력하지 않았습니다.</span>
        )}
      </dd>
    </div>
  );
}

/**
 * 거래처 상세 (F-103) — 기본 정보 + 담당자 + 메모 + 연관 기회·문서·이메일 이력 탭.
 *
 * 기회 상세와 **같은 골격**(`DetailShell`)을 쓴다 (3차 피드백 1). 본문(기본 정보·담당자·
 * 메모)이 전체 폭을 쓰고, 연관 기회·문서·이메일 이력은 오른쪽에서 밀려 나오는 드로어에
 * 담긴다 — 필요할 때만 꺼내고 트리거를 한 번 더 누르면 다시 들어간다.
 *
 * 여섯 조회는 서로 독립이라 병렬로 실행하고, 전부 orgId 로 스코프한다.
 */
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const [{ accountId }, user] = await Promise.all([params, getCurrentUser()]);

  const [account, contacts, opportunities, documents, emailLogs, owners] =
    await Promise.all([
      prisma.account.findFirst({ where: { id: accountId, orgId: user.orgId } }),
      // 상세에서는 담당자 **전원**을 다룬다 (목록은 대표 1명만 본다 — 거래처-8).
      // 정렬은 화면이 `sortContacts` 로 맞추므로 여기서는 조회 순서를 고정만 해 둔다.
      prisma.contact.findMany({
        where: { accountId, orgId: user.orgId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.opportunity.findMany({
        where: { accountId, orgId: user.orgId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          stage: true,
          expectedAmount: true,
          // 0 원인 이유(확정 문서 없음)를 목록에서 구분하기 위해 함께 읽는다 (기회-6 ④)
          confirmedDocumentId: true,
          expectedCloseDate: true,
          owner: { select: { name: true } },
        },
      }),
      // 문서는 기회를 경유해 거래처에 붙는다 (Document.opportunityId → Opportunity.accountId)
      prisma.document.findMany({
        where: { orgId: user.orgId, opportunity: { accountId } },
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
      // 이메일 이력은 그 문서들의 발송 기록이다
      prisma.emailLog.findMany({
        where: { document: { orgId: user.orgId, opportunity: { accountId } } },
        orderBy: { sentAt: "desc" },
        select: {
          id: true,
          subject: true,
          recipients: true,
          status: true,
          sentAt: true,
          openedAt: true,
          document: { select: { title: true } },
        },
      }),
      // 기회 등록 다이얼로그의 담당자 후보 (거래처는 이 화면의 거래처로 미리 선택된다)
      prisma.user.findMany({
        where: { orgId: user.orgId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

  if (!account) notFound();

  const dto = toAccountDTO(account);

  return (
    <>
      <PageHeader
        title={account.companyName}
        backHref="/accounts"
        /*
         * 기회 상세와 **같은 2줄 구조**다 (3차 피드백 3) — 위 줄이 그 칸의 뜻(거래처),
         * 아래 줄이 값(회사명)이다. 칸이 하나뿐이라 `>` 구분자는 나오지 않는다.
         * caption 을 주지 않는 다른 화면(보관함 등)은 기존 한 줄 표기를 그대로 쓴다.
         *
         * 위 줄의 `거래처` 는 거래처 목록으로 가는 링크다 (4차 피드백 1) — 경로는 공용
         * 컴포넌트가 caption 으로 정하므로 화면이 따로 넘기지 않는다(기회 상세와 같은 동작).
         *
         * 등록·최근 수정 일시는 싣지 않는다 (4차 피드백 3) — 회사 정보의 생성·수정 시각은
         * 영업 판단에 쓰이지 않는데 제목 바로 아래를 차지해 회사명보다 먼저 눈에 든다.
         */
        breadcrumb={[{ caption: "거래처", label: account.companyName }]}
        actions={
          <>
            <NewOpportunityButton
              // 이 화면에서는 거래처가 정해져 있으므로 자동완성에 미리 채워 연다
              owners={owners}
              defaultAccountId={account.id}
              defaultAccountName={account.companyName}
              defaultOwnerId={user.id}
              label="새 기회"
              variant="outline"
            />
            <AccountDetailActions
              account={dto}
              opportunityCount={opportunities.length}
            />
          </>
        }
      />

      {/*
        본문은 전체 폭을 쓰고 연관 데이터는 드로어로 뺀다 — 기회 상세와 **같은 골격**이다
        (3차 피드백 1). 문서 `createdAt` 은 클라이언트 목록으로 넘기므로 ISO 문자열로 바꾼다
        (REACT_BEST_PRACTICES: 직렬화 불가한 값을 클라이언트에 넘기지 않는다).
      */}
      <DetailShell
        panels={[
          {
            id: "opportunities",
            label: "영업 기회",
            count: opportunities.length,
            content: <AccountOpportunityList opportunities={opportunities} />,
          },
          {
            id: "documents",
            label: "문서",
            count: documents.length,
            content: (
              <AccountDocumentList
                documents={documents.map((document) => ({
                  ...document,
                  createdAt: document.createdAt.toISOString(),
                }))}
              />
            ),
          },
          {
            id: "emails",
            label: "이메일 이력",
            count: emailLogs.length,
            content: <AccountEmailList emailLogs={emailLogs} />,
          },
        ]}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">기본 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <InfoRow label="회사명" value={account.companyName} />
              <InfoRow label="사업자등록번호" value={account.bizRegNo} />
            </dl>
          </CardContent>
        </Card>

        {/* 담당자는 여러 명이므로 기본 정보 밖으로 뺀다 — 여기서 전원을 관리한다 (거래처-8) */}
        <AccountContacts
          accountId={account.id}
          companyName={account.companyName}
          contacts={contacts.map(toContactDTO)}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">메모</CardTitle>
          </CardHeader>
          <CardContent>
            {account.memo ? (
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {account.memo}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                아직 메모가 없습니다. 수정에서 영업 이력·특이사항을 남겨두시면
                팀원이 함께 볼 수 있습니다.
              </p>
            )}
          </CardContent>
        </Card>
      </DetailShell>
    </>
  );
}
