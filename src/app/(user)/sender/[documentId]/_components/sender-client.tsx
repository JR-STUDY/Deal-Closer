"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Send,
  FileText,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/constants";
import { formatKRW } from "@/lib/format";
import { DocTypeBadge } from "@/components/status-badge";

const DEFAULT_BODY =
  "안녕하세요, SpecFlow AI를 통해 생성된 문서를 전달드립니다. 첨부된 문서를 확인해주시기 바랍니다. 감사합니다.";

type SenderClientProps = {
  document: {
    id: string;
    title: string;
    type: string;
    clientName: string | null;
    amount: number;
  };
  account: { email: string } | null;
};

/** 이메일 발송 폼 — 헤더의 발송하기 버튼과 본문 입력값 상태를 함께 관리한다 (데모: 실제 발송 없음) */
export function SenderClient({ document, account }: SenderClientProps) {
  const typeLabel =
    DOCUMENT_TYPE_LABELS[document.type as DocumentType] ?? document.type;
  const attachmentName = `[${typeLabel}] ${document.title}.pdf`;

  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState(`[${typeLabel}] ${document.title}`);
  const [body, setBody] = useState(DEFAULT_BODY);

  const handleSend = () => {
    if (!recipients.trim()) {
      toast.error("수신자를 입력해주세요.");
      return;
    }
    toast.success("이메일이 발송되었습니다 (데모)");
  };

  return (
    <>
      <PageHeader
        title="이메일 발송"
        description={`"${document.title}" 문서를 이메일로 발송합니다.`}
        backHref="/library"
        actions={
          <Button onClick={handleSend}>
            <Send className="size-4" />
            발송하기
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          {account ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                연동됨 · 발신 계정:{" "}
                <span className="font-medium">{account.email}</span>
              </span>
              <Link
                href="/settings/email"
                className="text-sm font-medium text-primary hover:underline"
              >
                계정 변경
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4" />
                연동된 발신 계정이 없습니다. 이메일 계정을 먼저 연동해주세요.
              </span>
              <Link
                href="/settings/email"
                className="text-sm font-medium underline"
              >
                계정 연동하기
              </Link>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">문서 요약</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">거래처</p>
                <p className="mt-1 font-medium">
                  {document.clientName ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">종류</p>
                <div className="mt-1">
                  <DocTypeBadge type={document.type} />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">총액</p>
                <p className="mt-1 font-semibold tabular-nums">
                  {formatKRW(document.amount)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">수신자</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="recipients" className="sr-only">
                수신자
              </Label>
              <Textarea
                id="recipients"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                placeholder="example@company.com; (세미콜론으로 다중 입력 가능)"
                className="min-h-20"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">메일 제목</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="subject" className="sr-only">
                메일 제목
              </Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">메일 본문</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="body" className="sr-only">
                메일 본문
              </Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-32"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">첨부 파일</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <FileText className="size-8 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {attachmentName}
                  </p>
                  <p className="text-xs text-muted-foreground">1.2 MB</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
