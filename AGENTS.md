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
    api/               # REST API Route Handlers (SQLite 조회 / LLM 호출 / 일부 목업)
                     #  generate · templates · documents/[id]/{versions,revise} 는 실제 LLM 호출
                     #  (모델은 사용자가 화면에서 선택 — 서버가 카탈로그로 검증)
    layout.tsx         # 루트 레이아웃 (폰트·Toaster)
    page.tsx           # 랜딩 (콘솔 진입)
  components/
    ui/                # shadcn/ui (직접 수정 지양, CLI 로 관리)
    account/           # 프로필/계정 공용 폼 (profile-form·password-form·profile-tabs, user·admin 공유)
    email-template/    # 메일 템플릿 공용 폼 다이얼로그 (관리 페이지·발송폼 재사용)
    app-sidebar.tsx    # 공용 사이드바
    sidebar-folders.tsx / add-folder-button.tsx  # 보관함 폴더 트리 UI
    signature-html-editor.tsx / signature-preview.tsx  # 메일 서명 편집·미리보기
    provider-logo.tsx  # Gmail/Outlook 브랜드 로고
    page-header.tsx / back-button.tsx / status-badge.tsx / loading-state.tsx  # 공용 UI
  lib/
    db.ts              # Prisma 싱글톤 (DB 접근은 반드시 여기 경유)
    session.ts         # 현재 사용자/조직 (MVP: 데모 고정)
    constants.ts       # enum 대체 상수 + 라벨
    format.ts          # 통화/날짜 포맷
    api.ts             # API 응답 헬퍼(ok/fail)
    nav.ts             # 사이드바 네비게이션 정의 (user/admin)
    validation.ts      # 이메일 수신자 형식 검증·다중 파싱 (VAL_*)
    editor-schema.ts   # 블록 캔버스 문서 모델(contentJson) 파싱·총액/거래처 재도출·시드
    attachments.ts     # 업로드 파일 검증 + 엑셀/CSV 텍스트 추출
    template.ts        # 표준 양식 공용 select·DTO
    document-version.ts # 문서 버전 묶음(rootId) 유틸·최신본 필터
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
    email-template.ts  # 메일 템플릿 치환 변수·검증·DTO
    signature.ts       # 메일 서명 HTML 판별·미리보기 문서·검증
    mail-domain.ts     # 팀 발신 도메인 검증·팀 주소 조합·발신 신원 해석
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
- import alias 는 `@/*` = `src/*`.
- **UI 텍스트는 한국어 존댓말** (정책 COPY-TONE). 접근성·명도대비를 준수한다(ACC_*).
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

## MVP 범위 / 주의사항

- **인증 없음**: `src/lib/session.ts` 가 데모 고정 사용자/조직을 반환한다. 실제 인증(NextAuth 등) 도입 시 이 모듈만 교체하면 된다.
- 일부 쓰기 액션(폼 제출 등)은 `sonner` toast 목업이다. 실제 저장이 필요하면 `/api/*` 를 확장한다.
- `/api/generate/batch`(폴더 일괄 변환)는 **여전히 데모 목업**이다 — 파일명만 받아 기준본을 복제한다.
- 비밀정보는 `.env`(gitignore). 공유는 `.env.example` 로 한다.
- Next.js 16 은 breaking changes 가 있다(상단 블록 참고). `params`·`searchParams` 는 **Promise** 이므로 `await` 한다.
