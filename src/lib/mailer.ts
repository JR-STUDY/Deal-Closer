import "server-only";
import { isEmail } from "@/lib/validation";

/**
 * 메일 전송 어댑터 (서버 전용) — PRD Phase 0-3.
 *
 * 전송 수단은 **Resend HTTPS API** 하나다.
 * - 추가 의존성이 없다. Resend 는 `POST https://api.resend.com/emails` 단일 엔드포인트라
 *   표준 `fetch` 만으로 호출한다 (SMTP 는 nodemailer 설치가 필요).
 * - 실패 분류가 HTTP 상태코드로 명확해 재시도 정책(429·5xx·네트워크만 재시도)을
 *   규칙으로 못박을 수 있다 (비기능 7.3).
 * - 발신 도메인 DNS 인증 모델이 기존 `TeamMailDomain`(등록 → VERIFIED)과 1:1 로 맞는다.
 *   `resolveSendingIdentity()` 가 만든 팀 발신 주소를 그대로 `from` 에 넣으면 된다.
 *
 * 자격증명(`RESEND_API_KEY`)이 없으면 개발 환경에서는 **전송을 건너뛰고 로그만 남긴다**.
 * 운영(`NODE_ENV=production`)에서는 조용히 넘어가지 않고 실패로 반환한다 — 발송된 줄 알았는데
 * 나가지 않는 상황이 가장 위험하기 때문이다. 운영에서도 의도적으로 끄려면 `MAIL_DRY_RUN=true`.
 *
 * 이 모듈은 어댑터만 제공한다 — 부르는 곳은 `POST /api/documents/:id/send` 하나이고(F-233),
 * 그 라우트가 결과(`status`)를 `EmailLog.status` 로 그대로 옮긴다.
 * **예외를 던지지 않는다**: 호출부가 sent·skipped·failed 로 분기해 파이프라인 전진 여부를 정한다.
 */

// ── 상수 ──
/** Resend 발송 엔드포인트 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** 기본 시도 횟수 (최초 1회 + 재시도 2회) */
const DEFAULT_MAX_ATTEMPTS = 3;
/** 시도 횟수 상한 — 잘못된 환경변수로 무한정 재시도하지 않도록 */
const MAX_ATTEMPTS_LIMIT = 5;
/** 요청 1회 타임아웃 */
const DEFAULT_TIMEOUT_MS = 10_000;
/** 타임아웃 상한 (라우트 응답이 무한정 늘어지지 않도록) */
const MAX_TIMEOUT_MS = 60_000;
/** 지수 백오프 기준값 */
const BASE_BACKOFF_MS = 500;
/** 백오프 상한 */
const MAX_BACKOFF_MS = 8_000;
/** 백오프에 더하는 무작위 지터 상한 (동시 재시도 몰림 방지) */
const BACKOFF_JITTER_MS = 250;
/** 제공자 오류 메시지를 사용자 메시지에 덧붙일 때의 길이 제한 */
const PROVIDER_MESSAGE_MAX = 200;

// ── 설정 ──

/** `.env` 에서 읽어들인 전송 설정 */
export type MailerConfig = {
  /** Resend API 키. 없으면 개발 모드(건너뜀). */
  apiKey: string | null;
  /** 기본 발신 주소 — 입력에 `from` 이 없을 때 사용 */
  defaultFrom: string | null;
  /** 기본 발신 표시 이름 */
  defaultFromName: string | null;
  /** true 면 자격증명이 있어도 전송하지 않고 건너뛴다 */
  dryRun: boolean;
  /** 총 시도 횟수 (1 = 재시도 없음) */
  maxAttempts: number;
  /** 요청 1회 타임아웃(ms) */
  timeoutMs: number;
  /** 운영 환경 여부 — 자격증명 없을 때 건너뛸지 실패시킬지 결정 */
  isProduction: boolean;
};

function readFlag(raw: string | undefined): boolean {
  return raw !== undefined && /^(1|true|yes|on)$/i.test(raw.trim());
}

function readPositiveInt(
  raw: string | undefined,
  fallback: number,
  max: number,
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function readText(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * 환경변수에서 전송 설정을 읽는다.
 * 자격증명은 절대 코드에 두지 않는다 — `.env.example` 의 `RESEND_API_KEY` · `MAIL_*` 참고.
 */
export function readMailerConfig(
  env: Record<string, string | undefined> = process.env,
): MailerConfig {
  return {
    apiKey: readText(env.RESEND_API_KEY),
    defaultFrom: readText(env.MAIL_FROM_ADDRESS),
    defaultFromName: readText(env.MAIL_FROM_NAME),
    dryRun: readFlag(env.MAIL_DRY_RUN),
    maxAttempts: readPositiveInt(
      env.MAIL_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS,
      MAX_ATTEMPTS_LIMIT,
    ),
    timeoutMs: readPositiveInt(
      env.MAIL_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    ),
    isProduction: env.NODE_ENV === "production",
  };
}

// ── 입력 ──

/** 메일 첨부 (Phase 5 에서 PDF 바이트를 그대로 넘긴다) */
export type MailAttachment = {
  fileName: string;
  /** 첨부 내용. 문자열이면 UTF-8 텍스트로 인코딩한다. */
  content: Uint8Array | string;
  /** MIME 타입 (없으면 제공자가 확장자로 추론) */
  contentType?: string;
};

/** 전송 요청 */
export type SendMailInput = {
  /** 발신 주소. 없으면 `MAIL_FROM_ADDRESS` 를 쓴다. */
  from?: string;
  /** 발신 표시 이름. 없으면 `MAIL_FROM_NAME`. */
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  /** html·text 중 최소 하나는 있어야 한다. */
  html?: string;
  text?: string;
  attachments?: MailAttachment[];
};

// ── 결과 ──

/** 전송 실패 원인 — 재시도 가능 여부와 사용자 메시지를 이 값으로 고른다. */
export type MailErrorReason =
  /** 운영 환경인데 자격증명이 없다 */
  | "not_configured"
  /** 수신자·제목·본문 형식 오류 — 재시도해도 같다 */
  | "invalid_input"
  /** 제공자가 거부(4xx) — 재시도해도 같다 */
  | "rejected"
  /** 호출 한도 초과(429) */
  | "rate_limited"
  /** 제공자 장애(5xx) */
  | "server_error"
  /** 네트워크 오류·타임아웃 */
  | "network";

/** 건너뛴 이유 */
export type MailSkipReason = "dry_run" | "not_configured";

/** 전송 결과 (판별 유니온 — 호출부는 `status` 로 분기한다) */
export type SendMailResult =
  | { status: "sent"; messageId: string; attempts: number }
  | { status: "skipped"; reason: MailSkipReason; message: string }
  | {
      status: "failed";
      reason: MailErrorReason;
      /** 사용자에게 보여줄 한국어 메시지 */
      message: string;
      /** 제공자 HTTP 상태코드 (네트워크 오류면 null) */
      httpStatus: number | null;
      attempts: number;
    };

/** 실제로 전송에 성공했는지 (건너뜀은 false) */
export function isMailSent(
  result: SendMailResult,
): result is Extract<SendMailResult, { status: "sent" }> {
  return result.status === "sent";
}

// ── 재시도 정책 (비기능 7.3) ──

/** 재시도해도 결과가 달라지지 않는 실패인지 판정한다. */
export function isRetryableReason(reason: MailErrorReason): boolean {
  return (
    reason === "rate_limited" ||
    reason === "server_error" ||
    reason === "network"
  );
}

/** HTTP 상태코드를 실패 원인으로 변환한다. */
export function reasonFromStatus(status: number): MailErrorReason {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "rejected";
}

/**
 * 다음 재시도까지 기다릴 시간(ms). `attempt` 는 1부터 시작한다.
 * 제공자가 `Retry-After`(초)를 주면 그 값을 우선하되 상한을 넘기지 않는다.
 * 지터는 호출부에서 더한다 — 이 함수는 결정적이라 테스트가 쉽다.
 */
export function backoffDelayMs(
  attempt: number,
  retryAfterSeconds?: number | null,
): number {
  if (
    retryAfterSeconds !== undefined &&
    retryAfterSeconds !== null &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds > 0
  ) {
    return Math.min(Math.round(retryAfterSeconds * 1000), MAX_BACKOFF_MS);
  }
  const step = Math.max(1, attempt);
  return Math.min(BASE_BACKOFF_MS * 2 ** (step - 1), MAX_BACKOFF_MS);
}

/** `Retry-After` 헤더(초 단위 정수형만 지원)를 파싱한다. */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number.parseInt(header.trim(), 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

// ── 검증·정규화 ──

/** 메일 헤더 인젝션 방지 — 개행·캐리지리턴을 공백으로 만든다. */
function stripHeaderBreaks(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** 표시 이름을 헤더에 안전하게 넣을 수 있게 정리한다. */
function sanitizeDisplayName(value: string): string {
  return stripHeaderBreaks(value).replace(/["<>]/g, "").trim();
}

/** `"이름" <주소>` 형식으로 발신자를 조립한다. */
function formatAddress(email: string, name: string | null): string {
  const safeName = name ? sanitizeDisplayName(name) : "";
  return safeName ? `"${safeName}" <${email}>` : email;
}

function normalizeAddressList(values: string[] | undefined): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of values ?? []) {
    const address = raw.trim();
    if (!address) continue;
    if (!isEmail(address)) {
      invalid.push(address);
      continue;
    }
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(address);
  }
  return { valid, invalid };
}

/** 검증을 통과한 전송 페이로드 (제공자 요청 본문의 원재료) */
export type NormalizedMail = {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string | null;
  subject: string;
  html: string | null;
  text: string | null;
  attachments: MailAttachment[];
};

/**
 * 전송 입력을 검증·정규화한다.
 * 실패 시 사용자용 한국어 메시지를 담은 `{ error }` 를 반환한다 (정책 VAL_*).
 */
export function normalizeSendMailInput(
  input: SendMailInput,
  config: MailerConfig,
): NormalizedMail | { error: string } {
  const fromRaw = (input.from ?? config.defaultFrom ?? "").trim();
  if (!fromRaw) {
    return {
      error: "발신 주소가 설정되지 않았습니다. 발신 메일을 확인해주세요.",
    };
  }
  if (!isEmail(fromRaw)) {
    return { error: `발신 주소 형식이 올바르지 않습니다: ${fromRaw}` };
  }

  const to = normalizeAddressList(input.to);
  if (to.invalid.length > 0) {
    return { error: `수신자 형식이 올바르지 않습니다: ${to.invalid.join(", ")}` };
  }
  if (to.valid.length === 0) {
    return { error: "수신자를 한 명 이상 입력해주세요." };
  }

  const cc = normalizeAddressList(input.cc);
  if (cc.invalid.length > 0) {
    return { error: `참조 형식이 올바르지 않습니다: ${cc.invalid.join(", ")}` };
  }

  const bcc = normalizeAddressList(input.bcc);
  if (bcc.invalid.length > 0) {
    return {
      error: `숨은참조 형식이 올바르지 않습니다: ${bcc.invalid.join(", ")}`,
    };
  }

  const replyToRaw = input.replyTo?.trim();
  if (replyToRaw && !isEmail(replyToRaw)) {
    return { error: `회신 주소 형식이 올바르지 않습니다: ${replyToRaw}` };
  }

  const subject = stripHeaderBreaks(input.subject ?? "");
  if (!subject) {
    return { error: "메일 제목을 입력해주세요." };
  }

  const html = input.html?.trim() ? input.html : null;
  const text = input.text?.trim() ? input.text : null;
  if (!html && !text) {
    return { error: "메일 본문을 입력해주세요." };
  }

  for (const attachment of input.attachments ?? []) {
    if (!attachment.fileName?.trim()) {
      return { error: "첨부 파일 이름이 비어 있습니다." };
    }
  }

  return {
    from: formatAddress(fromRaw, input.fromName ?? config.defaultFromName),
    to: to.valid,
    cc: cc.valid,
    bcc: bcc.valid,
    replyTo: replyToRaw ?? null,
    subject,
    html,
    text,
    attachments: input.attachments ?? [],
  };
}

// ── 제공자 호출 ──

/** Resend 요청 본문 (제공자 스키마) */
type ResendPayload = {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
  attachments?: { filename: string; content: string; content_type?: string }[];
};

function toBase64(content: Uint8Array | string): string {
  return typeof content === "string"
    ? Buffer.from(content, "utf8").toString("base64")
    : Buffer.from(content).toString("base64");
}

/** 정규화된 메일을 Resend 요청 본문으로 변환한다. */
export function toResendPayload(mail: NormalizedMail): ResendPayload {
  const payload: ResendPayload = {
    from: mail.from,
    to: mail.to,
    subject: mail.subject,
  };
  if (mail.html) payload.html = mail.html;
  if (mail.text) payload.text = mail.text;
  if (mail.cc.length > 0) payload.cc = mail.cc;
  if (mail.bcc.length > 0) payload.bcc = mail.bcc;
  if (mail.replyTo) payload.reply_to = mail.replyTo;
  if (mail.attachments.length > 0) {
    payload.attachments = mail.attachments.map((attachment) => ({
      filename: attachment.fileName,
      content: toBase64(attachment.content),
      ...(attachment.contentType
        ? { content_type: attachment.contentType }
        : {}),
    }));
  }
  return payload;
}

/** 제공자 오류 본문에서 사람이 읽을 메시지를 뽑는다. */
function extractProviderMessage(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const message = (parsed as { message?: unknown }).message;
      if (typeof message === "string") {
        return message.slice(0, PROVIDER_MESSAGE_MAX);
      }
    }
  } catch {
    // JSON 이 아니면 원문 앞부분을 그대로 쓴다.
  }
  return trimmed.slice(0, PROVIDER_MESSAGE_MAX);
}

/** 실패 원인별 사용자 메시지 (정책 COPY-TONE — 한국어 존댓말) */
function messageForReason(reason: MailErrorReason, detail: string): string {
  const base: Record<MailErrorReason, string> = {
    not_configured:
      "메일 발송 설정이 없어 발송하지 못했습니다. 관리자에게 문의해주세요.",
    invalid_input: "메일 정보가 올바르지 않아 발송하지 못했습니다.",
    rejected: "메일 서버가 발송을 거부했습니다.",
    rate_limited: "메일 발송 요청이 많아 발송하지 못했습니다. 잠시 후 다시 시도해주세요.",
    server_error: "메일 서버에 일시적인 문제가 있어 발송하지 못했습니다.",
    network: "메일 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
  };
  return detail ? `${base[reason]} (${detail})` : base[reason];
}

// ── 의존성 주입 (테스트용) ──

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** 로그 싱크 — 기본은 console. 프로젝트에 로거가 생기면 여기만 교체한다. */
export type MailLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

const defaultLogger: MailLogger = {
  info: (message) => console.info(message),
  error: (message) => console.error(message),
};

export type SendMailDeps = {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  config?: MailerConfig;
  logger?: MailLogger;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 로그용 요약 — 본문·첨부 내용은 남기지 않는다 (개인정보·용량). */
function describe(mail: NormalizedMail): string {
  return `to=${mail.to.join(",")} subject="${mail.subject}" attachments=${mail.attachments.length}`;
}

/**
 * 메일을 전송한다.
 *
 * - 자격증명이 없으면: 개발 환경은 건너뛰고(`skipped`) 로그만 남기며, 운영 환경은 실패(`failed`)한다.
 * - 429·5xx·네트워크 오류는 지수 백오프로 재시도한다 (기본 3회 시도).
 * - 4xx 거부와 입력 오류는 재시도하지 않고 즉시 실패로 반환한다.
 *
 * 예외를 던지지 않는다 — 호출부(라우트)는 `result.status` 로 분기해 EmailLog 상태를 정한다.
 */
export async function sendMail(
  input: SendMailInput,
  deps: SendMailDeps = {},
): Promise<SendMailResult> {
  const config = deps.config ?? readMailerConfig();
  const logger = deps.logger ?? defaultLogger;
  const sleep = deps.sleep ?? defaultSleep;
  const fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));

  const normalized = normalizeSendMailInput(input, config);
  if ("error" in normalized) {
    return {
      status: "failed",
      reason: "invalid_input",
      message: normalized.error,
      httpStatus: null,
      attempts: 0,
    };
  }

  if (config.dryRun) {
    logger.info(`[mailer] dry-run — 전송하지 않음: ${describe(normalized)}`);
    return {
      status: "skipped",
      reason: "dry_run",
      message: "개발 모드(MAIL_DRY_RUN)라 메일을 실제로 보내지 않았습니다.",
    };
  }

  if (!config.apiKey) {
    if (config.isProduction) {
      // 운영에서 조용히 건너뛰면 "보낸 줄 알았는데 안 나간" 사고가 된다.
      return {
        status: "failed",
        reason: "not_configured",
        message: messageForReason("not_configured", "RESEND_API_KEY 미설정"),
        httpStatus: null,
        attempts: 0,
      };
    }
    logger.info(
      `[mailer] RESEND_API_KEY 없음 — 전송을 건너뜁니다: ${describe(normalized)}`,
    );
    return {
      status: "skipped",
      reason: "not_configured",
      message:
        "메일 자격증명이 없어 개발 모드로 건너뛰었습니다. 실제 발송은 .env 의 RESEND_API_KEY 설정 후 가능합니다.",
    };
  }

  const body = JSON.stringify(toResendPayload(normalized));
  let lastReason: MailErrorReason = "network";
  let lastDetail = "";
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    let retryAfter: number | null = null;
    try {
      const res = await fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(config.timeoutMs),
      });

      if (res.ok) {
        let messageId = "";
        try {
          const data: unknown = await res.json();
          if (data && typeof data === "object" && "id" in data) {
            const id = (data as { id?: unknown }).id;
            if (typeof id === "string") messageId = id;
          }
        } catch {
          // 성공 응답의 본문 파싱 실패가 전송 성공 판정을 뒤집지는 않는다.
        }
        return { status: "sent", messageId, attempts: attempt };
      }

      lastStatus = res.status;
      lastReason = reasonFromStatus(res.status);
      retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      lastDetail = extractProviderMessage(await res.text().catch(() => ""));
    } catch (error: unknown) {
      lastStatus = null;
      lastReason = "network";
      lastDetail =
        error instanceof Error
          ? error.message.slice(0, PROVIDER_MESSAGE_MAX)
          : "";
    }

    const canRetry =
      isRetryableReason(lastReason) && attempt < config.maxAttempts;
    if (!canRetry) {
      logger.error(
        `[mailer] 발송 실패(${lastReason}, ${attempt}회 시도): ${describe(normalized)} — ${lastDetail}`,
      );
      return {
        status: "failed",
        reason: lastReason,
        message: messageForReason(lastReason, lastDetail),
        httpStatus: lastStatus,
        attempts: attempt,
      };
    }

    const delay =
      backoffDelayMs(attempt, retryAfter) +
      Math.floor(Math.random() * BACKOFF_JITTER_MS);
    logger.info(
      `[mailer] ${lastReason} — ${delay}ms 후 재시도합니다 (${attempt}/${config.maxAttempts})`,
    );
    await sleep(delay);
  }

  // 루프는 항상 위에서 반환한다. 도달 시 방어적 실패.
  return {
    status: "failed",
    reason: lastReason,
    message: messageForReason(lastReason, lastDetail),
    httpStatus: lastStatus,
    attempts: config.maxAttempts,
  };
}
