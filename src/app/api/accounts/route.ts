import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  accountsWhere,
  parseAccountInput,
  toAccountDTO,
  type AccountListItem,
} from "@/lib/account";

/**
 * GET /api/accounts — 현재 조직의 거래처 목록 (F-102).
 * `?q=` 로 회사명·담당자명 부분 일치 검색을 하며, 최근 수정일 내림차순으로 정렬한다.
 * 거래처는 조직 공용 자산이므로 Owner 필터 없이 orgId 로만 스코프한다.
 */
export async function GET(req: NextRequest) {
  const org = await getCurrentOrg();
  const query = req.nextUrl.searchParams.get("q") ?? "";

  const accounts = await prisma.account.findMany({
    where: accountsWhere(org.id, query),
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { opportunities: true } } },
  });

  const items: AccountListItem[] = accounts.map((account) => ({
    ...toAccountDTO(account),
    opportunityCount: account._count.opportunities,
  }));
  return ok(items);
}

/** POST /api/accounts — 거래처 생성 (F-101). 회사명만 필수다. */
export async function POST(req: NextRequest) {
  const org = await getCurrentOrg();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const parsed = parseAccountInput(body);
  if ("error" in parsed) return fail(parsed.error);

  const created = await prisma.account.create({
    data: { orgId: org.id, ...parsed },
  });

  return ok(toAccountDTO(created), { status: 201 });
}
