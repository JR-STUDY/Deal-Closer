import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { latestVersionsOnly } from "@/lib/document-version";
import { OPEN_OPPORTUNITY_STAGES } from "@/lib/constants";
import { availableModels } from "@/lib/ai/model-access";
import { GeneratorForm } from "./_components/generator-form";

/**
 * AI 문서 생성 (F-201 · F-211 · F-212).
 *
 * 기회 상세에서 "문서 작성"으로 들어오면 `?opportunityId=` 가 함께 온다 (기회-2). 그때는
 * 만든 문서를 그 기회에 바로 연결하므로, 어느 기회에 붙을지 화면에서 먼저 알려준다.
 *
 * 기회 없이 이 화면으로 바로 들어올 수도 있으므로 **후보 목록도 함께 내린다** (F-212) —
 * 진입 경로에 따라 기회를 고를 수 있고 없고가 갈리면, 보관함에서 시작한 담당자는 문서를
 * 만든 뒤 다시 기회에 붙이러 가야 한다. 기회 연결은 끝까지 **선택**이다(빠른 초안 허용).
 *
 * 후보는 **진행 중 기회만**이다 — 수주·실주로 마감한 기회에 새 문서를 만들 이유가 없다.
 * 그래서 `?opportunityId=` 로 마감 기회가 들어오면 미리 선택되지 않는다. 기회 상세도
 * 마감이면 진입점을 감추므로 정상 경로에서는 생기지 않는 상황이다.
 * 기회 id 는 주소창에서 바꿀 수 있으므로 **반드시 후보 목록 안에서만** 초기값으로 인정한다.
 */
export default async function GeneratorPage({
  searchParams,
}: {
  // Next.js 16: searchParams 는 Promise 이므로 await 한다
  searchParams: Promise<{ template?: string; opportunityId?: string }>;
}) {
  const [{ template: templateParam, opportunityId: opportunityParam }, org] = await Promise.all([
    searchParams,
    getCurrentOrg(),
  ]);

  // 선택 가능한 AI 모델 — 키가 설정된 프로바이더만 내려간다 (환경변수만 읽으므로 동기)
  const { models, defaultModel, mock } = availableModels();

  // 독립 조회는 병렬화 (REACT_BEST_PRACTICES ①)
  // prettier-ignore
  const [
    wallet,
    allDocuments,
    templates,
    confirmedQuotes,
    opportunities,
    promptPresets,
  ] = await Promise.all([
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
    // 문서를 붙일 수 있는 영업 기회 (F-212) — 마감된 기회는 대상이 아니므로 제외한다
    prisma.opportunity.findMany({
      where: { orgId: org.id, stage: { in: [...OPEN_OPPORTUNITY_STAGES] } },
      orderBy: [{ expectedCloseDate: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        stage: true,
        expectedAmount: true,
        account: { select: { companyName: true } },
      },
      take: 100,
    }),
    // 저장해 둔 예시 지시문 (기본 예시는 코드에 있다 — @/lib/prompt-preset)
    prisma.promptPreset.findMany({
      where: { orgId: org.id },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, text: true, sortOrder: true },
    }),
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
          opportunities={opportunities.map((opportunity) => ({
            id: opportunity.id,
            name: opportunity.name,
            stage: opportunity.stage,
            expectedAmount: opportunity.expectedAmount,
            accountName: opportunity.account.companyName,
          }))}
          // 주소로 들어온 기회는 **후보 안에 있을 때만** 초기 선택한다 (마감·타 조직 제외)
          initialOpportunityId={
            opportunityParam &&
            opportunities.some((o) => o.id === opportunityParam)
              ? opportunityParam
              : null
          }
          promptPresets={promptPresets}
        />
      </div>
    </>
  );
}
