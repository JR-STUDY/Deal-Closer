-- CreateTable
CREATE TABLE "generation_references" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "generationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generation_references_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "generation_requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "generation_references_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "generation_references_generationId_idx" ON "generation_references"("generationId");

-- CreateIndex
CREATE INDEX "generation_references_documentId_idx" ON "generation_references"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "generation_references_generationId_documentId_key" ON "generation_references"("generationId", "documentId");
