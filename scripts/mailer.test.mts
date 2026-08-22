import assert from "node:assert/strict";
import {
  backoffDelayMs,
  isMailSent,
  isRetryableReason,
  normalizeSendMailInput,
  readMailerConfig,
  reasonFromStatus,
  sendMail,
  toResendPayload,
  type MailerConfig,
  type NormalizedMail,
  type SendMailInput,
} from "../src/lib/mailer";
import {
  newTrackingId,
  trackingPixelTag,
  withTrackingPixel,
} from "../src/lib/email-tracking";

/**
 * 메일 전송 어댑터 최소 검증 (Phase 0-3).
 * 실제 네트워크를 타지 않는다 — fetch·sleep·logger 를 전부 주입한다.
 */

// ── 테스트 도우미 ──

function config(overrides: Partial<MailerConfig> = {}): MailerConfig {
  return {
    apiKey: "re_test_key",
    defaultFrom: "sales@rainmaker.test",
    defaultFromName: "레인메이커",
    dryRun: false,
    maxAttempts: 3,
    timeoutMs: 1_000,
    isProduction: false,
    ...overrides,
  };
}

const BASE_TEXT = "안녕하세요, 견적서 첨부드립니다.";

const baseInput: SendMailInput = {
  to: ["client@example.com"],
  subject: "견적서를 보내드립니다",
  text: BASE_TEXT,
};

type StubCall = { url: string; init: RequestInit };

/** 응답 시퀀스를 순서대로 돌려주는 fetch 스텁 (마지막 항목은 이후에도 반복) */
function stubFetch(steps: (() => Response)[]) {
  const calls: StubCall[] = [];
  let index = 0;
  const impl = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const step = steps[Math.min(index, steps.length - 1)];
    index += 1;
    return step();
  };
  return { impl, calls };
}

function recorder() {
  const delays: number[] = [];
  const infos: string[] = [];
  const errors: string[] = [];
  return {
    delays,
    infos,
    errors,
    sleep: async (ms: number) => {
      delays.push(ms);
    },
    logger: {
      info: (message: string) => infos.push(message),
      error: (message: string) => errors.push(message),
    },
  };
}

function jsonResponse(status: number, body: unknown, headers?: HeadersInit) {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
}

function normalized(
  input: SendMailInput = baseInput,
  cfg = config(),
): NormalizedMail {
  const result = normalizeSendMailInput(input, cfg);
  assert.ok(!("error" in result), "정규화가 실패하면 안 된다");
  return result;
}

// ── 1. 설정 파싱 ──

const empty = readMailerConfig({});
assert.equal(empty.apiKey, null);
assert.equal(empty.defaultFrom, null);
assert.equal(empty.dryRun, false);
assert.equal(empty.maxAttempts, 3);
assert.equal(empty.timeoutMs, 10_000);
assert.equal(empty.isProduction, false);

// 공백만 있는 값은 미설정으로 본다 (값은 전부 env 에서만 온다 — 하드코딩 금지)
assert.equal(readMailerConfig({ RESEND_API_KEY: "   " }).apiKey, null);
assert.equal(readMailerConfig({ RESEND_API_KEY: " re_x " }).apiKey, "re_x");

assert.equal(readMailerConfig({ MAIL_DRY_RUN: "TRUE" }).dryRun, true);
assert.equal(readMailerConfig({ MAIL_DRY_RUN: "1" }).dryRun, true);
assert.equal(readMailerConfig({ MAIL_DRY_RUN: "0" }).dryRun, false);
assert.equal(readMailerConfig({ MAIL_DRY_RUN: "" }).dryRun, false);

// 잘못된/과한 값은 안전한 범위로 보정한다
assert.equal(readMailerConfig({ MAIL_MAX_ATTEMPTS: "99" }).maxAttempts, 5);
assert.equal(readMailerConfig({ MAIL_MAX_ATTEMPTS: "0" }).maxAttempts, 3);
assert.equal(readMailerConfig({ MAIL_MAX_ATTEMPTS: "2" }).maxAttempts, 2);
assert.equal(readMailerConfig({ MAIL_TIMEOUT_MS: "abc" }).timeoutMs, 10_000);
assert.equal(readMailerConfig({ MAIL_TIMEOUT_MS: "999999" }).timeoutMs, 60_000);
assert.equal(readMailerConfig({ NODE_ENV: "production" }).isProduction, true);

// ── 2. 재시도 정책 (비기능 7.3) ──

assert.equal(reasonFromStatus(429), "rate_limited");
assert.equal(reasonFromStatus(500), "server_error");
assert.equal(reasonFromStatus(503), "server_error");
assert.equal(reasonFromStatus(422), "rejected");
assert.equal(reasonFromStatus(401), "rejected");

assert.equal(isRetryableReason("rate_limited"), true);
assert.equal(isRetryableReason("server_error"), true);
assert.equal(isRetryableReason("network"), true);
assert.equal(isRetryableReason("rejected"), false);
assert.equal(isRetryableReason("invalid_input"), false);
assert.equal(isRetryableReason("not_configured"), false);

// 지수 백오프 + 상한
assert.equal(backoffDelayMs(1), 500);
assert.equal(backoffDelayMs(2), 1_000);
assert.equal(backoffDelayMs(3), 2_000);
assert.equal(backoffDelayMs(10), 8_000);
// Retry-After 우선, 단 상한은 지킨다
assert.equal(backoffDelayMs(1, 2), 2_000);
assert.equal(backoffDelayMs(1, 100), 8_000);
assert.equal(backoffDelayMs(1, 0), 500);
assert.equal(backoffDelayMs(1, null), 500);

// ── 3. 입력 검증·정규화 (정책 VAL_*) ──

const okMail = normalized();
assert.equal(okMail.from, '"레인메이커" <sales@rainmaker.test>');
assert.deepEqual(okMail.to, ["client@example.com"]);
assert.equal(okMail.text, BASE_TEXT);
assert.equal(okMail.html, null);

// 표시 이름이 없으면 주소만 쓴다
assert.equal(
  normalized(baseInput, config({ defaultFromName: null })).from,
  "sales@rainmaker.test",
);

// 중복 수신자는 대소문자 무시하고 한 번만 남긴다
assert.deepEqual(
  normalized({
    ...baseInput,
    to: ["a@example.com", "A@example.com", " b@example.com "],
  }).to,
  ["a@example.com", "b@example.com"],
);

// 헤더 인젝션 차단: 제목·표시 이름의 개행과 꺾쇠·따옴표는 제거된다
const injected = normalized({
  ...baseInput,
  fromName: 'evil"\r\nBcc: attacker@example.com',
  subject: "제목\r\nBcc: attacker@example.com",
});
assert.ok(!injected.from.includes("\n"), "발신자 헤더에 개행이 남으면 안 된다");
assert.ok(!injected.from.includes('evil"'), "표시 이름의 따옴표가 제거돼야 한다");
assert.ok(!injected.subject.includes("\n"), "제목에 개행이 남으면 안 된다");

function expectError(
  input: Parameters<typeof normalizeSendMailInput>[0],
  cfg = config(),
): string {
  const result = normalizeSendMailInput(input, cfg);
  assert.ok("error" in result, "검증이 실패해야 한다");
  return result.error;
}

assert.match(expectError({ ...baseInput, to: [] }), /수신자/);
assert.match(expectError({ ...baseInput, to: ["not-an-email"] }), /수신자/);
assert.match(expectError({ ...baseInput, cc: ["bad"] }), /참조/);
assert.match(expectError({ ...baseInput, bcc: ["bad"] }), /숨은참조/);
assert.match(expectError({ ...baseInput, replyTo: "bad" }), /회신/);
assert.match(expectError({ ...baseInput, subject: "  \r\n " }), /제목/);
assert.match(expectError({ ...baseInput, text: "   " }), /본문/);
assert.match(
  expectError(baseInput, config({ defaultFrom: null })),
  /발신 주소가 설정되지 않았습니다/,
);
assert.match(
  expectError({ ...baseInput, from: "broken-address" }),
  /발신 주소 형식/,
);
assert.match(
  expectError({
    ...baseInput,
    attachments: [{ fileName: "  ", content: "x" }],
  }),
  /첨부 파일 이름/,
);

// ── 4. 제공자 페이로드 변환 ──

const payload = toResendPayload(
  normalized({
    ...baseInput,
    cc: ["cc@example.com"],
    replyTo: "reply@example.com",
    html: "<p>본문</p>",
    attachments: [
      {
        fileName: "견적서.pdf",
        content: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // "%PDF"
        contentType: "application/pdf",
      },
    ],
  }),
);
assert.equal(payload.from, '"레인메이커" <sales@rainmaker.test>');
assert.deepEqual(payload.cc, ["cc@example.com"]);
assert.equal(payload.reply_to, "reply@example.com");
assert.equal(payload.bcc, undefined); // 빈 배열은 보내지 않는다
assert.equal(payload.attachments?.[0].filename, "견적서.pdf");
assert.equal(payload.attachments?.[0].content, "JVBERg=="); // base64("%PDF")
assert.equal(payload.attachments?.[0].content_type, "application/pdf");

// ── 5. 개발 모드: 자격증명 없으면 건너뛰고 로그만 남긴다 ──

{
  const rec = recorder();
  const stub = stubFetch([jsonResponse(200, { id: "should-not-be-called" })]);
  const result = await sendMail(baseInput, {
    config: config({ apiKey: null, isProduction: false }),
    fetchImpl: stub.impl,
    sleep: rec.sleep,
    logger: rec.logger,
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.status === "skipped" && result.reason, "not_configured");
  assert.equal(stub.calls.length, 0, "건너뛸 때는 전송 호출이 없어야 한다");
  assert.equal(rec.infos.length, 1, "건너뛴 사실을 로그로 남긴다");
  assert.match(rec.infos[0], /RESEND_API_KEY/);
  assert.ok(
    !rec.infos[0].includes(BASE_TEXT),
    "로그에 본문을 남기지 않는다",
  );
  assert.equal(isMailSent(result), false);
}

// 운영 환경에서는 조용히 건너뛰지 않고 실패로 알린다
{
  const rec = recorder();
  const stub = stubFetch([jsonResponse(200, { id: "x" })]);
  const result = await sendMail(baseInput, {
    config: config({ apiKey: null, isProduction: true }),
    fetchImpl: stub.impl,
    sleep: rec.sleep,
    logger: rec.logger,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.status === "failed" && result.reason, "not_configured");
  assert.equal(stub.calls.length, 0);
}

// MAIL_DRY_RUN 이면 자격증명이 있어도 보내지 않는다
{
  const rec = recorder();
  const stub = stubFetch([jsonResponse(200, { id: "x" })]);
  const result = await sendMail(baseInput, {
    config: config({ dryRun: true }),
    fetchImpl: stub.impl,
    sleep: rec.sleep,
    logger: rec.logger,
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.status === "skipped" && result.reason, "dry_run");
  assert.equal(stub.calls.length, 0);
}

// ── 6. 입력 오류는 호출 전에 실패한다 ──

{
  const rec = recorder();
  const stub = stubFetch([jsonResponse(200, { id: "x" })]);
  const result = await sendMail(
    { ...baseInput, to: ["bad"] },
    {
      config: config(),
      fetchImpl: stub.impl,
      sleep: rec.sleep,
      logger: rec.logger,
    },
  );
  assert.equal(result.status, "failed");
  assert.equal(result.status === "failed" && result.reason, "invalid_input");
  assert.equal(result.status === "failed" && result.attempts, 0);
  assert.equal(stub.calls.length, 0);
}

// ── 7. 정상 전송 ──

{
  const rec = recorder();
  const stub = stubFetch([jsonResponse(200, { id: "msg_abc123" })]);
  const result = await sendMail(
    { ...baseInput, attachments: [{ fileName: "견적서.pdf", content: "PDF" }] },
    {
      config: config(),
      fetchImpl: stub.impl,
      sleep: rec.sleep,
      logger: rec.logger,
    },
  );
  assert.equal(result.status, "sent");
  assert.equal(isMailSent(result), true);
  assert.equal(result.status === "sent" && result.messageId, "msg_abc123");
  assert.equal(result.status === "sent" && result.attempts, 1);
  assert.equal(rec.delays.length, 0, "성공하면 대기하지 않는다");

  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].url, "https://api.resend.com/emails");
  assert.equal(stub.calls[0].init.method, "POST");
  const headers = stub.calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer re_test_key");
  assert.equal(headers["Content-Type"], "application/json");
  const sentBody = JSON.parse(String(stub.calls[0].init.body)) as {
    to: string[];
    subject: string;
    attachments?: { filename: string }[];
  };
  assert.deepEqual(sentBody.to, ["client@example.com"]);
  assert.equal(sentBody.subject, "견적서를 보내드립니다");
  assert.equal(sentBody.attachments?.[0].filename, "견적서.pdf");
}

// 성공 응답의 본문이 깨져도 전송 성공 판정은 유지한다
{
  const rec = recorder();
  const stub = stubFetch([() => new Response("not json", { status: 200 })]);
  const result = await sendMail(baseInput, {
    config: config(),
    fetchImpl: stub.impl,
    sleep: rec.sleep,
    logger: rec.logger,
  });
  assert.equal(result.status, "sent");
  assert.equal(result.status === "sent" && result.messageId, "");
}

// ── 8. 일시적 실패는 재시도한다 ──

{
  const rec = recorder();
  const stub = stubFetch([
    jsonResponse(500, { message: "internal" }),
    jsonResponse(200, { id: "msg_retry" }),
  ]);
  const result = await sendMail(baseInput, {
    config: config(),
    fetchImpl: stub.impl,
    sleep: rec.sleep,
    logger: rec.logger,
  });
  assert.equal(result.status, "sent");
  assert.equal(result.status === "sent" && result.attempts, 2);
  assert.equal(stub.calls.length, 2);
  assert.equal(rec.delays.length, 1);
  assert.ok(rec.delays[0] >= 500, "첫 재시도는 최소 500ms 뒤에 한다");
}

// 429 는 Retry-After 를 존중하고, 시도 횟수를 다 쓰면 실패로 끝난다
{
  const rec = recorder();
  const stub = stubFetch([
    jsonResponse(429, { message: "too many requests" }, { "retry-after": "1" }),
  ]);
  const result = await sendMail(baseInput, {
    config: config({ maxAttempts: 3 }),
    fetchImpl: stub.impl,
    sleep: rec.sleep,
    logger: rec.logger,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.status === "failed" && result.reason, "rate_limited");
  assert.equal(result.status === "failed" && result.httpStatus, 429);
  assert.equal(result.status === "failed" && result.attempts, 3);
  assert.equal(stub.calls.length, 3);
  assert.equal(rec.delays.length, 2, "마지막 시도 뒤에는 대기하지 않는다");
  assert.ok(rec.delays[0] >= 1_000, "Retry-After(1초)를 존중한다");
  assert.equal(rec.errors.length, 1, "최종 실패는 error 로 남긴다");
}

// 네트워크 오류도 재시도 대상이다
{
  const rec = recorder();
  const stub = stubFetch([
    () => {
      throw new Error("connect ETIMEDOUT");
    },
  ]);
  const result = await sendMail(baseInput, {
    config: config({ maxAttempts: 2 }),
    fetchImpl: stub.impl,
    sleep: rec.sleep,
    logger: rec.logger,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.status === "failed" && result.reason, "network");
  assert.equal(result.status === "failed" && result.httpStatus, null);
  assert.equal(result.status === "failed" && result.attempts, 2);
  assert.match(
    result.status === "failed" ? result.message : "",
    /연결하지 못했습니다/,
  );
  assert.ok(
    result.status === "failed" && result.message.includes("ETIMEDOUT"),
    "원인을 메시지에 남긴다",
  );
}

// ── 9. 영구 실패는 재시도하지 않는다 ──

{
  const rec = recorder();
  const stub = stubFetch([
    jsonResponse(422, { message: "The from address is not verified" }),
  ]);
  const result = await sendMail(baseInput, {
    config: config(),
    fetchImpl: stub.impl,
    sleep: rec.sleep,
    logger: rec.logger,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.status === "failed" && result.reason, "rejected");
  assert.equal(result.status === "failed" && result.attempts, 1);
  assert.equal(stub.calls.length, 1, "4xx 는 재시도하지 않는다");
  assert.equal(rec.delays.length, 0);
  assert.match(
    result.status === "failed" ? result.message : "",
    /from address is not verified/,
  );
}

// 인증 실패(401)도 즉시 끝낸다 — 자격증명은 로그·메시지에 노출하지 않는다
{
  const rec = recorder();
  const stub = stubFetch([jsonResponse(401, { message: "Invalid API key" })]);
  const result = await sendMail(baseInput, {
    config: config(),
    fetchImpl: stub.impl,
    sleep: rec.sleep,
    logger: rec.logger,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.status === "failed" && result.reason, "rejected");
  assert.equal(stub.calls.length, 1);
  const leaked = [...rec.infos, ...rec.errors, result.message].some((line) =>
    line.includes("re_test_key"),
  );
  assert.equal(leaked, false, "자격증명이 로그·메시지로 새면 안 된다");
}

// ── 10. 오픈 트래킹: 추적 픽셀은 **html 본문에만** 실려 나간다 (F-234) ──

/*
 * 실제 발송 없이(fetch 스텁) 확인한다 — 제공자 요청 본문의 `html` 에 픽셀이 그대로 들어가고
 * `text` 에는 들어가지 않는다. 텍스트 파트에 태그를 넣으면 이미지가 아니라 **글자**로
 * 보이고(`<img …>` 가 그대로 읽힌다) 열람은 여전히 기록되지 않는다.
 *
 * 이것이 실전송 조립부(F-233)가 붙을 자리의 계약이다:
 *   sendMail({ text: 본문, html: withTrackingPixel(본문HTML, baseUrl, log.trackingId) })
 */
{
  const rec = recorder();
  const stub = stubFetch([jsonResponse(200, { id: "resend_track_1" })]);
  const trackingId = newTrackingId();
  const baseUrl = "https://app.example.com";
  const pixel = trackingPixelTag(baseUrl, trackingId);
  const signature = '<div class="sig">홍길동 · 영업팀</div>';
  const html = withTrackingPixel(
    `<!doctype html><html><body><p>${BASE_TEXT}</p>${signature}</body></html>`,
    baseUrl,
    trackingId,
  );

  const result = await sendMail(
    { ...baseInput, html },
    {
      config: config(),
      fetchImpl: stub.impl,
      sleep: rec.sleep,
      logger: rec.logger,
    },
  );
  assert.equal(result.status, "sent");

  const payload = JSON.parse(String(stub.calls[0].init.body)) as {
    html?: string;
    text?: string;
  };
  assert.ok(payload.html?.includes(pixel), "html 본문에 추적 픽셀이 실려 나간다");
  assert.ok(
    (payload.html?.indexOf(pixel) ?? -1) > (payload.html?.indexOf(signature) ?? -1),
    "픽셀은 서명 뒤(본문 맨 끝)에 온다",
  );
  assert.equal(
    payload.text?.includes("<img"),
    false,
    "텍스트 파트에는 태그를 넣지 않는다 (글자로 그대로 보인다)",
  );
  assert.ok(
    payload.html?.includes(`/api/mail/track/${trackingId}`),
    "픽셀 주소는 추적 라우트 + 그 발송의 식별자를 가리킨다",
  );
}

// 기본 주소가 없으면 픽셀 없이 나간다 — 깨진 이미지가 고객 메일에 박히지 않는다
{
  const rec = recorder();
  const stub = stubFetch([jsonResponse(200, { id: "resend_track_2" })]);
  const html = withTrackingPixel(
    "<html><body><p>본문</p></body></html>",
    null,
    newTrackingId(),
  );
  const result = await sendMail(
    { ...baseInput, html },
    {
      config: config(),
      fetchImpl: stub.impl,
      sleep: rec.sleep,
      logger: rec.logger,
    },
  );
  assert.equal(result.status, "sent");
  const payload = JSON.parse(String(stub.calls[0].init.body)) as { html?: string };
  assert.equal(
    payload.html?.includes("<img"),
    false,
    "기본 주소가 없으면 픽셀을 넣지 않는다",
  );
}

console.log("mailer tests passed ✅");
