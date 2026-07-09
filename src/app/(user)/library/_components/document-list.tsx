"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Pencil,
  Mail,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
} from "lucide-react";
import { formatKRW, formatDateTime } from "@/lib/format";
import { DOCUMENT_TYPES, DOCUMENT_STATUSES } from "@/lib/constants";
import { StatusBadge, DocTypeBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DocumentCardActions } from "./document-card-actions";

export type DocRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  clientName: string | null;
  amount: number;
  createdAt: Date;
  folderId: string | null;
  isCommon: boolean;
};

type FolderOption = { id: string; name: string };

type View = "card" | "list";

type SortKey = "title" | "type" | "status" | "amount" | "createdAt";
type Sort = { key: SortKey; dir: "asc" | "desc" };

/** 정렬 가능한 목록 헤더 — 클릭할 때마다 오름차순 ↔ 내림차순 토글 */
function SortHeader({
  label,
  sortKey,
  sort,
  onToggle,
  align,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort | null;
  onToggle: (key: SortKey) => void;
  align?: "right";
}) {
  const active = sort?.key === sortKey;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        aria-label={`${label} 기준 정렬`}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {active ? (
          sort!.dir === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

export function DocumentList({
  documents,
  folders,
  view = "card",
}: {
  documents: DocRow[];
  folders: FolderOption[];
  view?: View;
}) {
  const [sort, setSort] = useState<Sort | null>(null);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      !prev || prev.key !== key
        ? { key, dir: "asc" }
        : { key, dir: prev.dir === "asc" ? "desc" : "asc" },
    );
  }

  // 목록 보기 정렬 (카드 보기는 서버 기본 정렬 유지)
  const rows = useMemo(() => {
    if (!sort) return documents;
    const dir = sort.dir === "asc" ? 1 : -1;
    const types = DOCUMENT_TYPES as readonly string[];
    const statuses = DOCUMENT_STATUSES as readonly string[];
    const cmp = (a: DocRow, b: DocRow): number => {
      switch (sort.key) {
        case "title":
          return a.title.localeCompare(b.title, "ko");
        case "type":
          return types.indexOf(a.type) - types.indexOf(b.type);
        case "status":
          return statuses.indexOf(a.status) - statuses.indexOf(b.status);
        case "amount":
          return a.amount - b.amount;
        case "createdAt":
          return a.createdAt.getTime() - b.createdAt.getTime();
      }
    };
    return [...documents].sort((a, b) => dir * cmp(a, b));
  }, [documents, sort]);

  return (
    <div className="space-y-4">
      {view === "card" ? (
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
                      isCommon={doc.isCommon}
                      currentFolderId={doc.folderId}
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
                    {doc.status === "VOID" ? "편집·복원" : "편집"}
                  </Link>
                </Button>
                {doc.status !== "VOID" ? (
                  <Button asChild variant="outline" size="sm" className="flex-1">
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
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="제목" sortKey="title" sort={sort} onToggle={toggleSort} />
                <SortHeader label="종류" sortKey="type" sort={sort} onToggle={toggleSort} />
                <SortHeader label="상태" sortKey="status" sort={sort} onToggle={toggleSort} />
                <SortHeader label="금액" sortKey="amount" sort={sort} onToggle={toggleSort} align="right" />
                <SortHeader label="작성일" sortKey="createdAt" sort={sort} onToggle={toggleSort} align="right" />
                <TableHead className="w-20 text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="max-w-xs">
                    <Link
                      href={`/editor/${doc.id}`}
                      className="font-medium hover:underline"
                    >
                      {doc.title}
                    </Link>
                    {doc.clientName ? (
                      <div className="text-xs text-muted-foreground">
                        {doc.clientName}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <DocTypeBadge type={doc.type} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={doc.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatKRW(doc.amount)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                    {formatDateTime(doc.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {doc.status !== "VOID" ? (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`${doc.title} 발송`}
                        >
                          <Link href={`/sender/${doc.id}`}>
                            <Mail className="size-4" />
                          </Link>
                        </Button>
                      ) : null}
                      <DocumentCardActions
                        documentId={doc.id}
                        documentTitle={doc.title}
                        isCommon={doc.isCommon}
                        currentFolderId={doc.folderId}
                        folders={folders}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
