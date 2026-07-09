import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { parseTemplateInput, toTemplateDTO } from "@/lib/email-template";

/**
 * GET /api/email-templates — 현재 사용자가 볼 수 있는 메일 템플릿 목록.
 * 팀 공용(ownerId=null) + 본인 개인 템플릿(ownerId=본인)만 반환한다.
 */
export async function GET() {
  const user = await getCurrentUser();
  const templates = await prisma.emailTemplate.findMany({
    where: {
      orgId: user.orgId,
      OR: [{ ownerId: null }, { ownerId: user.id }],
    },
    // 팀 공용(null)이 먼저, 각 그룹 안에서는 최근 수정 순
    orderBy: [{ ownerId: "asc" }, { updatedAt: "desc" }],
  });
  return ok(templates.map(toTemplateDTO));
}

/** POST /api/email-templates — 새 템플릿 생성 (shared=true 면 팀 공용, 아니면 개인) */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const parsed = parseTemplateInput(body);
  if ("error" in parsed) return fail(parsed.error);

  const created = await prisma.emailTemplate.create({
    data: {
      orgId: user.orgId,
      ownerId: parsed.shared ? null : user.id,
      name: parsed.name,
      subject: parsed.subject,
      body: parsed.body,
    },
  });

  return ok(toTemplateDTO(created), { status: 201 });
}
