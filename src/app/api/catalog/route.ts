import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  parseCatalogInput,
  toCatalogItemDTO,
  type CatalogSaveResult,
} from "@/lib/catalog";

/**
 * 같은 SKU 를 쓰는 **다른** 품목 수.
 *
 * **SKU 중복은 막지 않는다 — 알린다.** 스키마에 유니크 제약이 없고(`CatalogItem.sku` 는
 * 그냥 `String?` 이다) 앱 검사만으로는 ① 동시 요청 두 건이 나란히 통과하고 ② 이미 중복이
 * 저장된 조직에서는 단가만 고치려는 수정까지 막힌다. 없는 제약을 있는 척하는 셈이다.
 * 게다가 SKU 는 사내 품번·거래처 코드 같은 **외부 식별자**라, 같은 제품의 단위·옵션별
 * 행이 한 코드를 공유하는 것이 실제로 정상이다 — 카탈로그를 고르는 유일한 경로
 * (에디터 품목표 자동완성)도 SKU 가 아니라 **품목명**으로 찾는다. 즉 중복이 무언가를
 * 깨뜨리지 않는다. 그래서 판정을 세우는 대신 저장 응답에 건수를 실어 화면이 알려 준다
 * (담당자 대표 규칙처럼 **불변식**인 값에만 앱 레벨 강제를 쓴다).
 */
async function countDuplicateSku(
  orgId: string,
  sku: string | null,
  exceptId?: string,
): Promise<number> {
  if (!sku) return 0;
  return prisma.catalogItem.count({
    where: { orgId, sku, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
}

/**
 * GET /api/catalog?category=&active=1 — 카탈로그(마스터 데이터) 목록.
 *
 * 화면(`/settings/catalog`)은 서버 컴포넌트에서 직접 조회하므로 이 라우트는 목록 화면용이
 * 아니다 — 조직 밖에서 쓰는 단순 조회용이며, `active=1` 이면 에디터 선택 목록과 같은
 * 범위(활성 품목만)를 돌려준다.
 */
export async function GET(req: NextRequest) {
  const org = await getCurrentOrg();
  const category = req.nextUrl.searchParams.get("category") ?? undefined;
  const activeOnly = req.nextUrl.searchParams.get("active") === "1";

  const items = await prisma.catalogItem.findMany({
    where: {
      orgId: org.id,
      ...(category ? { category } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return ok(items.map(toCatalogItemDTO));
}

/**
 * POST /api/catalog — 품목 등록.
 *
 * 검증은 `parseCatalogInput()` 하나가 맡는다 — 등록 팝업이 같은 함수를 미리 통과시키지만,
 * 화면에서만 막은 것은 막은 것이 아니므로 서버가 다시 판정한다.
 */
export async function POST(req: NextRequest) {
  const org = await getCurrentOrg();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const parsed = parseCatalogInput(body);
  if ("error" in parsed) return fail(parsed.error);

  const created = await prisma.catalogItem.create({
    data: { orgId: org.id, ...parsed },
  });
  const duplicateSkuCount = await countDuplicateSku(
    org.id,
    parsed.sku,
    created.id,
  );

  const result: CatalogSaveResult = {
    ...toCatalogItemDTO(created),
    duplicateSkuCount,
  };
  return ok(result, { status: 201 });
}
