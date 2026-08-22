/**
 * `src/lib/email-tracking.ts` 검증 (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:email-tracking
 *
 * 지켜야 할 것을 집중적으로 본다 —
 * ① 추적 식별자는 **추측 불가능**하고 매번 다르다 ·
 * ② 기본 주소가 없거나 절대 주소가 아니면 **이유를 문장으로** 알린다 ·
 * ③ 기본 주소가 없으면 픽셀을 **넣지 않는다**(깨진 이미지가 고객 메일에 박히지 않게) ·
 * ④ 픽셀은 본문 **맨 끝**(닫는 body 직전 · 서명 뒤)에 들어간다 ·
 * ⑤ 픽셀 응답은 캐시되지 않는다(캐시되면 두 번째 열람이 서버에 오지 않는다) ·
 * ⑥ 최초 열람 시각은 한 번 정해지면 바뀌지 않는다.
 */

import assert from "node:assert/strict";
import {
  APP_BASE_URL_ENV_KEY,
  TRACKING_PIXEL_CONTENT_TYPE,
  TRACKING_PIXEL_HEADERS,
  TRACKING_ROUTE_PREFIX,
  firstOpenAt,
  isTrackingId,
  newTrackingId,
  parseAppBaseUrl,
  readAppBaseUrl,
  trackingPixelBytes,
  trackingPixelTag,
  trackingPixelUrl,
  withTrackingPixel,
} from "../src/lib/email-tracking";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function ok(value: unknown, message: string) {
  assert.ok(value, message);
  checks += 1;
}

// ────────────────────────── 추적 식별자 ──────────────────────────

const id = newTrackingId();
ok(isTrackingId(id), "만든 식별자는 자기 형식 검사를 통과한다");
check(id.length, 36, "UUID v4 는 36글자다");

// 매번 다르다 — 같은 값이 나오면 두 발송의 열람이 한 행에 섞인다(`@unique` 충돌도 난다)
const many = new Set(Array.from({ length: 500 }, () => newTrackingId()));
check(many.size, 500, "500개를 만들어도 겹치지 않는다");

// 유추되는 값은 형식에서 걸러진다 — 라우트가 DB 를 태우지 않게 한다
for (const bad of [
  "",
  "1",
  "42",
  "cmf0abc123",
  "../../etc/passwd",
  "%2e%2e",
  "00000000-0000-0000-0000-000000000000", // v4 아님(버전 자리 0)
  `${id}x`,
]) {
  check(isTrackingId(bad), false, `추측성 값은 식별자가 아니다: ${bad || "(빈 값)"}`);
}
ok(isTrackingId(`  ${id}  `), "주소에서 온 공백은 다듬어서 판정한다");

// ────────────────────────── 기본 주소 ──────────────────────────

check(
  parseAppBaseUrl("https://app.example.com"),
  { baseUrl: "https://app.example.com", error: null },
  "정상 주소는 그대로 통과한다",
);
check(
  parseAppBaseUrl("https://app.example.com/"),
  { baseUrl: "https://app.example.com", error: null },
  "끝의 / 는 떼어낸다 (픽셀 주소가 // 로 겹치지 않게)",
);
check(
  parseAppBaseUrl("https://app.example.com/mail?x=1#a"),
  { baseUrl: "https://app.example.com", error: null },
  "경로·질의·조각은 버리고 오리진만 쓴다",
);
check(
  parseAppBaseUrl("http://localhost:3000").baseUrl,
  "http://localhost:3000",
  "개발용 localhost 도 형식으로는 허용한다 (포트 보존)",
);

for (const bad of [undefined, null, "", "   ", "/app", "app.example.com", "ftp://a.b"]) {
  const result = parseAppBaseUrl(bad);
  check(result.baseUrl, null, `절대 http(s) 주소가 아니면 거절한다: ${String(bad)}`);
  ok(
    typeof result.error === "string" && result.error.includes(APP_BASE_URL_ENV_KEY),
    "실패 사유에 환경변수 이름이 들어간다 (무엇을 고쳐야 하는지 알려준다)",
  );
}

check(
  readAppBaseUrl({}).baseUrl,
  null,
  "환경변수가 없으면 기본 주소도 없다 (기본값을 지어내지 않는다)",
);
check(
  readAppBaseUrl({ [APP_BASE_URL_ENV_KEY]: "https://a.example.com" }).baseUrl,
  "https://a.example.com",
  "환경변수를 그대로 읽는다",
);

// ────────────────────────── 픽셀 주소·태그 ──────────────────────────

const BASE = "https://app.example.com";
check(
  trackingPixelUrl(BASE, id),
  `${BASE}${TRACKING_ROUTE_PREFIX}/${id}`,
  "픽셀 주소는 기본 주소 + 라우트 경로 + 식별자다",
);
check(
  TRACKING_ROUTE_PREFIX,
  "/api/mail/track",
  "라우트 경로는 실제 라우트 폴더와 같아야 한다 (바뀌면 이미 나간 메일이 404 가 된다)",
);

const tag = trackingPixelTag(BASE, id);
ok(tag.startsWith("<img "), "픽셀은 img 태그다");
ok(tag.includes(`src="${trackingPixelUrl(BASE, id)}"`), "src 는 절대 주소다");
ok(tag.includes('alt=""'), "alt 는 비운다 (이미지 차단 화면에 글자가 남지 않게)");
ok(
  tag.includes('width="1"') && tag.includes('height="1"'),
  "1×1 크기를 속성으로도 알린다",
);
check(
  tag.includes("display:none"),
  false,
  "display:none 을 쓰지 않는다 — 숨긴 이미지를 아예 불러오지 않는 클라이언트가 있다",
);

// ────────────────────────── 본문 삽입 ──────────────────────────

const SIGNATURE = '<div class="sig">홍길동 · 영업팀</div>';
const HTML = `<!doctype html><html><body><p>안녕하세요.</p>${SIGNATURE}</body></html>`;

const tracked = withTrackingPixel(HTML, BASE, id);
ok(tracked.includes(tag), "픽셀 태그가 본문에 들어간다");
ok(
  tracked.indexOf(tag) > tracked.indexOf(SIGNATURE),
  "픽셀은 **서명 뒤**에 온다 (닫히지 않은 서명 마크업에 빨려 들어가지 않게)",
);
check(
  tracked.endsWith("</body></html>"),
  true,
  "픽셀은 닫는 body 직전에 들어간다 (문서 구조를 깨지 않는다)",
);
check(
  withTrackingPixel(HTML, null, id),
  HTML,
  "기본 주소가 없으면 본문을 그대로 둔다 — 깨진 이미지를 고객 메일에 넣지 않는다",
);
check(
  withTrackingPixel("<p>본문뿐</p>", BASE, id),
  `<p>본문뿐</p>${tag}`,
  "닫는 body 가 없으면 맨 끝에 붙인다",
);
// 서명이 통째로 완전한 문서일 수 있다 (`signatureSrcDoc` 이 그 경우를 인정한다)
const NESTED = `<html><body><p>본문</p><div><body>서명</body></div></body></html>`;
const nestedTracked = withTrackingPixel(NESTED, BASE, id);
check(
  nestedTracked.endsWith("</body></html>"),
  true,
  "닫는 body 가 여러 개면 **마지막** 것 직전에 넣는다",
);
check(
  (nestedTracked.match(/<img /g) ?? []).length,
  1,
  "픽셀은 한 번만 들어간다 (열람 1회가 2회로 세어지지 않게)",
);

// ────────────────────────── 픽셀 응답 ──────────────────────────

const bytes = trackingPixelBytes();
check(bytes.length, 42, "1×1 투명 GIF 는 42바이트다");
check(
  [bytes[0], bytes[1], bytes[2]],
  [0x47, 0x49, 0x46],
  "응답 본문은 GIF 매직 넘버로 시작한다 (실제 이미지다)",
);
check(bytes.at(-1), 0x3b, "GIF 종료 바이트(0x3B)로 끝난다");
check(
  TRACKING_PIXEL_HEADERS["Content-Type"],
  TRACKING_PIXEL_CONTENT_TYPE,
  "MIME 타입은 image/gif 다",
);
for (const token of ["no-store", "no-cache", "must-revalidate"]) {
  ok(
    TRACKING_PIXEL_HEADERS["Cache-Control"].includes(token),
    `캐시를 막는다: ${token} (캐시되면 두 번째 열람이 서버에 오지 않는다)`,
  );
}
check(TRACKING_PIXEL_HEADERS.Pragma, "no-cache", "옛 프록시용 Pragma 도 함께 준다");
check(TRACKING_PIXEL_HEADERS.Expires, "0", "Expires 도 함께 준다");

// ────────────────────────── 최초 열람 규칙 ──────────────────────────

const first = new Date("2026-06-20T09:20:00.000Z");
const later = new Date("2026-06-21T11:00:00.000Z");
check(firstOpenAt(null, first), first, "기록이 없으면 지금이 최초 열람이다");
check(
  firstOpenAt(first, later),
  first,
  "이미 기록이 있으면 바뀌지 않는다 — '언제 처음 봤는가' 가 마지막 열람으로 덮이면 안 된다",
);

console.log(`email-tracking: ${checks} checks passed`);
