/**
 * `src/lib/mail-body.ts` 검증 (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:mail-body
 *
 * 지켜야 할 것 —
 * ① 본문은 전부 사용자 입력이라 **반드시 이스케이프**한다 (한 곳에서만 하면 빠뜨릴 자리가 없다) ·
 * ② 서명은 예외다 — 사용자가 스스로 저장한 자기 HTML 이고 화면 미리보기와 **같은 판정**
 *    (`isHtmlSignature`)을 쓴다 ·
 * ③ 텍스트 파트에는 태그를 넣지 않는다 (수신자가 `<table>` 을 글자로 읽는다) ·
 * ④ **추적 픽셀은 이 모듈이 넣지 않는다** — 위치·주소 규칙은 `@/lib/email-tracking` 하나다.
 */

import assert from "node:assert/strict";
import { composeMailBody } from "../src/lib/mail-body";
import { withTrackingPixel } from "../src/lib/email-tracking";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function ok(value: unknown, message: string) {
  assert.ok(value, message);
  checks += 1;
}

// ────────────────────────── 이스케이프 ──────────────────────────

{
  const injected = '<script>alert("x")</script> & <b>굵게</b>';
  const { html, text } = composeMailBody({ bodyText: injected });
  check(html.includes("<script>"), false, "본문의 스크립트 태그는 살아남지 않는다");
  ok(html.includes("&lt;script&gt;"), "본문 태그는 이스케이프된다");
  ok(html.includes("&amp;"), "앰퍼샌드도 이스케이프된다");
  // 텍스트 파트는 원문 그대로다 — 이스케이프하면 수신자가 `&lt;` 를 글자로 읽는다
  check(text, injected, "텍스트 파트는 원문 그대로다");
}

// 줄바꿈은 `white-space:pre-wrap` 로 보존한다 — `<br>` 로 바꾸면 이스케이프를 우회해야 한다
{
  const { html } = composeMailBody({ bodyText: "첫 줄\n둘째 줄" });
  ok(html.includes("pre-wrap"), "줄바꿈은 스타일로 보존한다");
  check(html.includes("<br"), false, "본문에 태그를 만들어 넣지 않는다");
}

// ────────────────────────── 서명 ──────────────────────────

// HTML 서명은 사용자가 저장한 자기 조각이라 그대로 렌더한다 (화면 미리보기와 같은 판정)
{
  const signature = '<table><tr><td>홍길동 · 영업팀</td></tr></table>';
  const { html, text } = composeMailBody({ bodyText: "본문", signature });
  ok(html.includes(signature), "HTML 서명은 그대로 실린다");
  ok(html.indexOf(signature) > html.indexOf("본문"), "서명은 본문 뒤에 온다");
  check(text.includes("<table>"), false, "텍스트 파트에는 태그를 넣지 않는다");
  ok(text.includes("홍길동 · 영업팀"), "텍스트 파트에는 서명 글자만 남는다");
}

// 일반 텍스트 서명은 본문과 같은 규칙으로 이스케이프한다
// (`홍길동 <hong@a.com>` 을 HTML 로 오판하지 않아야 하는 것이 이 판정의 이유다)
{
  const { html, text } = composeMailBody({
    bodyText: "본문",
    signature: "홍길동 <hong@a.com>",
  });
  ok(html.includes("&lt;hong@a.com&gt;"), "텍스트 서명은 이스케이프된다");
  ok(text.includes("<hong@a.com>"), "텍스트 파트에는 원문이 남는다");
}

// 서명을 끄면(null) 구분선도 붙지 않는다 — 빈 줄 아래 선만 남으면 잘못 보낸 것처럼 보인다
for (const signature of [null, undefined, "", "   "]) {
  const { html, text } = composeMailBody({ bodyText: "본문", signature });
  check(html.includes("<hr"), false, `서명이 없으면 구분선도 없다 (${signature})`);
  check(text, "본문", `서명이 없으면 텍스트도 본문뿐이다 (${signature})`);
}

// ────────────────────────── 추적 픽셀은 이 모듈이 넣지 않는다 ──────────────────────────

{
  const { html, text } = composeMailBody({
    bodyText: "본문",
    signature: "<div>서명</div>",
  });
  check(html.includes("<img"), false, "조립만 하고 픽셀은 넣지 않는다");

  // 라우트가 하는 그대로 얹어 본다 — 픽셀은 **맨 끝**(서명 뒤)이다
  const withPixel = withTrackingPixel(
    html,
    "https://app.example.com",
    "11111111-1111-4111-8111-111111111111",
  );
  ok(withPixel.includes("<img"), "라우트가 얹으면 픽셀이 들어간다");
  ok(
    withPixel.indexOf("<img") > withPixel.indexOf("서명"),
    "픽셀은 서명 뒤(본문 맨 끝)에 온다",
  );
  check(text.includes("<img"), false, "텍스트 파트에는 픽셀을 넣지 않는다");
}

console.log(`mail-body: ${checks} checks passed`);
