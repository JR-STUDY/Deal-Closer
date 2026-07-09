import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toTemplateDTO } from "@/lib/email-template";
import { PageHeader } from "@/components/page-header";
import { TemplatesManager } from "./_components/templates-manager";

/**
 * 메일 템플릿 관리 (/settings/templates)
 * 팀 공용(ownerId=null) + 본인 개인 템플릿을 조회해 생성·수정·삭제한다.
 * 저장한 템플릿은 발송 화면에서 불러와 사용한다.
 */
export default async function EmailTemplatesPage() {
  const user = await getCurrentUser();

  const templates = await prisma.emailTemplate.findMany({
    where: {
      orgId: user.orgId,
      OR: [{ ownerId: null }, { ownerId: user.id }],
    },
    orderBy: [{ ownerId: "asc" }, { updatedAt: "desc" }],
  });

  return (
    <>
      <PageHeader
        title="메일 템플릿"
        description="자주 쓰는 발송 문구를 저장해 두고, 이메일 발송 화면에서 바로 불러와 사용합니다."
      />

      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-4xl">
          <TemplatesManager initialTemplates={templates.map(toTemplateDTO)} />
        </div>
      </div>
    </>
  );
}
