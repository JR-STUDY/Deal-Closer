-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'QUOTE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "clientName" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "contentJson" TEXT,
    "orgId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "folderId" TEXT,
    "isCommon" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "documents_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "documents_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_documents" ("amount", "authorId", "clientName", "contentJson", "createdAt", "currency", "folderId", "id", "orgId", "status", "title", "type", "updatedAt") SELECT "amount", "authorId", "clientName", "contentJson", "createdAt", "currency", "folderId", "id", "orgId", "status", "title", "type", "updatedAt" FROM "documents";
DROP TABLE "documents";
ALTER TABLE "new_documents" RENAME TO "documents";
CREATE INDEX "documents_orgId_idx" ON "documents"("orgId");
CREATE INDEX "documents_authorId_idx" ON "documents"("authorId");
CREATE INDEX "documents_status_idx" ON "documents"("status");
CREATE INDEX "documents_folderId_idx" ON "documents"("folderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
