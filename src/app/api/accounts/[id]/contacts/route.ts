import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  demotionTargetIds,
  parseContactAdditions,
  resolveAppendIsPrimary,
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
 * POST /api/accounts/:id/contacts — 담당자 추가 (거래처-8 · 4차 피드백 2).
 *
 * 본문은 **거래처 등록(`POST /api/accounts`)과 같은 형식**이다 — `{ contacts: [...] }` 로
 * 여러 명을 한 번에 받는다. 단건 객체(`{ name, ... }`)도 그대로 받아 한 명짜리 배열로 본다.
 *
 * 몇 명이든 **한 트랜잭션**이다. 나눠 실행하면 ① 일부만 저장된 채 실패하는데 화면은 다
 * 됐다고 알리고 ② 대표 해제와 생성 사이에 대표가 2명(또는 0명)인 상태가 노출된다.
 * 판정 규칙 자체는 `@/lib/contact` 가 단일 기준이며 라우트가 새로 판단하지 않는다 —
 * **대표 판정은 기존 담당자 수를 믿을 수 있는 트랜잭션 안에서** 한다.
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

  // 한 명이든 여러 명이든 저장 경로는 하나다 — 단건 본문은 한 명짜리 배열로 맞춰 둔다
  const rows = body.contacts === undefined ? [body] : body.contacts;

  // 검증은 트랜잭션을 열기 전에 끝낸다 (대표 판정은 트랜잭션 안에서 한다)
  const parsed = parseContactAdditions(rows);
  if ("error" in parsed) return fail(parsed.error);
  if (parsed.length === 0) return fail("담당자를 한 명 이상 입력해주세요.");

  const created = await prisma.$transaction(async (tx) => {
    const siblings = await tx.contact.findMany({
      where: { accountId: account.id },
      select: { id: true, isPrimary: true, createdAt: true },
    });

    /*
     * 첫 담당자는 요청과 무관하게 대표가 되고, 이미 담당자가 있으면 사용자가 고른 한 명만
     * 대표가 된다(아무도 고르지 않으면 기존 대표가 유지된다).
     */
    const flags = resolveAppendIsPrimary(siblings.length, parsed);
    if (flags.includes(true)) {
      // 새 담당자는 아직 목록에 없으므로 현재 대표 전원이 해제 대상이다
      const demoteIds = demotionTargetIds(siblings, "");
      if (demoteIds.length > 0) {
        await tx.contact.updateMany({
          where: { id: { in: demoteIds } },
          data: { isPrimary: false },
        });
      }
    }

    // 입력한 순서대로 만든다 — "먼저 만들어진 사람" 규칙(대표 승격·정렬)이 화면 순서와 맞아야 한다
    const inserted = [];
    for (const [index, one] of parsed.entries()) {
      inserted.push(
        await tx.contact.create({
          data: {
            orgId: account.orgId,
            accountId: account.id,
            ...one,
            isPrimary: flags[index],
          },
        }),
      );
    }
    return inserted;
  });

  return ok(created.map(toContactDTO), { status: 201 });
}
