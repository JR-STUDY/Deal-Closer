import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg, getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/templates/:id/instantiate — 템플릿으로 새 문서 생성
 * 템플릿의 종류·라인아이템을 복제해 DRAFT 문서를 만든다. body: { folderId?, clientName? }
 * 응답의 문서 id 로 편집 화면(/editor/:id)으로 이동한다.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const org = await getCurrentOrg();
  const user = await getCurrentUser();

  const template = await prisma.documentTemplate.findFirst({
    where: { id, orgId: org.id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!template) return fail("템플릿을 찾을 수 없습니다.", 404);

  // 본문은 선택 입력(폴더/거래처). 잘못된 JSON 이어도 기본값으로 진행한다.
  let body: { folderId?: unknown; clientName?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // 폴더 지정 시 같은 조직 소속인지 검증
  let folderId: string | null = null;
  if (typeof body.folderId === "string" && body.folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: body.folderId, orgId: org.id },
      select: { id: true },
    });
    folderId = folder?.id ?? null;
  }

  const amount = template.items.reduce((sum, it) => sum + it.amount, 0);

  const doc = await prisma.document.create({
    data: {
      orgId: org.id,
      authorId: user.id,
      title: template.title,
      type: template.type,
      status: "DRAFT",
      clientName:
        typeof body.clientName === "string" && body.clientName.trim()
          ? body.clientName.trim()
          : null,
      amount,
      contentJson: template.contentJson,
      folderId,
      items: {
        create: template.items.map((it, index) => ({
          name: it.name,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          amount: it.amount,
          sortOrder: index,
        })),
      },
    },
  });

  return ok({ id: doc.id }, { status: 201 });
}
