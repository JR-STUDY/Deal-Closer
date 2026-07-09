import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { parseContentJson, seedTemplate } from "@/lib/editor-schema";
import { DocumentEditorLoader } from "./_components/document-editor-loader";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;

  // getCurrentOrg 는 React.cache 로 사실상 무비용 → 먼저 해소 후 document·branding·catalog 병렬 (async-parallel)
  const org = await getCurrentOrg();
  const [document, branding, catalog] = await Promise.all([
    prisma.document.findUnique({
      where: { id: documentId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.branding.findUnique({ where: { orgId: org.id } }),
    // 품목 카탈로그(마스터 데이터) — 클라 useEffect fetch 대신 서버에서 조회해 prop 전달 (no-fetch-in-effect)
    prisma.catalogItem.findMany({
      where: { orgId: org.id },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        unitPrice: true,
        description: true,
        category: true,
        unit: true,
      },
    }),
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
    <DocumentEditorLoader
      documentId={document.id}
      initialTitle={document.title}
      initialStatus={document.status}
      initialDoc={initialDoc}
      catalog={catalog}
    />
  );
}
