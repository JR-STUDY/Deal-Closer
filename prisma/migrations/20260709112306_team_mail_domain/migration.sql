-- CreateTable
CREATE TABLE "team_mail_domains" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "team_mail_domains_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SALES_REP',
    "avatarUrl" TEXT,
    "signature" TEXT,
    "orgId" TEXT NOT NULL,
    "mailDomainId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "users_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "users_mailDomainId_fkey" FOREIGN KEY ("mailDomainId") REFERENCES "team_mail_domains" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_users" ("avatarUrl", "createdAt", "email", "id", "name", "orgId", "role", "signature", "updatedAt") SELECT "avatarUrl", "createdAt", "email", "id", "name", "orgId", "role", "signature", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_orgId_idx" ON "users"("orgId");
CREATE INDEX "users_mailDomainId_idx" ON "users"("mailDomainId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "team_mail_domains_orgId_idx" ON "team_mail_domains"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "team_mail_domains_orgId_domain_key" ON "team_mail_domains"("orgId", "domain");
