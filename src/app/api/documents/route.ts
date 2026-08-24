import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg, getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { ACTIVE_DOCUMENT_STATUSES } from "@/lib/constants";
import { unlinkedVersionGroupWhere } from "@/lib/document-version";

/**
 * GET /api/documents?status=&type=&q=&linkable=1 — 문서 목록 (SQLite)
 *
 * `linkable=1` 은 **기회에 연결할 수 있는 문서만** 돌려준다 (기회-5 · 기회-17).
 *  - 이미 다른 기회에 붙은 문서는 뺀다 — 한 문서가 두 기회의 예상 금액을 동시에 좌우할 수 없다.
 *  - 폐기(VOID) 문서도 뺀다 — 붙여도 확정 문서 후보가 되지 못해 금액이 0 인 채로 남는다.
 *  - **형제 버전이 붙은 묶음도 통째로 뺀다** — 연결은 버전 묶음 단위라(`@/lib/document-link`),
 *    v1 이 기회 A 에 붙어 있으면 v2 도 후보가 아니다. 이걸 빼먹으면 목록에는 뜨는데 저장에서
 *    거부당해, 사용자는 왜 안 되는지 모른 채 같은 시도를 반복한다.
 *
 * 묶음 제외 조건은 **`unlinkedVersionGroupWhere` 순수 함수 하나**가 정한다. 이 라우트가
 * 붙은 문서의 묶음 키를 먼저 모아 `NOT`/`notIn` 으로 뺐을 때 두 번 깨졌다 — v1 이
 * 통째로 사라졌고(부정 필터는 NULL 행을 돌려주지 않는다), 고친 뒤에도 문서가 1,200건인
 * 시연 데이터에서 바인딩 한계를 넘어 500 이 났다. 지금은 목록을 만들지 않고 관계로
 * 묻는다(그 사정은 함수 주석에 적어 두었다).
 */
export async function GET(req: NextRequest) {
  const org = await getCurrentOrg();
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") ?? undefined;
  const type = searchParams.get("type") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const linkableOnly = searchParams.get("linkable") === "1";

  const documents = await prisma.document.findMany({
    where: {
      orgId: org.id,
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(q ? { title: { contains: q } } : {}),
      ...(linkableOnly
        ? {
            opportunityId: null,
            status: { in: [...ACTIVE_DOCUMENT_STATUSES] },
            ...unlinkedVersionGroupWhere(),
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, name: true } } },
  });

  return ok(documents);
}

/** POST /api/documents — 문서 생성 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  let body: {
    title?: string;
    type?: string;
    clientName?: string;
    amount?: number;
  };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  if (!body.title?.trim()) {
    return fail("문서 제목은 필수입니다.");
  }

  const doc = await prisma.document.create({
    data: {
      orgId: user.orgId,
      authorId: user.id,
      title: body.title.trim(),
      type: body.type ?? "QUOTE",
      status: "DRAFT",
      clientName: body.clientName ?? null,
      amount: body.amount ?? 0,
    },
  });

  return ok(doc, { status: 201 });
}
