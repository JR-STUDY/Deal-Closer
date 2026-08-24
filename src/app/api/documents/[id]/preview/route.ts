import type { NextRequest } from "next/server";
import { getCurrentOrg } from "@/lib/session";
import { loadDocumentRenderInput } from "@/lib/document-render";
import { buildDocumentHtml } from "@/lib/pdf-html";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/documents/:id/preview — 문서 미리보기 HTML (기회-19).
 *
 * **인쇄용 HTML 생성기(`@/lib/pdf-html`)를 그대로 재사용한다.** 그 모듈이 이미 블록 절대좌표
 * 배치와 회사 정보(공급자 칸·로고·인감·주색)를 재현하고 본문을 이스케이프하므로, 미리보기용
 * 렌더러를 따로 만들면 "미리보기와 실제 PDF 가 다르게 보이는" 문제가 곧바로 생긴다.
 * 에디터의 `editor-preview.tsx` 는 편집 상태(선택·드래그)를 전제로 한 무거운 클라이언트
 * 컴포넌트라 기회 상세에서 다시 쓰기 어렵다 — 그래서 서버가 만든 HTML 을 iframe 에 띄운다.
 *
 * **재료는 `@/lib/document-render` 한 곳에서 받는다** — PDF 다운로드(`/pdf`)·발송 첨부와
 * 같은 조회·같은 기본 문서 시드를 쓴다. 예전에는 이 라우트가 스스로 조회하고 스스로
 * `seedTemplate` 을 불렀고, 그러면 어느 한쪽만 손봤을 때 화면에서 확인한 것과 다른 PDF 가
 * 고객에게 첨부된다 (화면으로는 알 수 없는 사고다).
 *
 * 조직 범위로 좁혀 조회한다 — 없는 문서와 남의 문서는 같은 404 다.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const [{ id }, org] = await Promise.all([params, getCurrentOrg()]);

  const rendered = await loadDocumentRenderInput(id, org);
  if (!rendered) {
    return new Response("문서를 찾을 수 없습니다.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const html = buildDocumentHtml({
    doc: rendered.doc,
    title: rendered.document.title,
    branding: rendered.branding,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // 편집 직후 다시 열면 바뀐 내용이 보여야 한다 — 미리보기는 캐시하지 않는다.
      "Cache-Control": "no-store",
    },
  });
}
