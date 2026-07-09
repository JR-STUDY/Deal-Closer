import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { parseContentJson, seedTemplate } from "@/lib/editor-schema";
import { DocumentEditorLoader } from "./_components/document-editor-loader";
import { DocumentStatusControl } from "./_components/document-status-control";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;

  // getCurrentOrg 는 React.cache 로 사실상 무비용 → 먼저 해소 후 document·branding 병렬 (async-parallel)
  const org = await getCurrentOrg();
  const [document, branding] = await Promise.all([
    prisma.document.findUnique({
      where: { id: documentId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.branding.findUnique({ where: { orgId: org.id } }),
  ]);

  if (!document) notFound();

  const initialDoc =
    parseContentJson(document.contentJson) ??
    seedTemplate({
      type: document.type,
      clientName: document.clientName,
      supplierName: branding?.companyName ?? org.name,
      logoUrl: branding?.logoUrl ?? null,
      items: document.items,
    });

  return (
    <>
      <PageHeader
        title={document.title}
        actions={
          <DocumentStatusControl
            documentId={document.id}
            status={document.status}
          />
        }
      />
      <DocumentEditorLoader
        documentId={document.id}
        initialTitle={document.title}
        initialDoc={initialDoc}
      />
    </>
  );
}
