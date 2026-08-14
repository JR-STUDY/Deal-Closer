import "server-only";

import { prisma } from "./db";
import { isOpportunityStage, type OpportunityStage } from "./constants";
import { primaryContact } from "./contact";
import { isEmail } from "./validation";

/**
 * 발송 화면이 쓰는 "연결된 기회 요약" 조회 (발송-11 · 발송-12).
 *
 * 발송 화면(서버 컴포넌트)과 연결 라우트(`PATCH /api/documents/:id/opportunity`)가
 * **같은 함수**를 써야 한다 — 처음 열었을 때와 기회를 바꿨을 때 받는 사람이 다른 규칙으로
 * 채워지면, 담당자는 화면에 보이는 주소가 어디서 온 값인지 알 수 없다.
 *
 * 대표 담당자 판정은 `@/lib/contact` 의 `primaryContact()` 를 그대로 쓴다 (거래처-8).
 * 여기서 다시 판단하지 않는다.
 */

/** 자동으로 채울 받는 사람. 대표 담당자가 없거나 이메일이 비면 만들지 않는다(비워 두는 편이 안전하다). */
export type OpportunityRecipient = {
  /** 어디서 온 값인지 화면에 밝히기 위한 거래처명 */
  accountName: string;
  name: string;
  email: string;
};

/** 발송 화면의 기회 연결 상태 — 자동완성 입력의 현재 값이자 발송 후 이동 대상이다 */
export type LinkedOpportunity = {
  id: string;
  name: string;
  accountName: string;
  stage: OpportunityStage;
  /** 자동으로 채울 받는 사람. 없으면 null → 화면은 비워 두고 이유를 안내한다 */
  recipient: OpportunityRecipient | null;
};

/**
 * 기회 id 로 요약을 읽는다. **orgId 스코프 필수** — 다른 조직의 기회 id 가 들어와도 null 이어야 한다.
 * 기회가 없으면 null (연결이 끊겼거나 삭제된 경우).
 */
export async function findLinkedOpportunity(
  opportunityId: string,
  orgId: string,
): Promise<LinkedOpportunity | null> {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, orgId },
    select: {
      id: true,
      name: true,
      stage: true,
      account: {
        select: {
          companyName: true,
          // 대표만 읽는다 — 목록에 싣지 않는 나머지 담당자는 여기서도 필요 없다 (거래처-8)
          contacts: {
            where: { isPrimary: true },
            select: {
              id: true,
              name: true,
              email: true,
              isPrimary: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
  if (!opportunity) return null;

  const contact = primaryContact(opportunity.account.contacts);
  const email = contact?.email?.trim() ?? "";

  return {
    id: opportunity.id,
    name: opportunity.name,
    // stage 는 DB 가 String 컬럼이라 정의 밖 값이 들어올 수 있다. 초기 단계로 보수 해석한다.
    stage: isOpportunityStage(opportunity.stage) ? opportunity.stage : "INITIAL",
    accountName: opportunity.account.companyName,
    // 형식이 깨진 주소를 채우면 담당자가 확인 없이 보낸다 — 그런 값은 없는 것으로 본다 (정책 VAL_*)
    recipient:
      contact && email && isEmail(email)
        ? {
            accountName: opportunity.account.companyName,
            name: contact.name,
            email,
          }
        : null,
  };
}
