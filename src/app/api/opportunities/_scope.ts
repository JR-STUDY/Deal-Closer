import "server-only";

import { prisma } from "@/lib/db";

/**
 * 기회가 참조하는 거래처·담당자가 **현재 조직 소속**인지 확인한다 (F-111).
 *
 * 요청 본문의 id 는 사용자가 조작할 수 있으므로, 다른 조직의 거래처·사용자에
 * 기회를 붙이지 못하게 생성·수정 양쪽에서 같은 검사를 통과시킨다.
 * 통과하면 null, 아니면 사용자용 한국어 메시지를 돌려준다.
 */
export async function findRefScopeError(
  orgId: string,
  refs: { accountId: string; ownerId: string },
): Promise<string | null> {
  const [account, owner] = await Promise.all([
    prisma.account.findFirst({
      where: { id: refs.accountId, orgId },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { id: refs.ownerId, orgId },
      select: { id: true },
    }),
  ]);

  if (!account) return "거래처를 찾을 수 없습니다.";
  if (!owner) return "담당자를 찾을 수 없습니다.";
  return null;
}
