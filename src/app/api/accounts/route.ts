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
import {
  parseContactInputs,
  primaryContact,
  toContactDTO,
} from "@/lib/contact";

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
    include: {
      _count: { select: { opportunities: true, contacts: true } },
      // 목록에 싣는 담당자는 **대표 1명뿐**이다 (거래처-8). 나머지는 상세에서 본다.
      contacts: { where: { isPrimary: true } },
    },
  });

  const items: AccountListItem[] = accounts.map((account) => {
    const primary = primaryContact(account.contacts);
    return {
      ...toAccountDTO(account),
      opportunityCount: account._count.opportunities,
      contactCount: account._count.contacts,
      primaryContact: primary ? toContactDTO(primary) : null,
    };
  });
  return ok(items);
}

/**
 * POST /api/accounts — 거래처 생성 (F-101). 회사명만 필수다.
 *
 * 담당자(`contacts`)를 함께 받아 **한 트랜잭션**으로 만든다 (거래처-8). 나눠 저장하면
 * 거래처만 만들어지고 담당자가 빠진 상태가 남는데, 사용자는 등록에 성공했다고 믿는다.
 * 담당자 0명도 정상이며, 대표 판정은 `parseContactInputs` 가 이미 끝냈다 —
 * 라우트가 규칙을 새로 판단하지 않는다.
 */
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

  const contacts = parseContactInputs(body.contacts);
  if ("error" in contacts) return fail(contacts.error);

  const created = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: { orgId: org.id, ...parsed },
    });
    // 입력한 순서대로 만든다 — "먼저 만들어진 사람" 규칙(대표 승격·정렬)이 화면 순서와 맞아야 한다
    for (const contact of contacts) {
      await tx.contact.create({
        data: { orgId: org.id, accountId: account.id, ...contact },
      });
    }
    return account;
  });

  return ok(toAccountDTO(created), { status: 201 });
}
