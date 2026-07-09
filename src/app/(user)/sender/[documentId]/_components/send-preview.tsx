import { Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignaturePreview } from "@/components/signature-preview";

type SendPreviewProps = {
  senderEmail: string | null;
  senderName: string;
  recipients: string;
  recipientName: string;
  cc: string;
  /** 변수 치환이 끝난 최종 제목 */
  subject: string;
  /** 변수 치환이 끝난 최종 본문 */
  body: string;
  includeSignature: boolean;
  signature: string;
};

/**
 * 실제 발송 미리보기 — 보낸사람·받는사람·참조·제목 헤더 + 본문 + 서명을 함께 보여준다.
 * 발송 폼(SenderClient)에서 조합한 최종 값을 받아 렌더만 한다.
 */
export function SendPreview({
  senderEmail,
  senderName,
  recipients,
  recipientName,
  cc,
  subject,
  body,
  includeSignature,
  signature,
}: SendPreviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="size-4 text-muted-foreground" />
          미리보기
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          실제 발송될 메일 모습입니다. 본문과 서명이 함께 표시됩니다.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
          <div className="space-y-1 border-b bg-muted/30 p-4 text-sm">
            <PreviewRow label="보낸사람">
              {senderEmail ? (
                <>
                  {senderName} &lt;{senderEmail}&gt;
                </>
              ) : (
                <span className="text-muted-foreground">발신 계정 없음</span>
              )}
            </PreviewRow>
            <PreviewRow label="받는사람">
              {recipients.trim() ? (
                recipientName.trim() ? (
                  <>
                    {recipientName} &lt;{recipients}&gt;
                  </>
                ) : (
                  recipients
                )
              ) : (
                <span className="text-muted-foreground">(수신자 미입력)</span>
              )}
            </PreviewRow>
            {cc.trim() ? <PreviewRow label="참조">{cc}</PreviewRow> : null}
            <PreviewRow label="제목">
              <span className="font-medium text-foreground">
                {subject || "(제목 없음)"}
              </span>
            </PreviewRow>
          </div>
          <div className="space-y-4 p-4">
            <p className="whitespace-pre-line text-sm leading-relaxed">{body}</p>
            {includeSignature && signature ? (
              <div className="border-t pt-4">
                <SignaturePreview signature={signature} />
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** 미리보기 헤더의 라벨/값 한 줄 */
function PreviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
