import { FileStack } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { TEMPLATE_SCOPE_LABELS, type TemplateScope } from "@/lib/constants";
import { TemplateUploadDialog } from "./_components/template-upload-dialog";
import { TemplateCard, type TemplateCardData } from "./_components/template-card";

/**
 * 표준 양식 관리 (PRD 4.2.1 — F-201 · F-202 · F-203 · F-204)
 * 공용 문서함(팀 표준 양식) / 내 문서함(개인 양식)으로 나눠 보여준다.
 */
export default async function TemplatesPage() {
  const org = await getCurrentOrg();

  const templates = await prisma.template.findMany({
    where: { orgId: org.id },
    orderBy: [{ scope: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      type: true,
      scope: true,
      description: true,
      sourceFileName: true,
      updatedAt: true,
      variables: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          key: true,
          label: true,
          sample: true,
          required: true,
        },
      },
      _count: { select: { documents: true } },
    },
  });

  // 클라이언트 컴포넌트에는 직렬화 가능한 값만 넘긴다 (Date → ISO 문자열)
  const cards: TemplateCardData[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    scope: t.scope,
    description: t.description,
    sourceFileName: t.sourceFileName,
    updatedAt: t.updatedAt.toISOString(),
    documentCount: t._count.documents,
    variables: t.variables,
  }));

  const groups: { scope: TemplateScope; items: TemplateCardData[] }[] = [
    { scope: "COMMON", items: cards.filter((t) => t.scope === "COMMON") },
    { scope: "PERSONAL", items: cards.filter((t) => t.scope === "PERSONAL") },
  ];

  return (
    <>
      <PageHeader
        title="표준 양식"
        breadcrumb={[
          { label: "문서 보관함", href: "/library" },
          { label: "표준 양식" },
        ]}
        description="기존에 쓰던 양식을 올리면 AI 가 표준 양식으로 세팅하고 변수 항목을 정리합니다. 문서 생성 시 이 양식을 불러와 값만 채웁니다."
        actions={<TemplateUploadDialog />}
      />

      <div className="flex-1 space-y-8 overflow-auto p-8">
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
            <FileStack className="size-10 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">
              아직 표준 양식이 없습니다. 지금 쓰고 있는 견적서·계약서 파일(PDF·이미지·엑셀)을
              올리면 AI 가 재사용 가능한 양식으로 정리해 드립니다.
            </p>
            <TemplateUploadDialog />
          </div>
        ) : (
          groups.map((group) =>
            group.items.length === 0 ? null : (
              <section key={group.scope} className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">
                  {TEMPLATE_SCOPE_LABELS[group.scope]} · {group.items.length}개
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))}
                </div>
              </section>
            ),
          )
        )}
      </div>
    </>
  );
}
