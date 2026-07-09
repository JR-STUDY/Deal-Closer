import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { fail } from "@/lib/api";
import { attachmentKind } from "@/lib/constants";

/**
 * GET /api/attachments/:id — 첨부 원본 파일 다운로드/열람.
 * 같은 조직의 문서에 연결된 첨부만 접근 가능하다 (정책 AUTH_*).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: {
      generation: { include: { user: { select: { orgId: true } } } },
    },
  });

  if (!attachment) return fail("첨부 파일을 찾을 수 없습니다.", 404);
  if (attachment.generation.user.orgId !== user.orgId) {
    return fail("접근 권한이 없습니다.", 403);
  }

  // PDF·이미지는 브라우저에서 바로 열람(inline), 그 외는 다운로드(attachment)
  const kind = attachmentKind(attachment.fileName, attachment.mimeType);
  const disposition = kind === "pdf" || kind === "image" ? "inline" : "attachment";
  const encodedName = encodeURIComponent(attachment.fileName);

  return new Response(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Length": String(attachment.size),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
    },
  });
}
