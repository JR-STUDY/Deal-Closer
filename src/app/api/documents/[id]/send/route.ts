import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/documents/:id/send — 문서 이메일 발송
 * 발송 이력(EmailLog)을 남기고 문서 상태를 SENT 로 전환한다.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();

  let body: { recipients?: string; subject?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  if (!body.recipients?.trim()) {
    return fail("수신자를 한 명 이상 입력해주세요.");
  }

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return fail("문서를 찾을 수 없습니다.", 404);

  const [log] = await prisma.$transaction([
    prisma.emailLog.create({
      data: {
        documentId: doc.id,
        senderId: user.id,
        recipients: body.recipients.trim(),
        subject: body.subject?.trim() || doc.title,
        body: body.body ?? null,
        attachmentName: `${doc.title}.pdf`,
        status: "SENT",
      },
    }),
    prisma.document.update({
      where: { id: doc.id },
      data: { status: "SENT" },
    }),
  ]);

  return ok(log, { status: 201 });
}
