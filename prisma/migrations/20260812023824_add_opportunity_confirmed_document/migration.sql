-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_opportunities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'INITIAL',
    "expectedAmount" INTEGER NOT NULL DEFAULT 0,
    "confirmedDocumentId" TEXT,
    "isConfirmedDocumentPinned" BOOLEAN NOT NULL DEFAULT false,
    "expectedCloseDate" DATETIME,
    "actualCloseDate" DATETIME,
    "lostReason" TEXT,
    "memo" TEXT,
    "previousOpportunityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "opportunities_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "opportunities_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "opportunities_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "opportunities_confirmedDocumentId_fkey" FOREIGN KEY ("confirmedDocumentId") REFERENCES "documents" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "opportunities_previousOpportunityId_fkey" FOREIGN KEY ("previousOpportunityId") REFERENCES "opportunities" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_opportunities" ("accountId", "actualCloseDate", "createdAt", "expectedAmount", "expectedCloseDate", "id", "lostReason", "memo", "name", "orgId", "ownerId", "previousOpportunityId", "stage", "updatedAt") SELECT "accountId", "actualCloseDate", "createdAt", "expectedAmount", "expectedCloseDate", "id", "lostReason", "memo", "name", "orgId", "ownerId", "previousOpportunityId", "stage", "updatedAt" FROM "opportunities";
DROP TABLE "opportunities";
ALTER TABLE "new_opportunities" RENAME TO "opportunities";
CREATE UNIQUE INDEX "opportunities_confirmedDocumentId_key" ON "opportunities"("confirmedDocumentId");
CREATE UNIQUE INDEX "opportunities_previousOpportunityId_key" ON "opportunities"("previousOpportunityId");
CREATE INDEX "opportunities_orgId_idx" ON "opportunities"("orgId");
CREATE INDEX "opportunities_accountId_idx" ON "opportunities"("accountId");
CREATE INDEX "opportunities_ownerId_idx" ON "opportunities"("ownerId");
CREATE INDEX "opportunities_stage_idx" ON "opportunities"("stage");
CREATE INDEX "opportunities_expectedCloseDate_idx" ON "opportunities"("expectedCloseDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- ─────────────────────────── 백필 (기회-6) ───────────────────────────
-- 위 테이블 재작성은 기존 컬럼을 그대로 옮기므로 데이터 손실이 없다. 다만 그대로 두면
-- 기존 기회가 "예상 금액은 있는데 확정 문서는 없는" — 새 규칙으로는 만들어질 수 없는 —
-- 상태로 남는다. 그 상태에서 문서를 하나만 연결해도 손으로 넣은 금액이 조용히 덮인다.
-- 그래서 여기서 **한 번만** 자동 판정을 적용해 두 값을 맞춘다.
--
-- 판정 순서는 `src/lib/confirmed-document.ts` 의 순수 함수와 같다 —
-- 계약완료(3) > 발송완료(2) > 초안(1), 폐기(VOID)는 제외, 동순위는 최근 수정 순,
-- 그래도 같으면 id 오름차순(어느 DB 에서 돌려도 같은 결과가 나오도록).
-- 한 문서는 기회 한 곳에만 붙으므로(documents.opportunityId) confirmedDocumentId 의
-- UNIQUE 제약과 충돌하지 않는다.
UPDATE "opportunities"
SET "confirmedDocumentId" = (
    SELECT d."id"
    FROM "documents" d
    WHERE d."opportunityId" = "opportunities"."id"
      AND d."status" IN ('DRAFT', 'SENT', 'COMPLETED')
    ORDER BY
        CASE d."status" WHEN 'COMPLETED' THEN 3 WHEN 'SENT' THEN 2 ELSE 1 END DESC,
        d."updatedAt" DESC,
        d."id" ASC
    LIMIT 1
);

-- 확정 문서가 없는 기회는 0 원이 된다 (기회-6 ④ — 수동 입력을 허용하지 않는다).
UPDATE "opportunities"
SET "expectedAmount" = COALESCE(
    (
        SELECT d."amount"
        FROM "documents" d
        WHERE d."id" = "opportunities"."confirmedDocumentId"
    ),
    0
);
