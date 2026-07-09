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
 * (미리보기 버튼으로 여는 모달 안에 들어가므로 바깥 카드/헤더는 두지 않는다.)
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
    // 실제 메일 클라이언트처럼 흰 바탕의 한 장짜리 문서로 보여준다.
    <div className="overflow-hidden rounded-lg border bg-white text-neutral-900 shadow-sm">
      {/* 제목 (메일 상단 헤드라인) */}
      <div className="border-b px-5 py-4">
        <p className="text-base font-semibold text-neutral-900">
          {subject || "(제목 없음)"}
        </p>
        <div className="mt-3 space-y-1 text-[13px] text-neutral-500">
          <PreviewRow label="보낸사람">
            {senderEmail ? (
              <>
                <span className="text-neutral-700">{senderName}</span> &lt;
                {senderEmail}&gt;
              </>
            ) : (
              <span>발신 계정 없음</span>
            )}
          </PreviewRow>
          <PreviewRow label="받는사람">
            {recipients.trim() ? (
              recipientName.trim() ? (
                <>
                  <span className="text-neutral-700">{recipientName}</span> &lt;
                  {recipients}&gt;
                </>
              ) : (
                recipients
              )
            ) : (
              <span>(수신자 미입력)</span>
            )}
          </PreviewRow>
          {cc.trim() ? <PreviewRow label="참조">{cc}</PreviewRow> : null}
        </div>
      </div>

      {/* 본문 + 서명 — 한 흐름으로 이어진다 (구분선·박스 없이 실제 메일처럼) */}
      <div className="px-5 py-5 text-sm leading-relaxed text-neutral-800">
        <p className="whitespace-pre-line">{body}</p>
        {includeSignature && signature ? (
          <div className="mt-8">
            <SignaturePreview signature={signature} bordered={false} scale={0.8} />
          </div>
        ) : null}
      </div>
    </div>
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
      <span className="w-14 shrink-0 text-neutral-400">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
