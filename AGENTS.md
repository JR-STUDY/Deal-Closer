<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# RAINMAKER (Deal-Closer) — 팀 개발 룰

> 이 파일은 팀원과 AI 코딩 도구가 공유하는 **개발 규칙**입니다.
> `CLAUDE.md` 는 이 파일을 `@AGENTS.md` 로 참조합니다. 규칙 변경은 이 파일에서 합니다.

## 프로젝트 개요

Rainmaker 는 자연어 한 줄로 영업 문서(견적서·계약서·NDA·제안서)를 생성하고, 웹에서 편집한 뒤 이메일로 발송하는 영업 문서 자동화 SaaS 의 **MVP** 입니다.

- **영업 담당자 포털(user-web)**: 대시보드 · AI 문서 생성 · 웹 에디터 · 이메일 발송 · 문서 보관함 · 메일 연동
- **관리자 콘솔(admin-web)**: 로그인 · 팀원 관리 · 마스터 데이터 · 요금/크레딧 · 브랜딩 · 통계
- 원본 기획서: Lamina 공유 문서(24화면 / 정책 24개). 요약은 `docs/SPEC.md` 참고.

## 작업 시작 전 (필독)

새 세션·새 팀원은 코드를 수정하기 전에 다음을 확인한다.

1. **이 파일(AGENTS.md) 전체** — 스택·구조·DB·컨벤션·커밋 규칙.
2. **[docs/SPEC.md](docs/SPEC.md)** — 원본 기획서(24화면 / 정책 24개). 이 제품의 **단일 기준(source of truth)** 이다.
3. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — 레이어·도메인 모델·데이터 흐름.
4. **[docs/REACT_BEST_PRACTICES.md](docs/REACT_BEST_PRACTICES.md)** — React/Next 성능 규칙 (코드 작성·리뷰 시).

**기획서 준수 원칙**: 화면·라우트·정책·도메인 모델은 `docs/SPEC.md` 기획서와 정합성을 유지한다. 기획서에 있는 항목을 임의로 빼거나, 없는 항목을 임의로 추가하지 않는다 — 변경이 필요하면 팀 합의 후 **SPEC·`prisma/schema.prisma`·이 문서를 함께 갱신**한다. 정책(`AUTH_*` `VAL_*` `FORM_*` `STATE_*` `ACC_*` `legal-*` `COPY-TONE`)은 구현에 반드시 반영한다.

## 기술 스택 (변경 시 팀 합의 필수)

| 영역 | 선택 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) / React 19 |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS v4 + shadcn/ui (radix · nova preset) |
| DB / ORM | SQLite + Prisma 7 (better-sqlite3 driver adapter) |
| 패키지 매니저 | **pnpm** (npm/yarn 혼용 금지) |

## 필수 명령어

```bash
pnpm dev            # 개발 서버 (http://localhost:3000)
pnpm build          # 프로덕션 빌드
pnpm typecheck      # 타입 검사 (tsc --noEmit)
pnpm lint           # ESLint
pnpm test:mailer    # 메일 전송 어댑터 검증 (네트워크 없이 fetch 스텁으로 실행)
pnpm test:opportunity-progress  # 기회 단계 진행 표시 순수 함수 검증 (DB 없이 실행)
pnpm test:opportunity-transition # 기회 단계 전이 규칙 순수 함수 검증 (DB 없이 실행)
pnpm test:opportunity-patch     # 기회 부분 수정(인라인) 병합 순수 함수 검증 (DB 없이 실행)
pnpm test:pagination # 목록 페이지네이션 순수 함수 검증 (DB 없이 실행)
pnpm test:contact   # 거래처 담당자 대표 규칙 순수 함수 검증 (DB 없이 실행)
pnpm test:confirmed-document # 확정 문서 판정 순수 함수 검증 (DB 없이 실행)

pnpm db:migrate     # 스키마 변경 → 마이그레이션 생성·적용
pnpm db:seed        # 데모 데이터 시드
pnpm db:studio      # Prisma Studio (DB GUI)
pnpm db:reset       # DB 초기화 + 마이그레이션 재적용
pnpm db:generate    # Prisma Client 재생성

pnpm doctor         # react-doctor 전체 진단 (보안·성능·정확성)
pnpm doctor:push    # 푸시 전 변경분 검증 (pre-push 훅이 자동 실행)
pnpm doctor:staged  # staged 파일만 빠르게 점검 (수동)
```

## 디렉토리 구조

```
prisma/
  schema.prisma        # 도메인 스키마 (단일 소스)
  seed.ts              # 데모 시드
  migrations/          # 마이그레이션 이력 (커밋)
src/
  app/
    (user)/            # 영업 담당자 포털 — 사이드바 공유 (에디터는 블록 캔버스, _components/ 에 co-locate)
    (admin)/           # 관리자 콘솔 — 사이드바 레이아웃 공유
    (auth)/            # 로그인 등 인증 화면 (사이드바 없음)
    api/               # REST API Route Handlers (SQLite 조회 / 목업)
    layout.tsx         # 루트 레이아웃 (폰트·Toaster)
    page.tsx           # 랜딩 (콘솔 진입)
  components/
    ui/                # shadcn/ui (직접 수정 지양, CLI 로 관리)
    account/           # 프로필/계정 공용 폼 (profile-form·password-form·profile-tabs, user·admin 공유)
    email-template/    # 메일 템플릿 공용 폼 다이얼로그 (관리 페이지·발송폼 재사용)
    document/          # 문서 공용 — linkable-document-picker(기회에 연결할 보관함 문서 선택),
                       #   document-preview-dialog(미리보기 iframe + 편집 화면으로 이동)
    opportunity/       # 기회 공용 — 등록 버튼·폼 다이얼로그(목록 전용), 단계 흐름 안내,
                       #   account-combobox(거래처 자동완성 + 인라인 생성),
                       #   confirmed-document-actions(확정 문서 지정·해제 훅 + 변경 toast),
                       #   opportunity-stage-stepper(진행 스테퍼 — action 을 주면 노드 클릭으로 전이),
                       #   stage-change(칸반·목록·스테퍼 공용 단계 변경 훅·메뉴·확인창)
    list-pagination.tsx / list-row-link.tsx  # 목록 공용 — 페이지 이동 UI, 행 전체 클릭 링크
    info-hint.tsx        # ⓘ 툴팁 — 조건부 안내 문구를 접어 같은 줄 입력의 폭이 흔들리지 않게 한다
    app-sidebar.tsx    # 공용 사이드바
    sidebar-folders.tsx / add-folder-button.tsx  # 보관함 폴더 트리 UI
    signature-html-editor.tsx / signature-preview.tsx  # 메일 서명 편집·미리보기
    provider-logo.tsx  # Gmail/Outlook 브랜드 로고
    page-header.tsx / back-button.tsx / status-badge.tsx / loading-state.tsx  # 공용 UI
  lib/
    db.ts                # Prisma 싱글톤 (DB 접근은 반드시 여기 경유)
    session.ts           # 현재 사용자/조직 (MVP: 데모 고정)
    constants.ts         # enum 대체 상수 + 라벨
    format.ts            # 통화/날짜 포맷
    api.ts               # API 응답 헬퍼(ok/fail)
    nav.ts               # 사이드바 네비게이션 정의 (user/admin)
    pagination.ts        # 목록 페이지네이션 순수 함수 — page 파싱·구간·번호 목록·href·필터 변경 시 리셋
    validation.ts        # 이메일 수신자 형식 검증·다중 파싱 (VAL_*)
    editor-schema.ts     # 블록 캔버스 문서 모델(contentJson) 파싱·총액/거래처 재도출·시드
    attachments.ts       # AI 생성 첨부(엑셀/CSV) 텍스트 추출
    email-template.ts    # 메일 템플릿 치환 변수·검증·DTO
    signature.ts         # 메일 서명 HTML 판별·미리보기 문서·검증
    mail-domain.ts       # 팀 발신 도메인 검증·팀 주소 조합·발신 신원 해석
    mailer.ts            # 메일 전송 어댑터(server-only, Resend) — 검증·재시도·개발 모드 건너뜀
    pdf-html.ts          # PDF 인쇄용 HTML 생성 — 블록 좌표 재현·브랜딩·이스케이프
    pdf.ts               # contentJson → PDF 바이트(server-only, puppeteer-core) → docs/PDF-RENDERING.md
    account.ts           # 거래처 검증·정규화(사업자번호)·DTO·목록 조회 조건 (F-101·102·103)
                         #   담당자는 다루지 않는다 — contact.ts 로 분리했다 (거래처-8)
    confirmed-document.ts # 확정 문서 판정 **규칙** 순수 함수 (기회-6) — 우선순위(계약완료>발송완료>초안)·
                         #   VOID 제외·동순위 최근 수정·수동 잠금. resolveConfirmedDocument /
                         #   pinConfirmedDocument / unpinConfirmedDocument
    opportunity-amount.ts # 확정 문서 재판정 → 예상 금액 **저장** (server-only, 기회-6).
                         #   expectedAmount 를 쓰는 유일한 곳이다
    document-link.ts     # 보관함 문서를 기회에 연결 (server-only, 기회-5·17) — 후보 규칙·이력 기록
    contact.ts           # 거래처 담당자 검증·DTO + **대표 담당자 규칙** 순수 함수 (거래처-8)
                         #   resolveCreateIsPrimary / resolveUpdateIsPrimary /
                         #   demotionTargetIds / resolveDeletion / primaryContact / sortContacts
    opportunity.ts       # 기회 검증·금액/날짜 입력 변환·DTO·목록 조회 조건·정렬 (F-111),
                         #   withOpportunityDefaults — 부분 수정(인라인)에서 빠진 필드를 현재 값으로 채움
    pipeline.ts          # 파이프라인 집계 순수 함수 — 단계별 합계·기간 필터·월 마감 요약 (F-402·404·406·302)
    opportunity-transition.ts # 단계 전이 **규칙** 순수 함수 — 전진만·되돌리기 판정·문서별 목표 단계 (F-112·113)
    opportunity-stage.ts # 기회 생성·단계 전이 + 활동 이력 기록 (한 트랜잭션, 서버 전용, F-111·113)
    opportunity-progress.ts # 단계 진행 **표시** 순수 함수 — 이력에서 도달 지점 도출·지나온/현재/남은·마감 노드 1건·다음 행동 안내
  generated/prisma/    # Prisma Client (자동 생성, 커밋 안 함)
```

## 데이터베이스 규칙

- **스키마는 `prisma/schema.prisma` 가 단일 소스.** 변경 시 반드시 `pnpm db:migrate` 로 마이그레이션을 생성한다 (수동 SQL 금지).
- SQLite 는 enum·배열·Json scalar 를 지원하지 않는다 → 열거값은 `String` + `src/lib/constants.ts` 상수로, 다중값은 관계 테이블 또는 문자열(JSON/구분자) 직렬화로 처리.
- **금액은 원(KRW) 단위 정수(Int)** 로 저장한다 (정책 FORM_CURRENCY_KRW).
- DB 접근은 **반드시 `src/lib/db.ts` 의 `prisma` 싱글톤**을 사용한다 (직접 `new PrismaClient()` 금지 — dev 리로드 커넥션 누수).
- 생성된 Client(`src/generated/prisma`)와 `dev.db` 는 커밋하지 않는다. `pnpm install` 시 `postinstall` 이 Client 를 자동 생성한다.

## 코딩 컨벤션

- 페이지는 **서버 컴포넌트가 기본**. 상호작용(입력/버튼/스위치)만 `"use client"` 컴포넌트로 분리하고, 해당 페이지 폴더 내 `_components/` 에 co-locate 한다.
- 데이터 조회는 서버 컴포넌트에서 `prisma` 직접 또는 `/api/*` 라우트를 사용한다.
- 공통 UI 는 재사용한다: `@/components/ui/*`(shadcn), `@/components/page-header`, `@/components/status-badge`.
- 포맷은 `@/lib/format`(formatKRW/formatDate/formatDateTime)만 사용한다.
- **기회 생성·단계 전이는 `@/lib/opportunity-stage` 를 경유한다.** 라우트·컴포넌트가 `stage` 를 직접 `update` 하거나 `opportunity.create()` 를 직접 호출하지 않는다 — 생성/전이와 활동 이력(ActivityLog)이 한 트랜잭션이어야 상태 정합성이 깨지지 않는다.
- **전이 허용 규칙은 `@/lib/opportunity-transition` 의 순수 함수가 단일 기준이다.** 서버(`opportunity-stage`)와 칸반 클라이언트가 같은 판정을 공유해야 화면 안내와 실제 저장 결과가 어긋나지 않는다. server-only 를 import 하지 않으므로 클라이언트·`tsx` 테스트에서도 쓴다. 자동 전이(문서 발송)는 **앞으로만**, 수동 전이(칸반 드래그·⋯ 메뉴)는 **어느 단계로든** 이동하며 마감 해제 시 확인창을 띄운다.
- **단계 변경 UI 는 드래그 전용으로 만들지 않는다.** 칸반 카드와 목록 행이 `@/components/opportunity/stage-change` 의 ⋯ 메뉴를 공유해 키보드로도 단계를 바꿀 수 있어야 한다 (정책 ACC_*). 기회 상세의 **진행 스테퍼도 같은 훅(`useStageChange`)을 쓴다** — `action` 을 넘기면 노드가 버튼이 되어 그 단계로 전이한다. 노드는 `<button>` 이라 Tab·Enter 로 닿고, 마감 노드는 수주·실주를 드롭다운으로 고른다(진행 중에는 어느 결과인지 정해지지 않았으므로). 스테퍼가 규칙을 스스로 판단하지 않는다 — 허용 판정·경고 문구는 `@/lib/opportunity-transition`, 저장은 `POST /api/opportunities/:id/stage` 하나뿐이다.
- **기회 상세의 값은 인라인으로 고친다 — 수정 다이얼로그를 다시 만들지 않는다** (기회-7). 표시 상태가 `<button>` 이라 클릭·Enter 로 편집에 들어가고, blur·Enter 로 저장하며 Esc 로 되돌린다(메모는 여러 줄이라 ⌘/Ctrl+Enter). 저장은 **고친 필드 하나만** `PATCH /api/opportunities/:id` 로 보내고, 서버가 `withOpportunityDefaults()` 로 나머지를 현재 값으로 채워 `parseOpportunityInput()` 한 곳을 통과시킨다 — 검증 규칙이 갈라지면 다이얼로그 저장과 인라인 저장의 제약이 달라진다. 화면에는 먼저 반영하고 실패 시 이전 값으로 롤백한다(칸반 전이와 같은 방식). 목록의 등록·행 수정은 계속 `opportunity-form-dialog` 를 쓴다.
- **기회의 예상 금액은 입력값이 아니라 확정 문서에서 파생된다** (기회-6).
  `Opportunity.expectedAmount` 는 **확정 문서(`confirmedDocumentId`)의 금액을 복제한 캐시**이고,
  확정 문서가 없으면 0 이다. 화면은 `₩0 · 확정 문서 없음` 으로 안내하고 문서를 연결하도록 유도한다 —
  **수동 입력을 어디에도 열어 주지 않는다**(폼·인라인 수정·PATCH 본문 모두). 손으로 고칠 길이 하나라도
  남으면 문서와 기회가 서로 다른 금액을 주장한다.
  판정 규칙은 `@/lib/confirmed-document` **순수 함수가 단일 기준**이고(계약완료 > 발송완료 > 초안,
  폐기 제외, 동순위는 최근 수정, 그다음 id), 쓰기는 `@/lib/opportunity-amount` **한 곳뿐**이다.
  라우트·컴포넌트가 `expectedAmount` 를 직접 update 하지 않는다. 시드도 같은 순수 함수를 쓴다.
  **재판정 시점은 세 가지다 — 문서 연결(해제·삭제) · 문서 상태 변경 · 문서 금액 변경.**
  이 셋을 일으키는 라우트는 같은 트랜잭션에서 `syncOpportunityAmount()` 를 부른다(중간 상태 노출 방지).
  문서를 기회 A → B 로 옮길 때는 **놓아주는 쪽을 먼저** 재판정한다 — `confirmedDocumentId` 가
  UNIQUE 라 순서가 뒤집히면 제약에 걸린다.
  확정 문서가 자동 판정으로 바뀌면 **toast 로 알리고 [되돌리기]를 준다**(모달이 아니다 — 작업 흐름을
  막지 않는다). 되돌리기는 이전 문서로 **수동 고정**하는 동작이며, 고정된 기회는 자동 판정에서
  제외되고 상세의 "자동 판정으로 되돌리기" 로 푼다. **잠금 상태 자체가 자동/수동 스위치**다.
- **한 문서는 최대 한 기회에만 붙는다.** 연결 후보(`GET /api/documents?linkable=1`)에서 이미 다른
  기회에 붙은 문서와 폐기 문서를 뺀다 — 한 문서가 두 기회의 금액을 동시에 좌우할 수 없다.
  기회 등록 팝업(기회-17)과 기회 상세의 "기존 문서 연결"(기회-5)은 `@/lib/document-link` 의
  같은 후보 규칙을 쓴다. 연결은 **복제가 아니다** — 복제하면 어느 쪽을 고쳐야 금액이 바뀌는지 알 수 없다.
- **문서 미리보기는 `@/lib/pdf-html` 을 재사용한다** (기회-19). 서버가 만든 인쇄용 HTML 을
  `GET /api/documents/:id/preview` 로 내려 `sandbox` iframe 에 띄운다 — 미리보기용 렌더러를 따로 만들면
  실제 PDF 와 다르게 보이기 시작한다.
- **거래처 담당자(Contact)는 여러 명이고, 대표 규칙은 `@/lib/contact` 순수 함수가 단일 기준이다** (거래처-8).
  거래처당 대표는 **최대 1명**이지만 DB 제약으로 막을 수 없어(SQLite 부분 유니크 인덱스는
  Prisma 스키마로 표현되지 않는다) 앱이 지킨다. 지켜야 할 불변식은 하나다 —
  **담당자가 1명 이상이면 대표는 정확히 1명.** ① 첫 담당자는 요청과 무관하게 대표가 되고,
  ② 대표는 스스로 내려올 수 없으며(다른 사람을 올리면 자동으로 내려간다),
  ③ 대표를 지우면 남은 담당자 중 가장 먼저 만들어진 사람이 승격하고(그 사실을 안내한다),
  ④ 담당자 0명은 허용한다. **대표 지정과 기존 대표 해제는 한 트랜잭션**이어야 한다 —
  두 번의 update 로 나누면 중간에 대표가 2명인 상태가 노출된다.
  라우트·화면이 규칙을 새로 판단하지 않는다(`scripts/contact.test.ts` 가 이 경계를 지킨다).
- **거래처 목록에는 대표 담당자만 싣는다.** 전원을 실어 오면 행마다 조회량이 담당자 수만큼
  늘고 보여줄 자리도 없다. 나머지는 "외 N명" 으로만 알리고 상세에서 관리한다(추가·수정·삭제·대표 지정).
  담당자 검색은 **대표가 아니어도 걸린다** — "김대리가 있는 회사"를 찾는 것이 검색의 쓰임이다.
- **상세 화면의 브레드크럼은 소속을 위로 둔다.** 기회 상세는 `거래처 > {회사명} > {기회명}`, 거래처 상세는 `거래처 > {회사명}` 이다 — 기회는 거래처에 속하므로 목록(`영업 기회`)이 아니라 그 거래처가 상위다. `backHref` 도 브레드크럼 상위와 같은 곳을 가리킨다.
- **상세 화면은 2단으로 나눈다** (기회-4). 좌측은 "이것이 무엇인지"(진행 단계·기본 정보·메모), 우측은 "무슨 일이 있었는지"(이력·연관 문서)다. `lg` 미만에서는 한 단으로 쌓여 좌측이 먼저 온다. 이력·연관 문서를 본문 아래로 길게 늘어놓지 않는다 — 좌우 공간이 남고 스크롤만 길어진다.
- **파이프라인·매출 집계는 `@/lib/pipeline` 의 순수 함수를 쓴다.** 대시보드와 캘린더가 같은 계산을 공유해야 화면끼리 숫자가 어긋나지 않는다.
- **단계 진행 표시(스테퍼·흐름 안내)는 `@/lib/opportunity-progress` 의 순수 함수를 쓴다.** 목록과 상세가 같은 계산을 공유해야 표현이 어긋나지 않는다. 이 모듈은 읽기 전용이며 단계를 바꾸지 않는다. 트랙 끝의 **마감 노드는 항상 1개**다 — 진행 중이면 회색 `수주/실주`(앞으로 갈 곳), 마감되면 실제 결과 하나가 채워진다. 수주·실주를 **갈래(2step)로 벌리지 않는다** — 둘을 나란히 띄우면 화면이 "둘 중 하나를 고르는 단계"처럼 읽힌다.
- **지나온 구간은 `stage` 하나로 단정하지 않는다.** 마감된 기회는 어느 단계에서 마감했는지가 활동 이력(ActivityLog)에만 남으므로, `opportunityProgress(stage, history)` 에 이력의 `from`/`to` 를 넘겨 도달 지점을 도출한다(`reachedOpenStage`). 상단(진행 단계)과 하단(이력)이 같은 출처를 봐야 "제안에서 실주했는데 검토/협상까지 지나온 것으로 보이는" 어긋남이 생기지 않는다. 이력을 **새로 조회하지 말고** 화면이 이미 읽은 것을 재사용한다. 이력이 없으면 초기까지만 지나온 것으로 본다(모르면 덜 주장한다).
- **목록 페이지네이션은 `@/lib/pagination` + `@/components/list-pagination` 을 쓴다.** 페이지는 URL 쿼리(`?page=`)로만 주고받는 **서버 페이지네이션**이며, 페이지 크기는 `LIST_PAGE_SIZE` 상수 하나다. 페이지 UI 는 **1페이지뿐이어도 노출**한다(이전·다음 비활성) — 결과 수에 따라 나타났다 사라지면 표 아래가 들썩이고 이 목록이 페이지로 나뉘는 화면인지도 알 수 없다. **0건일 때만** 감추고 그 자리에 빈 상태 안내를 둔다. 검색·필터를 바꿀 때는 툴바가 `nextListSearch` 로 page 를 1로 되돌린다(3페이지에 머문 채 조건을 좁히면 빈 화면이 뜬다). 총 건수·합계는 **필터를 적용한 전체**를 기준으로 내고, 건수 조회는 목록 조회와 `Promise.all` 로 병렬화한다. 기회 **칸반 보기는 페이지네이션 대상이 아니다** — 전체가 보여야 파이프라인이 성립한다.
- **목록 행 전체 클릭은 `@/components/list-row-link` 를 쓴다.** `onClick` + `router.push` 로 행을 이동시키지 않는다 — `RowLink` 의 `::after` 덮개가 행을 채우므로 JS 없이 동작하고 키보드 Tab·Enter·새 탭이 그대로 된다(정책 ACC_*). 행에 `ROW_LINK_ROW`, 행 안의 다른 링크·`⋯` 메뉴 칸에 `ROW_LINK_ABOVE` 를 함께 붙인다.
- import alias 는 `@/*` = `src/*`.
- **UI 텍스트는 한국어 존댓말** (정책 COPY-TONE). 접근성·명도대비를 준수한다(ACC_*).
- **영업 담당자(기회의 owner)와 거래처 담당자(Account.contactName)는 라벨을 구분한다.** 기회 화면에서는 `영업 담당자` 로 적는다 — 한 화면에 두 담당자가 등장하는 순간 그냥 `담당자` 는 어느 쪽인지 알 수 없다.
- **성능**: React/Next 코드를 작성·리뷰·리팩터링할 때 `docs/REACT_BEST_PRACTICES.md`(Vercel 70규칙 정리)를 따른다. 특히 ① 독립 조회는 `Promise.all` 병렬화, ② 서버 조회 함수는 `React.cache`, ③ 클라이언트 컴포넌트에 함수·비직렬화 객체 전달 금지 — 는 필수.
- 커밋 전 `pnpm typecheck` 와 `pnpm lint` 를 통과시킨다.

## 커밋 컨벤션

- 형식: `[이슈번호] <type>(<scope>): <subject>` (이슈번호 없으면 생략 가능)
- type: `feat` `fix` `docs` `style` `refactor` `perf` `test` `chore` `ci` `build`
- 제목은 50자 이내 명령문, 마침표 없음. **제목과 본문 사이 빈 줄 필수.**
- 본문은 72자 이내로 `- ` 접두사 나열, 무엇과 왜를 설명.
- `Co-Authored-By` 줄은 넣지 않는다.

## 코드 품질 · CI

React 코드의 **보안·성능·정확성**을 [react-doctor](https://github.com/millionco/react-doctor)(정적 분석, API 키 불필요)로 점검한다.

- **CI 자동 리뷰**: PR 을 열면 `.github/workflows/react-doctor.yml` 이 실행되어 ① PR 요약 코멘트, ② 변경 라인 인라인 리뷰, ③ 커밋 상태(점수)를 남긴다. `main` 푸시에도 상태를 표기한다.
- **푸시 시 자동 검증 (pre-push 훅)**: `git push` 하면 husky `pre-push` 훅(`pnpm doctor:push`)이 변경분을 스캔해 **새 error 가 있으면 push 를 차단**한다(기존 warning 은 통과). 팀원은 `pnpm install` 시 `prepare` 스크립트로 훅이 자동 활성화된다. 긴급 우회는 `git push --no-verify`.
- **수동 로컬 점검**: 전체 진단 `pnpm doctor`, staged 변경분 `pnpm doctor:staged`.
- **게이트 강화 절차**: 도입 초기에는 워크플로우 `blocking: none`(advisory — 항상 통과)이다. 팀이 결과에 익숙해지면 `warning` → `error` 로 올려 CI 통과 조건으로 승격한다.
- react-doctor 는 `.tsx`/`.jsx` 등 React 파일을 대상으로 한다. 규칙 상세는 위 저장소 참고.

## MVP 범위 / 주의사항

- **인증 없음**: `src/lib/session.ts` 가 데모 고정 사용자/조직을 반환한다. 실제 인증(NextAuth 등) 도입 시 이 모듈만 교체하면 된다.
- 일부 쓰기 액션(폼 제출 등)은 `sonner` toast 목업이다. 실제 저장이 필요하면 `/api/*` 를 확장한다.
- 비밀정보는 `.env`(gitignore). 공유는 `.env.example` 로 한다.
- Next.js 16 은 breaking changes 가 있다(상단 블록 참고). `params`·`searchParams` 는 **Promise** 이므로 `await` 한다.
