import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { parseSignatureInput } from "@/lib/signature";

/**
 * PATCH /api/signature — 현재 사용자의 메일 서명 저장 (텍스트/HTML).
 * 빈 문자열이면 서명 없음(null)으로 저장한다.
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const parsed = parseSignatureInput(body);
  if ("error" in parsed) return fail(parsed.error);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { signature: parsed.signature },
    select: { signature: true },
  });

  return ok({ signature: updated.signature ?? "" });
}
