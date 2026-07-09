import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toTemplateDTO, visibleTemplatesWhere } from "@/lib/email-template";
import { teamAddress } from "@/lib/mail-domain";
import { EMAIL_PROVIDER_LABELS, type EmailProvider } from "@/lib/constants";
import { SenderClient, type SenderOption } from "./_components/sender-client";

export default async function SenderPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  // params·현재 사용자는 서로 독립 → 병렬로 await
  const [{ documentId }, user] = await Promise.all([params, getCurrentUser()]);

  // 문서·개인 발신 계정·메일 템플릿·인증 팀 도메인을 병렬 조회 (REACT_BEST_PRACTICES)
  const [document, personalAccount, templates, verifiedDomains] =
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
      // 담당자가 발신 주소로 고를 수 있는 인증(VERIFIED) 팀 도메인
      prisma.teamMailDomain.findMany({
        where: { orgId: user.orgId, status: "VERIFIED" },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      }),
    ]);

  if (!document) {
    notFound();
  }

  // 발신 계정 선택지 — 개인 연동 계정 + 인증 팀 도메인 (발송 화면에서 바로 전환)
  const senderOptions: SenderOption[] = [
    ...(personalAccount
      ? [
          {
            value: "personal",
            kind: "personal" as const,
            email: personalAccount.email,
            label: `개인 계정 · ${
              EMAIL_PROVIDER_LABELS[personalAccount.provider as EmailProvider] ??
              personalAccount.provider
            }`,
            defaultCc: "",
          },
        ]
      : []),
    ...verifiedDomains.map((d) => ({
      value: d.id,
      kind: "team" as const,
      email: teamAddress(user.email, d.domain),
      label: d.label ? `${d.label} (@${d.domain})` : `@${d.domain}`,
      defaultCc: d.defaultCc ?? "",
    })),
  ];

  // 현재 선택값 — 인증된 팀 도메인을 골랐으면 그 도메인, 아니면 개인 계정(있을 때)
  const selectedTeamId =
    verifiedDomains.find((d) => d.id === user.mailDomainId)?.id ?? null;
  const selectedValue =
    selectedTeamId ?? (personalAccount ? "personal" : null);

  return (
    <SenderClient
      document={{
        id: document.id,
        title: document.title,
        type: document.type,
        clientName: document.clientName,
        amount: document.amount,
      }}
      senderOptions={senderOptions}
      initialSelectedValue={selectedValue}
      senderName={user.name}
      templates={templates.map(toTemplateDTO)}
      signature={user.signature ?? ""}
    />
  );
}
