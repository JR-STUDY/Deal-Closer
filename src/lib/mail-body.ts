/**
 * 발송 메일 본문 조립 (F-233) — **순수 모듈**.
 *
 * 발송 화면은 본문을 **일반 텍스트**로 입력받는다(Textarea). 그런데 오픈 트래킹(F-234)은
 * 이미지 태그를 넣을 HTML 본문을 요구하므로, 서버가 같은 원문에서 두 벌을 만든다.
 *   - `text`: 원문 + 서명(태그를 걷어낸 것) — 이미지를 막은 클라이언트·낭독기가 읽는다
 *   - `html`: 이스케이프한 본문 + 서명
 *
 * **추적 픽셀은 여기서 넣지 않는다.** 위치·주소 규칙은 `@/lib/email-tracking` 의
 * `withTrackingPixel` 하나이고(본문 맨 끝 · 서명 뒤 · 주소 없으면 그대로), 라우트가
 * 이 함수의 결과를 그 함수에 통과시킨다. 조립부를 두 벌로 만들면 픽셀 규칙이 갈라진다.
 *
 * **본문은 전부 사용자 입력이라 반드시 이스케이프한다.** 서명만 예외인데, 사용자가 스스로
 * 저장한 자기 서명이고 이미 화면에서 HTML 로 렌더하기 때문이다 — 판정도 미리보기와 같은
 * `isHtmlSignature` 를 쓴다(`signature-preview.tsx`). 이스케이프 규칙 자체는 인쇄용 HTML 과
 * 같은 `escapeHtml` 이다: 규칙을 새로 만들지 않는다.
 *
 * 라우트가 조립을 직접 하지 않는 이유는 하나다 — 이스케이프를 한 곳에서만 하면
 * 빠뜨릴 자리가 없다.
 */

import { escapeHtml } from "./pdf-html";
import { isHtmlSignature } from "./signature";

/** 메일 본문 바탕 스타일 — 클라이언트마다 기본 글꼴이 달라 최소한만 지정한다 */
const BODY_STYLE =
  "margin:0;padding:0;color:#111827;font-family:'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',Arial,sans-serif;font-size:14px;line-height:1.7;white-space:pre-wrap;";

/** 서명 앞 구분선 */
const SIGNATURE_DIVIDER =
  '<hr style="margin:24px 0 16px;border:0;border-top:1px solid #e5e7eb" />';

/** 텍스트 파트에서 본문과 서명을 가르는 줄 (메일 관례) */
const TEXT_DIVIDER = "---";

export type ComposeMailBodyInput = {
  /** 사용자가 입력한 본문 (일반 텍스트) */
  bodyText: string;
  /** 붙일 서명. 비었거나 사용자가 껐으면 null */
  signature?: string | null;
};

export type ComposedMailBody = {
  html: string;
  text: string;
};

/** 서명을 HTML 조각으로 만든다 (일반 텍스트 서명은 이스케이프해서 그대로) */
function signatureHtml(signature: string): string {
  return isHtmlSignature(signature)
    ? signature
    : `<div style="${BODY_STYLE}">${escapeHtml(signature)}</div>`;
}

/**
 * HTML 서명을 텍스트 파트용으로 되돌린다.
 * 그대로 붙이면 수신자가 `<table>` 같은 태그를 **글자로** 읽는다.
 */
function signatureText(signature: string): string {
  if (!isHtmlSignature(signature)) return signature.trim();
  return signature
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 텍스트 본문 — 서명은 원문에 붙이고 추적 픽셀은 넣지 않는다(이미지가 없다) */
function composeText(bodyText: string, signature: string | null): string {
  const trimmed = bodyText.trimEnd();
  if (!signature) return trimmed;
  const plain = signatureText(signature);
  return plain ? `${trimmed}\n\n${TEXT_DIVIDER}\n${plain}` : trimmed;
}

/** 발송할 본문 두 벌(html·text)을 만든다 */
export function composeMailBody(input: ComposeMailBodyInput): ComposedMailBody {
  const signature = input.signature?.trim() ? input.signature : null;
  const parts = [`<div style="${BODY_STYLE}">${escapeHtml(input.bodyText)}</div>`];
  if (signature) {
    parts.push(SIGNATURE_DIVIDER, signatureHtml(signature));
  }
  return {
    html: parts.join("\n"),
    text: composeText(input.bodyText, signature),
  };
}
