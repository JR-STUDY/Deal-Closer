-- 거래처 담당자 다중화 (거래처-8)
--
-- Account 의 단일 담당자 필드 4개(contactName · position · phone · email)를 contacts 테이블로
-- 옮기고 accounts 에서 제거한다. 순서가 곧 데이터 보존이다:
--   ① contacts 생성 → ② accounts 의 현재 값을 contacts 로 복사 → ③ accounts 재정의(컬럼 제거)
-- prisma migrate 가 자동 생성하는 SQL 에는 ② 가 없어 기존 담당자 정보가 통째로 사라진다.
-- ② 를 손으로 넣었으니 이 파일을 다시 생성하지 말 것.

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
