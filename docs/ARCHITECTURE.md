# 아키텍처

## 레이어 개요

```
브라우저
  │
  ▼
Next.js App Router (src/app)
  ├─ 페이지 (서버 컴포넌트 기본)  ── 데이터 조회 ──┐
  ├─ 페이지 전용 클라이언트 컴포넌트 (_components)  │
  └─ REST API Route Handlers (src/app/api) ───────┤
                                                   ▼
                                     src/lib/db.ts (Prisma 싱글톤)
                                                   │
                                                   ▼
                                     Prisma 7 + better-sqlite3
                                                   │
                                                   ▼
                                            SQLite (dev.db)
```

- **데이터 조회**: 화면은 서버 컴포넌트에서 `prisma` 로 직접 조회한다 (SSR). 외부/클라이언트 호출은 `/api/*` 라우트를 사용한다.
- **쓰기 액션**: MVP 단계에서는 일부를 `sonner` toast 목업으로 처리하고, 실제 기록이 필요한 흐름(문서 생성·발송)은 API 라우트에서 SQLite 에 반영한다.
- **세션**: `src/lib/session.ts` 가 데모 고정 사용자/조직을 반환한다 (인증 미구현). 교체 지점이 이 한 파일에 격리되어 있다.

## 라우트 그룹

| 그룹 | 레이아웃 | 대상 |
|---|---|---|
| `(user)` | 사이드바(영업 포털) | 영업 담당자 화면 |
| `(admin)` | 사이드바(관리자 콘솔) | 관리자 화면 |
| `(auth)` | 중앙 정렬(사이드바 없음) | 로그인 등 |

라우트 그룹 `()` 은 URL 에 노출되지 않으므로, `/settings/email`(user)과 `/settings/branding`(admin)처럼 최종 경로만 겹치지 않으면 서로 다른 레이아웃을 가질 수 있다. 반대로 최종 경로가 같으면 그룹이 달라도 충돌한다 — 그래서 프로필 설정은 영업 포털 `/settings/profile`, 관리자 콘솔 `/account/profile` 로 경로를 분리했다.

## 도메인 모델

```mermaid
erDiagram
  Organization ||--o{ User : has
  Organization ||--o{ Document : owns
  Organization ||--o{ Folder : owns
  Organization ||--o{ CatalogItem : owns
  Organization ||--o{ Invite : has
  Organization ||--|| Branding : has
  Organization ||--|| CreditWallet : has
  Organization ||--o{ CreditTransaction : logs
  Organization ||--o{ EmailTemplate : has
  Organization ||--o{ TeamMailDomain : has
  User ||--o{ Document : authors
  User ||--o{ EmailAccount : connects
  User ||--o{ EmailLog : sends
  User ||--o{ EmailTemplate : owns
  User ||--o{ GenerationRequest : requests
  TeamMailDomain ||--o{ User : sends_as
  Folder ||--o{ Folder : nests
  Folder ||--o{ Document : holds
  Document ||--o{ DocumentItem : contains
  Document ||--o{ EmailLog : sent_via
  Document ||--o| GenerationRequest : produced_by
  Document ||--o{ GenerationReference : referenced_by
  GenerationRequest ||--o{ Attachment : uploads
  GenerationRequest ||--o{ GenerationReference : cites
```

| 모델 | 역할 |
|---|---|
| `Organization` | 팀/회사. 모든 데이터의 최상위 소유자 |
| `User` | 사용자. `role` = SALES_REP · LEADER · ADMIN · `signature`(메일 서명) · `mailDomainId`(선택한 팀 발신 도메인, null=개인 계정) |
| `Invite` | 팀원 초대 (PENDING/ACCEPTED/EXPIRED) |
| `Document` | 영업 문서. `type`(QUOTE/CONTRACT/NDA/PROPOSAL) · `status`(DRAFT/SENT/COMPLETED/VOID) · `amount`(KRW 정수) · `contentJson`(블록 캔버스 에디터 본문) · `folderId`(폴더 분류) · `isCommon`(공용문서함 여부) |
| `Folder` | 문서 분류 폴더. `isCommon`(내/공용 문서함 구분) · `parentId`(다단계 트리 중첩) · `sortOrder`(형제 순서) |
| `DocumentItem` | 문서 라인 아이템 (수량·단가·금액) |
| `CatalogItem` | 마스터 데이터(상품/서비스 카탈로그) |
| `EmailAccount` | Gmail/Outlook 연동 계정 |
| `EmailLog` | 이메일 발송 이력 |
| `EmailTemplate` | 메일 발송 템플릿(제목·본문·`recipientName` 기본 담당자명). `ownerId=null`=팀 공용, 값 있으면 개인 |
| `TeamMailDomain` | 팀(조직) 발신 메일 도메인. 관리자가 등록·인증(`status`)·기본 참조(`defaultCc`) 지정, 담당자가 발신 주소로 선택 |
| `CreditWallet` / `CreditTransaction` | 조직 크레딧 잔액 / 충전·사용 내역 |
| `GenerationRequest` | AI 문서 생성 요청 이력 |
| `Attachment` | AI 생성 시 업로드한 참고 파일(엑셀/CSV 등 → 텍스트 추출). `GenerationRequest` 에 종속 |
| `GenerationReference` | AI 생성 시 참고한 기존 문서 연결 (`GenerationRequest` ↔ `Document`) |
| `Branding` | 조직 브랜딩(회사명·로고·색상) |
| `Policy` | 기획서 정책 라이브러리(24) |

전체 필드는 `prisma/schema.prisma` 참고.

## enum 대체 전략

SQLite 는 enum 을 지원하지 않으므로, 열거형은 `String` 컬럼 + `src/lib/constants.ts` 의 상수/라벨로 관리한다. 예:

```ts
DOCUMENT_STATUSES = ["DRAFT", "SENT", "COMPLETED", "VOID"]
DOCUMENT_STATUS_LABELS = { DRAFT: "초안", SENT: "발송완료", COMPLETED: "계약완료", VOID: "폐기" }
```

DB 에는 영문 코드가 저장되고, UI 에는 한국어 라벨을 표시한다.

## 데이터 흐름 예시

**AI 문서 생성** (`POST /api/generate`, multipart/form-data)
1. 첨부 파일(엑셀/CSV 등) 텍스트 추출 + 참고 문서(`referenceIds`) 수집
2. 크레딧 잔액 확인 (부족 시 402)
3. 트랜잭션: 문서(+라인아이템) 생성 → 크레딧 차감 → 거래내역 기록 → 생성요청·첨부(`Attachment`)·참고(`GenerationReference`) 이력 기록
4. 생성된 문서 반환 → 에디터로 이동

**블록 캔버스 편집 저장** (`PATCH /api/documents/:id`)
1. `contentJson`(블록 배치)으로 저장 시 서버가 총액·거래처명을 문서 본문에서 재도출한다 (클라이언트 계산 불신, 정책 VAL_DOC_CALCULATION)
2. 레거시 라인아이템 폼(`items`)으로 저장하면 라인아이템 교체 + 총액 재계산
3. 폴더 이동(`folderId`)·공용 지정(`isCommon`)도 같은 PATCH 로 처리

**폴더 관리** (`/api/folders` · `/api/folders/:id` · `/api/folders/reorder`)
- 문서함(내/공용)별 다단계 폴더 생성·이름변경·삭제·형제 순서변경

**이메일 발송** (`POST /api/documents/:id/send`)
1. 수신자 검증
2. 트랜잭션: `EmailLog` 생성 → 문서 `status = SENT` 전환

## 향후 확장 포인트

- **인증**: `src/lib/session.ts` 를 실제 인증(NextAuth 등)으로 교체
- **AI 연동**: `/api/generate` 목업을 실제 LLM(Anthropic API) 호출로 교체
- **메일 발송**: OAuth 토큰 저장 + 실제 Gmail/Outlook API 연동
- **문서 출력**: 블록 캔버스(`contentJson`)를 실제 PDF 로 렌더링해 발송 첨부 (현재는 목업 첨부)
