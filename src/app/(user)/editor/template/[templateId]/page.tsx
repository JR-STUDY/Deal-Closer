import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { parseContentJson, seedTemplate } from "@/lib/editor-schema";
import { DocumentEditorLoader } from "../../_components/document-editor-loader";

/**
 * 표준 양식 편집 화면.
 *
 * 양식도 **블록 캔버스 문서**(`Template.contentJson`)를 갖는다. 예전에는 그 본문을 볼
 * 길조차 없어서(카드에 변수 목록만 있었다) 무엇이 담겼는지 확인하려면 그 양식으로 문서를
 * 하나 만들어 봐야 했다.
 *
 * 문서 편집과 **같은 에디터**를 쓰고, 다른 점(상태·버전·발송·금액이 없다)은
 * `EditorTarget` 하나로 넘긴다 — 에디터를 두 벌 만들면 캔버스·되돌리기·정렬이 갈라진다.
 *
 * 조직 스코프로 좁혀 조회한다 — 다른 조직의 양식 id 는 404 로 끝나야 한다.
 */
export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  // params 와 조직 조회는 서로 독립이다 — 순차로 기다리면 왕복이 하나 늘어난다
  // (성능 규칙 ①: 독립 조회는 Promise.all 로 묶는다. generator/page.tsx 와 같은 형태)
  const [{ templateId }, org] = await Promise.all([params, getCurrentOrg()]);

  const [template, branding, catalog] = await Promise.all([
    prisma.template.findFirst({ where: { id: templateId, orgId: org.id } }),
    prisma.branding.findUnique({ where: { orgId: org.id } }),
    // 품목 카탈로그 — 문서 편집과 같은 인스펙터를 쓰므로 같이 넘긴다
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

  if (!template) notFound();

  // 아직 AI 세팅이 안 된 양식은 문서와 같은 기본 문서에서 시작한다
  const initialDoc =
    parseContentJson(template.contentJson) ??
    seedTemplate({
      type: template.type,
      clientName: "",
      supplierName: branding?.companyName ?? org.name,
      logoUrl: branding?.logoUrl ?? null,
      items: [],
    });

  return (
    <DocumentEditorLoader
      target={{ kind: "template", templateId: template.id }}
      initialTitle={template.name}
      initialDoc={initialDoc}
      catalog={catalog}
    />
  );
}
