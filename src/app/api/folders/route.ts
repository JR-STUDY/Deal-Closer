import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";

/** GET /api/folders — 조직의 폴더 전체 (문서 수 포함, 문서함별·정렬 순) */
export async function GET() {
  const org = await getCurrentOrg();
  const folders = await prisma.folder.findMany({
    where: { orgId: org.id },
    orderBy: [{ isCommon: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { documents: true } } },
  });
  return ok(folders);
}

/**
 * POST /api/folders — 폴더 생성 { name, parentId?, isCommon? }
 * parentId 가 오면 그 폴더의 하위로 만들고 문서함(isCommon)은 상위에서 상속한다.
 * 같은 상위·문서함 안에서 맨 뒤 순서로 추가된다.
 */
export async function POST(req: NextRequest) {
  const org = await getCurrentOrg();
  let body: { name?: unknown; parentId?: unknown; isCommon?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return fail("폴더 이름은 필수입니다.");

  let parentId: string | null = null;
  let isCommon = body.isCommon === true;

  if (typeof body.parentId === "string" && body.parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: body.parentId, orgId: org.id },
      select: { id: true, isCommon: true },
    });
    if (!parent) return fail("상위 폴더를 찾을 수 없습니다.", 404);
    parentId = parent.id;
    isCommon = parent.isCommon; // 하위 폴더는 상위와 같은 문서함
  }

  const last = await prisma.folder.findFirst({
    where: { orgId: org.id, isCommon, parentId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const folder = await prisma.folder.create({
    data: { orgId: org.id, name, isCommon, parentId, sortOrder },
  });
  return ok(folder, { status: 201 });
}
