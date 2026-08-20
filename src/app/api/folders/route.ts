import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";

/** GET /api/folders — 조직의 폴더 전체 (문서 수 포함, 정렬 순) */
export async function GET() {
  const org = await getCurrentOrg();
  const folders = await prisma.folder.findMany({
    where: { orgId: org.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { documents: true } } },
  });
  return ok(folders);
}

/**
 * POST /api/folders — 폴더 생성 { name, parentId? }
 * parentId 가 오면 그 폴더의 하위로 만든다. 같은 상위 안에서 맨 뒤 순서로 추가된다.
 *
 * 문서함은 하나뿐이라 소속(isCommon)을 받지 않는다 — 컬럼은 스키마에 남아 있지만
 * 기본값(false)으로만 쓴다. 요청으로 받으면 화면에 없는 두 번째 문서함이 데이터에만
 * 생겨 사이드바에서 영영 보이지 않는 폴더가 만들어진다.
 */
export async function POST(req: NextRequest) {
  const org = await getCurrentOrg();
  let body: { name?: unknown; parentId?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return fail("폴더 이름은 필수입니다.");

  let parentId: string | null = null;

  if (typeof body.parentId === "string" && body.parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: body.parentId, orgId: org.id },
      select: { id: true },
    });
    if (!parent) return fail("상위 폴더를 찾을 수 없습니다.", 404);
    parentId = parent.id;
  }

  const last = await prisma.folder.findFirst({
    where: { orgId: org.id, parentId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const folder = await prisma.folder.create({
    data: { orgId: org.id, name, parentId, sortOrder },
  });
  return ok(folder, { status: 201 });
}
