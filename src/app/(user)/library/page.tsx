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
    type?: string;
    q?: string;
    folder?: string;
  }>;
}) {
  // searchParams 와 org 조회는 서로 독립 → 병렬 처리
  const [{ status, type, q, folder }, org] = await Promise.all([
    searchParams,
    getCurrentOrg(),
  ]);

  const activeStatus = STATUS_TABS.some((t) => t.key === status) ? status! : "ALL";
  const activeType = (DOCUMENT_TYPES as readonly string[]).includes(type ?? "")
    ? type!
    : null;
  const query = q?.trim() ?? "";
  const activeFolder = folder || null;

  const statusWhere =
    activeStatus === "ALL" ? { status: { not: "VOID" } } : { status: activeStatus };
  const typeWhere = activeType ? { type: activeType } : {};
  const folderWhere = activeFolder ? { folderId: activeFolder } : {};
  const queryWhere = query
    ? {
        OR: [
          { title: { contains: query } },
          { clientName: { contains: query } },
        ],
      }
    : {};

  // 이 화면은 "내 문서함"(공통 아님)만 다룬다. 공용 문서는 /library/common 에서 관리.
  const baseWhere = { orgId: org.id, isCommon: false };

  const [documents, folders] = await Promise.all([
    prisma.document.findMany({
      where: {
        ...baseWhere,
        ...statusWhere,
        ...typeWhere,
        ...folderWhere,
        ...queryWhere,
      },
      orderBy: { createdAt: "desc" },
    }),
    // 내 문서함 폴더 (카드 '폴더 이동' 선택지 · 경로 표시)
    prisma.folder.findMany({
      where: { orgId: org.id, isCommon: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true },
    }),
  ]);

  // 현재 폴더의 경로(브레드크럼) — 내 문서함 › 상위 › … › 현재
  const byId = new Map(folders.map((f) => [f.id, f]));
  let breadcrumb: { label: string; href?: string }[] | undefined;
  if (activeFolder && byId.has(activeFolder)) {
    const chain: { id: string; name: string }[] = [];
    let cur = byId.get(activeFolder);
    while (cur) {
      chain.unshift({ id: cur.id, name: cur.name });
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    breadcrumb = [
      { label: "내 문서함", href: "/library" },
      ...chain.map((f) => ({ label: f.name, href: `/library?folder=${f.id}` })),
    ];
  }

  /** 상태 탭 링크 — 종류·검색·폴더 필터를 유지한다 */
  function statusHref(key: string): string {
    const sp = new URLSearchParams();
    if (key !== "ALL") sp.set("status", key);
    if (activeType) sp.set("type", activeType);
    if (query) sp.set("q", query);
    if (activeFolder) sp.set("folder", activeFolder);
    const qs = sp.toString();
    return qs ? `/library?${qs}` : "/library";
  }

  return (
    <>
      <PageHeader
        title="내 문서함"
        breadcrumb={breadcrumb}
        description="상태·종류로 걸러보고 제목·거래처로 검색하세요."
        actions={
          <Button asChild>
            <Link href="/generator">
              <Sparkles className="size-4" />새 문서 생성
            </Link>
          </Button>
        }
      />

      <div className="flex-1 space-y-4 overflow-auto p-8">
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
          <DocumentList documents={documents} folders={folders} />
        )}
      </div>
    </>
  );
}
