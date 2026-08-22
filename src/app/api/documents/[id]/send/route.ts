import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  DOCUMENT_TYPE_LABELS,
  OPPORTUNITY_STAGE_LABELS,
  isDocumentType,
} from "@/lib/constants";
import { parseRecipients } from "@/lib/validation";
import { applyDocumentSent } from "@/lib/opportunity-stage";
import { syncOpportunityAmount } from "@/lib/opportunity-amount";
import { newTrackingId, readAppBaseUrl } from "@/lib/email-tracking";

type Params = { params: Promise<{ id: string }> };

/** 발송 후 단계 변화 안내 (정책 COPY-TONE). 알릴 내용이 없으면 null. */
type StageNotice = { changed: boolean; stage: string | null; message: string };

function describeTransition(
  transition: Awaited<ReturnType<typeof applyDocumentSent>> | null,
  documentType: string,
): StageNotice | null {
  if (!transition || transition.status === "not-found") return null;

  const typeLabel = isDocumentType(documentType)
    ? DOCUMENT_TYPE_LABELS[documentType]
    : documentType;

  if (transition.status === "changed") {
    return {
      changed: true,
      stage: transition.to,
      message: `${typeLabel} 발송에 따라 기회 단계가 ‘${OPPORTUNITY_STAGE_LABELS[transition.to]}’ 로 이동했습니다.`,
    };
  }

  // 이미 지난 단계·마감된 기회·전이 규칙이 없는 문서는 단계를 그대로 둔다 (구현 계획 §8.1).
  return {
    changed: false,
    stage: transition.from,
    message: `기회 단계는 ‘${OPPORTUNITY_STAGE_LABELS[transition.from]}’ 그대로입니다.`,
  };
}

/**
 * POST /api/documents/:id/send — 문서 이메일 발송 (F-113 · F-114 · F-235).
 *
 * 발송 이력(EmailLog) 기록 · 문서 상태 SENT 전환 · 연결된 기회의 단계 자동 전이와
 * 활동 이력(DOCUMENT_SENT · STAGE_CHANGED)을 **한 트랜잭션**으로 묶는다. 나뉘면 메일은
 * 나갔는데 단계는 그대로인 상태 불일치가 생긴다 (PRD 9장).
 *
 * 단계 전이는 반드시 `@/lib/opportunity-stage` 를 경유한다 (AGENTS.md 규칙).
 * 실제 메일 전송(어댑터 연결)·PDF 첨부는 Phase 5(F-232 · F-233) 범위라 여기서는
 * 이력만 남긴다.
 *
 * **오픈 트래킹(F-234)**: 이력마다 추측 불가능한 `trackingId` 를 만들어 저장한다. 그 id 를
 * 가리키는 추적 픽셀을 본문에 얹는 것은 **전송 조립부**의 일이며(위 이유로 아직 없다)
 * `withTrackingPixel(html, baseUrl, log.trackingId)` 한 줄이면 된다 —
 * 자세한 규칙은 `@/lib/email-tracking` 주석 참고.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  let body: { recipients?: string; subject?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  if (!body.recipients?.trim()) {
    return fail("수신자를 한 명 이상 입력해주세요.");
  }

  // 수신자 형식은 서버에서도 검증한다 (정책 VAL_* — 클라이언트 검증만 믿지 않는다).
  const { valid, invalid } = parseRecipients(body.recipients);
  if (invalid.length > 0) {
    return fail(`올바르지 않은 이메일 형식입니다: ${invalid.join(", ")}`);
  }
  if (valid.length === 0) {
    return fail("수신자를 한 명 이상 입력해주세요.");
  }
  const recipients = valid.join("; ");

  // 조직 스코프로 좁혀 조회한다 — 다른 조직의 문서 id 가 들어와도 404 로 끝나야 한다.
  const doc = await prisma.document.findFirst({
    where: { id, orgId: user.orgId },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      opportunityId: true,
    },
  });
  if (!doc) return fail("문서를 찾을 수 없습니다.", 404);
  if (doc.status === "VOID") {
    return fail("폐기된 문서는 발송할 수 없습니다.");
  }

  /*
   * 추적 식별자는 **발송마다 새로** 만든다 (`@unique` — 이력 1건과 1:1).
   * 기본 주소를 여기서 미리 확인해 두는 이유: 주소가 없으면 픽셀을 만들 수 없어 이 발송의
   * 열람은 영원히 기록되지 않는다. 발송 시점에 그 사실을 말해 둔다 —
   * 조용히 넘기면 나중에 화면의 "열람 기록 없음" 을 수신자 탓으로 읽게 된다
   * (`mailer.ts` 가 자격증명 없을 때 이유를 남기는 것과 같은 판단).
   */
  const trackingId = newTrackingId();
  const baseUrl = readAppBaseUrl();
  if (baseUrl.error) {
    console.info(
      `[mail-track] ${baseUrl.error} 추적 픽셀을 만들 수 없어 이 발송의 열람은 기록되지 않습니다.`,
    );
  }

  const { log, transition, amountSync } = await prisma.$transaction(async (tx) => {
    const created = await tx.emailLog.create({
      data: {
        documentId: doc.id,
        senderId: user.id,
        recipients,
        subject: body.subject?.trim() || doc.title,
        body: body.body ?? null,
        attachmentName: `${doc.title}.pdf`,
        status: "SENT",
        trackingId,
      },
    });

    await tx.document.update({
      where: { id: doc.id },
      // 초안만 발송완료로 전이한다 (이미 계약완료된 문서를 재발송해도 강등하지 않음).
      data: { status: doc.status === "DRAFT" ? "SENT" : doc.status },
    });

    // 기회에 연결되지 않은 문서는 전이·재판정 대상이 아니다 — 오류가 아니라 조용히 통과한다.
    if (!doc.opportunityId) {
      return { log: created, transition: null, amountSync: null };
    }

    const result = isDocumentType(doc.type)
      ? await applyDocumentSent(
          {
            opportunityId: doc.opportunityId,
            orgId: user.orgId,
            actorId: user.id,
            documentId: doc.id,
            documentType: doc.type,
            documentTitle: doc.title,
            recipients,
          },
          tx,
        )
      : null;

    /*
     * 발송은 문서 상태를 초안 → 발송완료로 올리므로 **확정 문서 재판정 시점**이다 (기회-6 ①).
     * 같은 트랜잭션에 넣어야 "메일은 나갔는데 예상 금액은 옛 초안 기준" 이 되지 않는다.
     * 종류를 모르는 문서(전이 규칙이 없는 경우)도 상태는 바뀌었으므로 재판정은 그대로 돈다.
     */
    const amountSync = await syncOpportunityAmount(
      { opportunityId: doc.opportunityId, orgId: user.orgId },
      tx,
    );

    return { log: created, transition: result, amountSync };
  });

  return ok(
    { log, stage: describeTransition(transition, doc.type), amountSync },
    { status: 201 },
  );
}
