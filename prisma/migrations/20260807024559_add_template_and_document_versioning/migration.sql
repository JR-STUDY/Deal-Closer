-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'QUOTE',
    "scope" TEXT NOT NULL DEFAULT 'COMMON',
    "description" TEXT,
    "contentJson" TEXT,
    "prompt" TEXT,
    "sourceFileName" TEXT,
    "sourceMimeType" TEXT,
    "sourceSize" INTEGER,
    "sourceData" BLOB,
    "forkedFromId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "templates_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "templates_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "templates_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "template_variables" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sample" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "template_variables_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "isCommon" BOOLEAN NOT NULL DEFAULT false,
    "templateId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "rootId" TEXT,
    "sourceDocumentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "documents_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "documents_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "documents_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "documents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_documents" ("amount", "authorId", "clientName", "contentJson", "createdAt", "currency", "folderId", "id", "isCommon", "orgId", "status", "title", "type", "updatedAt") SELECT "amount", "authorId", "clientName", "contentJson", "createdAt", "currency", "folderId", "id", "isCommon", "orgId", "status", "title", "type", "updatedAt" FROM "documents";
DROP TABLE "documents";
ALTER TABLE "new_documents" RENAME TO "documents";
CREATE INDEX "documents_orgId_idx" ON "documents"("orgId");
CREATE INDEX "documents_authorId_idx" ON "documents"("authorId");
CREATE INDEX "documents_status_idx" ON "documents"("status");
CREATE INDEX "documents_folderId_idx" ON "documents"("folderId");
CREATE INDEX "documents_templateId_idx" ON "documents"("templateId");
CREATE INDEX "documents_rootId_idx" ON "documents"("rootId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "templates_orgId_idx" ON "templates"("orgId");

-- CreateIndex
CREATE INDEX "templates_type_idx" ON "templates"("type");

-- CreateIndex
CREATE INDEX "templates_forkedFromId_idx" ON "templates"("forkedFromId");

-- CreateIndex
CREATE INDEX "template_variables_templateId_idx" ON "template_variables"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "template_variables_templateId_key_key" ON "template_variables"("templateId", "key");
