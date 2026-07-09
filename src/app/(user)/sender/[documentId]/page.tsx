import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SenderClient } from "./_components/sender-client";

export default async function SenderPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;

  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    notFound();
  }

  const account =
    (await prisma.emailAccount.findFirst({ where: { isDefault: true } })) ??
    (await prisma.emailAccount.findFirst());

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
    />
  );
}
