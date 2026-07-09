"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutGrid, List as ListIcon, Pencil, Mail } from "lucide-react";
import { formatKRW, formatDateTime } from "@/lib/format";
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

type View = "card" | "list";

export function DocumentList({ documents }: { documents: DocRow[] }) {
  const [view, setView] = useState<View>("card");

  return (
    <div className="space-y-4">
      {/* 보기 전환 (카드 / 목록) */}
      <div className="flex justify-end">
        <div className="inline-flex rounded-md border p-0.5">
          <Button
            variant={view === "card" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 px-2"
            aria-pressed={view === "card"}
            onClick={() => setView("card")}
          >
            <LayoutGrid className="size-4" />
            카드
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 px-2"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <ListIcon className="size-4" />
            목록
          </Button>
        </div>
      </div>

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
                <TableHead>제목</TableHead>
                <TableHead>종류</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead className="text-right">작성일</TableHead>
                <TableHead className="w-20 text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
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
