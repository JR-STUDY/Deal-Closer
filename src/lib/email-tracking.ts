/**
 * 오픈 트래킹(추적 픽셀) — 식별자·기본 주소·픽셀 태그 조립 **순수 함수** (F-234).
 *
 * 이 모듈은 **기록 장치**를 다룬다. 무엇을 화면에 어떻게 적을지(열람/미확인 판정·라벨)는
 * `@/lib/email-log` 의 `emailOpenState` 가 단일 기준이다 — 둘을 섞으면 목록·상세가
 * 서로 다른 말을 하기 시작한다. 경계는 한 문장으로 나뉜다:
 *   - `email-tracking.ts` = "어떻게 기록되는가"(픽셀 주소·태그·최초 열람 규칙)
 *   - `email-log.ts`      = "무엇으로 보여줄 것인가"(표시 상태·라벨·안내 문구)
 *
 * DB 에 접근하지 않고 `server-only` 도 import 하지 않으므로 라우트·테스트 어디서나 쓴다.
 *
 * ## 왜 절대 주소여야 하는가
 * 픽셀은 **수신자의 메일 클라이언트**가 불러온다. 우리 앱의 상대 경로(`/api/...`)는
 * 그쪽에서 아무 곳도 가리키지 않으므로 `APP_BASE_URL`(공개적으로 닿는 주소)이 필요하다.
 * 주소가 없으면 **픽셀을 넣지 않는다** — 깨진 이미지가 고객 메일에 박히는 것이 열람
 * 기록을 잃는 것보다 나쁘다. 대신 그 사실을 로그로 말한다
 * (`mailer.ts` 가 자격증명 없을 때 조용히 넘어가지 않고 이유를 남기는 것과 같은 판단).
 */

// 이스케이프 규칙을 새로 만들지 않는다 — 인쇄용 HTML 과 같은 함수를 쓴다 (순수 모듈끼리의 재사용)
import { escapeHtml } from "./pdf-html";

// ────────────────────────── 추적 식별자 ──────────────────────────

/**
 * 추적 라우트 경로 — 조립부(픽셀 URL)와 라우트가 **같은 상수**를 본다.
 * 한쪽만 고치면 이미 나간 메일의 픽셀이 404 로 떨어진다.
 */
export const TRACKING_ROUTE_PREFIX = "/api/mail/track";

/** UUID v4 형식 (8-4-4-4-12 hex) */
const TRACKING_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 새 추적 식별자.
 *
 * **추측 불가능해야 한다** — 이 라우트는 인증 없이 열려 있어(수신자는 우리 사용자가 아니다)
 * 조직 범위로 좁힐 수 없다. 순번·문서 id·발송 시각처럼 유추되는 값을 쓰면 남의 발송 열람
 * 기록을 임의로 만들 수 있다. `crypto.randomUUID()` 는 122비트 난수(CSPRNG)라 그 목적에 맞다
 * (Prisma 의 `cuid()` 도 후보였지만 클라이언트 생성이 아니라 **서버에서** 만들어야 하고,
 * cuid 는 시간 성분이 앞에 붙어 같은 시각의 발송끼리 접두가 겹친다).
 */
export function newTrackingId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * 주소로 들어온 값이 우리가 만든 형식인지.
 * 형식이 아니면 **DB 를 조회하지 않는다** — 존재 여부를 알려주지 않는 것과 별개로,
 * 아무 문자열이나 조회를 태우면 라우트가 무료 탐색 도구가 된다.
 */
export function isTrackingId(value: string): boolean {
  return TRACKING_ID_PATTERN.test(value.trim());
}

// ────────────────────────── 기본 주소 ──────────────────────────

/** `.env` 의 기본 주소 키 (`.env.example` 참고) */
export const APP_BASE_URL_ENV_KEY = "APP_BASE_URL";

export type AppBaseUrlResult =
  | { baseUrl: string; error: null }
  | { baseUrl: null; error: string };

/**
 * 기본 주소 검증·정규화.
 *
 * - 절대 주소여야 한다 (`http://` · `https://`). 상대 경로는 수신자 쪽에서 의미가 없다.
 * - 경로·질의·조각은 버린다 — 픽셀 주소는 우리가 조립하므로 오리진만 필요하다.
 * - 끝의 `/` 는 떼어 `baseUrl + TRACKING_ROUTE_PREFIX` 가 `//` 로 겹치지 않게 한다.
 *
 * 실패 사유를 **문장으로** 돌려준다 — 로그에 "픽셀을 넣지 않았다" 만 남으면 무엇을
 * 고쳐야 하는지 알 수 없다.
 */
export function parseAppBaseUrl(raw: string | undefined | null): AppBaseUrlResult {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return {
      baseUrl: null,
      error: `${APP_BASE_URL_ENV_KEY} 가 설정되지 않았습니다.`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      baseUrl: null,
      error: `${APP_BASE_URL_ENV_KEY} 가 절대 주소가 아닙니다: ${trimmed}`,
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      baseUrl: null,
      error: `${APP_BASE_URL_ENV_KEY} 는 http · https 주소여야 합니다: ${trimmed}`,
    };
  }

  // origin 만 쓴다 (경로·질의·조각은 픽셀 주소에 섞이면 안 된다)
  return { baseUrl: parsed.origin, error: null };
}

/** 환경변수에서 기본 주소를 읽는다 */
export function readAppBaseUrl(
  env: Record<string, string | undefined> = process.env,
): AppBaseUrlResult {
  return parseAppBaseUrl(env[APP_BASE_URL_ENV_KEY]);
}

// ────────────────────────── 픽셀 ──────────────────────────

/** 추적 픽셀의 절대 주소 */
export function trackingPixelUrl(baseUrl: string, trackingId: string): string {
  return `${baseUrl}${TRACKING_ROUTE_PREFIX}/${encodeURIComponent(trackingId)}`;
}

/**
 * 추적 픽셀 `<img>` 태그.
 *
 * `display:none` 을 쓰지 않는다 — 숨긴 이미지를 아예 불러오지 않는 클라이언트가 있어
 * "안 보이게" 하려다 "기록 안 되게" 된다. 1×1 크기와 테두리 제거로 눈에 띄지 않게 하고,
 * `alt=""` 로 낭독기·이미지 차단 화면에서 **아무 것도 읽히지 않게** 한다
 * (설명을 넣으면 이미지가 차단된 메일에 "추적 이미지" 라는 글자만 남는다).
 */
export function trackingPixelTag(baseUrl: string, trackingId: string): string {
  const src = escapeHtml(trackingPixelUrl(baseUrl, trackingId));
  return `<img src="${src}" alt="" width="1" height="1" style="width:1px;height:1px;border:0;" />`;
}

/**
 * HTML 본문에 추적 픽셀을 얹는다.
 *
 * **위치는 본문 맨 끝(닫는 `</body>` 직전)이다.** 서명(`signature`)이 본문 하단에 붙는
 * 경로가 있으므로(`@/lib/signature`) 서명 **뒤**가 된다 — 이유는 셋이다:
 *   ① 서명은 사용자가 붙여 넣은 HTML 조각이라 표·`<div>` 가 닫히지 않은 경우가 있다.
 *      그 앞에 픽셀을 두면 서명 마크업 안으로 빨려 들어가 클라이언트가 통째로 지운다.
 *   ② 맨 끝은 본문 어디를 잘라 인용해도(답장·전달) 마지막에 남는 자리다.
 *   ③ 1×1 이라 눈에 보이는 배치에 영향이 없고, 사람이 읽는 내용 중간에 끼지 않는다.
 *
 * `baseUrl` 이 없으면 **원본을 그대로 돌려준다** — 넣을 수 없는 주소로 태그를 만들면
 * 고객 메일에 깨진 이미지가 박힌다. 호출부가 그 사실을 로그로 남긴다.
 */
export function withTrackingPixel(
  html: string,
  baseUrl: string | null,
  trackingId: string,
): string {
  if (!baseUrl) return html;
  const pixel = trackingPixelTag(baseUrl, trackingId);

  // 닫는 body 가 있으면 그 **직전**에 넣는다 (마지막 것 기준 — 서명이 통째로 문서일 수 있다)
  const closing = html.toLowerCase().lastIndexOf("</body>");
  if (closing === -1) return `${html}${pixel}`;
  return `${html.slice(0, closing)}${pixel}${html.slice(closing)}`;
}

/** 픽셀 응답의 MIME 타입 */
export const TRACKING_PIXEL_CONTENT_TYPE = "image/gif";

/** 1×1 투명 GIF (42바이트) — 가장 작고 모든 클라이언트가 그리는 형식이다 */
const TRACKING_PIXEL_GIF_BASE64 =
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * 픽셀 바이트 (매 요청 새 배열 — 응답 본문으로 그대로 넘긴다).
 * 반환 타입을 `Uint8Array<ArrayBuffer>` 로 못박는다 — 기본값인 `Uint8Array<ArrayBufferLike>`
 * 는 `Response` 본문 타입(BodyInit)에 들어가지 않아 라우트에서 타입 오류가 난다
 * (`ArrayBufferLike` 에는 SharedArrayBuffer 도 포함되기 때문이다).
 */
export function trackingPixelBytes(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(TRACKING_PIXEL_GIF_BASE64, "base64"));
}

/**
 * 픽셀 응답 헤더 — **캐시를 반드시 막는다.**
 * 한 번 캐시되면 두 번째 열람이 프록시·클라이언트 캐시에서 끝나 서버에 오지 않는다
 * (열람 횟수가 영원히 1 로 멈춘다). `Pragma`·`Expires` 는 옛 프록시용이다.
 */
export const TRACKING_PIXEL_HEADERS: Record<string, string> = {
  "Content-Type": TRACKING_PIXEL_CONTENT_TYPE,
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

// ────────────────────────── 기록 규칙 ──────────────────────────

/**
 * 최초 열람 시각 — **한 번 정해지면 바뀌지 않는다.**
 * 매번 갱신하면 "언제 처음 봤는가"(영업이 알고 싶은 사실)가 "마지막으로 본 시각"으로
 * 덮인다. 몇 번 봤는지는 `openCount` 가 따로 센다.
 */
export function firstOpenAt(existing: Date | null, now: Date): Date {
  return existing ?? now;
}
