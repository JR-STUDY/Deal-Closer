import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  MAIL_DOMAIN_LABEL_MAX,
  isValidDomain,
  normalizeDomain,
  toMailDomainDTO,
} from "@/lib/mail-domain";

/** GET /api/mail-domains — 현재 조직의 팀 발신 도메인 목록 */
export async function GET() {
  const org = await getCurrentOrg();
  const domains = await prisma.teamMailDomain.findMany({
    where: { orgId: org.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return ok(domains.map(toMailDomainDTO));
}

/**
 * POST /api/mail-domains — 팀 발신 도메인 등록 (관리자)
 * body: { domain: string; label?: string }
 * 신규 도메인은 PENDING(인증 대기) 상태로 생성된다.
 */
export async function POST(req: NextRequest) {
  const org = await getCurrentOrg();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }
  if (typeof body !== "object" || body === null) {
    return fail("잘못된 요청 본문입니다.");
  }

  const raw = (body as { domain?: unknown }).domain;
  if (typeof raw !== "string" || !raw.trim()) {
    return fail("도메인을 입력해주세요.");
  }
  const domain = normalizeDomain(raw);
  if (!isValidDomain(domain)) {
    return fail("올바른 도메인 형식이 아닙니다. (예: specflow.ai)");
  }

  const labelRaw = (body as { label?: unknown }).label;
  const label =
    typeof labelRaw === "string" && labelRaw.trim()
      ? labelRaw.trim().slice(0, MAIL_DOMAIN_LABEL_MAX)
      : null;

  const existing = await prisma.teamMailDomain.findFirst({
    where: { orgId: org.id, domain },
  });
  if (existing) {
    return fail("이미 등록된 도메인입니다.", 409);
  }

  const created = await prisma.teamMailDomain.create({
    data: { orgId: org.id, domain, label, status: "PENDING", isDefault: false },
  });
  return ok(toMailDomainDTO(created), { status: 201 });
}
