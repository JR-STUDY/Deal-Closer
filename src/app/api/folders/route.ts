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

/** POST /api/folders — 폴더 생성 { name, isCommon? } (해당 문서함 맨 뒤에 추가) */
export async function POST(req: NextRequest) {
  const org = await getCurrentOrg();
  let body: { name?: unknown; isCommon?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return fail("폴더 이름은 필수입니다.");
  const isCommon = body.isCommon === true;

  // 같은 문서함(isCommon) 안에서 맨 뒤 순서로 추가
  const last = await prisma.folder.findFirst({
    where: { orgId: org.id, isCommon },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const folder = await prisma.folder.create({
    data: { orgId: org.id, name, isCommon, sortOrder },
  });
  return ok(folder, { status: 201 });
}
