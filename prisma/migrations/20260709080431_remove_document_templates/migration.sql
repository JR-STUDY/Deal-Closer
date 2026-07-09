/*
  Warnings:

  - You are about to drop the `document_templates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `template_items` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "document_templates";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "template_items";
PRAGMA foreign_keys=on;
