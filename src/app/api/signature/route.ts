import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { MAX_SIGNATURE_LENGTH } from "@/lib/constants";

/**
 * PATCH /api/signature — 현재 사용자의 메일 서명 저장.
 * 빈 문자열이면 서명 없음(null)으로 저장한다.
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  if (typeof body.signature !== "string") {
    return fail("서명 형식이 올바르지 않습니다.");
  }
  const trimmed = body.signature.trim();
  if (trimmed.length > MAX_SIGNATURE_LENGTH) {
    return fail(`서명은 ${MAX_SIGNATURE_LENGTH}자 이내여야 합니다.`);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { signature: trimmed ? trimmed : null },
    select: { signature: true },
  });

  return ok({ signature: updated.signature ?? "" });
}
