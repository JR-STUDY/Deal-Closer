import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  clearConfirmedDocumentPin,
  setConfirmedDocument,
} from "@/lib/opportunity-amount";

type Params = { params: Promise<{ id: string }> };

/**
 * 확정 문서 — 예상 금액의 근거를 바꾸는 전용 경로 (기회-6 ③).
 *
 * `PUT` 은 **수동 고정**(사용자가 문서를 직접 지정 → 자동 판정에서 제외),
 * `DELETE` 는 **자동 판정으로 되돌리기**(잠금 해제 후 곧바로 재판정)다.
 * 별도 설정 화면 없이 잠금 상태 자체가 자동/수동 스위치이므로 엔드포인트도 두 개면 충분하다.
 *
 * 예상 금액을 직접 받지 않는다 — 금액은 언제나 확정 문서에서 따라온다.
 * 판정·저장은 `@/lib/opportunity-amount` 를 경유하고 이 라우트는 스코프 확인과 응답만 맡는다.
 */

/** PUT /api/opportunities/:id/confirmed-document — 문서를 확정으로 지정(잠금) */
export async function PUT(req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  let body: { documentId?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const documentId =
    typeof body.documentId === "string" ? body.documentId.trim() : "";
  if (!documentId) return fail("확정할 문서를 선택해주세요.");

  const result = await setConfirmedDocument({
    opportunityId: id,
    orgId: user.orgId,
    documentId,
  });

  if (result.status === "not-found") {
    return fail("영업 기회를 찾을 수 없습니다.", 404);
  }
  // 이 기회에 붙어 있지 않거나 폐기된 문서 — 순수 함수가 사유를 만들어 준다.
  if (result.status === "invalid") return fail(result.error);

  return ok(result);
}

/** DELETE /api/opportunities/:id/confirmed-document — 잠금 해제 후 자동 판정으로 복귀 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  const result = await clearConfirmedDocumentPin({
    opportunityId: id,
    orgId: user.orgId,
  });
  if (result.status === "not-found") {
    return fail("영업 기회를 찾을 수 없습니다.", 404);
  }
  return ok(result);
}
