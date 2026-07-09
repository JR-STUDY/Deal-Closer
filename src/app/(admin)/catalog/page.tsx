import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { formatKRW } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CatalogActions } from "./_components/catalog-actions";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const org = await getCurrentOrg();

  const categoryRows = await prisma.catalogItem.findMany({
    where: { orgId: org.id },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });

  const TABS = [
    { key: "ALL", label: "전체" },
    ...categoryRows.map((row) => ({ key: row.category, label: row.category })),
  ];
  const active = TABS.some((t) => t.key === category) ? category! : "ALL";

  const items = await prisma.catalogItem.findMany({
    where: {
      orgId: org.id,
      ...(active !== "ALL" ? { category: active } : {}),
    },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="마스터 데이터 관리"
        description="견적서에 사용할 상품·서비스 카탈로그를 관리합니다."
        actions={<CatalogActions />}
      />

      <div className="flex-1 space-y-6 overflow-auto p-8">
        {/* 카테고리 탭 */}
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={tab.key === "ALL" ? "/catalog" : `/catalog?category=${tab.key}`}
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

        <Card>
          <CardContent>
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
                <PackageSearch className="size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  등록된 카탈로그 품목이 없습니다.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>카테고리</TableHead>
                    <TableHead>품목명</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>단위</TableHead>
                    <TableHead className="text-right">단가</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {item.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="font-medium">{item.name}</div>
                        {item.description ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {item.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.sku ?? "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.unit}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatKRW(item.unitPrice)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "border-0",
                            item.isActive
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {item.isActive ? "활성" : "비활성"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
