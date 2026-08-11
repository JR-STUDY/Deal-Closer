import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  demotionTargetIds,
  parseContactInput,
  resolveCreateIsPrimary,
  toContactDTO,
} from "@/lib/contact";

type Params = { params: Promise<{ id: string }> };

/**
 * 조직 스코프 안에서 거래처를 찾는다.
 * 다른 조직의 id 가 들어와도 404 로 끝나야 하므로 findUnique 를 쓰지 않는다.
 */
async function findScopedAccount(id: string, orgId: string) {
  return prisma.account.findFirst({
    where: { id, orgId },
    select: { id: true, orgId: true },
  });
}

/**
 * POST /api/accounts/:id/contacts — 담당자 추가 (거래처-8).
 *
 * 대표 판정과 기존 대표 해제, 생성이 **한 트랜잭션**이다. 나눠 실행하면 그 사이에
 * 대표가 2명(또는 0명)인 상태가 노출된다. 판정 규칙 자체는 `@/lib/contact` 가 단일 기준이다.
 *
 * 거래처의 updatedAt 은 건드리지 않는다 — 그 값은 "회사 정보를 고친 시각"이며,
 * 담당자를 한 명 넣을 때마다 목록 정렬(최근 수정일 내림차순)이 뒤바뀌면 곤란하다.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const [{ id }, org] = await Promise.all([params, getCurrentOrg()]);

  const account = await findScopedAccount(id, org.id);
  if (!account) return fail("거래처를 찾을 수 없습니다.", 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const parsed = parseContactInput(body);
  if ("error" in parsed) return fail(parsed.error);

  const created = await prisma.$transaction(async (tx) => {
    const siblings = await tx.contact.findMany({
      where: { accountId: account.id },
      select: { id: true, isPrimary: true, createdAt: true },
    });

    // 첫 담당자는 요청과 무관하게 대표가 된다 (하나뿐인데 대표가 아니면 목록에서 사라진다)
    const isPrimary = resolveCreateIsPrimary(siblings.length, parsed.isPrimary);
    if (isPrimary) {
      // 새 담당자는 아직 목록에 없으므로 현재 대표 전원이 해제 대상이다
      const demoteIds = demotionTargetIds(siblings, "");
      if (demoteIds.length > 0) {
        await tx.contact.updateMany({
          where: { id: { in: demoteIds } },
          data: { isPrimary: false },
        });
      }
    }

    return tx.contact.create({
      data: {
        orgId: account.orgId,
        accountId: account.id,
        ...parsed,
        isPrimary,
      },
    });
  });

  return ok(toContactDTO(created), { status: 201 });
}
