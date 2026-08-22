import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { fail, ok } from "@/lib/api";
import {
  PROMPT_PRESET_LIMIT_MESSAGE,
  canAddPromptPreset,
  nextPromptPresetOrder,
  parsePromptPreset,
} from "@/lib/prompt-preset";

/**
 * 지시문 예시 프리셋 (생성 화면 오른쪽 레일).
 *
 * 검증은 `@/lib/prompt-preset` 순수 함수 한 곳이고 **화면과 서버가 같은 함수를 지난다** —
 * 화면에서만 막은 것은 막은 것이 아니다(문서 본문 크기 상한에서 배운 규칙과 같다).
 * 기본 예시는 코드에 있으므로 이 라우트는 **사용자가 더한 것만** 다룬다.
 */

/** 내 예시 목록 (순서대로) */
export async function GET() {
  const org = await getCurrentOrg();
  const presets = await prisma.promptPreset.findMany({
    where: { orgId: org.id },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, text: true, sortOrder: true },
  });
  return ok({ presets });
}

/** 예시 추가 */
export async function POST(req: NextRequest) {
  const org = await getCurrentOrg();
  const body = await req.json().catch(() => null);

  // 중복·개수 판정에 쓸 현재 목록을 먼저 읽는다 (같은 트랜잭션이 아니어도 되는 이유:
  // 예시가 하나 더 늘거나 같은 문구가 잠깐 겹치는 것은 데이터를 망가뜨리지 않는다)
  const existing = await prisma.promptPreset.findMany({
    where: { orgId: org.id },
    select: { id: true, text: true, sortOrder: true },
  });

  if (!canAddPromptPreset(existing.length)) {
    return fail(PROMPT_PRESET_LIMIT_MESSAGE, 400);
  }

  const parsed = parsePromptPreset(body?.text, {
    existing: existing.map((preset) => preset.text),
  });
  if (!parsed.ok) return fail(parsed.error, 400);

  const preset = await prisma.promptPreset.create({
    data: {
      orgId: org.id,
      text: parsed.text,
      sortOrder: nextPromptPresetOrder(existing),
    },
    select: { id: true, text: true, sortOrder: true },
  });

  return ok({ preset }, { status: 201 });
}
