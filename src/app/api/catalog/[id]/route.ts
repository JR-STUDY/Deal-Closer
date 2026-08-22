import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  catalogUsageWhere,
  parseCatalogInput,
  toCatalogItemDTO,
  withCatalogDefaults,
  type CatalogSaveResult,
} from "@/lib/catalog";

type Params = { params: Promise<{ id: string }> };

/** 없는 품목과 남의 품목은 **같은 404** 다 — 존재 여부도 알려주지 않는다 */
const NOT_FOUND = "품목을 찾을 수 없습니다.";

/**
 * 조직 범위 안에서 품목을 찾는다.
 * `findUnique({ where: { id } })` 를 쓰지 않는다 — 인증이 붙는 순간 남의 조직 품목을
 * 읽고·고치고·지울 수 있게 된다(문서 라우트에서 이미 고친 규칙과 같다).
 */
async function findScopedItem(id: string, orgId: string) {
  return prisma.catalogItem.findFirst({ where: { id, orgId } });
}

/** 같은 SKU 를 쓰는 **다른** 품목 수 (막지 않고 알린다 — `../route.ts` 주석 참고) */
async function countDuplicateSku(
  orgId: string,
  sku: string | null,
  exceptId: string,
): Promise<number> {
  if (!sku) return 0;
  return prisma.catalogItem.count({
    where: { orgId, sku, NOT: { id: exceptId } },
  });
}

/**
 * GET /api/catalog/:id — 품목 1건 + **품목명이 같은 문서 수**.
 *
 * 문서 수를 목록에 함께 싣지 않는 이유는 거래처 목록이 담당자 전원을 싣지 않는 것과 같다 —
 * 행마다 조회가 하나씩 늘고, 정작 이 숫자가 필요한 자리는 **삭제 확인창 하나**다.
 * 그래서 확인창을 열 때만 이 라우트로 가져온다.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const [{ id }, org] = await Promise.all([params, getCurrentOrg()]);

  const item = await findScopedItem(id, org.id);
  if (!item) return fail(NOT_FOUND, 404);

  const documentCount = await prisma.document.count({
    where: catalogUsageWhere(org.id, item.name),
  });

  return ok({ ...toCatalogItemDTO(item), documentCount });
}

/**
 * PATCH /api/catalog/:id — 품목 수정 · 활성/비활성 토글.
 *
 * 폼 다이얼로그(전체 저장)와 목록의 활성 토글(`{ isActive }` 하나)이 **같은 라우트·같은
 * 검증**을 지난다. 빠진 필드는 `withCatalogDefaults()` 가 현재 값으로 채워
 * `parseCatalogInput()` 한 곳을 통과시킨다 — 토글 전용 라우트를 따로 두면 두 경로의 제약이
 * 갈린다(기회 상세 인라인 수정에서 세운 규칙과 같다).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const [{ id }, org] = await Promise.all([params, getCurrentOrg()]);

  const existing = await findScopedItem(id, org.id);
  if (!existing) return fail(NOT_FOUND, 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const parsed = parseCatalogInput(withCatalogDefaults(body, existing));
  if ("error" in parsed) return fail(parsed.error);

  const updated = await prisma.catalogItem.update({
    where: { id },
    data: parsed,
  });
  const duplicateSkuCount = await countDuplicateSku(org.id, parsed.sku, id);

  const result: CatalogSaveResult = {
    ...toCatalogItemDTO(updated),
    duplicateSkuCount,
  };
  return ok(result);
}

/**
 * DELETE /api/catalog/:id — 품목 삭제.
 *
 * **문서가 있어도 막지 않는다.** 문서의 품목표는 담을 때 이름·단가를 복사해 둔 값이라
 * 참조가 끊기지 않고, 지워도 이미 만든 문서의 금액은 그대로다(거래처 삭제를 연관 기회로
 * 막는 것과 다르다 — 그쪽은 Cascade 로 영업 기록이 실제로 사라진다).
 * 대신 확인창이 **품목명이 같은 문서 수**를 미리 말하고, 지우는 대신 비활성으로 내리는
 * 길도 함께 안내한다.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const [{ id }, org] = await Promise.all([params, getCurrentOrg()]);

  const item = await findScopedItem(id, org.id);
  if (!item) return fail(NOT_FOUND, 404);

  await prisma.catalogItem.delete({ where: { id } });
  return ok({ id });
}
