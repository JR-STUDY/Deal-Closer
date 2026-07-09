-- AlterTable
ALTER TABLE "email_templates" ADD COLUMN "recipientName" TEXT;

-- AlterTable
ALTER TABLE "team_mail_domains" ADD COLUMN "defaultCc" TEXT;
