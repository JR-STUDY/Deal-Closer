import Link from "next/link";
import { Sparkles, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DocumentList } from "../_components/document-list";

export default async function CommonDocumentsPage() {
  const org = await getCurrentOrg();

  const documents = await prisma.document.findMany({
    where: { orgId: org.id, isCommon: true, status: { not: "VOID" } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="공용문서함"
        description="팀이 함께 쓰는 기준 문서함입니다. 카드 메뉴의 ‘내 문서함으로 이동’으로 되돌릴 수 있습니다."
        actions={
          <Button asChild>
            <Link href="/generator">
              <Sparkles className="size-4" />새 문서 생성
            </Link>
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-8">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
            <Users className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              아직 공용문서함에 문서가 없습니다. 내 문서함의 카드 메뉴에서
              ‘공용문서함으로 이동’해 팀 공용 기준 문서를 모아 보세요.
            </p>
            <Button asChild variant="outline">
              <Link href="/library">내 문서함으로 이동</Link>
            </Button>
          </div>
        ) : (
          <DocumentList documents={documents} />
        )}
      </div>
    </>
  );
}
