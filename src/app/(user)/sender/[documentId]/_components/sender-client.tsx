"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Send, FileText, PenLine, Eye } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/constants";
import { formatKRW } from "@/lib/format";
import { parseRecipients } from "@/lib/validation";
import {
  applyTemplateVariables,
  type EmailTemplateDTO,
  type TemplateContext,
} from "@/lib/email-template";
import { DocTypeBadge } from "@/components/status-badge";
import { SignaturePreview } from "@/components/signature-preview";
import { EmailTemplateToolbar } from "./email-template-toolbar";
import { SendPreview } from "./send-preview";
import { SenderAccountBanner } from "./sender-account-banner";

const DEFAULT_BODY =
  "안녕하세요, Rainmaker를 통해 생성된 문서를 전달드립니다. 첨부된 문서를 확인해주시기 바랍니다. 감사합니다.";

/** 발송 화면에서 고를 수 있는 발신 계정(개인 연동 계정 / 인증 팀 도메인) */
export type SenderOption = {
  /** 개인 계정은 "personal", 팀 도메인은 도메인 id (mail-preference 저장 키) */
  value: string;
  kind: "team" | "personal";
  email: string;
  label: string;
  /** 팀 도메인 발송 시 관리자가 지정한 기본 참조(CC) (개인 계정이면 "") */
  defaultCc: string;
};

type SenderClientProps = {
  document: {
    id: string;
    title: string;
    type: string;
    clientName: string | null;
    amount: number;
  };
  /** 발신 계정 선택지 (개인 계정 + 인증 팀 도메인). 비어 있으면 연동 필요 */
  senderOptions: SenderOption[];
  /** 초기 선택값 (SenderOption.value) — 없으면 null */
  initialSelectedValue: string | null;
  /** 발신자(현재 사용자) 이름 — 미리보기 보낸사람 표시용 */
  senderName: string;
  templates: EmailTemplateDTO[];
  /** 현재 사용자의 저장된 메일 서명 (없으면 빈 문자열) */
  signature: string;
};

/** 이메일 발송 폼 — 헤더의 발송하기 버튼과 본문 입력값 상태를 함께 관리한다 (데모: 실제 발송 없음) */
export function SenderClient({
  document,
  senderOptions,
  initialSelectedValue,
  senderName,
  templates,
  signature,
}: SenderClientProps) {
  const typeLabel =
    DOCUMENT_TYPE_LABELS[document.type as DocumentType] ?? document.type;
  const attachmentName = `[${typeLabel}] ${document.title}.pdf`;

  // 선택된 발신 계정 — 셀렉트로 바로 전환하고 선택은 즉시 저장(PATCH /api/mail-preference)한다
  const [selectedValue, setSelectedValue] = useState<string | null>(
    initialSelectedValue,
  );
  const [savingSender, setSavingSender] = useState(false);
  const currentOption =
    senderOptions.find((o) => o.value === selectedValue) ?? null;
  const sender = currentOption
    ? { email: currentOption.email, kind: currentOption.kind }
    : null;

  const initialDefaultCc =
    senderOptions.find((o) => o.value === initialSelectedValue)?.defaultCc ?? "";

  const [recipients, setRecipients] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [cc, setCc] = useState(() => initialDefaultCc);

  const changeSender = async (value: string) => {
    if (value === selectedValue || savingSender) return;
    const prev = selectedValue;
    const nextOption = senderOptions.find((o) => o.value === value) ?? null;
    setSelectedValue(value); // 낙관적 업데이트
    setSavingSender(true);
    // 팀 도메인으로 바꿀 때 CC 가 비어 있으면 기본 참조를 채워 준다 (입력값은 보존)
    if (nextOption?.kind === "team" && nextOption.defaultCc && !cc.trim()) {
      setCc(nextOption.defaultCc);
    }
    try {
      const res = await fetch("/api/mail-preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // 개인 계정 → mailDomainId null, 팀 도메인 → 도메인 id
        body: JSON.stringify({
          mailDomainId: value === "personal" ? null : value,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        throw new Error(json?.error ?? "저장에 실패했습니다.");
      }
      toast.success("발신 계정을 변경했습니다.");
    } catch (err) {
      setSelectedValue(prev); // 실패 시 원복
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSavingSender(false);
    }
  };
  const [subject, setSubject] = useState(`[${typeLabel}] ${document.title}`);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  // 서명은 본문과 분리해 발송 시 하단에 붙인다 (템플릿에 서명이 섞이지 않도록)
  const [includeSignature, setIncludeSignature] = useState(
    () => signature.length > 0,
  );
  const [previewOpen, setPreviewOpen] = useState(false);

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
    const { valid, invalid } = parseRecipients(recipients);

    if (valid.length === 0 && invalid.length === 0) {
      const message = "수신자를 입력해주세요.";
      setRecipientError(message);
      toast.error(message);
      return;
    }
    if (invalid.length > 0) {
      const message = `올바르지 않은 이메일 형식: ${invalid.join(", ")}`;
      setRecipientError(message);
      toast.error(message);
      return;
    }
    if (!sender) {
      toast.error("발신 계정을 먼저 연동해주세요.");
      return;
    }

    setRecipientError(null);
    toast.success(`${valid.length}명에게 이메일이 발송되었습니다 (데모)`);
  };

  return (
    <>
      <PageHeader
        title="이메일 발송"
        description={`"${document.title}" 문서를 이메일로 발송합니다.`}
        backHref="/library"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye className="size-4" />
              미리보기
            </Button>
            <Button onClick={handleSend}>
              <Send className="size-4" />
              발송하기
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <SenderAccountBanner
            options={senderOptions}
            selectedValue={selectedValue}
            saving={savingSender}
            kind={sender?.kind ?? null}
            onChange={changeSender}
          />

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
                  onChange={(e) => {
                    setRecipients(e.target.value);
                    if (recipientError) setRecipientError(null);
                  }}
                  placeholder="example@company.com; (세미콜론·쉼표로 다중 입력 가능)"
                  className="min-h-16"
                  aria-invalid={recipientError ? true : undefined}
                  aria-describedby={
                    recipientError ? "recipients-error" : undefined
                  }
                />
                {recipientError ? (
                  <p
                    id="recipients-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {recipientError}
                  </p>
                ) : null}
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
                {sender?.kind === "team" && currentOption?.defaultCc.trim() ? (
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
                value={composedSubject}
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
                value={composedBody}
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

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="size-4 text-muted-foreground" />
              메일 미리보기
            </DialogTitle>
            <DialogDescription>
              실제 발송될 메일 모습입니다. 본문과 서명이 함께 표시됩니다.
            </DialogDescription>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
    </>
  );
}
