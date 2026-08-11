import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { GeneratorForm } from "./_components/generator-form";

/**
 * AI 문서 생성 (F-201).
 *
 * 기회 상세에서 "문서 작성"으로 들어오면 `?opportunityId=` 가 함께 온다 (기회-2). 그때는
 * 만든 문서를 그 기회에 바로 연결하므로, 어느 기회에 붙을지 화면에서 먼저 알려준다.
 * 기회 id 는 주소창에서 바꿀 수 있으므로 **반드시 orgId 로 좁혀 확인**한다 — 찾지 못하면
 * 연결 없이 평소의 문서 생성 화면으로 둔다.
 */
export default async function GeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string }>;
}) {
  const [org, { opportunityId }] = await Promise.all([
    getCurrentOrg(),
    searchParams,
  ]);

  // 독립 조회는 병렬화 (REACT_BEST_PRACTICES ①)
  const [wallet, documents, opportunity] = await Promise.all([
    prisma.creditWallet.findUnique({ where: { orgId: org.id } }),
    prisma.document.findMany({
      where: { orgId: org.id, status: { not: "VOID" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        clientName: true,
        amount: true,
        createdAt: true,
      },
      take: 100,
    }),
    opportunityId
      ? prisma.opportunity.findFirst({
          where: { id: opportunityId, orgId: org.id },
          select: {
            id: true,
            name: true,
            account: { select: { companyName: true } },
          },
        })
      : null,
  ]);

  return (
    <>
      <PageHeader
        title="새 문서 생성"
        description="AI와의 대화로 견적서·계약서·NDA·제안서를 빠르게 만들어보세요."
        actions={
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="size-3.5 text-primary" />
            {wallet?.balance ?? 0} Credits
          </Badge>
        }
      />

      <div className="flex-1 overflow-auto p-8">
        <GeneratorForm
          libraryDocuments={documents}
          // 클라이언트로는 직렬화 가능한 값만 넘긴다 (REACT_BEST_PRACTICES ③)
          opportunity={
            opportunity
              ? {
                  id: opportunity.id,
                  name: opportunity.name,
                  accountName: opportunity.account.companyName,
                }
              : null
          }
        />
      </div>
    </>
  );
}
