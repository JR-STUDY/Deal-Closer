import { Suspense } from "react";
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
import { FolderTree } from "./_components/folder-tree";
import { LibraryBrowser } from "./_components/library-browser";
import { DocumentCardActions } from "./_components/document-card-actions";

const STATUS_TABS = [
  { key: "ALL", label: "전체" },
  ...DOCUMENT_STATUSES.map((s) => ({ key: s, label: DOCUMENT_STATUS_LABELS[s] })),
];

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; folder?: string }>;
}) {
  // searchParams 와 org 조회는 서로 독립 → 병렬 처리
  const [{ status, folder }, org] = await Promise.all([
    searchParams,
    getCurrentOrg(),
  ]);

  const activeStatus = STATUS_TABS.some((t) => t.key === status) ? status! : "ALL";
  const activeFolder = folder === "none" ? "none" : folder ? folder : null;

  const statusWhere =
    activeStatus === "ALL" ? { status: { not: "VOID" } } : { status: activeStatus };
  const folderWhere =
    activeFolder === "none"
      ? { folderId: null }
      : activeFolder
        ? { folderId: activeFolder }
        : {};

  // 이 화면은 "일반 문서"(공통 아님)만 다룬다. 공통 문서는 /library/common 에서 관리.
  const baseWhere = { orgId: org.id, isCommon: false };

  const [folders, documents, totalActive, folderCounts] = await Promise.all([
    prisma.folder.findMany({
      where: { orgId: org.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.document.findMany({
      where: { ...baseWhere, ...statusWhere, ...folderWhere },
      orderBy: { createdAt: "desc" },
      include: { author: true },
    }),
    prisma.document.count({ where: { ...baseWhere, status: { not: "VOID" } } }),
    // 폴더별 일반 문서 수 (폐기·공통 제외) — 트리 배지·미분류 카운트에 사용
    prisma.document.groupBy({
      by: ["folderId"],
      where: { ...baseWhere, status: { not: "VOID" } },
      _count: { _all: true },
    }),
  ]);

  const countByFolder = new Map<string | null, number>();
  for (const g of folderCounts) countByFolder.set(g.folderId, g._count._all);
  const unfiledCount = countByFolder.get(null) ?? 0;

  const folderNodes = folders.map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    docCount: countByFolder.get(f.id) ?? 0,
  }));
  const flatFolders = folders.map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
  }));

  /** 상태 탭 링크 — 현재 폴더 선택을 유지한다 */
  function statusHref(key: string): string {
    const sp = new URLSearchParams();
    if (key !== "ALL") sp.set("status", key);
    if (activeFolder) sp.set("folder", activeFolder);
    const qs = sp.toString();
    return qs ? `/library?${qs}` : "/library";
  }

  return (
    <>
      <PageHeader
        title="문서 보관함"
        description="폴더로 문서를 분류하고, 자주 쓰는 문서는 베이스 템플릿으로 관리하세요."
        actions={
          <Button asChild>
            <Link href="/generator">
              <Sparkles className="size-4" />새 문서 생성
            </Link>
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-8">
        <LibraryBrowser
          sidebar={
            <Suspense fallback={<div className="w-full" />}>
              <FolderTree
                folders={folderNodes}
                selected={activeFolder}
                totalCount={totalActive}
                unfiledCount={unfiledCount}
              />
            </Suspense>
          }
        >
          {/* 상태 필터 */}
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
              {STATUS_TABS.map((tab) => (
                <Link
                  key={tab.key}
                  href={statusHref(tab.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    activeStatus === tab.key
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
                  이 조건에 해당하는 문서가 없습니다.
                </p>
                <Button asChild>
                  <Link href="/generator">새 문서 만들기</Link>
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
                            folders={flatFolders}
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
        </LibraryBrowser>
      </div>
    </>
  );
}
