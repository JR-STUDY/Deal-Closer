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
pnpm test:pagination # 목록 페이지네이션 순수 함수 검증 (DB 없이 실행)

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
    opportunity/       # 기회 공용 — 등록 버튼·폼 다이얼로그, 단계 흐름 안내·진행 스테퍼(표시 전용),
                       #   stage-change(칸반·목록 공용 단계 변경 메뉴·확인창, 키보드 대체 수단)
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
    opportunity.ts       # 기회 검증·금액/날짜 입력 변환·DTO·목록 조회 조건·정렬 (F-111)
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
- **단계 변경 UI 는 드래그 전용으로 만들지 않는다.** 칸반 카드와 목록 행이 `@/components/opportunity/stage-change` 의 ⋯ 메뉴를 공유해 키보드로도 단계를 바꿀 수 있어야 한다 (정책 ACC_*).
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
