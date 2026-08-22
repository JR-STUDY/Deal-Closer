import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { fail, ok } from "@/lib/api";
import { parsePromptPreset } from "@/lib/prompt-preset";

/**
 * 예시 하나를 고치거나 지운다.
 *
 * 단건 조회는 **조직 범위**로 좁힌다 — `findUnique({ id })` 가 아니라
 * `findFirst({ id, orgId })`. 없는 예시와 남의 예시는 **같은 404** 다(존재 여부도
 * 알려주지 않는다). 기본 예시는 코드에 있어 id 가 없으므로 이 라우트로 닿지 않는다 —
 * "기본 예시는 지울 수 없다" 가 화면 규칙이 아니라 **구조**인 이유다.
 */

/** 예시 수정 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, org] = await Promise.all([params, getCurrentOrg()]);

  const preset = await prisma.promptPreset.findFirst({
    where: { id, orgId: org.id },
    select: { id: true },
  });
  if (!preset) return fail("예시를 찾을 수 없습니다.", 404);

  const body = await req.json().catch(() => null);

  // 자기 자신은 중복 검사에서 뺀다 — 문구를 그대로 두고 순서만 고칠 수도 있다
  const siblings = await prisma.promptPreset.findMany({
    where: { orgId: org.id, id: { not: id } },
    select: { text: true },
  });
  const parsed = parsePromptPreset(body?.text, {
    existing: siblings.map((sibling) => sibling.text),
  });
  if (!parsed.ok) return fail(parsed.error, 400);

  const updated = await prisma.promptPreset.update({
    where: { id },
    data: { text: parsed.text },
    select: { id: true, text: true, sortOrder: true },
  });

  return ok({ preset: updated });
}

/** 예시 삭제 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, org] = await Promise.all([params, getCurrentOrg()]);

  const preset = await prisma.promptPreset.findFirst({
    where: { id, orgId: org.id },
    select: { id: true },
  });
  if (!preset) return fail("예시를 찾을 수 없습니다.", 404);

  await prisma.promptPreset.delete({ where: { id } });
  return ok({ id });
}
