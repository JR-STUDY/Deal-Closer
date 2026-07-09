import Link from "next/link";
import { Sparkles, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DocumentList } from "../_components/document-list";

export default async function CommonDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const [{ folder }, org] = await Promise.all([searchParams, getCurrentOrg()]);
  const activeFolder = folder || null;

  const [documents, folders] = await Promise.all([
    prisma.document.findMany({
      where: {
        orgId: org.id,
        isCommon: true,
        status: { not: "VOID" },
        ...(activeFolder ? { folderId: activeFolder } : {}),
      },
      orderBy: { createdAt: "desc" },
    }),
    // 공용문서함 폴더 (카드 '폴더 이동' 선택지 · 경로 표시)
    prisma.folder.findMany({
      where: { orgId: org.id, isCommon: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true },
    }),
  ]);

  // 현재 폴더의 경로(브레드크럼) — 공용문서함 › 상위 › … › 현재
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
      { label: "공용문서함", href: "/library/common" },
      ...chain.map((f) => ({
        label: f.name,
        href: `/library/common?folder=${f.id}`,
      })),
    ];
  }

  return (
    <>
      <PageHeader
        title="공용문서함"
        breadcrumb={breadcrumb}
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
          <DocumentList documents={documents} folders={folders} />
        )}
      </div>
    </>
  );
}
