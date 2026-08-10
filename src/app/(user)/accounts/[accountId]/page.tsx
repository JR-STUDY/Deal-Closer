import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { toAccountDTO } from "@/lib/account";
import { formatDate, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountDetailActions } from "./_components/account-detail-actions";
import { AccountRelatedTabs } from "./_components/account-related-tabs";

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
 * 거래처 상세 (F-103) — 기본 정보 + 수정·삭제 + 연관 기회·문서·이메일 이력 탭.
 * 네 조회는 서로 독립이라 병렬로 실행하고, 전부 orgId 로 스코프한다.
 */
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const [{ accountId }, org] = await Promise.all([params, getCurrentOrg()]);

  const [account, opportunities, documents, emailLogs] = await Promise.all([
    prisma.account.findFirst({ where: { id: accountId, orgId: org.id } }),
    prisma.opportunity.findMany({
      where: { accountId, orgId: org.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        stage: true,
        expectedAmount: true,
        expectedCloseDate: true,
        owner: { select: { name: true } },
      },
    }),
    // 문서는 기회를 경유해 거래처에 붙는다 (Document.opportunityId → Opportunity.accountId)
    prisma.document.findMany({
      where: { orgId: org.id, opportunity: { accountId } },
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
      where: { document: { orgId: org.id, opportunity: { accountId } } },
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
  ]);

  if (!account) notFound();

  const dto = toAccountDTO(account);

  return (
    <>
      <PageHeader
        title={account.companyName}
        backHref="/accounts"
        breadcrumb={[
          { label: "거래처", href: "/accounts" },
          { label: account.companyName },
        ]}
        description={`${formatDate(account.createdAt)} 등록 · ${formatDateTime(account.updatedAt)} 최근 수정`}
        actions={
          <AccountDetailActions
            account={dto}
            opportunityCount={opportunities.length}
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
                <InfoRow label="회사명" value={account.companyName} />
                <InfoRow label="담당자명" value={account.contactName} />
                <InfoRow label="직책" value={account.position} />
                <InfoRow label="핸드폰 번호" value={account.phone} />
                <InfoRow label="담당자 이메일" value={account.email} />
                <InfoRow label="사업자등록번호" value={account.bizRegNo} />
              </dl>
            </CardContent>
          </Card>

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

          <AccountRelatedTabs
            opportunities={opportunities}
            documents={documents}
            emailLogs={emailLogs}
          />
        </div>
      </div>
    </>
  );
}
