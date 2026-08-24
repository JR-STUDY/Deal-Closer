import type { NextRequest } from "next/server";
import { getCurrentOrg } from "@/lib/session";
import { loadDocumentRenderInput } from "@/lib/document-render";
import {
  PDF_CONTENT_TYPE,
  contentDisposition,
  documentPdfFileName,
} from "@/lib/document-file";
import { renderDocumentPdf } from "@/lib/pdf";

type Params = { params: Promise<{ id: string }> };

/** 오류는 JSON 봉투가 아니라 평문으로 돌려준다 — 이 라우트를 여는 쪽은 브라우저다 */
function textError(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * GET /api/documents/:id/pdf — 문서 PDF 미리보기·다운로드 (F-223).
 *
 * 발송 첨부와 **같은 재료·같은 렌더러**를 쓴다 (`@/lib/document-render` → `@/lib/pdf`).
 * 그래서 담당자가 내려받아 확인한 파일이 고객에게 첨부되는 파일과 같다 — 경로를 따로
 * 만들면 "받아 본 PDF 는 멀쩡한데 첨부된 건 깨진" 상황이 생기고, 그건 화면으로 알 수 없다.
 *
 * 인쇄용 HTML 미리보기(`/preview`)는 그대로 남는다. 미리보기는 iframe 으로 즉시 뜨는 것이
 * 목적이고(브라우저를 띄우지 않는다), 이 라우트는 **실제 파일**이 필요할 때만 쓴다.
 *
 * `?inline=1` 이면 새 탭에서 바로 보여 주고, 기본은 내려받기다.
 * 조직 범위로 좁혀 조회한다 — 없는 문서와 남의 문서는 같은 404 다.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const [{ id }, org] = await Promise.all([params, getCurrentOrg()]);

  const rendered = await loadDocumentRenderInput(id, org);
  if (!rendered) return textError("문서를 찾을 수 없습니다.", 404);

  const fileName = documentPdfFileName(rendered.document);
  const inline = req.nextUrl.searchParams.get("inline") === "1";

  let pdf: Uint8Array;
  try {
    pdf = await renderDocumentPdf({
      doc: rendered.doc,
      title: rendered.document.title,
      branding: rendered.branding,
    });
  } catch (error) {
    /*
     * 브라우저 실행 파일·한글 글꼴 문제는 사용자가 화면에서 고칠 수 없다 — 원인을 그대로
     * 보여 준다(조치 방법이 곧 오류 메시지다 · docs/PDF-RENDERING.md).
     */
    const reason = error instanceof Error ? error.message : "알 수 없는 오류";
    return textError(`PDF 를 만들지 못했습니다: ${reason}`, 502);
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": PDF_CONTENT_TYPE,
      "Content-Disposition": contentDisposition(
        fileName,
        inline ? "inline" : "attachment",
      ),
      "Content-Length": String(pdf.byteLength),
      // 편집 직후 내려받으면 바뀐 내용이 담겨야 한다 — 미리보기와 같은 이유로 캐시하지 않는다.
      "Cache-Control": "no-store",
    },
  });
}
