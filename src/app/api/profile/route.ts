import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { parseProfileInput } from "@/lib/user-profile";

/**
 * PATCH /api/profile — 현재 사용자의 이름·직함·연락처 저장 (설정 7).
 *
 * 검증·정규화는 `@/lib/user-profile` 의 `parseProfileInput` 한 곳이 한다
 * (연락처 정규화는 담당자와 같은 `normalizePhone`).
 * 대상은 **항상 현재 사용자**다 — 요청 본문으로 사용자 id 를 받지 않는다(인증이 붙기 전에
 * 그 길을 열어 두면 남의 프로필을 고칠 수 있다).
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }
  if (typeof body !== "object" || body === null) {
    return fail("잘못된 요청 본문입니다.");
  }

  const parsed = parseProfileInput(body as Record<string, unknown>);
  if ("error" in parsed) return fail(parsed.error);

  const saved = await prisma.user.update({
    where: { id: user.id },
    data: parsed,
    select: { name: true, position: true, phone: true },
  });

  return ok(saved);
}
