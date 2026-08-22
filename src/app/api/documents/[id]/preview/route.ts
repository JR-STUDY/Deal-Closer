import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { parseContentJson, seedTemplate } from "@/lib/editor-schema";
import { buildDocumentHtml, toPdfBranding } from "@/lib/pdf-html";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/documents/:id/preview — 문서 미리보기 HTML (기회-19).
 *
 * **인쇄용 HTML 생성기(`@/lib/pdf-html`)를 그대로 재사용한다.** 그 모듈이 이미 블록 절대좌표
 * 배치와 브랜딩(로고·주색)을 재현하고 본문을 이스케이프하므로, 미리보기용 렌더러를 따로 만들면
 * "미리보기와 실제 PDF 가 다르게 보이는" 문제가 곧바로 생긴다.
 * 에디터의 `editor-preview.tsx` 는 편집 상태(선택·드래그)를 전제로 한 무거운 클라이언트
 * 컴포넌트라 기회 상세에서 다시 쓰기 어렵다 — 그래서 서버가 만든 HTML 을 iframe 에 띄운다.
 *
 * `contentJson` 이 없는 문서(AI 초안·레거시 폼 문서)는 편집 화면과 **같은 기본 문서**를
 * 만들어 보여준다 — 미리보기와 편집 화면이 다른 내용을 보여주면 안 된다.
 *
 * 조직 스코프로 좁혀 조회한다 — 다른 조직의 문서 id 가 들어와도 404 로 끝나야 한다.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const [{ id }, org] = await Promise.all([params, getCurrentOrg()]);

  const [document, branding] = await Promise.all([
    prisma.document.findFirst({
      where: { id, orgId: org.id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.branding.findUnique({ where: { orgId: org.id } }),
  ]);

  if (!document) {
    return new Response("문서를 찾을 수 없습니다.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // 회사 정보(공급자 칸·로고·인감) 반영은 `buildDocumentHtml` 이 한 번에 한다 —
  // 에디터 캔버스도 같은 `withCompanyDefaults` 를 지나므로 두 화면이 같게 보인다
  const pdfBranding = toPdfBranding(branding, org.name);
  const doc =
    parseContentJson(document.contentJson) ??
    seedTemplate({
      type: document.type,
      clientName: document.clientName,
      company: pdfBranding,
      items: document.items,
    });

  const html = buildDocumentHtml({
    doc,
    title: document.title,
    branding: pdfBranding,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // 편집 직후 다시 열면 바뀐 내용이 보여야 한다 — 미리보기는 캐시하지 않는다.
      "Cache-Control": "no-store",
    },
  });
}
