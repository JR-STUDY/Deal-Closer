import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { parseBrandingInput } from "@/lib/branding";

/**
 * PATCH /api/branding — 현재 조직의 회사 정보 저장 (설정 7).
 *
 * 회사명·대표자·사업자등록번호·주소·대표 연락처·로고·인감·기본 색상을 한 번에 받는다.
 * 검증·정규화는 `@/lib/branding` 의 `parseBrandingInput` **한 곳**이 한다 —
 * 화면에서만 막은 것은 막은 것이 아니므로 서버가 다시 판정한다(이미지 크기 상한 포함).
 *
 * 조직에 Branding 행이 없을 수도 있어(시드 전 조직) `upsert` 로 만든다 —
 * 저장을 누른 사람이 "행이 없어서 실패했습니다" 를 볼 이유가 없다.
 */
export async function PATCH(req: NextRequest) {
  const org = await getCurrentOrg();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }
  if (typeof body !== "object" || body === null) {
    return fail("잘못된 요청 본문입니다.");
  }

  const parsed = parseBrandingInput(body as Record<string, unknown>);
  if ("error" in parsed) return fail(parsed.error);

  const saved = await prisma.branding.upsert({
    where: { orgId: org.id },
    create: { orgId: org.id, ...parsed },
    update: parsed,
    select: {
      companyName: true,
      ceoName: true,
      bizRegNo: true,
      address: true,
      phone: true,
      logoUrl: true,
      stampUrl: true,
      primaryColor: true,
    },
  });

  return ok(saved);
}
