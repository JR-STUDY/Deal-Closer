-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "folders_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'QUOTE',
    "description" TEXT,
    "contentJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "document_templates_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "template_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "template_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "documents_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "documents_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_documents" ("amount", "authorId", "clientName", "contentJson", "createdAt", "currency", "id", "orgId", "status", "title", "type", "updatedAt") SELECT "amount", "authorId", "clientName", "contentJson", "createdAt", "currency", "id", "orgId", "status", "title", "type", "updatedAt" FROM "documents";
DROP TABLE "documents";
ALTER TABLE "new_documents" RENAME TO "documents";
CREATE INDEX "documents_orgId_idx" ON "documents"("orgId");
CREATE INDEX "documents_authorId_idx" ON "documents"("authorId");
CREATE INDEX "documents_status_idx" ON "documents"("status");
CREATE INDEX "documents_folderId_idx" ON "documents"("folderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "folders_orgId_idx" ON "folders"("orgId");

-- CreateIndex
CREATE INDEX "folders_parentId_idx" ON "folders"("parentId");

-- CreateIndex
CREATE INDEX "document_templates_orgId_idx" ON "document_templates"("orgId");

-- CreateIndex
CREATE INDEX "template_items_templateId_idx" ON "template_items"("templateId");
