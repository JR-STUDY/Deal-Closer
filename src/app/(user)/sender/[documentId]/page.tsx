import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toTemplateDTO, visibleTemplatesWhere } from "@/lib/email-template";
import { SenderClient } from "./_components/sender-client";

export default async function SenderPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  // params·현재 사용자는 서로 독립 → 병렬로 await
  const [{ documentId }, user] = await Promise.all([params, getCurrentUser()]);

  // 문서·발신 계정·메일 템플릿을 병렬 조회 (독립 쿼리 — REACT_BEST_PRACTICES)
  const [document, account, templates] = await Promise.all([
    prisma.document.findUnique({ where: { id: documentId } }),
    prisma.emailAccount
      .findFirst({ where: { userId: user.id, isDefault: true } })
      .then((a) => a ?? prisma.emailAccount.findFirst({ where: { userId: user.id } })),
    prisma.emailTemplate.findMany({
      where: visibleTemplatesWhere(user.orgId, user.id),
      orderBy: [{ ownerId: "asc" }, { updatedAt: "desc" }],
    }),
  ]);

  if (!document) {
    notFound();
  }

  return (
    <SenderClient
      document={{
        id: document.id,
        title: document.title,
        type: document.type,
        clientName: document.clientName,
        amount: document.amount,
      }}
      account={account ? { email: account.email } : null}
      templates={templates.map(toTemplateDTO)}
    />
  );
}
