import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  MAIL_CC_MAX_LENGTH,
  MAIL_DOMAIN_LABEL_MAX,
  normalizeCcList,
  toMailDomainDTO,
} from "@/lib/mail-domain";

type Params = { params: Promise<{ id: string }> };

/** 조직에 속한 도메인을 로드한다. 없으면 null (다른 조직 포함). */
async function loadOwned(id: string, orgId: string) {
  const domain = await prisma.teamMailDomain.findUnique({ where: { id } });
  if (!domain || domain.orgId !== orgId) return null;
  return domain;
}

/**
 * PATCH /api/mail-domains/:id — 도메인 인증/기본설정/별칭 변경 (관리자)
 * body: { verify?: boolean; isDefault?: boolean; label?: string | null }
 * - verify=true: 인증(데모는 관리자 수동 확인) → status VERIFIED
 * - isDefault=true: 팀 기본 도메인으로 지정(조직당 1개, 인증된 도메인만)
 * - label: 별칭 변경 (null/빈값이면 해제)
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const org = await getCurrentOrg();

  const domain = await loadOwned(id, org.id);
  if (!domain) return fail("도메인을 찾을 수 없습니다.", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }
  if (typeof body !== "object" || body === null) {
    return fail("잘못된 요청 본문입니다.");
  }
  const { verify, isDefault, label, defaultCc } = body as {
    verify?: unknown;
    isDefault?: unknown;
    label?: unknown;
    defaultCc?: unknown;
  };

  const data: {
    status?: string;
    isDefault?: boolean;
    label?: string | null;
    defaultCc?: string | null;
  } = {};

  // 인증 상태를 미리 계산 (기본 지정 가능 여부 판단에 사용)
  const willBeVerified = verify === true || domain.status === "VERIFIED";
  if (verify === true) data.status = "VERIFIED";

  if (label !== undefined) {
    data.label =
      typeof label === "string" && label.trim()
        ? label.trim().slice(0, MAIL_DOMAIN_LABEL_MAX)
        : null;
  }

  if (defaultCc !== undefined) {
    if (typeof defaultCc !== "string") {
      return fail("잘못된 참조 목록입니다.");
    }
    if (defaultCc.length > MAIL_CC_MAX_LENGTH) {
      return fail(`참조 목록이 너무 깁니다. (${MAIL_CC_MAX_LENGTH}자 이내)`);
    }
    const normalized = normalizeCcList(defaultCc);
    data.defaultCc = normalized || null;
  }

  if (isDefault === true) {
    if (!willBeVerified) {
      return fail("인증된 도메인만 기본 발신 도메인으로 지정할 수 있습니다.");
    }
    data.isDefault = true;
  } else if (isDefault === false) {
    data.isDefault = false;
  }

  // 기본 지정 시 같은 조직의 다른 기본 도메인을 해제한다 (조직당 1개 보장)
  if (data.isDefault === true) {
    const [, updated] = await prisma.$transaction([
      prisma.teamMailDomain.updateMany({
        where: { orgId: org.id, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      }),
      prisma.teamMailDomain.update({ where: { id }, data }),
    ]);
    return ok(toMailDomainDTO(updated));
  }

  const updated = await prisma.teamMailDomain.update({ where: { id }, data });
  return ok(toMailDomainDTO(updated));
}

/**
 * DELETE /api/mail-domains/:id — 도메인 삭제 (관리자)
 * 이 도메인을 선택했던 담당자는 스키마의 onDelete: SetNull 로 개인 계정 발신으로 복귀한다.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const org = await getCurrentOrg();

  const domain = await loadOwned(id, org.id);
  if (!domain) return fail("도메인을 찾을 수 없습니다.", 404);

  await prisma.teamMailDomain.delete({ where: { id } });

  // 삭제한 도메인이 기본이었다면, 남은 인증 도메인 중 가장 먼저 등록된 것을
  // 기본으로 승계한다 (조직당 기본 도메인 1개 유지 — schema 주석 정합).
  if (domain.isDefault) {
    const next = await prisma.teamMailDomain.findFirst({
      where: { orgId: org.id, status: "VERIFIED" },
      orderBy: { createdAt: "asc" },
    });
    if (next) {
      await prisma.teamMailDomain.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }

  return ok({ id });
}
