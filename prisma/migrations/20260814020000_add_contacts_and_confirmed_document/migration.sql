-- 거래처 담당자 다중화(거래처-8) + 기회의 확정 문서(기회-6)
--
-- release/2.0.0 의 20260813061049 가 만든 accounts · opportunities 위에 얹는 델타다.
-- 두 변경을 한 파일에 묶은 이유: 둘 다 SQLite 의 테이블 재작성(RedefineTables)을 쓰는데
-- 파일이 갈리면 accounts → opportunities 순서가 파일명 정렬에 의존하게 된다.
-- 여기서는 한 파일 안의 순서가 곧 실행 순서다.
--
-- ─────────────────────────── ① 담당자 이관 ───────────────────────────
-- Account 의 단일 담당자 필드 4개(contactName · position · phone · email)를 contacts 로
-- 옮기고 accounts 에서 제거한다. 순서가 곧 데이터 보존이다:
--   contacts 생성 → accounts 의 현재 값을 contacts 로 복사 → accounts 재정의(컬럼 제거)
-- prisma migrate 가 자동 생성하는 SQL 에는 가운데 복사 단계가 없어 기존 담당자 정보가
-- 통째로 사라진다. 손으로 넣었으니 이 파일을 다시 생성하지 말 것.

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contacts_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contacts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- MigrateData: accounts 의 기존 담당자 1명 → contacts (대표 담당자로)
--
-- id 는 SQL 안에서 만들어야 해서 cuid() 를 쓸 수 없다. 거래처 1곳당 1건이므로
-- Account.id 에서 파생한 'ct_' || accounts.id 를 쓴다 — 유일성이 Account.id 의 유일성으로
-- 보장되고, 마이그레이션을 어느 DB 에 돌려도 같은 값이 나온다(결정론적이라 재현·대조가 된다).
--
-- name 은 NOT NULL 이므로 담당자명이 비어 있는 거래처는 Contact 를 만들지 않는다
-- (담당자 0명을 허용한다). 직책·연락처만 있고 이름이 없던 값은 여기서 버려지는데,
-- 이름 없는 담당자는 목록·상세 어디에도 표시할 수 없어 남겨도 쓰이지 않는다.
--
-- isPrimary 는 1(대표)이다. 거래처당 1명뿐이라 대표가 2명이 되는 경우가 없다.
-- createdAt · updatedAt 은 거래처의 값을 물려받는다 — 대표 삭제 시 "가장 먼저 만들어진
-- 담당자"를 승격하는 규칙이 이관된 담당자에게도 자연스럽게 적용된다.
INSERT INTO "contacts" ("id", "orgId", "accountId", "name", "position", "phone", "email", "isPrimary", "createdAt", "updatedAt")
SELECT
    'ct_' || "id",
    "orgId",
    "id",
    TRIM("contactName"),
    "position",
    "phone",
    "email",
    true,
    "createdAt",
    "updatedAt"
FROM "accounts"
WHERE "contactName" IS NOT NULL AND TRIM("contactName") <> '';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "bizRegNo" TEXT,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "accounts_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_accounts" ("bizRegNo", "companyName", "createdAt", "id", "memo", "orgId", "updatedAt") SELECT "bizRegNo", "companyName", "createdAt", "id", "memo", "orgId", "updatedAt" FROM "accounts";
DROP TABLE "accounts";
ALTER TABLE "new_accounts" RENAME TO "accounts";
CREATE INDEX "accounts_orgId_idx" ON "accounts"("orgId");
CREATE INDEX "accounts_companyName_idx" ON "accounts"("companyName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "contacts_orgId_idx" ON "contacts"("orgId");

-- CreateIndex
CREATE INDEX "contacts_accountId_idx" ON "contacts"("accountId");

-- ──────────────────────── ② 기회의 확정 문서 ────────────────────────
-- Opportunity 에 confirmedDocumentId(@unique FK) · isConfirmedDocumentPinned 를 더한다.

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
