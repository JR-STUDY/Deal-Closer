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
import { loadDocumentRenderInput } from "@/lib/document-render";
import { documentPdfFileName, PDF_CONTENT_TYPE } from "@/lib/document-file";
import { renderDocumentPdf } from "@/lib/pdf";
import { resolveSendingIdentity } from "@/lib/mail-domain";
import { composeMailBody } from "@/lib/mail-body";
import {
  newTrackingId,
  readAppBaseUrl,
  withTrackingPixel,
} from "@/lib/email-tracking";
import { sendMail, type SendMailResult } from "@/lib/mailer";
import type { EmailLogStatus } from "@/lib/email-log";

type Params = { params: Promise<{ id: string }> };

/** 발송 후 단계 변화 안내 (정책 COPY-TONE). 알릴 내용이 없으면 null. */
type StageNotice = { changed: boolean; stage: string | null; message: string };

/**
 * 전송 결과 요약 — **화면이 문장을 새로 만들지 않는다.**
 * 예전에는 화면이 "발송 처리했습니다 (실제 메일 전송은 준비 중입니다)" 를 스스로 적었고,
 * 서버가 무엇을 했는지와 무관한 말이 사용자에게 갔다.
 */
type DeliveryNotice = {
  status: EmailLogStatus;
  /** 사용자에게 보여줄 한국어 문구 */
  message: string;
  /** 실제로 메일이 나갔는지 — 화면이 toast 종류(성공/안내)를 고르는 기준 */
  delivered: boolean;
  /** 첨부한 PDF — 첨부 없이 보내지 않으므로 항상 있다 */
  attachment: { fileName: string; byteSize: number };
  /** 추적 픽셀을 실어 보냈는지. false 면 이 발송의 열람은 기록되지 않는다 (F-234) */
  tracking: boolean;
};

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
 * 전송 결과 → `EmailLog.status`.
 * 어댑터가 준 세 상태를 **그대로** 옮긴다. 결과를 모른 채 `SENT` 로 적지 않는다 (F-233).
 */
function logStatusOf(result: SendMailResult): EmailLogStatus {
  if (result.status === "sent") return "SENT";
  if (result.status === "skipped") return "SKIPPED";
  return "FAILED";
}

/**
 * POST /api/documents/:id/send — 문서 이메일 발송 (F-232 · F-233 · F-234 · F-113 · F-114).
 *
 * ## 순서와 트랜잭션 경계
 *
 * ```
 *   ① PDF 렌더        ② 메일 전송         ③ DB 갱신 (한 트랜잭션)
 *     (Chrome)          (Resend HTTPS)      EmailLog · 문서 상태 · 단계 전이 · 금액 재판정
 *   ├──────────── 트랜잭션 밖 ──────────┤ ├────────── 트랜잭션 안 ──────────┤
 * ```
 *
 * **①② 를 트랜잭션 밖에 두는 이유**: 둘 다 외부 프로세스·네트워크를 기다린다(렌더 최대 30초,
 * 전송은 재시도까지 최대 30초). SQLite 는 쓰기를 직렬화하고 better-sqlite3 드라이버는
 * **동기 호출**이라, 트랜잭션을 열어 둔 채 그 시간을 기다리면 그동안 앱의 **다른 모든 쓰기가
 * 막힌다**. 게다가 트랜잭션 안에서 실패해도 롤백은 DB 만 되돌리고 **이미 나간 메일은 되돌릴
 * 수 없다** — 트랜잭션이 지켜 주는 것이 없다.
 *
 * **전송을 DB 기록보다 먼저 하는 이유**: 반대로 하면(기록 → 전송) 그 사이에 프로세스가 죽으면
 * `status="SENT"` 인 이력만 남고 메일은 나가지 않는다 — 이번 Phase 가 없애려는 바로 그
 * 거짓말이다. 지금 순서에서 최악의 경우는 "메일은 나갔는데 이력이 없다" 인데, 이건 사용자에게
 * 오류로 보이고 제공자 로그에도 남아 **알아챌 수 있는** 손실이다. 발송된 척하는 이력보다 낫다.
 *
 * **PDF 를 가장 먼저 하는 이유** (F-232): 견적서 없는 견적 메일이 나가면 안 된다. 기본 본문이
 * "첨부된 문서를 확인해주시기 바랍니다" 라고 적고 화면이 첨부 카드를 보여주므로, 첨부 없이
 * 내보내면 약속한 파일이 빠진 메일이 고객에게 간다. 렌더가 실패하면 전송·DB 기록 어느 것도
 * 하지 않고 502 로 이유를 알린다.
 *
 * ## 실패·건너뜀 시 상태
 *
 * - `failed` → EmailLog 는 **FAILED** 로 남기고 문서 상태·기회 단계·예상 금액은 **건드리지
 *   않는다**. 나가지 않은 메일로 파이프라인을 전진시키면 단계가 사실을 앞지르고, 확정 문서
 *   재판정을 통해 기회 예상 금액까지 따라 올라간다 (기회-6).
 * - `skipped`(자격증명 없는 개발 환경 · `MAIL_DRY_RUN`) → EmailLog 는 **SKIPPED**, 문서
 *   상태·단계는 **진행한다**. 운영자가 의도적으로 켠 리허설이라 파이프라인을 끝까지 확인하는
 *   것이 목적이고, 응답·이력·화면이 "건너뜀" 과 그 이유를 그대로 말하므로 보낸 척이 아니다.
 * - `trackingId` 는 **SENT 에만** 남긴다 — 나가지 않은 메일은 열릴 수가 없는데 id 를 남기면
 *   이력이 영원히 "열람 기록 없음" 으로 보여 오해를 만든다.
 *
 * 단계 전이는 반드시 `@/lib/opportunity-stage` 를 경유한다 (AGENTS.md 규칙).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  let body: {
    recipients?: string;
    cc?: string;
    subject?: string;
    body?: string;
    includeSignature?: boolean;
  };
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

  // 참조도 같은 함수로 검증한다 — 한쪽만 느슨하면 그 경로로 잘못된 주소가 들어간다.
  const ccParsed = parseRecipients(body.cc ?? "");
  if (ccParsed.invalid.length > 0) {
    return fail(`올바르지 않은 참조 형식입니다: ${ccParsed.invalid.join(", ")}`);
  }

  const bodyText = body.body?.trim();
  if (!bodyText) {
    return fail("메일 본문을 입력해주세요.");
  }

  /*
   * 문서·회사 정보는 미리보기·PDF 다운로드와 **같은 재료**를 쓴다 (`@/lib/document-render`).
   * 조직 범위로 좁혀 조회하므로 다른 조직의 문서 id 가 들어와도 404 로 끝난다.
   */
  const rendered = await loadDocumentRenderInput(id, user.org);
  if (!rendered) return fail("문서를 찾을 수 없습니다.", 404);

  const doc = rendered.document;
  if (doc.status === "VOID") {
    return fail("폐기된 문서는 발송할 수 없습니다.");
  }
  const mailSubject = body.subject?.trim() || doc.title;

  /*
   * 발신 주소는 **서버가 다시 정한다.** 화면이 보낸 값을 그대로 쓰면 남의 팀 도메인으로
   * 보내는 요청을 막을 수 없다 (인증이 붙는 순간 그대로 취약점이 된다).
   * 규칙은 `@/lib/mail-domain` 의 `resolveSendingIdentity` 하나다 — 발송 화면의 계정 선택기와
   * 같은 판정을 써야 화면에 보이는 발신 주소와 실제 발신 주소가 갈라지지 않는다.
   */
  const [personalAccount, selectedDomain] = await Promise.all([
    prisma.emailAccount
      .findFirst({ where: { userId: user.id, isDefault: true } })
      .then(
        (account) =>
          account ?? prisma.emailAccount.findFirst({ where: { userId: user.id } }),
      ),
    user.mailDomainId
      ? prisma.teamMailDomain.findFirst({
          where: { id: user.mailDomainId, orgId: user.orgId },
          select: { domain: true, status: true },
        })
      : null,
  ]);
  const identity = resolveSendingIdentity({
    userEmail: user.email,
    selectedDomain,
    personalEmail: personalAccount?.email ?? null,
  });
  if (identity.email === null) {
    return fail(
      "발신 계정이 없어 발송할 수 없습니다. 메일 연동 설정에서 계정을 연결하거나 팀 발신 도메인을 인증해 주세요.",
    );
  }

  // ── ① PDF 렌더 (F-232) — 첨부 없이 보내지 않으므로 가장 먼저 하고, 실패하면 멈춘다 ──
  const fileName = documentPdfFileName(doc);
  let pdf: Uint8Array;
  try {
    pdf = await renderDocumentPdf({
      doc: rendered.doc,
      title: doc.title,
      branding: rendered.branding,
    });
  } catch (error) {
    // 브라우저·글꼴 문제는 사용자가 화면에서 고칠 수 없다 — 원인을 그대로 전한다.
    const reason = error instanceof Error ? error.message : "알 수 없는 오류";
    return fail(
      `문서를 PDF 로 만들지 못해 발송을 중단했습니다. 첨부 없이 보내지 않습니다. (${reason})`,
      502,
    );
  }

  // ── ② 본문 조립 + 추적 픽셀 (F-234) ──
  const trackingId = newTrackingId();
  const baseUrl = readAppBaseUrl();
  if (baseUrl.error) {
    /*
     * 기본 주소가 없으면 픽셀을 만들 수 없어 이 발송의 열람은 영원히 기록되지 않는다.
     * 조용히 넘기면 나중에 화면의 "열람 기록 없음" 을 수신자 탓으로 읽게 되므로 이유를 남긴다
     * (`mailer.ts` 가 자격증명 없을 때 이유를 남기는 것과 같은 판단).
     */
    console.info(
      `[mail-track] ${baseUrl.error} 추적 픽셀을 만들 수 없어 이 발송의 열람은 기록되지 않습니다.`,
    );
  }
  const composed = composeMailBody({
    bodyText,
    // 화면에서 서명을 껐으면 붙이지 않는다 (기본값은 저장된 서명 포함)
    signature: body.includeSignature === false ? null : user.signature,
  });
  // 픽셀 위치·주소 규칙은 `@/lib/email-tracking` 하나다 (본문 맨 끝 · 서명 뒤 · 없으면 그대로)
  const html = withTrackingPixel(composed.html, baseUrl.baseUrl, trackingId);

  // ── ③ 전송 — 트랜잭션 밖 (위 주석의 근거) ──
  const result = await sendMail({
    from: identity.email,
    fromName: user.name,
    to: valid,
    cc: ccParsed.valid,
    // 회신은 담당자 본인에게 온다 — 팀 도메인 발신 주소는 받는 편지함이 아닐 수 있다.
    replyTo: user.email,
    subject: mailSubject,
    html,
    text: composed.text,
    attachments: [
      { fileName, content: pdf, contentType: PDF_CONTENT_TYPE },
    ],
  });
  const logStatus = logStatusOf(result);
  // 나가지 않은 메일로 파이프라인을 전진시키지 않는다 (위 "실패·건너뜀 시 상태" 참고).
  const advance = logStatus !== "FAILED";
  const tracked = logStatus === "SENT" && baseUrl.baseUrl !== null;

  // ── ④ DB 갱신 — 빠른 로컬 쓰기만 한 트랜잭션으로 묶는다 ──
  const { log, transition, amountSync } = await prisma.$transaction(async (tx) => {
    const created = await tx.emailLog.create({
      data: {
        documentId: doc.id,
        senderId: user.id,
        recipients,
        subject: mailSubject,
        body: bodyText,
        attachmentName: fileName,
        status: logStatus,
        // 실제로 나간 메일에만 추적 식별자를 남긴다 (위 주석 참고)
        trackingId: tracked ? trackingId : null,
      },
    });

    if (!advance) {
      return { log: created, transition: null, amountSync: null };
    }

    await tx.document.update({
      where: { id: doc.id },
      // 초안만 발송완료로 전이한다 (이미 계약완료된 문서를 재발송해도 강등하지 않음).
      data: { status: doc.status === "DRAFT" ? "SENT" : doc.status },
    });

    // 기회에 연결되지 않은 문서는 전이·재판정 대상이 아니다 — 오류가 아니라 조용히 통과한다.
    if (!doc.opportunityId) {
      return { log: created, transition: null, amountSync: null };
    }

    const stageResult = isDocumentType(doc.type)
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
    const synced = await syncOpportunityAmount(
      { opportunityId: doc.opportunityId, orgId: user.orgId },
      tx,
    );

    return { log: created, transition: stageResult, amountSync: synced };
  });

  if (result.status === "failed") {
    /*
     * 실패는 실패라고 말한다. 이력에 남겼다는 사실까지 알려야 사용자가 발송 이력에서 무엇을
     * 보게 될지 안다 (같은 문서를 몇 번 보냈는지 세다가 헷갈리지 않게).
     */
    return fail(
      `메일 전송에 실패했습니다: ${result.message} 발송 이력에는 실패로 기록했습니다.`,
      502,
    );
  }

  const delivery: DeliveryNotice = {
    status: logStatus,
    delivered: result.status === "sent",
    message:
      result.status === "skipped"
        ? `메일을 실제로 보내지 않았습니다. ${result.message} 문서 상태와 기회 단계는 그대로 진행했습니다.`
        : `${valid.length}명에게 메일을 발송했습니다.`,
    attachment: { fileName, byteSize: pdf.byteLength },
    tracking: tracked,
  };

  return ok(
    {
      log,
      delivery,
      stage: describeTransition(transition, doc.type),
      amountSync,
    },
    { status: 201 },
  );
}
