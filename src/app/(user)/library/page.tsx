import { Suspense } from "react";
import Link from "next/link";
import { Sparkles, FolderOpen } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPES,
} from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FolderTree } from "./_components/folder-tree";
import { LibraryBrowser } from "./_components/library-browser";
import { LibraryToolbar } from "./_components/library-toolbar";
import { DocumentList } from "./_components/document-list";

const STATUS_TABS = [
  { key: "ALL", label: "전체" },
  ...DOCUMENT_STATUSES.map((s) => ({ key: s, label: DOCUMENT_STATUS_LABELS[s] })),
];

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    folder?: string;
    type?: string;
    q?: string;
  }>;
}) {
  // searchParams 와 org 조회는 서로 독립 → 병렬 처리
  const [{ status, folder, type, q }, org] = await Promise.all([
    searchParams,
    getCurrentOrg(),
  ]);

  const activeStatus = STATUS_TABS.some((t) => t.key === status) ? status! : "ALL";
  const activeFolder = folder === "none" ? "none" : folder ? folder : null;
  const activeType = (DOCUMENT_TYPES as readonly string[]).includes(type ?? "")
    ? type!
    : null;
  const query = q?.trim() ?? "";

  const statusWhere =
    activeStatus === "ALL" ? { status: { not: "VOID" } } : { status: activeStatus };
  const folderWhere =
    activeFolder === "none"
      ? { folderId: null }
      : activeFolder
        ? { folderId: activeFolder }
        : {};
  const typeWhere = activeType ? { type: activeType } : {};
  const queryWhere = query
    ? {
        OR: [
          { title: { contains: query } },
          { clientName: { contains: query } },
        ],
      }
    : {};

  // 이 화면은 "일반 문서"(공통 아님)만 다룬다. 공통 문서는 /library/common 에서 관리.
  const baseWhere = { orgId: org.id, isCommon: false };

  const [folders, documents, totalActive, folderCounts] = await Promise.all([
    prisma.folder.findMany({
      where: { orgId: org.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.document.findMany({
      where: {
        ...baseWhere,
        ...statusWhere,
        ...folderWhere,
        ...typeWhere,
        ...queryWhere,
      },
      orderBy: { createdAt: "desc" },
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

  /** 상태 탭 링크 — 폴더·종류·검색 필터를 유지한다 */
  function statusHref(key: string): string {
    const sp = new URLSearchParams();
    if (key !== "ALL") sp.set("status", key);
    if (activeFolder) sp.set("folder", activeFolder);
    if (activeType) sp.set("type", activeType);
    if (query) sp.set("q", query);
    const qs = sp.toString();
    return qs ? `/library?${qs}` : "/library";
  }

  return (
    <>
      <PageHeader
        title="내 문서함"
        description="폴더로 문서를 분류하고 검색·필터로 빠르게 찾아보세요."
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
          {/* 검색 · 종류 필터 */}
          <Suspense fallback={<div className="h-9" />}>
            <LibraryToolbar />
          </Suspense>

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
              <DocumentList documents={documents} folders={flatFolders} />
            )}
        </LibraryBrowser>
      </div>
    </>
  );
}
