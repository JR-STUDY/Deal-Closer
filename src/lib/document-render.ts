import "server-only";

import { prisma } from "./db";
import { parseContentJson, seedTemplate, type EditorDoc } from "./editor-schema";
import { toPdfBranding, type PdfBranding } from "./pdf-html";

/**
 * 문서를 그릴 **재료를 한 곳에서** 모은다 (F-223 · F-232 · 기회-19).
 *
 * 미리보기 HTML(`GET /api/documents/:id/preview`) · PDF 다운로드
 * (`GET /api/documents/:id/pdf`) · 발송 첨부(`POST /api/documents/:id/send`) 는
 * **같은 문서**를 보여줘야 한다. 세 라우트가 각자 조회하고 각자 기본 문서를 시드하면,
 * 어느 한쪽만 손봤을 때 "담당자가 화면에서 확인한 것과 다른 PDF" 가 첨부돼 고객에게
 * 나간다 — 화면으로는 알 수 없는 사고다. 그래서 조회·시드를 이 모듈이 전담한다
 * (파일명은 `@/lib/document-file` 이 정한다 — 그쪽은 클라이언트도 봐야 해서 순수 모듈이다).
 *
 * 렌더러는 그대로 하나씩이다 — HTML 은 `@/lib/pdf-html`, PDF 는 `@/lib/pdf`.
 * 이 모듈은 그 **입력만** 만든다. 회사 정보(공급자 칸·로고·인감) 반영도 여기서 하지
 * 않는다: 두 렌더러가 지나는 `buildDocumentHtml` 안의 `withCompanyDefaults` 하나가
 * 단일 기준이고(설정 7), 여기서 한 번 더 채우면 규칙이 두 벌이 된다.
 */

/** 조회·시드까지 끝난 렌더 입력 */
export type DocumentRenderInput = {
  document: {
    id: string;
    title: string;
    type: string;
    status: string;
    clientName: string | null;
    amount: number;
    opportunityId: string | null;
  };
  /** 캔버스 문서 — `contentJson` 이 없으면 편집 화면과 같은 기본 문서를 시드한다 */
  doc: EditorDoc;
  branding: PdfBranding;
};

/**
 * 문서와 회사 정보를 **조직 범위로 좁혀** 읽고 캔버스 문서까지 만든다.
 * 없는 문서와 남의 문서는 같은 `null` 이다 — 존재 여부도 알려주지 않는다.
 */
export async function loadDocumentRenderInput(
  id: string,
  org: { id: string; name: string },
): Promise<DocumentRenderInput | null> {
  const [document, branding] = await Promise.all([
    prisma.document.findFirst({
      where: { id, orgId: org.id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.branding.findUnique({ where: { orgId: org.id } }),
  ]);
  if (!document) return null;

  // 상호 폴백은 언제나 조직명이다 — 공급자는 조직이지 사람이 아니다 (AGENTS.md 설정 7)
  const pdfBranding = toPdfBranding(branding, org.name);

  /*
   * `contentJson` 이 없는 문서(레거시 폼 문서·구버전 초안)는 편집 화면과 **같은 기본 문서**를
   * 시드한다. 여기서 null 을 돌려주면 첨부 없이 발송되거나 빈 PDF 가 나간다.
   * `amount` 를 함께 넘겨 캔버스 합계와 저장된 금액을 처음부터 일치시킨다 —
   * 어긋난 채로 열면 저장 한 번에 실제 금액이 0 으로 덮인다 (기회-6).
   */
  const doc =
    parseContentJson(document.contentJson) ??
    seedTemplate({
      type: document.type,
      clientName: document.clientName,
      company: pdfBranding,
      items: document.items,
      amount: document.amount,
    });

  return {
    document: {
      id: document.id,
      title: document.title,
      type: document.type,
      status: document.status,
      clientName: document.clientName,
      amount: document.amount,
      opportunityId: document.opportunityId,
    },
    doc,
    branding: pdfBranding,
  };
}
