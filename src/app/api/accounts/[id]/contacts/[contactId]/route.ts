import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  demotionTargetIds,
  parseContactInput,
  resolveDeletion,
  resolveUpdateIsPrimary,
  toContactDTO,
} from "@/lib/contact";

type Params = { params: Promise<{ id: string; contactId: string }> };

/** 담당자를 찾지 못했을 때 트랜잭션이 돌려주는 표시 (throw 없이 404 로 이어간다) */
const NOT_FOUND = { notFound: true } as const;

/** 대표 판정에 필요한 최소 컬럼 — 승격 안내 문구에 이름이 필요해 name 도 읽는다 */
const ORDER_SELECT = {
  id: true,
  name: true,
  isPrimary: true,
  createdAt: true,
} as const;

/**
 * 조직·거래처 스코프 안에서만 담당자를 다룬다.
 * 담당자 id 만으로 찾지 않는다 — 다른 거래처(또는 다른 조직)의 담당자를 이 주소로 고칠 수 없어야 한다.
 */
function scopedContactWhere(accountId: string, orgId: string) {
  return { accountId, orgId };
}

/**
 * PATCH /api/accounts/:id/contacts/:contactId — 담당자 수정 · 대표 지정 (거래처-8).
 *
 * 대표 지정은 **기존 대표 해제와 한 트랜잭션**이다. 두 번의 update 로 나누면
 * 그 사이에 대표가 2명인 상태가 노출된다.
 * "대표를 스스로 내리는" 요청은 `resolveUpdateIsPrimary` 가 무시한다 —
 * 대표 0명 상태가 만들어지면 목록에서 그 거래처의 담당자가 사라지기 때문이다.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const [{ id, contactId }, org] = await Promise.all([params, getCurrentOrg()]);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const parsed = parseContactInput(body);
  if ("error" in parsed) return fail(parsed.error);

  const result = await prisma.$transaction(async (tx) => {
    const siblings = await tx.contact.findMany({
      where: scopedContactWhere(id, org.id),
      select: ORDER_SELECT,
    });
    const target = siblings.find((contact) => contact.id === contactId);
    if (!target) return NOT_FOUND;

    const isPrimary = resolveUpdateIsPrimary(target.isPrimary, parsed.isPrimary);
    if (isPrimary) {
      const demoteIds = demotionTargetIds(siblings, contactId);
      if (demoteIds.length > 0) {
        await tx.contact.updateMany({
          where: { id: { in: demoteIds } },
          data: { isPrimary: false },
        });
      }
    }

    return tx.contact.update({
      where: { id: contactId },
      data: { ...parsed, isPrimary },
    });
  });

  if ("notFound" in result) return fail("담당자를 찾을 수 없습니다.", 404);
  return ok(toContactDTO(result));
}

/**
 * DELETE /api/accounts/:id/contacts/:contactId — 담당자 삭제 (거래처-8).
 *
 * 대표를 지우면 남은 담당자 중 **가장 먼저 만들어진 사람을 대표로 승격**한다.
 * 삭제 한 번으로 목록에서 그 거래처의 담당자가 통째로 사라지는 편이 더 나쁘다.
 * 승격된 사람은 응답에 실어 화면이 그 사실을 알릴 수 있게 한다(조용히 바꾸지 않는다).
 * 남은 담당자가 없으면 승격도 없다 — 담당자 0명은 허용한다.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const [{ id, contactId }, org] = await Promise.all([params, getCurrentOrg()]);

  const result = await prisma.$transaction(async (tx) => {
    const siblings = await tx.contact.findMany({
      where: scopedContactWhere(id, org.id),
      select: ORDER_SELECT,
    });
    const { deleted, promoted } = resolveDeletion(siblings, contactId);
    if (!deleted) return NOT_FOUND;

    await tx.contact.delete({ where: { id: contactId } });
    if (promoted) {
      await tx.contact.update({
        where: { id: promoted.id },
        data: { isPrimary: true },
      });
    }
    return {
      id: contactId,
      promoted: promoted ? { id: promoted.id, name: promoted.name } : null,
    };
  });

  if ("notFound" in result) return fail("담당자를 찾을 수 없습니다.", 404);
  return ok(result);
}
