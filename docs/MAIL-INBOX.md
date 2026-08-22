# 수신함(`/mail/inbox`) — 지금 상태와 실구현에 필요한 것

> 이 문서는 **차후 작업 메모**입니다. 지금 화면은 골격(빈 상태 안내)뿐이며 목업 데이터를
> 넣지 않았습니다 — 가짜 스레드를 채워 두면 나중에 진짜 수신 메일과 구분할 수 없습니다.

## 지금 무엇이 되어 있나

| 항목 | 상태 |
|---|---|
| 발송 (Resend HTTPS API) | **어댑터만** — `src/lib/mailer.ts` 는 완성·검증됐지만 **부르는 곳이 없다**(F-232 · F-233) |
| 발송 이력 기록 | 동작 — `EmailLog` (`POST /api/documents/:id/send`) |
| 발송 이력 화면 | 동작 — `/mail/sent` (목록 · 상세) |
| 메일 계정 연동 | **표시만** — `EmailAccount` 행을 만들고 지우는 수준. OAuth 토큰 없음 |
| 열람(오픈) 추적 | **절반 동작** — 발송마다 `trackingId` 를 저장하고 `GET /api/mail/track/:id` 가 열람을 기록한다. 다만 **픽셀을 실어 보낼 전송 경로가 없다**(아래 곁가지) |
| 수신 메일 | **없음** — 저장할 모델도, 가져오는 코드도 없다 |

즉 수신함이 비어 있는 이유는 "조회가 안 되어서" 가 아니라 **받은 메일이 어디에도 저장되지
않기 때문**입니다. 화면은 그 사실을 그대로 안내합니다.

## 실구현에 필요한 것

### 1) 연동 방식 선택 (먼저 결정해야 나머지가 정해진다)

| 방식 | 장점 | 비용·제약 |
|---|---|---|
| **Gmail API + Microsoft Graph** (계정별 OAuth) | 스레드·라벨·첨부까지 원본대로. 계정 하나만 연결하면 됨 | 프로바이더 2종을 각각 구현. OAuth 심사(Gmail `readonly` 는 민감 범위)·토큰 갱신·watch/푸시 구독 갱신 필요 |
| **IMAP** (앱 비밀번호) | 프로바이더 중립, 구현 단순 | 조직 정책으로 IMAP·앱 비밀번호가 막힌 경우가 많다. 비밀번호를 우리가 보관해야 한다 |
| **수신 전용 주소로 포워딩** (Resend Inbound 등) | 토큰·심사 없음. 웹훅으로 받으므로 폴링 불필요 | 받는 주소가 우리 도메인이어야 하고, 고객이 담당자 개인 주소로 답장하면 들어오지 않는다 |

MVP 관점 추천: **답장 추적이 목적이면 포워딩/Inbound 웹훅**이 가장 빠릅니다(발송 시
`Reply-To` 를 우리 도메인 주소로 두고, 스레드 식별자를 메일 헤더에 심어 발송 이력과 잇는다).
"받은편지함을 그대로 보여주기" 가 목적이면 Gmail API + Graph 를 피할 수 없습니다.

### 2) 필요한 스키마 (현재 `prisma/schema.prisma` 에 없음 — 별도 합의·마이그레이션 필요)

- `MailMessage` — 수신 메일 1건: `orgId`(또는 `document`/`opportunity` 경유), `accountId`,
  `providerMessageId`(유니크 — 중복 수집 방지), `threadId`, `from`, `to`, `subject`,
  `bodyText`/`bodyHtml`, `receivedAt`, `isRead`, `snippet`
- `MailAttachment` — 첨부 1건: `messageId`, `fileName`, `mimeType`, `size`, 저장 위치
- `MailSyncState` — 계정별 증분 동기화 커서: `accountId`, `historyId`/`deltaLink`,
  `lastSyncedAt`, `lastError` (전체 재수집을 막는다)
- `EmailAccount` 확장 — `accessToken`·`refreshToken`·`expiresAt`·`scope`
  (현재는 provider·email·isDefault·status 뿐)
- 발송 이력과의 연결 — `EmailLog.messageId`(우리가 보낸 메일의 provider id)와
  `MailMessage.inReplyToLogId` 가 있어야 "이 답장은 그 견적서 발송의 답장" 이 성립한다

### 3) 토큰 저장

- 토큰은 **평문으로 두지 않는다.** 최소한 `.env` 의 키로 암호화해 저장하고(AES-GCM),
  복호화는 서버 전용 모듈(`server-only`)에서만 한다.
- 갱신 실패(사용자가 권한 회수)는 조용히 넘기지 말고 `EmailAccount.status` 를
  `DISCONNECTED` 로 내려 **화면이 다시 연결하라고 안내**해야 한다.
- MVP 에는 인증이 없다(`src/lib/session.ts` 가 데모 사용자 고정). 남의 메일을 읽는 기능이므로
  **실제 인증이 붙기 전에는 켜지 않는다.**

### 4) 화면 (스키마가 생긴 뒤)

- 목록 규칙은 발송 이력과 같게 — `@/lib/pagination` + `@/components/list-pagination`,
  URL 쿼리 정렬(`?sort=&dir=`) + `@/components/list-sort-header`,
  `@/components/list-row-link`, `table-fixed` + 컬럼별 명시 폭.
- 조회 조건·정렬은 `src/lib/email-log.ts` 처럼 **순수 함수로 뽑고** `scripts/*.test.ts` 를 남긴다.
- 조직 범위를 어디로 좁힐지 먼저 정한다 — 수신 메일은 문서를 경유할 수 없으므로
  `MailMessage.orgId` 를 **직접** 갖는 편이 안전하다.

## 곁가지 — 열람(오픈) 추적: 어디까지 됐고 무엇이 남았나

**된 것** (F-234, `src/lib/email-tracking.ts` · `src/app/api/mail/track/[trackingId]/route.ts`)

1. 발송마다 `trackingId`(UUID v4)를 만들어 `EmailLog` 에 저장한다.
   추측 불가능해야 한다 — 추적 라우트는 **인증 없이** 열려 있어(부르는 쪽이 수신자의 메일
   앱이라 세션이 없다) 조직 범위로 좁힐 수가 없고, 난수성이 유일한 방어선이다.
2. `GET /api/mail/track/:trackingId` 가 1×1 투명 GIF(42바이트)를 돌려주며
   `openedAt`(최초 1회) · `openCount`(원자적 증가)를 기록한다.
   - 캐시 금지 헤더 필수(`no-store, no-cache, must-revalidate` · `Pragma` · `Expires`) —
     캐시되면 두 번째 열람이 서버에 오지 않는다.
   - **모르는 id 도 200 + 픽셀**이다. 404 로 갈리면 유효한 id 를 찾는 탐색 도구가 되고,
     고객 메일에 깨진 이미지가 뜬다. 기록만 조용히 건너뛴다.
   - 실측(로컬 3113): 5개 동시 요청 → `openCount` 5 · `openedAt` 은 가장 먼저 도착한 시각 1건.
3. 픽셀 주소의 기본값은 `.env` 의 **`APP_BASE_URL`** 이다(절대 http(s) 주소, 오리진만 사용).
   없으면 `withTrackingPixel()` 이 **본문을 그대로 돌려준다** — 깨진 이미지가 고객 메일에
   박히는 것이 열람 기록을 잃는 것보다 나쁘다. 발송 라우트가 그 사실을 로그로 남긴다.
4. 화면은 **확인된 것만 주장한다** — 낱말이 `열람 여부`/`미열람` 이 아니라 `열람 확인`/`기록 없음`
   이고, ⓘ 가 양방향 부정확(이미지 차단 → 거짓 음성, 프리페치·프록시 → 거짓 양성)을 밝힌다.
   문구는 `src/lib/email-log.ts` 의 `EMAIL_OPEN_*` 한 곳에서 온다.

**남은 것 — 픽셀을 실어 보낼 전송 경로 (F-232 · F-233)**

`POST /api/documents/:id/send` 는 이력만 남기고 **메일을 내보내지 않는다**. `src/lib/mailer.ts`
(Resend 어댑터)는 완성돼 있지만 **부르는 곳이 저장소 전체에 없다.** 그래서 지금은
`trackingId` 만 쌓이고 열람은 기록되지 않는다(화면도 그렇게 안내한다).

전송을 붙일 때의 계약은 한 줄이다 (`scripts/mailer.test.mts` §10 이 fetch 스텁으로 고정):

```ts
sendMail({
  text: 본문,                                            // 텍스트 파트에는 태그를 넣지 않는다
  html: withTrackingPixel(본문HTML, baseUrl, log.trackingId), // 픽셀은 서명 뒤 · 본문 맨 끝
});
```

함께 맞춰야 하는 것 (전송만 먼저 붙이면 안 되는 이유):

- **PDF 첨부(F-232)** — 기본 본문이 "첨부된 문서를 확인해주시기 바랍니다" 라고 적고 발송
  화면이 첨부 파일 카드를 보여준다. 첨부 없이 내보내면 약속한 파일이 빠진 메일이 고객에게
  간다. 렌더러(`src/lib/pdf.ts`)는 있으나 어떤 라우트도 쓰지 않는다.
- **참조(CC)·서명** — 발송 화면이 입력만 받고 요청 본문에 싣지 않는다
  (`sender-client.tsx` 의 `handleSend` 는 `recipients`·`subject`·`body` 만 보낸다).
- **발신 신원** — `src/lib/mail-domain.ts` 의 `resolveSendingIdentity()` 결과를 `from` 에 넣어야
  한다(화면에서 고른 팀 도메인/개인 계정).
- **실패 처리** — `sendMail` 은 예외를 던지지 않고 `status` 로 알린다. 네트워크 호출을
  `$transaction` 안에 넣지 말고, 결과에 따라 `EmailLog.status` 를 `SENT`/`FAILED` 로 쓴다.
