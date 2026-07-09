import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Send,
  Paperclip,
  FileText,
  Download,
  FolderOpen,
  ExternalLink,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, DocTypeBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditorClient } from "./_components/editor-client";

/** 바이트 크기를 사람이 읽는 형태로 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default async function EditorPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      generation: {
        include: {
          attachments: {
            // 원본 바이트(data)는 제외하고 메타데이터만 조회
            select: { id: true, fileName: true, mimeType: true, size: true },
            orderBy: { createdAt: "asc" },
          },
          references: {
            include: {
              document: {
                select: { id: true, title: true, type: true, status: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!document) {
    notFound();
  }

  const attachments = document.generation?.attachments ?? [];
  const references = document.generation?.references ?? [];

  return (
    <>
      <PageHeader
        title={document.title}
        actions={
          <>
            <StatusBadge status={document.status} />
            <Button asChild variant="outline">
              <Link href={`/sender/${document.id}`}>
                <Send className="size-4" />
                발송하기
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-8">
        {attachments.length > 0 && (
          <div className="mx-auto mb-6 max-w-4xl">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-base">
                  <Paperclip className="size-4" />
                  첨부 파일 ({attachments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {attachments.map((file) => (
                    <li
                      key={file.id}
                      className="flex min-h-11 items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate" title={file.fileName}>
                        {file.fileName}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatBytes(file.size)}
                      </span>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0"
                      >
                        <a
                          href={`/api/attachments/${file.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${file.fileName} 열기`}
                        >
                          <Download className="size-4" />
                        </a>
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {references.length > 0 && (
          <div className="mx-auto mb-6 max-w-4xl">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-base">
                  <FolderOpen className="size-4" />
                  참고 문서 ({references.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {references.map((ref) => (
                    <li
                      key={ref.id}
                      className="flex min-h-11 items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span
                        className="flex-1 truncate"
                        title={ref.document.title}
                      >
                        {ref.document.title}
                      </span>
                      <DocTypeBadge type={ref.document.type} />
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0"
                      >
                        <Link
                          href={`/editor/${ref.document.id}`}
                          aria-label={`${ref.document.title} 열기`}
                        >
                          <ExternalLink className="size-4" />
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        <EditorClient document={document} />
      </div>
    </>
  );
}
