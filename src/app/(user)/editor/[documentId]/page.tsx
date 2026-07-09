import Link from "next/link";
import { notFound } from "next/navigation";
import { Send } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { EditorClient } from "./_components/editor-client";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  if (!document) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={document.title}
        actions={
          <>
            <StatusBadge status={document.status} />
            <Button asChild variant="outline">
              <Link href={`/sender/${document.id}`}>
                <Send className="size-4" />
                발송하기
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-8">
        <EditorClient document={document} />
      </div>
    </>
  );
}
