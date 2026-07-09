import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toTemplateDTO, visibleTemplatesWhere } from "@/lib/email-template";
import { TemplateDetail } from "../_components/template-detail";

/**
 * 메일 템플릿 상세 (/settings/templates/[id])
 * 조회·수정·삭제를 전체 화면에서 처리한다.
 * 볼 수 있는 범위(팀 공용 + 본인 개인) 밖이면 404.
 */
export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // params·현재 사용자는 서로 독립 → 병렬로 await
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  const template = await prisma.emailTemplate.findFirst({
    where: { id, ...visibleTemplatesWhere(user.orgId, user.id) },
  });

  if (!template) {
    notFound();
  }

  return <TemplateDetail template={toTemplateDTO(template)} />;
}
