import Link from "next/link";
import { Sparkles, Mail, Pencil, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { formatKRW, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, DocTypeBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { DocumentCardActions } from "../_components/document-card-actions";

export default async function CommonDocumentsPage() {
  const org = await getCurrentOrg();

  const [documents, folders] = await Promise.all([
    prisma.document.findMany({
      where: { orgId: org.id, isCommon: true, status: { not: "VOID" } },
      orderBy: { createdAt: "desc" },
      include: { author: true },
    }),
    prisma.folder.findMany({
      where: { orgId: org.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="공통 문서"
        description="팀이 함께 쓰는 기준 문서입니다. 카드 메뉴의 ‘공통 문서에서 제외’로 일반 문서로 되돌릴 수 있습니다."
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
              아직 공통 문서가 없습니다. 일반 문서의 카드 메뉴에서 ‘공통 문서로
              지정’해 팀 공용 기준 문서를 모아 보세요.
            </p>
            <Button asChild variant="outline">
              <Link href="/library">일반 문서로 이동</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {documents.map((doc) => (
              <Card key={doc.id} className="flex flex-col">
                <CardContent className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={doc.status} />
                    <div className="flex items-center gap-1">
                      <DocTypeBadge type={doc.type} />
                      <DocumentCardActions
                        documentId={doc.id}
                        documentTitle={doc.title}
                        currentFolderId={doc.folderId}
                        isCommon={doc.isCommon}
                        folders={folders}
                      />
                    </div>
                  </div>
                  <div>
                    <h3 className="line-clamp-2 font-semibold leading-snug">
                      {doc.title}
                    </h3>
                    {doc.clientName ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {doc.clientName}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="text-lg font-semibold tabular-nums">
                      {formatKRW(doc.amount)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDateTime(doc.createdAt)}
                    </span>
                  </div>
                </CardContent>
                <CardFooter className="gap-2 border-t">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/editor/${doc.id}`}>
                      <Pencil className="size-3.5" />
                      편집
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/sender/${doc.id}`}>
                      <Mail className="size-3.5" />
                      발송
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
