import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { parseContentJson, seedTemplate } from "@/lib/editor-schema";
import { buildDocumentHtml, toPdfBranding } from "@/lib/pdf-html";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/templates/:id/preview — 표준 양식 미리보기 HTML.
 *
 * 문서 미리보기와 **같은 인쇄용 HTML 생성기**(`@/lib/pdf-html`)를 쓴다 — 양식 전용 렌더러를
 * 따로 만들면 "양식에서 본 모습"과 "그 양식으로 만든 문서"가 다르게 보이기 시작한다.
 *
 * 양식은 AI 세팅 결과(`contentJson`)를 갖고 있다. 아직 세팅되지 않은 양식은 문서와 같은
 * 기본 문서를 만들어 보여준다 — 빈 화면보다 "이 양식은 아직 본문이 없다"를 눈으로 보는 게 낫다.
 *
 * 조직 스코프로 좁혀 조회한다 — 다른 조직의 양식 id 가 들어와도 404 로 끝나야 한다.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const [{ id }, org] = await Promise.all([params, getCurrentOrg()]);

  const [template, branding] = await Promise.all([
    prisma.template.findFirst({ where: { id, orgId: org.id } }),
    prisma.branding.findUnique({ where: { orgId: org.id } }),
  ]);

  if (!template) {
    return new Response("양식을 찾을 수 없습니다.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const pdfBranding = toPdfBranding(branding, org.name);
  const doc =
    parseContentJson(template.contentJson) ??
    seedTemplate({
      type: template.type,
      clientName: "",
      company: pdfBranding,
      items: [],
    });

  const html = buildDocumentHtml({
    doc,
    title: template.name,
    branding: pdfBranding,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // 편집 직후 다시 열면 바뀐 내용이 보여야 한다 — 미리보기는 캐시하지 않는다
      "Cache-Control": "no-store",
    },
  });
}
