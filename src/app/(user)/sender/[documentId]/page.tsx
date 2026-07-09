import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toTemplateDTO, visibleTemplatesWhere } from "@/lib/email-template";
import { resolveSendingIdentity } from "@/lib/mail-domain";
import { SenderClient } from "./_components/sender-client";

export default async function SenderPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  // params·현재 사용자는 서로 독립 → 병렬로 await
  const [{ documentId }, user] = await Promise.all([params, getCurrentUser()]);

  // 문서·개인 발신 계정·메일 템플릿·선택한 팀 도메인을 병렬 조회 (REACT_BEST_PRACTICES)
  const [document, personalAccount, templates, selectedDomain] =
    await Promise.all([
      prisma.document.findUnique({ where: { id: documentId } }),
      prisma.emailAccount
        .findFirst({ where: { userId: user.id, isDefault: true } })
        .then(
          (a) =>
            a ?? prisma.emailAccount.findFirst({ where: { userId: user.id } }),
        ),
      prisma.emailTemplate.findMany({
        where: visibleTemplatesWhere(user.orgId, user.id),
        orderBy: [{ ownerId: "asc" }, { updatedAt: "desc" }],
      }),
      user.mailDomainId
        ? prisma.teamMailDomain.findUnique({ where: { id: user.mailDomainId } })
        : Promise.resolve(null),
    ]);

  if (!document) {
    notFound();
  }

  // 선택한 팀 도메인이 있으면 팀 주소로, 없으면 개인 연동 계정으로 발신한다
  const identity = resolveSendingIdentity({
    userEmail: user.email,
    selectedDomain: selectedDomain
      ? { domain: selectedDomain.domain, status: selectedDomain.status }
      : null,
    personalEmail: personalAccount?.email ?? null,
  });

  return (
    <SenderClient
      document={{
        id: document.id,
        title: document.title,
        type: document.type,
        clientName: document.clientName,
        amount: document.amount,
      }}
      sender={
        identity.email
          ? { email: identity.email, kind: identity.kind }
          : null
      }
      templates={templates.map(toTemplateDTO)}
      signature={user.signature ?? ""}
    />
  );
}
