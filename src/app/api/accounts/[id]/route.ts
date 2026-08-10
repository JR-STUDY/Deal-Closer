import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { parseAccountInput, toAccountDTO } from "@/lib/account";

type Params = { params: Promise<{ id: string }> };

/**
 * 조직 스코프 안에서 거래처를 찾는다 (연관 기회 수 포함).
 * 다른 조직의 id 가 들어와도 404 로 끝나야 하므로 findUnique 를 쓰지 않는다.
 */
async function findScopedAccount(id: string, orgId: string) {
  return prisma.account.findFirst({
    where: { id, orgId },
    select: {
      id: true,
      companyName: true,
      _count: { select: { opportunities: true } },
    },
  });
}

/** PATCH /api/accounts/:id — 거래처 수정 (F-103) */
export async function PATCH(req: NextRequest, { params }: Params) {
  const [{ id }, org] = await Promise.all([params, getCurrentOrg()]);

  const existing = await findScopedAccount(id, org.id);
  if (!existing) return fail("거래처를 찾을 수 없습니다.", 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const parsed = parseAccountInput(body);
  if ("error" in parsed) return fail(parsed.error);

  const updated = await prisma.account.update({ where: { id }, data: parsed });
  return ok(toAccountDTO(updated));
}

/**
 * DELETE /api/accounts/:id — 거래처 삭제 (F-103).
 * 스키마는 Opportunity 를 Cascade 로 지우지만, 영업 기록이 통째로 사라지는 사고를
 * 막기 위해 연관 기회가 하나라도 있으면 앱 레벨에서 삭제를 거부한다.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const [{ id }, org] = await Promise.all([params, getCurrentOrg()]);

  const account = await findScopedAccount(id, org.id);
  if (!account) return fail("거래처를 찾을 수 없습니다.", 404);

  const opportunityCount = account._count.opportunities;
  if (opportunityCount > 0) {
    return fail(
      `이 거래처에 연결된 영업 기회가 ${opportunityCount}건 있어 삭제할 수 없습니다. 기회를 먼저 정리해주세요.`,
      409,
    );
  }

  await prisma.account.delete({ where: { id } });
  return ok({ id });
}
