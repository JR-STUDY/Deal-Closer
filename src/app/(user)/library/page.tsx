import Link from "next/link";
import { Sparkles, Mail, Pencil, FolderOpen } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { formatKRW, formatDateTime } from "@/lib/format";
import { DOCUMENT_STATUSES, DOCUMENT_STATUS_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, DocTypeBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "ALL", label: "전체" },
  ...DOCUMENT_STATUSES.map((s) => ({ key: s, label: DOCUMENT_STATUS_LABELS[s] })),
];

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = TABS.some((t) => t.key === status) ? status! : "ALL";
  const org = await getCurrentOrg();

  const documents = await prisma.document.findMany({
    where: {
      orgId: org.id,
      // "전체" 탭은 폐기 문서를 제외한다 (폐기는 전용 탭에서만 노출).
      ...(active === "ALL" ? { status: { not: "VOID" } } : { status: active }),
    },
    orderBy: { createdAt: "desc" },
    include: { author: true },
  });

  return (
    <>
      <PageHeader
        title="문서 보관함"
        description={`총 ${documents.length}개의 문서가 보관되어 있습니다.`}
        actions={
          <Button asChild>
            <Link href="/generator">
              <Sparkles className="size-4" />새 문서 생성
            </Link>
          </Button>
        }
      />

      <div className="flex-1 space-y-6 overflow-auto p-8">
        {/* 상태 탭 */}
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={tab.key === "ALL" ? "/library" : `/library?status=${tab.key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
            <FolderOpen className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              보관 중인 문서가 없거나 검색 결과가 없습니다.
            </p>
            <Button asChild>
              <Link href="/generator">첫 문서 만들기</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {documents.map((doc) => (
              <Card key={doc.id} className="flex flex-col">
                <CardContent className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={doc.status} />
                    <DocTypeBadge type={doc.type} />
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
                      {doc.status === "VOID" ? "편집·복원" : "편집"}
                    </Link>
                  </Button>
                  {doc.status !== "VOID" ? (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Link href={`/sender/${doc.id}`}>
                        <Mail className="size-3.5" />
                        발송
                      </Link>
                    </Button>
                  ) : null}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
