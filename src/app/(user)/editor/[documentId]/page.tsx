import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import {
  parseContentJson,
  seedTemplate,
  withCompanyDefaults,
} from "@/lib/editor-schema";
import { toCompanyProfile } from "@/lib/branding";
import { DocumentEditorLoader } from "../_components/document-editor-loader";
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
    // 조직 범위로 좁혀 조회한다 — 다른 조직의 문서 id 는 404 로 끝나야 한다
    // (양식 편집 페이지·발송 페이지와 같은 규칙)
    prisma.document.findFirst({
      where: { id: documentId, orgId: org.id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.branding.findUnique({ where: { orgId: org.id } }),
    // 품목 카탈로그(마스터 데이터) — 클라 useEffect fetch 대신 서버에서 조회해 prop 전달 (no-fetch-in-effect).
    // **비활성 품목은 내려보내지 않는다** — `CatalogItem.isActive` 는 "에디터 품목 선택
    // 목록에 뜨는지" 를 뜻한다(지우는 대신 내리는 길). 필터가 빠지면 내려 둔 품목이
    // 선택 목록 맨 위에 다시 올라와, 카탈로그 화면에서 비활성으로 만든 일이 무의미해진다.
    prisma.catalogItem.findMany({
      where: { orgId: org.id, isActive: true },
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

  // 상호 폴백을 정하는 곳은 `toCompanyProfile` 하나다 (회사 정보를 비워 둔 조직도 문서를 만든다)
  const company = toCompanyProfile(branding, org.name);

  /*
   * 회사 정보 반영을 **에디터에서도** 한다 (`withCompanyDefaults`).
   * 인쇄 렌더러(`buildDocumentHtml`)가 같은 함수를 지나므로 캔버스·미리보기·PDF 가
   * 같은 값을 그린다 — 예전에는 폴백이 인쇄 쪽에만 있어서 화면에 없는 값이 PDF 에만
   * 찍혔다. 회사 정보를 나중에 채운 조직의 **예전 문서**도 여기서 빈 칸이 메워지고,
   * 그 값은 다음 저장에 함께 남는다(역할 치유와 같은 선례).
   */
  const initialDoc = withCompanyDefaults(
    parseContentJson(document.contentJson) ??
      seedTemplate({
        type: document.type,
        clientName: document.clientName,
        company,
        items: document.items,
        // 품목 없이 금액만 있는 문서(수동 생성·구버전)도 캔버스 합계가 저장된 금액과
        // 맞아야 한다 — 어긋난 채로 열면 저장 한 번에 실제 금액이 0 으로 덮인다.
        amount: document.amount,
      }),
    company,
  );

  // AI 부분 재작성(F-215)에 쓸 모델 선택 목록 (환경변수만 읽으므로 동기)
  const { models, defaultModel, mock } = availableModels();

  return (
    <DocumentEditorLoader
      target={{
        kind: "document",
        documentId: document.id,
        initialStatus: document.status,
        initialAmount: document.amount,
        version: document.version,
        isConfirmed: document.isConfirmed,
        // 잠금 판정은 서버(PATCH)와 같은 순수 함수를 쓴다 — 화면과 API 가 갈라지지 않게
        lock: documentEditLock(document),
        models,
        defaultModel,
        mockProvider: mock,
      }}
      initialTitle={document.title}
      initialDoc={initialDoc}
      catalog={catalog}
    />
  );
}
