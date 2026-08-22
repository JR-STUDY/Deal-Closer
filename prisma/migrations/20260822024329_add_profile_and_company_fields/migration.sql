-- AlterTable
ALTER TABLE "brandings" ADD COLUMN "address" TEXT;
ALTER TABLE "brandings" ADD COLUMN "bizRegNo" TEXT;
ALTER TABLE "brandings" ADD COLUMN "ceoName" TEXT;
ALTER TABLE "brandings" ADD COLUMN "phone" TEXT;
ALTER TABLE "brandings" ADD COLUMN "stampUrl" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "position" TEXT;
