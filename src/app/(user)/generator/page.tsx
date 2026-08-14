import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { latestVersionsOnly } from "@/lib/document-version";
import { availableModels } from "@/lib/ai/model-access";
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
  // Next.js 16: searchParams 는 Promise 이므로 await 한다
  searchParams: Promise<{ template?: string; opportunityId?: string }>;
}) {
  const [{ template: templateParam, opportunityId }, org] = await Promise.all([
    searchParams,
    getCurrentOrg(),
  ]);

  // 선택 가능한 AI 모델 — 키가 설정된 프로바이더만 내려간다 (환경변수만 읽으므로 동기)
  const { models, defaultModel, mock } = availableModels();

  // 독립 조회는 병렬화 (REACT_BEST_PRACTICES ①)
  // prettier-ignore
  const [wallet, allDocuments, templates, confirmedQuotes, opportunity] = await Promise.all([
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
        rootId: true,
        version: true,
      },
      take: 200,
    }),
    // 불러올 표준 양식 (F-211) — 변수 필드도 함께 넘겨 입력 안내에 쓴다
    prisma.template.findMany({
      where: { orgId: org.id },
      orderBy: [{ scope: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        type: true,
        scope: true,
        variables: {
          orderBy: { sortOrder: "asc" },
          select: { key: true, label: true, sample: true, required: true },
        },
      },
    }),
    // 계약서의 소스로 고를 수 있는 "확정된 견적서" (F-213)
    prisma.document.findMany({
      where: {
        orgId: org.id,
        type: "QUOTE",
        isConfirmed: true,
        status: { not: "VOID" },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        clientName: true,
        amount: true,
        version: true,
      },
      take: 50,
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

  // 참고 문서 선택기에는 버전 묶음별 최신 버전만 노출한다 (F-214)
  const documents = latestVersionsOnly(allDocuments).slice(0, 100);

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

      <div className="flex-1 overflow-auto p-8 [scrollbar-gutter:stable]">
        <GeneratorForm
          libraryDocuments={documents}
          templates={templates}
          confirmedQuotes={confirmedQuotes}
          initialTemplateId={
            templateParam && templates.some((t) => t.id === templateParam)
              ? templateParam
              : null
          }
          models={models}
          defaultModel={defaultModel}
          mockProvider={mock}
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
