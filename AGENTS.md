<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# RAINMAKER (Deal-Closer) — 팀 개발 룰

> 이 파일은 팀원과 AI 코딩 도구가 공유하는 **개발 규칙**입니다.
> `CLAUDE.md` 는 이 파일을 `@AGENTS.md` 로 참조합니다. 규칙 변경은 이 파일에서 합니다.

## 프로젝트 개요

Rainmaker 는 자연어 한 줄로 영업 문서(견적서·계약서·NDA·제안서)를 생성하고, 웹에서 편집한 뒤 이메일로 발송하는 영업 문서 자동화 SaaS 의 **MVP** 입니다.

- **영업 담당자 포털(user-web)**: 대시보드 · 거래처 · 영업 기회 · AI 문서 생성 · 웹 에디터 · 문서 보관함(표준 양식·품목 카탈로그·내 문서함) · 메일(발송 이력·수신함·연동·템플릿) · 설정(사이드바 맨 아래 프로필 줄 → 계정 정보·회사 정보·보안 탭)
- **관리자 콘솔(admin-web)**: 사이드바·랜딩에서 **진입점을 걷어냈다**(2.0.0). 라우트는 살아 있고 주소로만 들어간다 — 통계·리포트 · 팀원 관리 · 요금/크레딧 · 메일 도메인. 담당자가 실제로 쓰는 **품목 카탈로그·회사 정보는 포털로 옮겼다**(아래 컨벤션 참고).
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
pnpm test:opportunity-sort      # 기회 목록 정렬 순수 함수 검증 (DB 없이 실행)
pnpm test:opportunity-renewal   # 갱신 기회 판정·이름·마감일 순수 함수 검증 (DB 없이 실행)
pnpm test:pagination # 목록 페이지네이션 순수 함수 검증 (DB 없이 실행)
pnpm test:calendar  # 대시보드 월 캘린더(그리드·일정 배치·월 합계) 순수 함수 검증 (DB 없이 실행)
pnpm test:email-log # 발송 이력 목록 조회 조건·정렬 순수 함수 검증 (DB 없이 실행)
pnpm test:email-tracking # 오픈 트래킹(추적 픽셀 주소·태그·기본 주소·최초 열람) 순수 함수 검증
pnpm test:contact   # 거래처 담당자 대표 규칙 순수 함수 검증 (DB 없이 실행)
pnpm test:confirmed-document # 확정 문서 판정 순수 함수 검증 (DB 없이 실행)
pnpm test:amount-breakdown   # 확정 문서 금액 내역(요약행) 표기 순수 함수 검증 (DB 없이 실행)
pnpm test:editor-schema      # 블록 캔버스 문서 모델 파싱·직렬화 검증 (DB 없이 실행)
pnpm test:editor-amount      # 에디터 문서 금액 도출 순수 함수 검증 (DB 없이 실행)
pnpm test:document-edit      # 문서 편집 잠금 판정 순수 함수 검증 (DB 없이 실행)
pnpm test:editor-render      # 캔버스·미리보기·PDF 렌더 정합 검증 (DB 없이 실행)
pnpm test:table-merge        # 표 셀 병합 순수 함수 검증 (DB 없이 실행)
pnpm test:block-align        # 다중선택 정렬·분할·이동 순수 함수 검증 (DB 없이 실행)
pnpm test:editor-cell        # 캔버스 칸 편집 규칙 순수 함수 검증 (DB 없이 실행)
pnpm test:prompt-preset      # 지시문 예시 프리셋 규칙(기본 셋 보존·중복·상한) 검증 (DB 없이 실행)
pnpm test:settings           # 회사·프로필 검증 + 품목 카탈로그 목록·등록 규칙 순수 함수 검증 (DB 없이 실행)

pnpm db:migrate     # 스키마 변경 → 마이그레이션 생성·적용
pnpm db:seed        # 데모 데이터 시드 (prisma db seed — 명령은 prisma.config.ts 가 정의)
pnpm db:studio      # Prisma Studio (DB GUI)
pnpm db:reset       # DB 초기화 + 마이그레이션 재적용 + 시드
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
    (admin)/           # 관리자 콘솔 — 사이드바 레이아웃 공유 (진입점 없음: 주소로만 들어간다)
                     #  잔존: analytics · team/members · billing · settings/mail-domain
                     #  이전 완료(리다이렉트만 남음): settings/branding · account/profile → /settings/profile
    (auth)/            # 로그인 등 인증 화면 (사이드바 없음)
    api/               # REST API Route Handlers (SQLite 조회 / LLM 호출 / 일부 목업)
                     #  mail/track/[trackingId] 는 **인증 없이 열린 유일한 라우트**다
                     #  (수신자의 메일 앱이 부른다 — 아래 오픈 트래킹 규칙 참고)
                     #  generate · templates · documents/[id]/{versions,revise} 는 실제 LLM 호출
                     #  (모델은 사용자가 화면에서 선택 — 서버가 카탈로그로 검증)
    layout.tsx         # 루트 레이아웃 (폰트·Toaster)
    page.tsx           # 랜딩 (콘솔 진입)
  components/
    ui/                # shadcn/ui (직접 수정 지양, CLI 로 관리)
    account/           # 회사·프로필 공용 폼 (profile-tabs 셸 + profile-form·company-form·password-form)
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
    sidebar-folders.tsx / add-folder-button.tsx  # 보관함 폴더 트리 UI (문서함은 하나 — 파티션 없음)
    signature-html-editor.tsx / signature-preview.tsx  # 메일 서명 편집·미리보기
    provider-logo.tsx  # Gmail/Outlook 브랜드 로고
    page-header.tsx / back-button.tsx / status-badge.tsx / loading-state.tsx  # 공용 UI
  lib/
    db.ts                # Prisma 싱글톤 (DB 접근은 반드시 여기 경유)
    session.ts           # 현재 사용자/조직 (MVP: 데모 고정)
    constants.ts         # enum 대체 상수 + 라벨
    format.ts            # 통화/날짜 포맷
    api.ts               # API 응답 헬퍼(ok/fail)
    nav.ts               # 사이드바 네비게이션 정의 (user 만 노출 · adminNav 는 잔존 화면용)
    branding.ts          # 회사 정보(Branding) 검증·정규화·DTO — 사업자번호·연락처는 거래처·담당자와
                         #   **같은 순수 함수**를 재사용한다. 로고·인감 dataUrl 상한(1MB)도 여기 하나
    user-profile.ts      # 담당자 개인 정보(이름·직함·연락처) 검증·정규화·DTO
    catalog.ts           # 품목 카탈로그 — 목록 조회 조건·정렬 (catalogWhere/catalogOrderBy/
                         #   catalogSortHref — 다른 목록과 같은 URL 규칙) + **등록·수정 검증·DTO**
                         #   (parseCatalogInput/withCatalogDefaults/toCatalogItemDTO ·
                         #    catalogUsageWhere/catalogDeleteMessage — 삭제 확인창 문구)
    pagination.ts        # 목록 페이지네이션 순수 함수 — page 파싱·구간·번호 목록·href·필터 변경 시 리셋
    calendar.ts          # 대시보드 월 캘린더 순수 함수 (F-302) — month 쿼리 파싱·달 이동 주소 ·
                         #   달 그리드(gridRange/calendarGrid, 로컬 자정 기준) · 칸 접기(foldDayEvents) ·
                         #   결말 판정(outcomeOfStage) · 월 합계(monthRevenue — 예상/확정을 나눠 낸다)
    validation.ts        # 이메일 수신자 형식 검증·다중 파싱 (VAL_*)
    editor-schema.ts     # 블록 캔버스 문서 모델(contentJson) 파싱·시드 + **공용 순수 함수**:
                         #   deriveAmount(금액 근거 없으면 null) · blocksOnPage(쪽 나눔) ·
                         #   totalSummaryRow/normalizeSummaryRows(문서 금액이 되는 요약행 —
                         #     표식 `isTotal`, 없으면 마지막 행) · itemTableGrandTotal ·
                         #   parseIntInput(수량·단가 입력 파싱 단일 기준) ·
                         #   formulaError(수식이 조용히 버리는 글자를 알린다) ·
                         #   reorderZ/reorderZMany(겹침 순서 1..n 정규화 · 묶음째) ·
                         #   tableLayout/normalizeMerges(셀 병합) ·
                         #   textFormat(서식 기본값) · FONT_FAMILIES(화면·인쇄 공용 글꼴) ·
                         #   withCompanyDefaults(빈 공급자 칸·빈 로고·빈 인감을 회사 정보로 —
                         #     화면·인쇄가 함께 지나는 단일 기준) · companyMetaValues ·
                         #   STAMP_BOX(인감 기본 자리) · supplierBlockHeight
    block-align.ts       # 다중선택 정렬·분할·이동 **규칙** 순수 함수 — selectionBounds ·
                         #   alignBlocks(바운딩 박스 기준) · distributeBlocks(양 끝 고정) ·
                         #   translateBlocks(묶음째 클램프) · blocksInRect(마퀴 교차 판정)
    editor-cell.ts       # 캔버스에서 고칠 수 있는 **칸**(CellRef)과 읽기·쓰기 **규칙** 순수 함수 —
                         #   readCell/displayCell(단가만 통화 형식) · writeCell(못 고치는 칸이면
                         #   같은 객체) · editableCells(그 블록의 칸 전부 열거) · sameCell
    document-edit.ts     # 문서 편집 잠금 **규칙** 순수 함수 — 발송·계약완료·폐기·확정본은
                         #   읽기 전용, 고치려면 새 버전. 화면(에디터)과 서버(PATCH)가 같은 판정
    attachments.ts       # 업로드 파일 검증 + 엑셀/CSV 텍스트 추출 (AI 생성 첨부 포함)
    template.ts          # 표준 양식 공용 select·DTO
    document-version.ts  # 문서 버전 묶음(rootId) 유틸·최신본 필터
    ai/                # AI 문서 생성 레이어 (Claude·GPT·Gemini 공용)
      models.ts        #  선택 가능한 모델 카탈로그 (순수 모듈 — 선택기 UI 가 import)
      config.ts        #  프로바이더 판별·기본 모델·토큰 상한·예외 타입 (서버 전용)
      model-access.ts  #  선택기 노출 목록·요청 모델 검증 (서버 전용)
      client.ts        #  Anthropic·OpenAI·Google SDK 싱글톤 + 키 형식 검사
      blocks.ts        #  프로바이더 중립 메시지 블록 (text·image·pdf)
      invoke.ts        #  callStructured — 모델명으로 어댑터 선택 + JSON 파싱·예외 정규화
      providers/       #  프로바이더 어댑터 (요청 형식 변환은 여기서만)
        anthropic.ts   #   Claude Messages API (system 캐시 breakpoint · output_config)
        openai.ts      #   GPT Responses API (instructions · text.format strict · input_file)
        google.ts      #   Gemini generateContent (systemInstruction · responseJsonSchema)
        mock.ts        #   로컬 검증용 (실제 호출 없음, 프로덕션에서 거부)
      prompts.ts       #  시스템 프롬프트 + 사용자 메시지 조립 (캐시 적중 위해 가변값 금지)
      doc-spec.ts      #  응답 스펙(DocSpec) JSON Schema ↔ EditorDoc 변환
      revision-spec.ts #  부분 재작성 diff 스펙·적용 (F-215)
      describe.ts      #  EditorDoc → 프롬프트용 텍스트 요약
      content.ts       #  파일 → 중립 블록 (PDF·이미지 원본 전달)
      generate-document.ts / setup-template.ts / revise-document.ts  # 서비스 진입점
      http.ts          #  AI 예외 → 503/502 응답 매핑
    email-log.ts         # 발송 이력 목록 **조회 조건·정렬·표시 판정** 순수 함수 (메일-1) —
                         #   emailLogsWhere(조직 범위는 document.orgId 경유) ·
                         #   parseEmailLogFilters/Sort · emailLogOrderBy(마지막 기준 id) ·
                         #   emailOpenState(실패 건은 "미열람" 이 아니다) · recipientList
    email-tracking.ts    # 오픈 트래킹 **기록 장치** 순수 함수 (F-234) — newTrackingId(UUID v4) ·
                         #   readAppBaseUrl/parseAppBaseUrl(APP_BASE_URL 검증) ·
                         #   trackingPixelUrl/Tag · withTrackingPixel(본문 맨 끝 · 주소 없으면 그대로) ·
                         #   trackingPixelBytes/TRACKING_PIXEL_HEADERS(캐시 금지) · firstOpenAt
    email-template.ts    # 메일 템플릿 치환 변수·검증·DTO
    signature.ts         # 메일 서명 HTML 판별·미리보기 문서·검증
    mail-domain.ts       # 팀 발신 도메인 검증·팀 주소 조합·발신 신원 해석
    mailer.ts            # 메일 전송 어댑터(server-only, Resend) — 검증·재시도·개발 모드 건너뜀
    branding.ts          # 회사 정보 검증·정규화·DTO (설정 7) + **CompanyProfile** ·
                         #   toCompanyProfile(상호 폴백을 정하는 유일한 곳)
    pdf-html.ts          # PDF 인쇄용 HTML 생성 — 블록 좌표 재현·브랜딩·이스케이프.
                         #   PdfBranding = CompanyProfile + primaryColor · toPdfBranding
    pdf.ts               # contentJson → PDF 바이트(server-only, puppeteer-core) → docs/PDF-RENDERING.md
    account.ts           # 거래처 검증·정규화(사업자번호)·DTO·목록 조회 조건 (F-101·102·103)
                         #   담당자는 다루지 않는다 — contact.ts 로 분리했다 (거래처-8)
    confirmed-document.ts # 확정 문서 판정 **규칙** 순수 함수 (기회-6) — 우선순위(계약완료>발송완료>초안)·
                         #   VOID 제외·동순위 최근 수정·수동 잠금. resolveConfirmedDocument /
                         #   pinConfirmedDocument / unpinConfirmedDocument
                         #   버전 묶음마다 대표를 먼저 뽑는다 — representativeByVersionGroup (F-214)
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
    opportunity-renewal.ts  # 갱신 기회 **규칙** 순수 함수 (F-115·F-306) — decideRenewal
                         #   (수주 + 다음 기회 없음만 허용) · renewalBlockMessage ·
                         #   renewalName(회차 증가·길이 상한) · suggestedRenewalCloseDate
  generated/prisma/    # Prisma Client (자동 생성, 커밋 안 함)
```

## 데이터베이스 규칙

- **스키마는 `prisma/schema.prisma` 가 단일 소스.** 변경 시 반드시 `pnpm db:migrate` 로 마이그레이션을 생성한다 (수동 SQL 금지).
- SQLite 는 enum·배열·Json scalar 를 지원하지 않는다 → 열거값은 `String` + `src/lib/constants.ts` 상수로, 다중값은 관계 테이블 또는 문자열(JSON/구분자) 직렬화로 처리.
- **금액은 원(KRW) 단위 정수(Int)** 로 저장한다 (정책 FORM_CURRENCY_KRW).
- DB 접근은 **반드시 `src/lib/db.ts` 의 `prisma` 싱글톤**을 사용한다 (직접 `new PrismaClient()` 금지 — dev 리로드 커넥션 누수).
- 생성된 Client(`src/generated/prisma`)와 `dev.db` 는 커밋하지 않는다. `pnpm install` 시 `postinstall` 이 Client 를 자동 생성한다.
- **시드 명령은 `prisma.config.ts` 의 `migrations.seed` 가 정의한다** (Prisma 7). `package.json` 의
  `"prisma": { "seed": ... }` 는 더 이상 읽히지 않고, `prisma migrate reset` 도 **시드를 자동 실행하지
  않는다**(`--skip-seed` 옵션 자체가 사라졌다). 그래서 `db:reset` 이 `prisma migrate reset && prisma db seed`
  로 두 단계를 명시한다 — 설정이 빠지면 리셋 뒤 **빈 DB** 로 개발 서버가 뜨고, 화면이 비어 있는 원인을
  스키마에서 찾게 된다. 시드 진입점을 바꿀 때는 `prisma.config.ts` 한 곳만 고친다.

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
- **판정은 버전 묶음 단위다 — 같은 문서의 v1·v2 가 서로 경쟁하지 않는다** (기회-6 × F-214).
  버전은 별도 테이블이 아니라 Document 행을 하나 더 만드는 방식이라(`rootId` 로 묶이고 `version` 이
  번호, v1 은 `rootId=null`), 아무 처리도 하지 않으면 같은 견적서의 두 버전이 다른 문서인 척 겨룬다.
  그래서 `representativeByVersionGroup()` 이 **묶음마다 대표 1건**을 먼저 뽑고, 대표들끼리만
  기존 우선순위로 겨룬다. 묶음 안의 순서는 ① 버전 확정본(`isConfirmed`) ② 상태 우선순위
  ③ 높은 `version` 번호다 — 묶음 안에서는 `updatedAt` 이 아니라 버전 번호가 의도된 순서다.
  **`latestVersionsOnly()` 를 쓰지 않는다.** 그 함수는 보관함 목록용이고, 금액 판정에 쓰면
  "v1 로 계약이 체결된 뒤 누군가 v2 초안을 만들면 서명된 금액을 잃는다" — 최신이 곧 권위 있는
  버전은 아니다. 판정에 문서를 넘기는 모든 조회의 `select` 에 `rootId`·`version`·`isConfirmed` 를
  넣는다(빠지면 타입 오류가 난다 — 선택 필드로 만들지 말 것).
  **수동 고정은 묶음이 아니라 그 버전을 고정한다** — "직접 지정"의 뜻이 그것이고, 묶음을 고정하면
  나중에 만든 v3 초안이 서명된 v2 를 밀어낸다.
- **"확정" 이 두 뜻으로 쓰인다 — 문구와 주석에서 섞지 않는다.**
  `Document.isConfirmed` 는 **버전 확정본**(F-214, "이 버전이 확정본인가", 한 묶음에 여러 개 가능),
  `Opportunity.confirmedDocumentId` 는 **확정 문서**(기회-6, "예상 금액을 어디서 가져오는가",
  기회당 1건). 컬럼 이름을 바꾸는 건 범위 밖이므로 **낱말로 구분한다** — 화면에서 전자는
  `버전 확정본`·`v2`, 후자는 `확정 문서`(툴팁 "예상 금액의 기준이 되는 문서입니다")로 적는다.
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
- **연결 단위는 문서 한 건이 아니라 버전 묶음이다** (기회-5 × F-214). 문서 id 하나에만
  `opportunityId` 를 걸면 **같은 견적서의 v1 은 기회 A, v2 는 기회 B** 에 붙는 상태가 만들어지고,
  두 기회가 같은 문서의 서로 다른 버전을 근거로 각자 다른 금액을 주장한다 — 화면으로는 가릴 수 없다.
  그래서 `linkDocumentsToOpportunity()` 는 묶음의 **모든 버전**에 `opportunityId` 를 걸고,
  후보 조회도 **형제 버전이 이미 붙은 묶음을 통째로 뺀다**(빼먹으면 목록에는 뜨는데 저장에서
  거부당해 사용자는 이유를 모른 채 같은 시도를 반복한다). 활동 이력은 **묶음마다 1건**만 남기고,
  연결 건수도 문서 행 수가 아니라 **묶음 수**로 센다 — 버전이 3개인 견적서 하나를 붙였는데
  "3건" 이라고 알리면 사용자는 문서 세 건을 붙인 줄 안다.
- **실주 사유(F-117)는 고정 목록 + 기타이고, 변환은 `@/lib/opportunity-transition` 의
  `parseLostReason()` 한 곳만 한다.** 이 값은 표기가 아니라 **이탈률 통계(F-405)의 분류 축**이라
  자유 입력만 받으면 "가격때문"·"가격 이슈"·"단가" 가 전부 다른 값으로 쌓여 집계가 되지 않는다.
  목록에 없는 사유를 위해 `기타` 를 열되 `기타: ` 접두사를 붙여 **한 문자열**로 저장한다
  (집계는 `기타` 로 묶으면서 원문을 잃지 않는다). **화면이 저장 문자열을 조립하지 않는다** —
  고른 값과 직접 입력을 그대로 보내고 서버가 정규화한다. LOST 인데 사유가 없으면 400 이고,
  실주가 아닌데 사유가 오면 **조용히 버리지 않고 거절한다**(버리면 화면은 저장됐다고 믿는다).
  목록을 바꾸면 과거 데이터와 비교가 끊기므로 항목 삭제·문구 변경은 팀 합의 후에만 한다.
  입력창은 칸반·목록·스테퍼가 **같은 컴포넌트 하나**(`StageChangeDialogs`)를 쓴다 — 창을 나누면
  한 곳이 빠졌을 때 그 화면에서만 사유 없이 저장된다.
- **갱신 기회(F-115)의 규칙은 `@/lib/opportunity-renewal` 순수 함수가 단일 기준이다.**
  수주로 끝난 거래의 다음 건을 **새 기회**로 세우고 `previousOpportunityId` 체인으로 잇는다
  (새 컬럼을 만들지 않는다). 갱신은 **단계 전이가 아니라 기회를 하나 더 만드는 일**이라
  `@/lib/opportunity-transition` 과 파일을 나눈다 — 한 파일에 섞으면 "전이 규칙" 이라는 이름이
  거짓이 된다. 판정(`decideRenewal`·`canRenewOpportunity`)과 기본 이름(`renewalName`)을
  **화면과 서버가 같이** 쓴다: 화면은 버튼을 보일지 정하고 서버는 요청을 받을지 정하며,
  **화면에서만 막은 것은 막은 것이 아니다.** 생성 경로는 `POST /api/opportunities/:id/renewal`
  하나이고, 새 기회는 예상 금액을 복제하지 않는다(확정 문서가 정하는 값이다).
  `previousOpportunityId` 가 `@unique` 라 한 기회의 다음 기회는 **최대 1건**이다.
- **문서 보관함은 `표준 양식`(`/library/templates`)과 `내 문서함`(`/library`) 둘뿐이다.**
  팀 공용/개인 문서함 파티션(`Document.isCommon` · `Folder.isCommon`)은 걷어냈다 —
  그 구분은 결국 **팀 워크스페이스 기능**인데 MVP 에는 인증이 없어(`session.ts` 가 데모 사용자
  1명 고정) 나눌 주체가 없고, "공용 문서함"이라는 말을 `Template.scope=COMMON`(표준 양식)과
  문서 파티션이 함께 써서 같은 이름이 두 가지를 가리켰다.
  **두 컬럼은 스키마에 남아 있지만 기본값(`false`)으로만 쓴다** — 조회 조건에 넣거나
  요청 본문으로 받지 않는다(`/api/folders` · `PATCH /api/documents/:id` · 생성 라우트 모두).
  하나라도 입력을 열어 주면 화면에 없는 두 번째 문서함이 데이터에만 생겨,
  사이드바에서 영영 보이지 않는 폴더·문서가 만들어진다. 팀 워크스페이스를 실제로 도입할 때
  되살릴 자리이므로 컬럼 자체는 지우지 않았다.
- **문서 금액은 `deriveAmount()` 로 도출한다 — `computeAmount()` 를 저장에 쓰지 않는다.**
  `deriveAmount` 는 품목표 블록이 **하나도 없으면 `null`** 을 준다. "합계 0원"과 "이 문서는
  금액을 품목표로 표현하지 않는다(계약서·NDA)"는 다른 사실이고, 이 둘을 같게 취급하면
  문서를 열어 **저장만 눌러도** amount 가 0 이 되고 확정 문서를 통해 기회 예상 금액까지
  0 으로 내려간다(실측 12,000,000 → 0). `null` 이면 `undefined` 를 넘겨 저장된 금액을
  보존한다. `0 ?? fallback` 은 0 이 nullish 가 아니라 폴백이 걸리지 않는다는 것도 기억한다.
  에디터를 열 때는 `seedTemplate({ amount })` 로 근거 1행을 시드해 **캔버스 합계와 저장된
  금액을 처음부터 일치**시킨다. 금액이 0 으로 떨어지는 저장은 확인창이 바뀔 금액을 미리 말하고,
  저장 응답의 `amountSync` 로 결과를 알린다(문구는 `amountChangeMessage` 하나를 쓴다).
- **품목표의 문서 금액은 `isTotal` 표식이 붙은 요약행이다 — "마지막 행"이 아니다.**
  예전에는 `itemTableGrandTotal()` 이 **마지막 요약행**을 문서 금액으로 삼았다. 그러면
  금액이 **행을 넣은 순서**에 달린다 — 사용자가 `공급가액` → `부가세` 순서로만 넣으면
  문서 금액이 **부가세 금액**이 되고(실측 1,000만원 견적서가 100만원으로 저장됐다),
  확정 문서를 통해 기회 예상 금액까지 그 값으로 내려간다(기회-6). 프리셋은 마지막이
  `합계` 라서 우연히 맞았을 뿐이다. 지금은 `SummaryRow.isTotal` 이 **명시적**으로 그
  행을 가리키고, 판정은 `totalSummaryRow()` · 정규화는 `normalizeSummaryRows()`
  **순수 함수 한 쌍**이 단일 기준이다(요약행을 고치는 모든 경로가 정규화를 지난다 —
  안 지나면 행을 하나 더할 때마다 금액이 새 행으로 옮겨간다).
  표식은 **옵셔널**이라 예전 `contentJson` 을 깨지 않는다: `parseContentJson` 이 읽으면서
  **마지막 행**에 붙여 주므로(음수 z 치유·`MetaFieldRole` 추정과 같은 선례) 이미 저장된
  문서의 금액이 이 변경 한 번으로 달라지지 않는다. 화면·인쇄는 **표식 행**을 굵게 그리고
  (인쇄 CSS 는 `tfoot tr.total` — `tr:last-child` 는 옛 규약을 한 번 더 적어 둔 것이었다),
  인스펙터는 행마다 `[문서 금액]` 라디오를 준다 — 어느 행이 금액인지 화면에서 보여야 한다.
  `amount-breakdown` 도 "마지막 행"을 다시 판단하지 않는다(두 벌이 되면 큰 글씨 금액과
  내역이 서로 다른 행을 가리킨다). AI 경로는 조립 시 마지막 행에 표식을 굳힌다.
- **수량·단가 입력 파싱은 `parseIntInput()` 하나다.** 예전에는 캔버스(`editor-cell`)가
  숫자 아닌 글자를 **지웠고**(`1200000.5` → `12000005`, **10배**) 인스펙터는
  `Math.trunc(Number(v))`(→ `1200000`) 였다. 같은 값을 어디서 고쳤는지에 따라 단가가
  달라지고, 그 위에 얹힌 부가세·합계·문서 금액이 전부 어긋난다("단가를 캔버스에서
  고치면 부가세가 깨진다"의 실제 원인). 규칙은 **소수점 앞까지만 읽는다** — 통화기호·
  쉼표·공백·단위는 걷어내고 소수점에서 끊는다(지우지 않는다). 음수는 0 이다.
- **요약행 수식이 알아볼 수 없는 글자를 담고 있으면 `formulaError()` 로 알린다.**
  `evalFormula` 는 못 읽는 토큰을 **조용히 버린다** — `subtotal * 10%` 는 `%` 가 사라져
  소계의 **10배**가 부가세 자리에 찍히고, `subtotal*.1` 은 `× 1`, `subtotal + 부가세` 는
  소계 그대로다. 셋 다 화면에 그럴듯한 숫자가 뜨므로 알아챌 단서가 없다.
  **평가 규칙은 바꾸지 않는다**(이미 저장된 문서의 금액이 달라지면 안 된다) — 대신
  인스펙터가 이 판정을 수식 옆에 적는다.
- **발송완료·계약완료·폐기·확정본 문서는 본문이 읽기 전용이다.** 판정은
  `@/lib/document-edit` 의 `documentEditLock()` 순수 함수가 단일 기준이고 **화면과 서버가
  같은 함수를 쓴다** — 화면에서만 막으면 API 로 그대로 통한다. 서버는 본문 변경(`contentJson`
  ·`title`·`items`·`amount`·`type`·`clientName`)을 409 로 거절하고 `status`·`isConfirmed`
  ·`folderId` 는 통과시킨다(발송 라우트가 상태를 올리고, 확정본 해제가 잠금을 푸는 유일한 길이다).
  고치는 길은 **[이 내용으로 새 버전 만들어 편집]** 하나이며 `use-create-version` 훅을
  버전 이력 다이얼로그와 공유한다. 에디터 안의 모든 편집은 `editDoc` 래퍼 한 곳을 지난다 —
  핸들러마다 검사를 흩어 두면 하나를 빠뜨렸을 때 그 경로로만 조용히 편집된다.
- **넘친 내용은 알리고 한 번에 맞춰 준다 — 자동으로 늘리지 않는다.** 블록은 절대 좌표라서
  높이를 늘려도 아래 블록이 밀려나지 않고 **덮는다**. 자동 확장은 잘림을 겹침으로 바꾸는데,
  겹침은 z 순서가 승자를 정하고 덮인 내용이 PDF 에서도 사라져 더 안 보이는 손상이다.
  게다가 늘어난 블록이 페이지 경계를 넘고, `h` 의 주인이 사용자와 렌더러로 둘이 된다.
  대신 `use-overflow` 로 감지해 점선 외곽선·경고 배지·"내용에 맞추기"·"잘린 블록 N개 ·
  모두 맞추기"를 주고 저장 시 남은 잘림을 알린다(막지는 않는다).
- **화면 렌더러와 인쇄 렌더러는 같은 값을 쓴다.** 글꼴 스택은 `FONT_FAMILIES` 하나이고
  줄 높이는 인쇄 CSS 가 화면 Tailwind 비율을 명시한다(`TEXT_XS_LEADING`·`BASE_LEADING`).
  예전에는 인쇄가 `line-height: normal` 이라 같은 표가 화면 21.5px / 인쇄 19px 행으로
  그려져 화면에서 맞춘 블록이 인쇄에서 어긋났다. 표에 `height:100%` 를 주지 않는다 —
  행이 블록 높이에 맞춰 억지로 벌어진다. 쪽 나눔(`blocksOnPage`)과 셀 병합(`tableLayout`)도
  두 렌더러가 같은 순수 함수를 쓴다. **화면 쪽 Tailwind 클래스를 바꾸면 인쇄 CSS 도 함께 본다.**
- **겹침 순서는 `reorderZ()` 로만 바꾼다.** z 를 항상 `1..n` 으로 정규화한다 — 예전 "맨 뒤로"
  는 `min-1` 로 내려 음수를 만들었고, 음수 z 자식은 흰 배경을 가진 부모 뒤로 들어가 블록이
  화면·PDF 에서 통째로 사라졌다. 캔버스와 `.page` 에 `isolation: isolate` 를 걸고
  `parseContentJson` 이 저장된 음수 z 도 치유한다. **여러 블록의 겹침 순서는
  `reorderZMany()` 로 묶음째** 옮긴다 — id 마다 `reorderZ` 를 반복하면 선택 내부 순서가
  뒤집힌다(이미 맨 앞인 두 블록을 "앞으로" 보낼 때 실제로 재현된다).
- **다중선택의 정렬·분할·이동 규칙은 `@/lib/block-align` 순수 함수가 단일 기준이다.**
  정렬 패널·그룹 드래그·방향키가 같은 함수를 써야 세 경로의 결과가 어긋나지 않는다.
  기준은 **선택 영역 바운딩 박스**다("마지막에 고른 블록" 기준은 무엇이 기준인지 화면으로
  알 수 없어 결과를 예측할 수 없다). `translateBlocks` 는 **묶음째 클램프**한다 — 블록마다
  따로 가두면 벽에 닿은 것만 멈추고 나머지는 계속 가서 상대 배치가 찌그러진다.
  마퀴는 **닿기만 해도** 고른다(`blocksInRect`) — 완전히 감싸야 하면 큰 블록을 고르려고
  화면 밖까지 끌어야 한다. 여러 페이지에 걸친 선택도 문서 좌표로 정렬된다(막지 않는다 —
  되돌리기가 있다). `scripts/block-align.test.ts` 가 이 경계를 지킨다.
- **그룹 드래그는 미리보기만 하고 확정은 놓을 때 한 번이다.** 끄는 동안 좌표를 옮겨
  **그리기만** 하고 문서는 건드리지 않는다 — mousemove 마다 편집하면 되돌리기 스택이 수백 건
  쌓여 ⌘Z 가 쓸모없어진다. 스냅은 **끌린 블록에만** 걸고 그 결과 이동량을 선택 전체에
  적용한다(각 블록에 따로 걸면 서로 다른 기준선에 붙어 배치가 무너진다). 정렬 기준선에서
  함께 움직이는 블록은 뺀다 — 같이 따라오므로 영원히 붙지 않는다.
- **이미 선택된 블록을 수식키 없이 눌러도 선택을 무너뜨리지 않는다.** 이게 없으면 3개를
  골라 두고 하나를 잡는 순간 선택이 1개로 줄어 그룹 드래그가 성립하지 않는다. 움직이지 않고
  놓으면(=클릭) 그때 그 블록만 남긴다. ⇧클릭으로 선택에서 **뺄 때는** react-rnd 가
  mousedown 에 이미 시작한 드래그를 버린다(안 그러면 빼려다 블록이 움직인다).
  블록의 `onFocus` 는 **`:focus-visible` 일 때만** 단일 선택한다 — 마우스 클릭 포커스까지
  단일 선택하면 ⇧클릭이 더하지 않고 **교체**된다(Tab 이동 단일 선택은 그대로 유지된다).
- **아이콘·우클릭 메뉴는 누른 블록이 선택에 포함되면 선택 전체를 대상으로 한다.** 5개를
  골라 두고 그중 하나를 우클릭해 지울 때 하나만 사라지면 헷갈린다. 대신 **몇 개를 처리했는지
  toast 가 말하고** 되돌리기를 준다. 여러 개 삭제·복제·붙여넣기는 한 번의 편집이라
  ⌘Z 한 번에 전부 돌아온다.
- **되돌리기는 `use-doc-history` 를 지난다.** 문서·과거·미래를 한 state 로 묶어 전이를 순수
  함수로 만든다(updater 안에서 다른 setState 를 부르면 StrictMode 이중 호출 때 스택이 두 번
  쌓인다). 잦은 변경은 `coalesceKey` 로 600ms 안에서 한 건으로 묶는다 — 타이핑이 글자 단위로
  되돌아가면 되돌리기가 쓸모없어진다. **무이동 드래그(=클릭)에는 스냅을 적용하지 않는다** —
  선택만 했는데 블록이 최대 6px 밀리고 스택이 클릭마다 쌓인다.
- **정보 필드를 코드가 찾을 때는 라벨이 아니라 `role` 로 찾는다** (`MetaFieldRole`).
  예전에는 라벨 문자열이 곧 키였다 — `label.includes("고객사")` 로 거래처명을, `label === "상호"`
  로 공급자명을 찾았다. 그래서 라벨을 `발주처` 로 바꾸면 `extractClientName` 이 `null` 이 되고,
  PATCH 는 `clientName` 을 건드리지 않아 **문서 목록에 옛 거래처명이 영구히 남았다**(본문과
  목록이 서로 다른 거래처를 주장한다). 캔버스에서 라벨을 더블클릭으로 고칠 수 있게 된 뒤로는
  걸리기 쉬운 함정이다. AI 생성 경로는 더 심하다 — **라벨을 모델이 정하므로**(`수요기관`·`발주처`)
  애초에 관례를 벗어난다. `role` 은 **옵셔널**이라 예전 문서를 깨지 않는다:
  `parseContentJson` 이 읽으면서 라벨로 추정해 채우고(음수 z 치유와 같은 선례) 다음 저장에 남는다.
  AI 조립부는 값 힌트(`spec.clientName`·브랜딩 회사명)로 배정한다. 조회는 `findMetaField()`
  하나이고 라벨 매칭은 역할이 없는 문서를 위한 **폴백일 뿐**이다.
  **역할 조각은 역할마다 여러 개**이고 겹치면 **긴 조각이 이긴다**(`대표번호` 는 `대표`
  보다 구체적이라 전화가 이긴다). 선언 순서에 맡기면 조각을 하나 더할 때마다 기존
  판정이 조용히 뒤집힌다. 후보는 **블록별로 좁힌다**(`metaRolesFor`) — 거래처 블록의
  `주소` 칸이 공급자 주소 역할을 차지하면 회사 주소가 거래처 자리에 채워진다.
- **회사 정보(공급자 칸·로고·인감)는 `withCompanyDefaults()` 한 곳에서 채운다** (설정 7).
  회사 정보는 문서의 **공급자 자리**에 그대로 박히는 값인데(상호·대표자·사업자등록번호
  ·주소·대표 연락처·로고·인감), 예전에는 폴백이 **인쇄 렌더러 안에만** 있어서 캔버스에는
  빈 칸이 보이는데 PDF 에만 값이 찍혔다 — 사용자가 화면에서 확인할 수 없는 내용이 고객에게
  발송된다. 지금은 규칙이 문서 한 단계 위에 있고 **에디터 페이지·미리보기·PDF 가 같은
  함수를 지난다.** 렌더러는 블록에 담긴 값만 그린다.
  지키는 선은 넷이다. ① **적힌 값은 덮지 않는다**(빈 칸만 채운다), ② **역할로 지목한다**
  (`MetaFieldRole` · 이미지의 `ImageRole`) — 역할 **없는** 빈 이미지 블록에는 아무것도
  넣지 않는다(예전에는 빈 이미지면 무엇이든 로고가 찍혀 자리만 잡아 둔 칸에 로고가
  인쇄됐다), ③ **블록을 만들지 않는다** — 블록을 놓는 것은 시드(`seedTemplate` ·
  `buildDocFromSpec`)의 일이고, **인감이 등록되지 않은 조직에는 인감 블록 자체를 만들지
  않는다**(빈 이미지 블록은 회색 자리표시자가 되어 견적서에 남는다), ④ 바뀔 것이 없으면
  **같은 객체**를 돌려준다.
  인감 자리는 `STAMP_BOX` 이고 겹침 순서는 `reorderZ(..., "front")` 로 정한다 —
  z 를 손으로 계산하지 않는다. `Branding` 에 이메일 컬럼이 없으므로 공급자 블록의
  `이메일` 칸은 **라벨만 두고 비워 둔다**(대표 연락처나 사용자 이메일을 억지로 넣지 않는다).
  상호 폴백을 정하는 곳은 `toCompanyProfile()` 하나이고 **넘기는 폴백 값은 언제나
  조직명(`org.name`)이다** — 공급자는 조직이지 사람이 아니다. 함수를 하나로 모아도
  **인자를 호출측이 정하므로** 규칙이 갈라질 수 있다: 실제로 AI 생성·양식 세팅만
  `user.name` 이어서, 회사명을 비워 둔 조직에서 AI 로 만든 문서는 공급자 상호가
  **담당자 이름**으로 굳고(조립이 값을 `contentJson` 에 써 넣으므로 나중에 회사명을
  채워도 고쳐지지 않는다) 시드로 열린 문서는 조직명이 되어, 같은 조직의 문서가 경로에
  따라 다른 상호를 주장했다.
- **화면에서만 막은 것은 막은 것이 아니다 — 서버가 다시 판정한다.** 이미지 1MB 상한은
  인스펙터에만 있었고 서버는 `contentJson` 을 그대로 저장했다(이미지는 `dataUrl` 로 본문
  안에 들어간다). 본문 전체에 `MAX_CONTENT_JSON_BYTES` 상한을 두고 문서·양식 PATCH 가
  `contentJsonSizeError()` 로 413 을 돌려준다 — 문서 편집 잠금에서 이미 배운 규칙과 같다.
- **단건 조회는 조직 범위로 좁힌다** — `findUnique({ where: { id } })` 가 아니라
  `findFirst({ where: { id, orgId } })`. 예전에는 `documents/[id]` 의 GET·PATCH·DELETE 와
  에디터 페이지만 범위가 없었다(형제 라우트 preview·versions·send·revise·양식·폴더·거래처는
  모두 있었다). 지금은 데모 조직이 하나라 노출이 없지만 인증이 붙는 순간 문서 읽기·수정·삭제가
  조직을 넘는다. 없는 문서와 남의 문서는 **같은 404** 여야 한다(존재 여부도 알려주지 않는다).
- **끌어서 바꾸는 것은 키보드로도 바꿀 수 있어야 한다** (ACC_*). 표 열 폭·행 높이 손잡이는
  `role="separator"` + `tabIndex={0}` + 방향키(⇧ 로 4배)이고 `aria-valuenow` 로 현재 값을
  알린다. 방향키는 **캔버스의 블록 이동과 같은 키**라 `stopPropagation` 으로 삼킨다 —
  안 그러면 손잡이에 포커스를 둔 채 누를 때 블록이 함께 움직인다. 표 폭은 **이벤트가 준
  요소**(`e.currentTarget.parentElement`)에서 잰다 — ref 로 읽으면 `react-hooks/refs` 에
  걸리고, 상태로 들고 있으면 확대 배율이 바뀔 때 낡은 값이 된다(배율은 블록을 바꾸지 않아
  다시 재지 않는다).
- **캔버스에서 고칠 수 있는 칸은 `@/lib/editor-cell` 이 단일 기준이다.** 기준 문장은 하나다 —
  **인스펙터에서 고칠 수 있고 캔버스에 글자로 보이는 값은 캔버스에서도 고칠 수 있다.**
  예전에는 커밋 경로가 종류마다 따로여서(블록 전체·격자 표·품목표) 칸을 늘릴 때마다
  배선을 하나 더 해야 했고, 그래서 **표처럼 보이는데 편집만 안 되는 칸**이 남았다 —
  `공급자 정보`·`거래처·견적 정보` 는 `<table>` 로 그려지는데 더블클릭 경로가 아예 없었고
  (실제 문서에서 공급자 6칸 중 5칸이 비어 있었다), 품목표의 **추가 열 머리글**과
  **요약행 라벨**도 인스펙터에만 있었다. 이제 자리(`CellRef`)와 읽기·쓰기가 이 모듈
  하나이고 화면·훅(`handleCommitCell`)이 그것만 쓴다. 반대로 **계산 결과**(금액=수량×단가,
  요약행 값=수식)와 **고정 머리글**(`품목 / 설명`·`수량`·`단가`·`금액`·`합계` — `props` 에
  없는 문구)에는 칸을 만들지 않는다. `editableCells()` 가 칸을 **열거**하므로
  `scripts/editor-cell.test.ts` 의 누락 검사가 새 텍스트 속성을 잡는다(모든 칸에 새 값을
  쓴 뒤 예전 값이 남으면 실패한다 — 칸을 열든 "화면에 안 보인다"고 적든 **결정을 하게**
  만든다). 더블클릭 핸들러는 안쪽 글자가 아니라 **칸(`th`/`td`)** 에 둔다 — 값이 빈
  필드는 글자 높이가 0 이라 안쪽에 달면 닿을 수가 없다.
- **라벨/값 2열 표(`공급자 정보`·`거래처·견적 정보`)는 렌더러가 하나다**
  (`blocks/labeled-fields-block.tsx`, 인쇄 쪽 `renderFieldTable` 과 같은 방식). 글자
  크기·여백만 `variant` 로 갈린다 — 둘로 나누면 한쪽만 손봤을 때 화면과 인쇄가 갈라진다.
- **캔버스 인라인 편집은 기회 상세와 같은 규칙이다** — 더블클릭 진입, blur 저장, Esc 되돌리기,
  여러 줄이므로 ⌘/Ctrl+Enter 저장. 편집 중에는 React 가 `contentEditable` 내용을 다시 쓰지
  않고(입력마다 커서가 튄다) 캔버스 단축키와 Rnd 드래그를 모두 양보한다. 편집 세션 하나가
  되돌리기 한 건이다.
- **텍스트 서식은 블록 단위다** (굵게·기울임·줄 높이). 새 속성은 **옵셔널**로 두고
  `textFormat()` 이 기본값을 채운다 — 필수로 만들면 예전 contentJson 을 열 때마다 서식이
  초기화된다. 화면·인쇄·인스펙터가 이 함수 하나를 쓴다. 부분 서식(리치텍스트)은 범위 밖이다.
- **확대 배율은 `Rnd scale` 로 함께 넘기고 `bounds="parent"` 는 쓰지 않는다.** 배율이 걸리면
  react-rnd 가 경계를 배율 적용 크기로 재고 위치는 문서 좌표로 비교해 150% 에서 블록이 아예
  움직이지 않는다. 경계는 놓는 순간 문서 좌표로 클램프한다(드래그·리사이즈 모두). 드롭 좌표도
  배율로 나눈다. 기본값은 **폭 맞춤** — 794px 캔버스는 1280 폭 화면에 들어가지 않는다.
- **표 셀 병합은 `merges` 를 `cells` 위에 얹는다** (기존 문서 호환 — 없으면 병합 없음).
  `normalizeMerges` 가 격자 밖·1×1·겹친 범위를 걸러내고 겹치면 먼저 선언된 것이 이긴다 —
  걸러내지 않으면 colspan 합이 열 수를 넘어 표가 통째로 깨진다. 행·열을 지울 때
  `shiftMergesOn{Row,Col}Delete` 로 좌표를 옮긴다.
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
  **담당자 추가 팝업은 이미 대표가 있으면 아무 라디오도 켜지 않되, 현재 대표가 누구인지
  이름으로 밝힌다** — 켜지 않는 이유("덧붙였을 뿐인데 목록에 나오는 이름이 바뀌면 안 된다")가
  화면에 없으면 빈 라디오가 버그로 읽힌다. 새로 고르면 그 사람이 내려온다는 결과도 함께 적는다.
- **거래처 목록에는 대표 담당자만 싣는다.** 전원을 실어 오면 행마다 조회량이 담당자 수만큼
  늘고 보여줄 자리도 없다. 나머지는 "외 N명" 으로만 알리고 상세에서 관리한다(추가·수정·삭제·대표 지정).
  담당자 검색은 **대표가 아니어도 걸린다** — "김대리가 있는 회사"를 찾는 것이 검색의 쓰임이다.
- **상세 화면의 브레드크럼은 소속을 위로 둔다.** 기회 상세는 `거래처 > {회사명} > {기회명}`, 거래처 상세는 `거래처 > {회사명}` 이다 — 기회는 거래처에 속하므로 목록(`영업 기회`)이 아니라 그 거래처가 상위다. `backHref` 도 브레드크럼 상위와 같은 곳을 가리킨다.
- **상세 화면은 2단으로 나눈다** (기회-4). 좌측은 "이것이 무엇인지"(진행 단계·기본 정보·메모), 우측은 "무슨 일이 있었는지"(이력·연관 문서)다. `lg` 미만에서는 한 단으로 쌓여 좌측이 먼저 온다. 이력·연관 문서를 본문 아래로 길게 늘어놓지 않는다 — 좌우 공간이 남고 스크롤만 길어진다.
- **파이프라인 집계는 `@/lib/pipeline` 의 순수 함수를 쓴다.** 기회 목록과 칸반이 같은 계산을 공유해야 두 보기의 숫자가 어긋나지 않는다. **대시보드는 이 모듈을 쓰지 않는다** — 대시보드의 "누적 매출"은 계약완료(COMPLETED) **문서** 금액의 합이라 기회 파이프라인 합계와 다른 값이 정상이다(두 숫자를 같게 맞추려 들지 말 것).
- **대시보드의 월 캘린더는 `@/lib/calendar` 순수 함수를 쓴다** (F-302). 캘린더는 **전용 페이지가
  아니라 대시보드 안의 카드**이고, 올리는 일정은 **기회의 예상 마감일(`expectedCloseDate`) 하나**다
  — 갱신 예정일 같은 필드를 새로 만들지 않는다(출처가 둘이면 어느 날짜가 진짜인지 알 수 없다).
  보고 있는 달은 **URL 쿼리(`?month=YYYY-MM`)로만** 주고받고 이동은 `<Link>` 다(목록 정렬 머리글과
  같은 이유 — JS 없이 동작하고 새 탭·주소 복사가 된다). 이번 달이면 파라미터를 지우고, 잘못된 값은
  이번 달로 떨어뜨린다. 날짜 칸 판정은 **로컬 자정 기준**이다 — `toISOString()` 으로 칸을 정하면
  UTC 로 밀려 하루 어긋난 칸에 일정이 붙는다. 조회 범위는 그 달이 아니라 **그리드 구간**(`gridRange`)
  이다(같은 주에 걸친 앞뒤 달 칸이 늘 비어 보이지 않게). 상태는 **색만으로 구분하지 않는다**(ACC_*) —
  진행 중·수주·실주를 아이콘 **모양**과 라벨(실주는 취소선)로 구분한다. 카드 헤더의 **예상 매출(진행 중
  기회 합)과 확정 매출(그 달 수주 합)을 한 숫자로 합치지 않는다** — "될 수도 있는 돈"과 "된 돈"은 다른
  사실이다. 이 두 합계는 **기회 기준**이라 상단 KPI 의 계약 매출(**문서** 기준 누적)과 다른 값이 정상이며,
  카드 설명이 그 사실을 밝힌다(같게 맞추려 들지 말 것). 월 구간 판정은 `@/lib/pipeline` 의 `monthRange`
  ·`isWithinRange` 를 재사용한다 — 같은 "그 달" 을 두 모듈이 각자 계산하면 하루 차이로 갈린다.
- **차트는 두 개의 y축을 한 그래프에 겹치지 않는다.** 문서 수(건)와 누적 매출(원)은 단위가 달라
  한 좌표계에 얹으면 두 축의 정렬이 임의로 정해지고 없던 상관관계를 그림이 주장한다 — 위아래 두
  판으로 나누고 x축(월)만 공유한다. 계열 색은 **라이트·다크를 각각** 지정하고(`ChartConfig` 의
  `theme`), 색만으로 계열을 구분하지 않는다(판 제목·단위·색 키, 도넛은 옆의 배지 + 건수·비중).
  격자·축은 **실선 hairline**(점선은 "예측"으로 읽힌다)이고 값 서식은 `@/lib/format` 을 쓴다.
  프로젝트의 `--chart-*` 토큰은 무채색이라 계열 구분에 쓸 수 없다.
- **예상 금액은 입력값이 아니라 확정 문서에서 파생된다** (기회-6). 판정은 `@/lib/confirmed-document` 순수 함수가 단일 기준이고 저장은 `@/lib/opportunity-amount` 한 곳만 한다. 확정 문서가 없으면 ₩0 이며 **손으로 고치는 길을 만들지 않는다** — 두 출처가 생기는 순간 어느 쪽이 맞는지 아무도 모른다. 문서를 기회에서 떼는 길도 `PATCH /api/documents/:id/opportunity` 하나뿐이다. 연결 해제도 연결과 같은 트랜잭션에서 재판정하고 그 결과를 응답에 실어 화면이 새 기준을 알린다 — 금액이 소리 없이 달라지면 안 된다.
- **되돌릴 수 없는 조작의 확인창은 결과를 미리 말한다.** 확정 문서를 해제할 때는 바뀔 금액과 새 기준 문서를, 대표 담당자를 지울 때는 누가 승계하는지를 확인창에 싣는다. 누르고 나서 알게 되면 이미 늦다.
- **진행 표시 노드 상태는 `done`·`current`·`skipped`·`upcoming` 넷이다.** 마감된 기회의 도달 지점 **뒤** 진행 단계는 `upcoming` 이 아니라 `skipped` 다 — 앞으로 갈 곳과 영영 안 갈 곳은 다르다. 스테퍼는 `skipped` 를 점선 노드·점선 연결선·취소선 라벨로 구분한다(색만으로 구분하지 않는다 — ACC_*). **연결선 색은 양 끝 노드 상태에서 파생시킨다** — 들어가는 노드 하나만 보면 결과 색이 건너뛴 구간을 가로질러 지나온 것처럼 읽힌다.
- **브레드크럼은 라벨(작은 글씨) 위 · 값 아래 2줄이다.** `Crumb.caption` 을 주면 2줄 구조가 켜지고 `>` 는 값 줄에만 놓인다. 라벨과 값은 같은 `<li>` 로 묶어 스크린리더가 "거래처 다올테크" 로 읽게 한다. 분류와 값을 한 줄에 나열하지 않는다.
- **상세 화면의 골격은 `@/components/detail-shell` 을 쓴다** (이전 `detail-columns` 의
  후신). 본문이 전체 폭을 쓰고 "무슨 일이 있었는지"(이력·연관 문서)는 오른쪽에서 밀려
  나오는 **드로어**에 담긴다. 폭·간격·분기점을 화면마다 적어 두면 한쪽만 손봤을 때
  조용히 어긋난다 — 기회 상세와 거래처 상세가 같은 자리에 같은 것을 두어야 한다.
- **드로어가 열릴 때 본문 배경색을 바꾸지 않는다 — 떠 있다는 것은 그림자로 알린다.**
  한때 열리면 스크롤 영역이 `bg-foreground/5` 로 어두워졌다. 두 가지가 어긋났다.
  ① **머리글에 이음선이 생겼다** — `DetailShell` 이 칠할 수 있는 것은 스크롤 영역뿐이고
  `PageHeader` 는 **형제**라 손이 닿지 않는다. 스크롤 영역이 `y=77` 부터라(실측
  1440×900) 머리글 바로 아래에 폭 전체를 가로지르는 각진 회색 띠가 나타났고, 흰
  머리글과 흰 드로어가 한 덩어리로 붙어 본문만 다른 판으로 떨어져 나갔다.
  ② **강조가 뒤집혔다** — 라이트에서 `--card` 와 `--background` 은 둘 다 흰색이라,
  바탕만 어두워지면 카드가 흰 판으로 도드라지고 정작 새로 나타난 드로어가 그 카드들과
  같은 흰색으로 남는다. 국소적인 조작 하나에 화면 전체가 다시 칠해지는데 그 결과로
  가장 눈에 덜 드는 것이 드로어다. 게다가 색 전환(200ms)이 드로어 이동(300ms)보다
  먼저 끝나 **두 개의 따로 노는 사건**으로 읽혔다.
  지금은 드로어가 **왼쪽으로 떨어지는 그림자**로 스스로를 들어올린다 — 겹쳐 뜬 것이
  바탕에 그림자를 떨어뜨리는 것은 현실의 이치라 설명이 필요 없고, 국소적이라 이음선이
  없으며, 그림자가 드로어와 함께 움직이므로 어긋날 것이 없다. **`shadow-2xl` 을 쓰지
  않는다** — `0 25px 50px -12px` 는 아래로 떨어지는 그림자여서 왼쪽 모서리에 거의
  아무것도 그리지 않는다(그래서 바탕 틴트가 그 몫을 대신하고 있었다). x 오프셋을
  왼쪽으로 준 값을 직접 적는다(실측 낙차 30px · 가장 진한 값 225/255).
  다크에서는 그림자가 거의 보이지 않지만 **표면색이 이미 갈린다**(바탕 0.145 <
  드로어 `--card` 0.205) — 라이트는 그림자가, 다크는 표면색이 맡는다.
- **화면 밖에 있는 요소에 `focus()` 를 걸 때는 `{ preventScroll: true }` 를 준다.**
  드로어는 닫힌 동안 `translate-x-full` 이라 바깥칸(`overflow-hidden`) **밖**에 있고,
  열 때 `rAF` 로 초점을 옮기는 시점에는 아직 전환이 시작되지 않아 여전히 밖에 있다.
  브라우저는 초점 받은 요소를 보이게 하려고 **바깥칸을 스크롤한다** — `overflow: hidden`
  도 프로그램으로는 스크롤되므로 막히지 않는다. 실측(1440×900): 드로어를 여는 순간
  바깥칸 `scrollLeft` 가 0 → 544(드로어 폭)로 뛰어 본문이 `x=336` → `-208` 로 끌려갔고,
  전환이 진행돼 `scrollWidth` 가 줄면 그 값이 다시 0 으로 깎이며 본문이 제자리로
  튕겨 돌아왔다 — 사용자가 말한 **"드로어가 팅긴다"** 의 정체는 드로어가 아니라
  **바탕이 왕복한 것**이었다. 초점만 옮기면 되므로 스크롤은 거절한다.
- **목록 정렬은 `@/lib/opportunity-sort` + `@/components/list-sort-header` 를 쓴다.** 정렬 상태는 URL 쿼리(`?sort=&dir=`)로만 주고받고 기본값이면 주소에서 지운다. 정렬을 바꾸면 page 를 1로 되돌린다. 머리글은 **`<Link>`** 다 — 주소를 바꾸는 이동이라 JS 없이 동작하고 새 탭·주소 복사가 되며 머리글마다 `"use client"` 가 붙지 않는다(`aria-sort` 는 `<th>` 에). 정렬 방향은 색이 아니라 **화살표 모양**으로 구분하고, 정렬하지 않은 컬럼에도 **같은 크기의 아이콘 자리를 비워 둬** 눌러도 폭이 변하지 않게 한다. 모든 정렬에 `{ id: asc }` 를 마지막 기준으로 붙인다 — 같은 값이 여럿이면 DB 가 순서를 보장하지 않아 페이지를 넘길 때 같은 행이 두 번 나오거나 빠진다. 단계·담당자는 정렬 대상이 아니다(문자열 정렬이 파이프라인 순서와 어긋나며, 그 목적은 필터가 더 정확히 해결한다).
- **자동완성 입력은 `@/components/opportunity/account-combobox` 의 골격을 따른다.** debounce·↑↓·Enter·Esc·`role=combobox`+`aria-activedescendant`·blur 지연 닫기까지 같아야 사용자가 매번 다시 배우지 않는다(ACC_*). 검색은 기존 목록 API(`?q=`)를 재사용해 목록 화면과 조건을 맞추고 새 검색 라우트를 만들지 않는다. 값 동기화는 `useEffect`+`setState` 가 아니라 **렌더 중 조정**으로 한다(react-doctor `set-state-in-effect`).
- **문서 생성에 넣는 기회·거래처는 CRM 값 하나뿐이다** (F-211 · F-212). 생성 화면은 진행 중
  기회를 후보로 내리고(`?opportunityId=` 로 들어오면 미리 선택), 기회를 고르면 거래처 자유
  입력 3칸을 감춘다 — 같은 사실을 주장하는 출처가 둘이면 어느 쪽이 문서에 박혔는지 알 수 없다.
  담당자는 **대표 1명만** 싣고 판정은 `@/lib/contact` 의 `primaryContact()` 가 단일 기준이다
  (발송 화면과 같은 규칙 — 받는 사람과 문서 수신인이 갈라지면 안 된다).
  프롬프트용 텍스트는 `@/lib/ai/describe.ts` 의 `describeOpportunity()` 한 곳에서 만들고,
  이 모듈은 **순수 모듈이라 조회하지 않는다** — 이미 고른 담당자를 받는다.
  `POST /api/generate` 의 기회 조회는 **한 번뿐**이다. 연결(문서에 붙이기)과 컨텍스트(프롬프트에
  넣기)가 같은 기회를 봐야 "AI 에게 준 거래처"와 "문서가 붙은 기회"가 갈라지지 않는다.
  이력은 `applyDocumentLinked` 가 남기므로 `recordActivity` 를 따로 부르지 않는다(두 번 남는다).
  문서 연결은 확정 문서 재판정 시점이라 같은 트랜잭션에서 `syncOpportunityAmount()` 를 부른다.
  기회 연결은 **끝까지 선택**이다 — 고르지 않으면 "기회 미연결" 빠른 초안이 되고, 보관함 목록이
  그 사실을 표시한다.
- **문서 생성 화면(`/generator`)은 컴포저다 — 지시문이 주인공이고 나머지는 툴바 한 줄이다.**
  대부분의 생성은 **아무 것도 붙이지 않고 지시문만 적는다**. 매번 쓰는 것이 가장 가까이
  있어야 하므로 지시문 칸을 위로 올리고, 부수 입력(거래처·파일·참고 문서·확정 견적서·모델)은
  바로 아래 **팝오버 버튼 한 줄**로 접는다. 예시 지시문은 **오른쪽 레일**에 세로로 둔다 —
  적는 동안 곁눈질하는 것이라 입력칸과 같은 높이에 있어야 한다.
  한때 번호 붙은 네 섹션(`무엇을 만드는가`·`누구에게`·`무엇을 보고`·`무엇을 지시하는가`)을
  세로로 쌓고 예시를 카드 아래 3열로 뒀다. 다섯 입력이 늘 펼쳐져 지시문이 화면 아래로 밀리고,
  번호·제목·설명이 공간을 크게 먹어 **화면이 난잡해졌다**(사용자 피드백으로 되돌렸다).
  `form-section.tsx`·`document-kind-fields.tsx` 는 그때 쓰던 조각이라 걷어냈다.
  **접는 것과 감추는 것은 다르다** — 고른 값은 `SelectionChips` 로 툴바 아래 한 줄에 남아
  무엇을 준 상황인지 보이고, 칩의 × 로 팝오버를 다시 열지 않고 뗄 수 있다.
  **모델 선택기도 팝오버에 넣는다** — 라벨·설명·목 모드 배지를 그대로 살리면서 툴바를
  한 줄로 유지하려면 그래야 한다(그대로 펼치면 3줄이 되어 툴바 정렬이 무너진다).
- **생성 방식(빈 문서 / 표준 양식)은 화면 맨 위의 큰 선택 카드다** (`mode-choice.tsx`).
  두 방식은 **AI 에게 주는 것과 결과물이 다르다** — 빈 문서는 지시문만으로 레이아웃까지
  새로 짜고, 양식 기반은 양식의 레이아웃·문구·공급자 정보를 **보존한 채 값만 채운다**.
  어느 쪽인지 모르고 지시문을 적으면 "왜 우리 양식이 아니지" 또는 "왜 적은 대로 안 나오지"
  가 된다. 예전에는 작은 탭 두 개였고 폭이 좁아 **무엇이 달라지는지 적을 자리가 없었다**.
  차이는 **세 곳에서** 드러난다: ① 카드의 설명 한 줄 ② 카드 아래 입력(양식 모드에만 있다 —
  양식 피커와 그 양식의 필수 항목 안내) ③ 지시문 placeholder ("만들고 싶은 문서를…" /
  "이번 건에서 달라지는 점만…").
  탭이 아니라 **라디오 그룹**이다(ACC_*) — 탭은 "같은 것의 다른 보기" 인데 이건 서로를
  배제하는 값의 선택이다. 선택 상태를 색만으로 구분하지 않는다(테두리 굵기 + 점 표식).
  양식이 0개면 그 카드를 못 누르므로 **탈출구(양식 등록 링크)는 카드 밖에** 둔다 —
  `disabled` 버튼은 안의 링크까지 포인터 이벤트를 삼켜 눌러도 아무 일이 없다.
- **갱신은 단계를 되돌리는 것이 아니라 새 기회를 세우는 것이다** (F-115 · F-306).
  수주로 끝난 거래의 다음 건은 `previousOpportunityId` 체인으로 원본과 이어지고,
  원본은 `수주` 로 그대로 남는다 — 단계를 되돌려 재활용하면 이미 딴 계약의 기록이 사라진다.
  **갱신 전용 스키마 필드를 만들지 않는다** — 주기·갱신 여부 컬럼 대신 `expectedCloseDate`
  하나로 표현하고, 새 기회의 마감일은 사용자가 폼에서 정한다(모듈은 **제안값**만 낸다:
  원본 마감일 + 1년, 이미 지난 날이면 다음 해로 밀어 낸다).
  판정은 `@/lib/opportunity-renewal` **순수 함수가 단일 기준**이다 — **수주(WON) + 다음
  기회 없음**, 이 한 조합만 허용한다(진행 중인 건은 "다음"이 없고, 실주한 건은 이어 갈
  계약이 없다). 체인 컬럼이 `@unique` 라 다음 기회는 최대 1건이므로 **화면은 버튼을
  감추고 서버는 409 로 거절한다** — 화면에서만 막은 것은 막은 것이 아니다. 동시 요청이
  겹치면 DB 제약(P2002)이 마지막 방어선이고, 라우트가 그것을 **같은 안내 문구**로 옮긴다.
  이미 갱신한 기회에는 버튼 대신 **그 기회로 가는 링크**를 둔다(갈 수 없는 문을 그리지 않는다).
  생성은 `@/lib/opportunity-stage` 의 `createOpportunity()` 만 경유하고(생성과
  OPPORTUNITY_CREATED 이력이 한 트랜잭션), **예상 금액은 복제하지 않는다** (기회-6) —
  확정 문서에서 파생되는 값이라 새 기회는 확정 문서 없음 → 0 으로 시작한다.
  이름·마감일 제안값은 화면과 서버가 **같은 순수 함수**로 만든다 — 폼에 뜬 값과 본문 없이
  요청했을 때 서버가 쓰는 값이 갈라지지 않는다.
- **생성 화면에서 문서 종류와 거래처를 손으로 묻지 않는다.**
  **문서 종류**: 양식을 고르면 양식이 정하고, 빈 문서면 AI 가 지시문을 보고 판단한다 —
  `견적서를 만들어줘` 라고 적으면서 종류를 또 고르는 것은 같은 사실을 두 번 말하는 일이다.
  그 대가로 빈 문서 모드에서는 **무엇을 만들지 미리 알 수 없다**. 그래서 근거 견적서
  (F-213)는 빈 문서 모드에서 **열어 두고**(선택), 양식 모드는 종류를 아니까 계약서 양식일
  때만 보인다. 안 고르면 아무 일도 없다.
  **거래처**: 예전에는 기회를 고르지 않으면 `고객사명`·`수신 담당자`·`담당자 이메일` 3칸이
  나타났다. 걷어낸 이유는 셋이다 — ① 거래처의 출처가 CRM 과 손입력 둘이 되어, CRM 에 없는
  거래처명이 문서에 박히면 나중에 그 문서를 기회에 붙일 때 본문과 기회가 서로 다른 거래처를
  주장한다 ② `A사에 …` 라고 적으면 거래처명은 이미 지시문에 있다(같은 값을 두 번 묻는다)
  ③ 칸 셋이 팝오버의 대부분을 차지해, 정작 목적인 기회 선택기가 위에 한 줄로 밀렸다.
  기회를 고르지 않으면 거래처는 **지시문과 첨부에서** 나온다.
- **예시 지시문은 기본 셋(코드) + 내 예시(`PromptPreset` 표)다.**
  기본 셋은 `@/lib/prompt-preset` 의 `DEFAULT_PROMPT_PRESETS` 이고 **지울 수 없다** —
  처음 온 담당자가 "무엇을 어떻게 적으면 되는지" 배우는 유일한 단서라, 지워질 수 있으면
  빈 레일만 남는 날이 온다. 표에 넣지 않았으므로 id 가 없고, 그래서 삭제 라우트로 **닿을
  수가 없다** — 화면 규칙이 아니라 구조다. 마음에 들지 않으면 `복사` 로 내 예시로 가져와
  고친다(원본은 남는다). 검증(`parsePromptPreset`)은 화면과 서버가 같은 함수를 쓰고,
  기본 예시와 같은 문구·내 예시끼리 중복을 거절한다 — 레일에 같은 줄이 두 번 뜨면 어느
  것을 눌러야 하는지, 지울 수 있는 것과 없는 것이 무엇인지 알 수 없다.
  화면은 둘을 **왼쪽 굵은 선**으로 구분한다(색만으로 구분하지 않는다 — ACC_*).
  편집은 레일이 아니라 **다이얼로그 한 곳**에서 한다 — 17rem 레일에 항목마다 아이콘을
  붙이면 문구가 두 글자씩 접힌다. 조직 단위인 이유는 `EmailTemplate` 의 팀 공용 프리셋과
  같다(예시 지시문은 "우리 팀이 이렇게 쓴다" 는 관행이다).
- **마감된 기회에는 문서 생성 진입점을 노출하지 않는다** (F-211). 기회 상세의 `문서 작성`(헤더)과
  `새 문서 생성`(연관 문서 패널) 둘 다 감추며, 판정은 상세 화면이 한 번만 하고 하위 컴포넌트는
  `canCreateDocument` 를 받아 쓴다(같은 규칙이 두 곳에 있으면 갈라진다). **`기존 문서 연결`은
  마감 뒤에도 열어 둔다** — 실물 계약서를 뒤늦게 붙이는 일은 있다. 서버는 마감 기회로의 생성을
  막지 않는다 — 감춘 것은 안내이지 제약이 아니고, 연결 자체가 허용되는 동작이기 때문이다.
- **발송 화면의 받는 사람은 연결된 기회의 대표 담당자에서 파생된다.** 조회는 `@/lib/opportunity-recipient` 한 곳뿐이고 대표 판정은 `@/lib/contact` 의 `primaryContact()` 가 단일 기준이다. **비어 있거나 직전 자동 채움 값 그대로일 때만** 덮어쓰며, 채웠다는 사실과 출처를 화면에 밝힌다 — 대표가 없거나 이메일이 비면 **채우지 않고 그 이유를 안내한다**(빈 값을 채운 척하면 확인 없이 보낸다). 발송 후에는 연결된 기회 상세로 돌아가되 `router.push` 전에 `router.refresh()` 로 캐시를 비운다 — 발송이 단계를 자동 전이시키므로 비우지 않으면 전이 전 단계가 보인다.
- **폼 다이얼로그는 본문만 스크롤시킨다.** 껍데기는 `flex flex-col max-h-[90svh] overflow-hidden`, 본문(form)에 `min-h-0 flex-1 overflow-y-auto`. 다이얼로그 전체에 `overflow` 를 걸면 제목·저장 버튼·닫기(×)까지 함께 밀려 올라간다. 높이는 내용에 맞추고 화면을 넘길 때만 스크롤한다.
- **팝업 안의 목록도 목록 화면과 같은 규칙을 따른다** — `table-fixed` + 컬럼별 명시 폭, 말줄임+`title`, 금액 `tabular-nums`, 그리고 **결과 0건에도 머리행을 남긴다**(표가 통째로 사라졌다 나타나면 폭이 다시 튄다).
- **다이얼로그 안에서 비동기로 채워지는 내용은 자리를 미리 잡아 둔다.** 다이얼로그는
  `translate(-50%,-50%)` 로 화면 중앙에 고정되므로 **높이가 바뀌면 위·아래가 함께
  움직인다** — 열림 애니메이션이 끝난 뒤에 튀면 사용자에게는 오작동으로 보인다.
  실측: `기존 문서 연결` 이 불러오는 동안 한 줄 안내만 그렸다가 응답이 오면 검색칸+표로
  바뀌어 239px → 449px 로 커지며 y 가 330 → 225 로 **105px 위로 튀었다**. 그래서
  `LinkableDocumentPicker` 는 검색칸과 표 틀을 **항상** 그리고, 불러오는 중·오류·후보
  없음·검색 결과 없음을 모두 **틀 안의 한 행**으로 표현한다.
  스크롤 상자 높이는 `max-h` 가 아니라 **고정(`h-56`)** 이다 — `max-h` 면 행 수에 따라
  자라고 줄어들어 검색어 한 글자마다 같은 튐이 반복된다(실측: 38행 → 1행에서 449px →
  319.5px, y 225.5 → 290.3). `결과 0건에도 머리행을 남긴다` 규칙의 **높이 판**이다.
- **담당자 연락처는 `@/lib/contact` 의 `normalizePhone` 으로 저장 시 정규화**하고 `isPhone` 으로 판정한다(사업자번호와 같은 선례). 같은 번호가 표기만 달리 저장되면 목록 표기가 입력 방식에 따라 갈리고 번호로 찾거나 중복을 가려낼 방법이 사라진다. 이메일은 `@/lib/validation` 의 `isEmail` 을 재사용한다 — 검증 규칙을 새로 만들지 않는다. **거래처 등록 팝업에서만** 담당자를 여러 줄 입력하고(저장은 거래처 생성과 한 트랜잭션), **수정 팝업에는 두지 않는다** — 상세의 담당자 카드가 단일 편집 경로다.
- **단계 진행 표시(스테퍼·흐름 안내)는 `@/lib/opportunity-progress` 의 순수 함수를 쓴다.** 목록과 상세가 같은 계산을 공유해야 표현이 어긋나지 않는다. 이 모듈은 읽기 전용이며 단계를 바꾸지 않는다. 트랙 끝의 **마감 노드는 항상 1개**다 — 진행 중이면 회색 `수주/실주`(앞으로 갈 곳), 마감되면 실제 결과 하나가 채워진다. 수주·실주를 **갈래(2step)로 벌리지 않는다** — 둘을 나란히 띄우면 화면이 "둘 중 하나를 고르는 단계"처럼 읽힌다.
- **지나온 구간은 `stage` 하나로 단정하지 않는다.** 마감된 기회는 어느 단계에서 마감했는지가 활동 이력(ActivityLog)에만 남으므로, `opportunityProgress(stage, history)` 에 이력의 `from`/`to` 를 넘겨 도달 지점을 도출한다(`reachedOpenStage`). 상단(진행 단계)과 하단(이력)이 같은 출처를 봐야 "제안에서 실주했는데 검토/협상까지 지나온 것으로 보이는" 어긋남이 생기지 않는다. 이력을 **새로 조회하지 말고** 화면이 이미 읽은 것을 재사용한다. 이력이 없으면 초기까지만 지나온 것으로 본다(모르면 덜 주장한다).
- **목록 페이지네이션은 `@/lib/pagination` + `@/components/list-pagination` 을 쓴다.** 페이지는 URL 쿼리(`?page=`)로만 주고받는 **서버 페이지네이션**이며, 페이지 크기는 `LIST_PAGE_SIZE` 상수 하나다. 페이지 UI 는 **1페이지뿐이어도 노출**한다(이전·다음 비활성) — 결과 수에 따라 나타났다 사라지면 표 아래가 들썩이고 이 목록이 페이지로 나뉘는 화면인지도 알 수 없다. **0건일 때만** 감추고 그 자리에 빈 상태 안내를 둔다. 검색·필터를 바꿀 때는 툴바가 `nextListSearch` 로 page 를 1로 되돌린다(3페이지에 머문 채 조건을 좁히면 빈 화면이 뜬다). 총 건수·합계는 **필터를 적용한 전체**를 기준으로 내고, 건수 조회는 목록 조회와 `Promise.all` 로 병렬화한다. 기회 **칸반 보기는 페이지네이션 대상이 아니다** — 전체가 보여야 파이프라인이 성립한다.
- **메일 발송 이력(`/mail/sent`)의 조회 조건·정렬은 `@/lib/email-log` 순수 함수가 단일 기준이다.**
  `EmailLog` 에는 `orgId` 컬럼이 **없다** — 조직 범위를 `{ document: { orgId } }` 관계 필터로
  걸고, 그 조건을 화면이 아니라 `emailLogsWhere()` 한 곳에 둔다(목록 조회와 건수 조회가 같은
  범위를 써야 한다). 단건 조회도 `findFirst({ where: { id, document: { orgId } } })` 이며
  없는 이력과 남의 이력은 **같은 404** 다. 상태·열람 여부는 **정렬이 아니라 필터**로 준다
  (값이 두세 가지뿐이라 정렬하면 뭉치만 생긴다 — 단계·담당자와 같은 판단).
  **발송 실패 건에는 열람을 적지 않는다**(`emailOpenState` → `—`) — 나가지 않은 메일의
  "기록 없음" 은 "보냈는데 아직 안 봤다" 로 읽힌다. 목록 select 에 본문(`body`)을 넣지 않고 상세에서만 읽는다.
  발송 상세는 **다이얼로그가 아니라 라우트**(`/mail/sent/:id`)다 — 행 전체 클릭 덮개
  (`RowLink`)의 목적지가 주소여야 새 탭·주소 복사·키보드 이동이 그대로 되고, 목록 10건의
  본문을 미리 클라이언트로 내려보내지 않는다.
- **오픈 트래킹은 "확인된 것만" 주장한다 — 화면에 `미열람` 이라고 쓰지 않는다** (F-234).
  기록은 수신자의 메일 앱이 본문의 1×1 픽셀을 불러왔을 때만 남으므로 **양방향으로 부정확**
  하다: 이미지 차단(대부분의 앱 기본값)이면 읽었는데 기록이 없고, 앱·보안 프록시의
  프리페치(Gmail 이미지 프록시)면 안 읽었는데 잡힌다. 그래서 낱말이 `열람 여부`(있음/없음의
  단정)가 아니라 **`열람 확인`** 이고, 기록이 없는 칸은 **`기록 없음`** 이다 — 금액에 관해
  지키는 태도("틀린 말이 아무 말도 하지 않는 것보다 나쁘다")를 열람에도 적용한다.
  라벨·ⓘ 문구는 `@/lib/email-log` 한 곳에 두고(`EMAIL_OPEN_*`) 목록·상세·필터가 같은 말을
  쓴다. **판정은 두 모듈로 나뉜다** — "어떻게 기록되는가" 는 `@/lib/email-tracking`,
  "무엇으로 보여줄 것인가" 는 `@/lib/email-log` 의 `emailOpenState` 다.
- **추적 식별자는 추측 불가능한 난수(UUID v4)여야 한다.** `GET /api/mail/track/:trackingId` 는
  **인증 없이** 열려 있다(부르는 쪽은 수신자의 메일 앱이라 세션이 없다) — 그래서 조직 범위로
  좁힐 수가 없고 `trackingId` 의 무작위성이 유일한 방어선이다. 라우트는 성공·실패에 상관없이
  **같은 이미지 한 장**만 돌려준다: 모르는 id 도 200 + 픽셀이다(404 로 갈리면 유효한 id 를
  찾는 탐색 도구가 되고, 고객 메일에 깨진 이미지가 뜬다). 캐시 금지 헤더는 필수다 —
  캐시되면 두 번째 열람이 서버에 오지 않아 `openCount` 가 1 에서 멈춘다.
  갱신은 **원자적으로** 한다: `openedAt: null` 인 행만 골라 시각+횟수를 함께 올리고
  (`updateMany`), **그 결과가 0건일 때만** 횟수를 따로 올린다. 조건 없이 두 번 부르면 첫
  열람이 2회로 잡히고, `findFirst` 로 읽어 `openCount + 1` 을 쓰면 동시 요청에서 증가가
  유실된다(실측: 5개 동시 요청 → 5, `openedAt` 은 가장 먼저 도착한 시각 하나).
- **픽셀 주소는 절대 주소여야 하고, 주소가 없으면 픽셀을 넣지 않는다.** 픽셀은 수신자의 메일
  앱이 불러오므로 상대 경로는 아무 곳도 가리키지 않는다 — 기본 주소는 `.env` 의
  `APP_BASE_URL` 이고 검증은 `parseAppBaseUrl()` 하나다. 없으면 `withTrackingPixel` 이
  **본문을 그대로 돌려준다**(깨진 이미지가 고객 메일에 박히는 것이 열람 기록을 잃는 것보다
  나쁘다) 대신 발송 라우트가 그 사실을 로그로 남긴다 — `mailer.ts` 가 자격증명 없을 때 이유를
  남기는 것과 같은 판단. 픽셀은 본문 **맨 끝(닫는 `</body>` 직전 · 서명 뒤)** 이다: 서명은
  사용자가 붙여 넣은 HTML 조각이라 닫히지 않은 태그가 있을 수 있고, 그 앞에 두면 서명
  마크업에 빨려 들어가 클라이언트가 통째로 지운다. **텍스트 파트에는 넣지 않는다**(태그가
  글자로 보인다).
- **아직 남은 것: 픽셀을 실제로 실어 보내는 일.** `POST /api/documents/:id/send` 는 이력만
  남기고 **메일을 내보내지 않는다**(F-232 PDF 첨부 · F-233 실전송이 미구현 — `sendMail` 을
  부르는 곳이 저장소 전체에 없다). 그래서 발송마다 `trackingId` 는 저장되지만 픽셀이 나가지
  않아 열람이 쌓이지 않으며, ⓘ 문구가 그 사실도 함께 밝힌다. 전송이 붙는 자리는 한 줄이다 —
  `sendMail({ text: 본문, html: withTrackingPixel(본문HTML, baseUrl, log.trackingId) })`
  (`scripts/mailer.test.mts` §10 이 그 계약을 fetch 스텁으로 고정해 두었다).
  **본문이 텍스트뿐인 발송에 픽셀을 억지로 끼우지 않는다.**
- **수신함(`/mail/inbox`)은 골격뿐이며 목업 수신 메일을 만들지 않는다** — 가짜 스레드를 채우면
  나중에 진짜와 구분할 수 없다(`/api/generate/batch` 목업이 남긴 교훈). 실구현에 필요한
  연동 방식·스키마·토큰 저장은 `docs/MAIL-INBOX.md` 에 정리했다.
- **목록 행 전체 클릭은 `@/components/list-row-link` 를 쓴다.** `onClick` + `router.push` 로 행을 이동시키지 않는다 — `RowLink` 의 `::after` 덮개가 행을 채우므로 JS 없이 동작하고 키보드 Tab·Enter·새 탭이 그대로 된다(정책 ACC_*). 행에 `ROW_LINK_ROW`, 행 안의 다른 링크·`⋯` 메뉴 칸에 `ROW_LINK_ABOVE` 를 함께 붙인다.
- **사이드바는 담당자 포털 하나뿐이다** (2.0.0). `userNav` 가 유일한 진입 경로이고, 관리자 콘솔은
  랜딩·사이드바에서 링크를 걷어냈다 — MVP 에는 인증이 없어(`session.ts` 가 데모 사용자 1명 고정)
  "관리자"라는 주체를 화면으로 나눌 근거가 없고, 두 콘솔을 나란히 노출하면 담당자가 어느 쪽에서
  무엇을 고치는지 매번 헷갈린다. **`adminNav` 를 지우지 않는다** — `(admin)/layout.tsx` 가 읽고,
  잔존 화면(통계·팀원·요금·메일 도메인)은 주소로 들어가면 그대로 동작해야 한다.
  옮긴 항목은 `adminNav` 에서 **빼고** 옛 라우트는 옮긴 자리로 **리다이렉트**한다 — 같은 폼을 두
  곳에서 렌더하면 한쪽만 손봤을 때 어느 쪽이 실제로 저장되는지 알 수 없다.
  **묶음(children)이 있는 항목의 부모 href 는 첫 하위 항목과 같게 둔다** — 묶음 자체를 위한 페이지를
  새로 만들지 않는다. 그래서 사이드바의 묶음 강조는 부모가 아니라 **하위 항목까지 보고** 판단한다.
- **사이드바의 세로 골격은 세 조각이다 — 로고·목록·프로필 줄.** 로고와 프로필 줄은 `shrink-0`,
  가운데 목록만 `min-h-0 flex-1 overflow-y-auto` 다. **`min-h-0` 이 빠지면 스크롤이 생기지
  않는다** — flex 자식의 기본 `min-height: auto` 는 내용보다 작아지기를 거부하므로, 목록이
  자기 내용 높이로 버티며 넘쳐 흐른다. 실측(1440×**700**): 목록이 760px 로 버텨
  `scrollHeight === clientHeight === 760` · `overflow-y: visible` 이 되고, 프로필 줄이
  `y=795` 로 밀려 화면 밖으로 나가 **통째로 잘렸다**(바깥칸이 `overflow-hidden` 이라 스크롤로
  닿을 수도 없다). 사용자가 말한 "스크롤이 생기지 않는다"와 "하단 프로필 고정영역이 그대로
  내려간다"는 **원인이 하나**다. 로고 줄에 `shrink-0` 이 없으면 같은 상황에서 로고가
  63 → 35px 로 눌린다 — `h-16` 은 flex 축소를 막아 주지 않는다.
- **`설정` 묶음은 없다 — 설정은 사이드바 맨 아래 프로필 메뉴다** (설정 7). 담겨 있던 둘이
  각자 제 집으로 갔다: **품목 카탈로그는 문서 보관함의 설정**이라 그 묶음으로, **회사 정보는
  계정 정보·보안과 같은 화면의 탭**이라 프로필 메뉴로. 한 화면의 탭 셋이 사이드바 두 곳으로
  흩어지면 어디서 무엇을 고치는지 매번 헷갈린다 — 실제로 그 전에는 프로필 줄과
  `설정 > 회사·프로필` 이 **이름만 다른 같은 링크**였다(사용자 피드백).
  프로필 줄은 **링크 하나**다(`/settings/profile`). 한때 탭 셋을 고르는 **드롭다운 메뉴**로
  만들었다가 걷어냈다 — 목적지가 결국 한 화면이라 메뉴는 **누르는 횟수만 한 번 늘리고**,
  고른 뒤에도 같은 탭 줄이 화면에 다시 나와 같은 선택지를 두 번 보여 준다(사용자 피드백).
  링크로 들어가면 탭이 바로 거기 있다. **사이드바에서 특정 탭을 지목하지 않는다** — 그래서
  `NavChild` 에 `tab` 같은 필드를 두지 않는다(쓰지 않는 필드는 다음 사람이 쓸 자리를 찾는다).
  트리거 둘째 칸은 **역할이 아니라 `설정`** 이다: 역할(`영업 담당자`)은 위 브랜드 줄의
  `영업 담당자 포털` 과 겹쳐 읽혔고 정작 이 줄이 하는 일은 어디에도 적혀 있지 않았다
  (역할은 문 안쪽 프로필 히어로의 배지에 그대로 있다). 그래서 `AppSidebar` 는 `roleLabel` 을
  **받지 않는다** — 쓰지 않는 값을 받으면 호출측이 매번 계산해 넘긴다.
  **주소의 접두사와 사이드바의 자리는 같아야 할 이유가 없다** — `메일 연동`·`메일 템플릿`
  (`/settings/*`)은 `메일` 묶음에, 품목 카탈로그(`/settings/catalog`)는 문서 보관함 묶음에 있다.
- **품목 카탈로그는 담당자 포털의 `/settings/catalog` 다** (관리자 콘솔 `마스터 데이터 관리` 에서 이전).
  카탈로그를 쓰는 사람은 견적서를 쓰는 담당자이고, 에디터 품목표의 자동완성(`catalog-combobox`)이
  보는 데이터도 이것이다 — 고치는 자리와 쓰는 자리가 다른 콘솔에 있을 이유가 없다.
  **사이드바에서는 `문서 보관함` 묶음에 있다** — 문서함의 설정이라는 뜻이다. `내 문서함` **앞**에
  두는데, 폴더 트리가 `내 문서함` 의 자식으로 그려지므로 그 뒤에 오는 항목은 들여쓰기 한 단계
  차이뿐이라 트리의 일부로 읽힌다(앞의 둘은 재료, 뒤가 결과물이라는 순서도 된다).
  옮기면서 **목록 규칙을 그대로 적용했다**: 검색·카테고리·정렬·페이지는 URL 쿼리로만 주고받고
  (`@/lib/catalog` + `@/lib/pagination` + `@/components/list-sort-header`), 서버가 잘라 내려준다.
  카테고리 탭은 **필터를 걸지 않은 조직 전체**에서 뽑는다 — 필터 결과에서 뽑으면 하나를 고른 순간
  나머지 탭이 사라져 되돌아올 길이 없다. 행 전체 클릭(`RowLink`)은 **두지 않았다**: 품목 상세 화면이
  없어 갈 곳이 없고, 눌러도 아무 일이 없는 덮개는 사용자를 한 번 속인다. 상세가 생기면 그때 붙인다.
- **품목 등록·수정·삭제는 실제로 저장한다** (2.0.0 · 목업 제거). 라우트는 `POST /api/catalog` ·
  `PATCH`·`DELETE`·`GET /api/catalog/:id` 이고, 단건 조회는 **조직 범위**(`findFirst({ id, orgId })`)
  다 — 없는 품목과 남의 품목은 같은 404 다. 검증은 `@/lib/catalog` 의 `parseCatalogInput()`
  **하나**이고 화면(폼)과 서버가 같은 함수를 지난다(카테고리·품목명 필수, 길이 상한, 단위는
  비우면 `EA`). **단가 파싱은 `parseIntInput()` 을 재사용한다** — 캔버스·인스펙터와 같은 함수다.
  파서를 새로 만들면 같은 `1,200,000.5` 가 카탈로그에서만 다르게 저장되고 그 품목을 견적서에
  꽂는 순간 단가가 갈린다(에디터에서 이미 겪은 사고다). 상한은 **Prisma `Int` = 32비트**라
  `CATALOG_UNIT_PRICE_MAX` 로 앱이 먼저 막는다 — 안 막으면 드라이버 오류가 그대로 화면에 뜬다.
  **등록과 수정은 폼 다이얼로그 한 벌**을 공유하고(상세 화면이 없으므로 목록에서 편집한다 —
  거래처 목록과 같은 골격), 활성 토글만 목록에서 바로 바꾼다. 토글은 `{ isActive }` 하나만
  보내고 서버가 `withCatalogDefaults()` 로 나머지를 현재 값으로 채운다 — **토글 전용 라우트를
  만들지 않는다**(기회 상세 인라인 수정과 같은 규칙: 검증이 두 벌이면 제약이 갈린다).
- **`isActive` 는 "에디터 품목 선택 목록에 뜨는가" 다 — 지우는 대신 내려두는 길이다.** 판매를
  끝낸 품목을 지우면 이름만 남은 지난 견적서를 나중에 대조할 수 없다. 목록에서는 **기본 필터로
  감추지 않고** 색만으로도 구분하지 않는다(정책 ACC_*) — 상태 칸의 글자(`활성`/`비활성`)와
  품목명 앞의 감춤 아이콘 **모양**으로 함께 알린다.
- **SKU 중복은 막지 않고 알린다.** 스키마에 유니크 제약이 없고(`sku String?`), 앱 검사만으로는
  ① 동시 요청 두 건이 나란히 통과하고 ② 이미 중복이 저장된 조직에서는 단가만 고치려는 수정까지
  막힌다 — 없는 제약을 있는 척하는 셈이다. SKU 는 사내 품번·거래처 코드 같은 **외부 식별자**라
  같은 제품의 단위·옵션별 행이 한 코드를 공유하는 것이 정상이고, 카탈로그를 고르는 유일한 경로
  (에디터 자동완성)도 **품목명**으로 찾는다. 그래서 저장 응답에 `duplicateSkuCount` 를 실어
  화면이 toast 로 알린다. 앱 레벨 강제는 **대표 담당자처럼 불변식인 값**에만 쓴다.
- **품목 삭제는 문서가 있어도 막지 않는다 — 확인창이 결과를 미리 말한다.** 문서의 품목표는
  카탈로그를 참조하지 않고 담을 때 이름·단가를 **복사**하므로(`contentJson` · `DocumentItem`),
  지워도 이미 만든 문서의 품목·금액은 그대로다(거래처 삭제를 연관 기회로 막는 것과 다르다 —
  그쪽은 Cascade 로 기록이 실제로 사라진다). 확인창은 ① **품목명이 같은** 문서가 몇 건인지
  (`catalogUsageWhere` — 이어 주는 열이 없어 이름으로 센다. 그래서 문구도 "품목명이 같은 문서"
  라고 적는다. 링크가 있는 척하지 않는다) ② 그래도 금액은 바뀌지 않는다는 사실 ③ 지우는 대신
  비활성으로 내리는 길을 함께 말한다(문구는 `catalogDeleteMessage()` 한 곳). 문서 수는 **확인창을
  열 때 한 번만** 가져온다 — 목록 행마다 세면 페이지를 볼 때마다 조회가 10배로 는다.
- **`엑셀 업로드` 버튼은 걷어냈다** — 누르면 "준비 중입니다 (데모)" toast 만 뜨는 목업이었다.
  실제 일괄 등록은 열 매핑·미리보기·오류 행 안내에 **중복 정책**(같은 SKU·품목명을 갱신할지
  건너뛸지)까지 필요한 별개의 기능이고, `@/lib/attachments` 의 엑셀 추출은 **프롬프트용 TSV
  텍스트**(시트 목록 머리글·병합셀 공백·길이 잘림)라 표로 되짚어 읽기에 맞지 않는다 — 재사용처럼
  보이지만 실은 파서를 새로 만드는 일이다. 있는 척하는 버튼은 남기지 않는다(수신함에 가짜 메일을
  채우지 않은 것과 같은 판단). 되살릴 때는 CRUD 와 같은 `parseCatalogInput()` 을 행마다 통과시킨다.
- **설정 값은 "개인이냐 회사냐" 로 나눈다** (설정 7). 직함·연락처는 사람마다 다르므로 `User`
  (`position`·`phone`), 상호·대표자·사업자등록번호·주소·대표 연락처·로고·인감은 조직 단위이므로
  `Branding`(`companyName`·`ceoName`·`bizRegNo`·`address`·`phone`·`logoUrl`·`stampUrl`)이다.
  조직 쪽에 개인 값을 두면 팀원이 늘 때 서로의 값을 덮어쓴다. **같은 항목을 두 탭에 두지 않는다** —
  문서에 어느 값이 박히는지 알 수 없다. 화면은 `/settings/profile` 의 세 탭
  (`계정 정보 · 회사 정보 · 보안`) 하나이고 저장은 `PATCH /api/profile` · `PATCH /api/branding` 뿐이다.
  **열린 탭은 주소(`?tab=`)에 있다** — 목록 정렬·페이지·캘린더의 달과 같은 규칙이다. 세 탭 중
  둘(`회사 정보`·`보안`)은 스크롤이 길어서, 새로 고칠 때마다 첫 탭으로 돌아가면 고치던 자리를
  다시 찾아 들어와야 한다. `ProfileTabs` 는 **제어 컴포넌트**다(`defaultValue` 로 두면 주소만
  바뀌는 이동에서 탭이 따라오지 않는다 — 같은 라우트라 다시 마운트되지 않는다).
  탭을 바꿀 때는 `router.replace` 가 아니라
  **`window.history.replaceState`** 를 쓴다: App Router 가 이 호출을 알아보고 `useSearchParams`
  를 갱신하므로 주소는 맞춰지면서 **서버 왕복이 없다**(`replace` 는 탭마다 RSC 를 다시 받는다).
  모르는 값은 첫 탭으로 떨어뜨린다.
  전부 **선택 입력**이다 — 회사 정보를 아직 채우지 않은 조직도 문서를 만들 수 있어야 한다.
- **회사·프로필 검증은 새로 만들지 않는다.** 사업자등록번호는 거래처와 같은 `@/lib/account` 의
  `normalizeBizRegNo`·`isBizRegNo`, 연락처는 담당자와 같은 `@/lib/contact` 의
  `normalizePhone`·`isPhone`, 이메일은 `@/lib/validation` 의 `isEmail` 이다 — 규칙이 두 벌이 되면
  같은 값이 화면마다 다르게 저장되고, 번호로 찾거나 중복을 가려낼 방법이 사라진다
  (`scripts/settings.test.ts` 가 이 경계를 지킨다).
- **로고·인감은 dataUrl 로 컬럼에 들어간다** — 별도 파일 저장소가 없고, 에디터 이미지 블록도 같은
  방식이다. 그래서 이미지 상한(`MAX_BRANDING_IMAGE_BYTES` = 1MB)이 곧 DB 행 크기의 상한이며
  **화면과 서버가 같은 순수 함수(`brandingImageError`)로 판정한다** — 화면에서만 막은 것은 막은 것이
  아니다(문서 `contentJson` 상한에서 이미 배운 규칙과 같다). base64 길이는 4글자 → 3바이트로
  되짚어 잰다(문자열 길이를 그대로 재면 33% 더 크게 잡혀 정상 파일이 거절된다).
- import alias 는 `@/*` = `src/*`.
- **서버가 읽는 상수는 `"use client"` 파일에서 export 하지 않는다.** 클라이언트 모듈의
  export 는 번들러가 **클라이언트 참조로 바꿔** 놓으므로, 서버 컴포넌트가 import 하면 값이
  아니라 함수 같은 프록시를 받는다. 실제로 `OPPORTUNITY_PEEK_LIMIT` 을 팝오버 컴포넌트에
  두었다가 거래처 목록이 `take: [object Function]` 으로 죽었다. **타입은 `number` 로 보여
  `typecheck`·`lint`·`build` 가 모두 통과하고 런타임에만 터진다** — 그래서 규칙으로 막는다.
  양쪽이 함께 보는 값은 `@/lib/constants` 같은 **순수 모듈**에 두고 각자 import 한다
  (`LIST_PAGE_SIZE` 가 선례다). 클라이언트끼리만 쓰는 상수는 그 자리에 둬도 된다.
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

## AI 문서 생성 (Claude / GPT / Gemini)

문서 생성·표준 양식 세팅·부분 재작성은 **실제 LLM API 를 직접 호출**한다. 목업 폴백은 없다.

### 프로바이더

Claude(Anthropic Messages API) · GPT(OpenAI Responses API) · Gemini(Google generateContent)
**셋을 모두 지원하고, 사용자가 화면에서 모델을 고른다.**

- **선택 목록은 서버가 정한다** — `lib/ai/models.ts` 의 `AI_MODEL_CATALOG` 가 단일 소스.
  모델 세대가 바뀌면 이 배열만 갱신한다 (호출 코드는 건드리지 않는다).
- **키가 설정된 프로바이더의 모델만 노출한다** (`lib/ai/model-access.ts` 의 `availableModels`).
- **요청으로 들어온 모델 id 는 반드시 검증한다** (`resolveRequestedModel`).
  카탈로그 밖 모델은 `400`, 키 없는 프로바이더는 `503`.
  → 클라이언트가 보낸 임의 문자열을 그대로 호출하면 비용·오류를 통제할 수 없다.
- 선택기가 붙는 곳: **문서 생성 · 표준 양식 AI 세팅 · AI 부분 재작성**.
  변수 필드 추출(F-204)은 경량 경로라 선택기 없이 `AI_MODEL_BATCH` 를 쓴다.
- 크레딧은 **모델 등급과 무관하게 동일**하다 (생성 10 / 양식세팅 10 / 재작성 5).

사용자가 고르지 않았을 때의 기본 프로바이더 판별 순서:

1. `AI_PROVIDER`(`anthropic` | `openai` | `google` | `mock`) 를 명시하면 그대로 따른다.
2. `AI_MODEL_GENERATE` 모델명으로 판별한다
   (`claude*`→anthropic, `gpt*`·`o1/o3/o4*`→openai, `gemini*`→google).
3. 쓸 수 있는 키가 하나뿐이면 그 프로바이더를 쓴다. 그래도 모르면 anthropic.

**로컬 검증용 목 프로바이더**: `AI_PROVIDER=mock` 으로 켜면 **화면에서 어떤 모델을 골라도**
실제 LLM 을 호출하지 않고
스키마에 맞는 응답을 즉시 돌려준다. 키·비용 없이 생성→에디터→버전→크레딧 경로를
결정적으로 확인할 때 쓴다. **문장 품질·추론 정확도는 검증되지 않는다.**
자동 선택되지 않으며(명시해야 켜짐), `NODE_ENV=production` 에서는 어댑터가 거부한다
— 가짜 견적서가 고객에게 발송되는 사고를 코드로 차단한다.

- **키 필수**: `ANTHROPIC_API_KEY` · `OPENAI_API_KEY` · `GEMINI_API_KEY`.
  없거나 형식이 틀리면 `503`, 호출 실패 시 `502` 를 반환한다.
  키 형식을 호출 전에 검사해 원인을 알려준다 — 특히 `sk-ant-oat…`(Claude Code 로그인 토큰)은
  Messages API 에 쓸 수 없으므로 "키가 없다"가 아니라 무엇을 넣어야 하는지 안내한다.
- **모델은 용도별 분리** (환경변수로 오버라이드): `AI_MODEL_GENERATE` = 선택기 기본값,
  `AI_MODEL_BATCH` = 변수 필드 추출 등 경량 작업.
- **프로바이더별 코드는 `lib/ai/providers/` 안에만 둔다.** 프롬프트 조립부는
  `lib/ai/blocks.ts` 의 중립 블록(`text`·`image`·`pdf`)만 만들고, 요청 형식 변환은 어댑터가 한다.
  → 프로바이더를 추가할 때 프롬프트·스펙 코드를 건드리지 않는다.

### 공통 규칙 (프로바이더 무관)

- **응답은 구조화 출력(JSON Schema)으로 고정한다.** 모델이 좌표를 직접 만들지 않고
  의미 기반 스펙(DocSpec)만 반환하며, 블록 배치는 `lib/ai/doc-spec.ts` 의 결정적 코드가 담당한다.
  → 양식이 있으면 **양식 레이아웃·문구·공급자 정보를 보존**하고 거래처 필드·품목표만 채운다.
- 스키마는 **3사 공통 제약을 지킨다**: 모든 object 에 `additionalProperties:false`,
  전 속성을 `required` 에 넣고(OpenAI strict), `allOf`·`not`·`if/then/else` 를 쓰지 않는다.
  Gemini `responseJsonSchema` 가 지원하는 키워드만 사용한다
  (`type` `properties` `required` `additionalProperties` `enum` `items` `anyOf` `minimum/maximum`
  `minItems/maxItems` `title` `description` `$ref`/`$defs`).
- **금액은 항상 서버가 재계산한다** (수량×단가). 모델이 계산한 총액은 신뢰하지 않는다.
- 시스템 프롬프트에는 날짜·사용자명 같은 **가변 값을 넣지 않는다** — 프롬프트 캐시 적중이 깨진다
  (Claude 는 `cache_control`, GPT 는 `instructions` 프리픽스 자동 캐시).
- docx·hwp 는 변환기가 없어 업로드 단계에서 안내 후 거절한다 (PDF·이미지·엑셀·CSV 지원).
- **엑셀 추출은 병합셀을 대표 셀에서 한 번만 읽는다** (`lib/attachments.ts`). exceljs 는 병합 범위의
  모든 셀에 같은 값을 채워주므로 그대로 옮기면 텍스트가 몇 배로 불어나 프롬프트 예산을 잡아먹는다.
  수식 셀의 캐시 결과(Date·리치텍스트·하이퍼링크)는 재귀로 풀어야 한다 — `String(result)` 를 쓰면
  이메일·전화번호가 `[object Object]` 로 들어간다.
- **시트가 많은 워크북은 시트 단위로 예산을 배분한다** (`lib/ai/content.ts` `budgetWorkbook`).
  앞에서부터 자르면 목표 시트가 예산 밖으로 밀려나 모델이 엉뚱한 시트로 문서를 만든다
  (18시트 견적서에서 실제로 발생). 파일명·요청의 낱말과 시트 이름이 겹치는 순서로 넣고,
  맨 앞에 시트 목록(manifest)을 붙여 모델이 어느 시트를 썼는지 밝히게 한다.
- **품목표로 표현할 수 없는 격자 표는 `DocSpec.tables` 로 받는다** (등급 매트릭스·조건표·요율표).
  이게 없으면 원본 양식의 표가 이관 과정에서 통째로 사라진다.

## MVP 범위 / 주의사항

- **인증 없음**: `src/lib/session.ts` 가 데모 고정 사용자/조직을 반환한다. 실제 인증(NextAuth 등) 도입 시 이 모듈만 교체하면 된다.
- 일부 쓰기 액션(폼 제출 등)은 `sonner` toast 목업이다. 실제 저장이 필요하면 `/api/*` 를 확장한다.
- `/api/generate/batch`(폴더 일괄 변환)는 **여전히 데모 목업**이다 — 파일명만 받아 기준본을 복제한다.
- **에디터의 품목 카탈로그 조회에 `isActive` 필터가 없다.** `(user)/editor/[documentId]/page.tsx`
  와 `(user)/editor/template/[templateId]/page.tsx` 의 `prisma.catalogItem.findMany` 가
  `where: { orgId }` 만 걸어 **비활성 품목까지** 품목표 자동완성(`catalog-combobox`)에 내려간다
  (실측: 비활성 품목이 `catalog` prop 에 실려 목록 첫 줄에 떴다). `isActive` 의 뜻이 "선택 목록에
  뜨지 않는다" 이므로 두 조회에 `isActive: true` 를 더해야 한다 — 에디터 파일은 다른 작업 흐름이
  소유하고 있어 이 라운드에서 손대지 않았다. 참고로 `GET /api/catalog?active=1` 이 같은 범위를 준다.
- **메일은 실제로 나가지 않는다** (F-232 · F-233). `src/lib/mailer.ts`(Resend 어댑터)는 완성돼
  있고 테스트도 있지만 **부르는 곳이 없다** — 발송 화면은 `EmailLog` 기록·문서 상태 전환·기회
  단계 전이까지만 한다(toast 도 "실제 메일 전송은 준비 중입니다" 로 그렇게 안내한다).
  전송을 붙일 때는 **PDF 첨부(F-232)를 함께** 붙인다 — 기본 본문이 "첨부된 문서를
  확인해주시기 바랍니다" 라고 적고 화면이 첨부 파일 카드를 보여주므로, 첨부 없이 내보내면
  약속한 파일이 빠진 메일이 고객에게 간다. 참조(CC)·서명도 아직 발송 요청 본문에 실리지
  않으므로(발송 화면이 보내지 않는다) 함께 맞춰야 한다.
- 품목 카탈로그의 `엑셀 업로드`·`품목 추가` 버튼은 아직 목업이다 (조회·정렬·페이지는 실제 DB).
- **로고·인감을 PDF·에디터에 반영하는 것은 아직 하지 않았다.** 꽂을 자리는 두 곳이다 —
  `src/lib/pdf-html.ts` 의 `PdfBranding`(로고는 이미 빈 이미지 블록의 대체값으로 쓰인다. 인감은
  `stampUrl` 을 타입에 더해 같은 방식으로 내려주면 된다)과 `src/lib/editor-schema.ts` 의
  `seedTemplate` → `supplier` 블록(현재 `supplierName` 만 시드한다 — 대표자·등록번호·주소를
  Branding 에서 채우면 공급자 6칸이 비지 않는다).
- 비밀정보는 `.env`(gitignore). 공유는 `.env.example` 로 한다.
- Next.js 16 은 breaking changes 가 있다(상단 블록 참고). `params`·`searchParams` 는 **Promise** 이므로 `await` 한다.
