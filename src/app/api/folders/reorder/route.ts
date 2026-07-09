import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";

/**
 * POST /api/folders/reorder { ids: string[] }
 * 주어진 순서대로 sortOrder 를 0..n 으로 재설정한다(같은 문서함 안 드래그 정렬).
 */
export async function POST(req: NextRequest) {
  const org = await getCurrentOrg();
  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  if (
    !Array.isArray(body.ids) ||
    body.ids.some((id) => typeof id !== "string")
  ) {
    return fail("ids 배열이 필요합니다.");
  }
  const ids = body.ids as string[];

  // 전부 같은 조직 소속인지 확인
  const owned = await prisma.folder.findMany({
    where: { id: { in: ids }, orgId: org.id },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    return fail("잘못된 폴더가 포함되어 있습니다.");
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.folder.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  return ok({ ids });
}
