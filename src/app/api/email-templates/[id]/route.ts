import type { NextRequest } from "next/server";
import type { EmailTemplate } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { parseTemplateInput, toTemplateDTO } from "@/lib/email-template";

type Params = { params: Promise<{ id: string }> };

/**
 * 현재 사용자가 이 템플릿을 수정·삭제할 수 있는지 확인한다.
 * - 같은 조직의 팀 공용(ownerId=null) 또는 본인 개인 템플릿만 허용.
 * - 다른 사람의 개인 템플릿은 접근 불가.
 * 성공 시 레코드를, 실패 시 표준 에러 응답을 반환한다.
 */
async function loadEditable(
  id: string,
  userId: string,
  orgId: string,
): Promise<EmailTemplate | Response> {
  const existing = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!existing || existing.orgId !== orgId) {
    return fail("템플릿을 찾을 수 없습니다.", 404);
  }
  if (existing.ownerId !== null && existing.ownerId !== userId) {
    return fail("이 템플릿에 접근할 권한이 없습니다.", 403);
  }
  return existing;
}

/** PATCH /api/email-templates/:id — 템플릿 수정 (이름·제목·본문·공유 범위) */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();

  const loaded = await loadEditable(id, user.id, user.orgId);
  if (loaded instanceof Response) return loaded;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const parsed = parseTemplateInput(body);
  if ("error" in parsed) return fail(parsed.error);

  const updated = await prisma.emailTemplate.update({
    where: { id },
    data: {
      name: parsed.name,
      subject: parsed.subject,
      body: parsed.body,
      // 공유 범위 전환 허용: 공용 ↔ 개인(본인 소유)
      ownerId: parsed.shared ? null : user.id,
    },
  });

  return ok(toTemplateDTO(updated));
}

/** DELETE /api/email-templates/:id — 템플릿 삭제 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();

  const loaded = await loadEditable(id, user.id, user.orgId);
  if (loaded instanceof Response) return loaded;

  await prisma.emailTemplate.delete({ where: { id } });
  return ok({ id });
}
