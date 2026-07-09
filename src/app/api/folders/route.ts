import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";

/** GET /api/folders — 조직의 폴더 전체 (문서 수·하위 폴더 수 포함, 플랫 목록) */
export async function GET() {
  const org = await getCurrentOrg();
  const folders = await prisma.folder.findMany({
    where: { orgId: org.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { documents: true, children: true } } },
  });
  return ok(folders);
}

/** POST /api/folders — 폴더 생성 { name, parentId? } */
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

  // parentId 가 오면 같은 조직의 실제 폴더인지 검증한다.
  let parentId: string | null = null;
  if (typeof body.parentId === "string" && body.parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: body.parentId, orgId: org.id },
      select: { id: true },
    });
    if (!parent) return fail("상위 폴더를 찾을 수 없습니다.", 404);
    parentId = parent.id;
  }

  const folder = await prisma.folder.create({
    data: { orgId: org.id, name, parentId },
  });
  return ok(folder, { status: 201 });
}
