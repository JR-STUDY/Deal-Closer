"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Send,
  FileText,
  CheckCircle2,
  AlertTriangle,
  PenLine,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/constants";
import { formatKRW } from "@/lib/format";
import {
  applyTemplateVariables,
  type EmailTemplateDTO,
  type TemplateContext,
} from "@/lib/email-template";
import { DocTypeBadge } from "@/components/status-badge";
import { SignaturePreview } from "@/components/signature-preview";
import { EmailTemplateToolbar } from "./email-template-toolbar";
import { SendPreview } from "./send-preview";

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
  /** 발신 신원 — 팀 도메인 선택 시 팀 주소, 아니면 개인 연동 계정 (없으면 null) */
  sender: { email: string; kind: "team" | "personal" } | null;
  /** 발신자(현재 사용자) 이름 — 미리보기 보낸사람 표시용 */
  senderName: string;
  templates: EmailTemplateDTO[];
  /** 현재 사용자의 저장된 메일 서명 (없으면 빈 문자열) */
  signature: string;
  /** 팀 도메인 발송 시 관리자가 지정한 기본 참조(CC) (개인 계정이면 "") */
  defaultCc: string;
};

/** 이메일 발송 폼 — 헤더의 발송하기 버튼과 본문 입력값 상태를 함께 관리한다 (데모: 실제 발송 없음) */
export function SenderClient({
  document,
  sender,
  senderName,
  templates,
  signature,
  defaultCc,
}: SenderClientProps) {
  const typeLabel =
    DOCUMENT_TYPE_LABELS[document.type as DocumentType] ?? document.type;
  const attachmentName = `[${typeLabel}] ${document.title}.pdf`;

  const [recipients, setRecipients] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [cc, setCc] = useState(() => defaultCc);
  const [subject, setSubject] = useState(`[${typeLabel}] ${document.title}`);
  const [body, setBody] = useState(DEFAULT_BODY);
  // 서명은 본문과 분리해 발송 시 하단에 붙인다 (템플릿에 서명이 섞이지 않도록)
  const [includeSignature, setIncludeSignature] = useState(
    () => signature.length > 0,
  );

  // 템플릿 {{변수}} 치환에 쓸 현재 문서·담당자 값
  const templateContext = useMemo<TemplateContext>(
    () => ({
      거래처: document.clientName ?? "",
      담당자: recipientName,
      문서제목: document.title,
      문서종류: typeLabel,
      총액: formatKRW(document.amount),
    }),
    [document.clientName, document.title, document.amount, typeLabel, recipientName],
  );

  // 미리보기·발송에 쓸 최종 제목·본문.
  // 문서 값은 템플릿 로드 시 이미 치환됐고, {{담당자}} 만 담당자명 입력값으로 지연 치환한다
  // (담당자명을 수정하면 미리보기·본문에 실시간 반영된다).
  const nameContext = { 담당자: recipientName };
  const composedSubject = applyTemplateVariables(subject, nameContext);
  const composedBody = applyTemplateVariables(body, nameContext);

  const handleSend = () => {
    if (!recipients.trim()) {
      toast.error("받는 사람을 입력해주세요.");
      return;
    }
    toast.success("이메일이 발송되었습니다 (데모)");
  };

  return (
    <>
      <PageHeader
        title="이메일 발송"
        description={`"${document.title}" 문서를 이메일로 발송합니다.`}
        actions={
          <Button onClick={handleSend}>
            <Send className="size-4" />
            발송하기
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          {sender ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                {sender.kind === "team" ? "팀 도메인" : "연동됨"} · 발신 계정:{" "}
                <span className="font-medium">{sender.email}</span>
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

          <EmailTemplateToolbar
            initialTemplates={templates}
            context={templateContext}
            currentSubject={subject}
            currentBody={body}
            onApply={(nextSubject, nextBody, nextRecipientName) => {
              setSubject(nextSubject);
              setBody(nextBody);
              // 템플릿에 기본 담당자명이 있으면 폼 담당자명도 채운다
              if (nextRecipientName) setRecipientName(nextRecipientName);
            }}
          />

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
              <CardTitle className="text-base">받는 사람</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="recipient-name">담당자명</Label>
                <Input
                  id="recipient-name"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="예: 김구매 (본문의 {{담당자}}에 반영됩니다)"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="recipients">수신자</Label>
                <Textarea
                  id="recipients"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder="example@company.com; (세미콜론으로 다중 입력 가능)"
                  className="min-h-16"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cc">참조 (CC)</Label>
                <Textarea
                  id="cc"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="참조할 이메일 (세미콜론으로 다중 입력 가능)"
                  className="min-h-16"
                />
                {sender?.kind === "team" && defaultCc.trim() ? (
                  <p className="text-xs text-muted-foreground">
                    팀 도메인 발송이라 관리자가 지정한 기본 참조가 채워졌습니다.
                    필요하면 수정할 수 있습니다.
                  </p>
                ) : null}
              </div>
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

          {/* 메일 서명 — 본문과 분리, 발송 시 하단에 추가 */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">서명</CardTitle>
              {signature ? (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  메일에 포함
                  <Switch
                    checked={includeSignature}
                    onCheckedChange={setIncludeSignature}
                    aria-label="메일에 서명 포함"
                  />
                </label>
              ) : null}
            </CardHeader>
            <CardContent>
              {signature ? (
                <div
                  className={
                    includeSignature
                      ? "rounded-lg border bg-muted/40 p-4"
                      : "rounded-lg border border-dashed p-4 opacity-60"
                  }
                >
                  <SignaturePreview signature={signature} />
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <PenLine className="size-4" />
                    저장된 서명이 없습니다. 서명을 추가하면 발송 메일에 자동으로
                    포함됩니다.
                  </span>
                  <Link
                    href="/settings/email"
                    className="font-medium text-primary hover:underline"
                  >
                    서명 추가
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 실제 발송 미리보기 — 헤더 + 본문 + 서명 */}
          <SendPreview
            senderEmail={sender?.email ?? null}
            senderName={senderName}
            recipients={recipients}
            recipientName={recipientName}
            cc={cc}
            subject={composedSubject}
            body={composedBody}
            includeSignature={includeSignature}
            signature={signature}
          />

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
