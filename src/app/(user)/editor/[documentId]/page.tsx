import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { parseContentJson, seedTemplate } from "@/lib/editor-schema";
import { DocumentEditorLoader } from "./_components/document-editor-loader";
import { availableModels } from "@/lib/ai/model-access";
import { documentEditLock } from "@/lib/document-edit";

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
      // 품목 없이 금액만 있는 문서(수동 생성·구버전)도 캔버스 합계가 저장된 금액과
      // 맞아야 한다 — 어긋난 채로 열면 저장 한 번에 실제 금액이 0 으로 덮인다.
      amount: document.amount,
    });

  // AI 부분 재작성(F-215)에 쓸 모델 선택 목록 (환경변수만 읽으므로 동기)
  const { models, defaultModel, mock } = availableModels();

  return (
    <DocumentEditorLoader
      documentId={document.id}
      initialTitle={document.title}
      initialStatus={document.status}
      initialDoc={initialDoc}
      initialAmount={document.amount}
      catalog={catalog}
      version={document.version}
      isConfirmed={document.isConfirmed}
      // 잠금 판정은 서버(PATCH)와 같은 순수 함수를 쓴다 — 화면과 API 가 갈라지지 않게
      lock={documentEditLock(document)}
      models={models}
      defaultModel={defaultModel}
      mockProvider={mock}
    />
  );
}
