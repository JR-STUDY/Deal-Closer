import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";

/**
 * PATCH /api/mail-preference — 담당자의 발신 신원 선택
 * body: { mailDomainId: string | null }
 * - null: 개인 연동 계정으로 발신 (기본)
 * - string: 팀 발신 도메인 선택 (같은 조직 소속 + 인증 완료 도메인만 허용)
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }
  if (typeof body !== "object" || body === null || !("mailDomainId" in body)) {
    return fail("잘못된 요청 본문입니다.");
  }

  const mailDomainId = (body as { mailDomainId: unknown }).mailDomainId;

  if (mailDomainId === null) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { mailDomainId: null },
    });
    return ok({ mailDomainId: updated.mailDomainId });
  }

  if (typeof mailDomainId !== "string") {
    return fail("잘못된 도메인입니다.");
  }

  const domain = await prisma.teamMailDomain.findUnique({
    where: { id: mailDomainId },
  });
  if (!domain || domain.orgId !== user.orgId) {
    return fail("도메인을 찾을 수 없습니다.", 404);
  }
  if (domain.status !== "VERIFIED") {
    return fail("인증된 도메인만 선택할 수 있습니다.");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { mailDomainId: domain.id },
  });
  return ok({ mailDomainId: updated.mailDomainId });
}
