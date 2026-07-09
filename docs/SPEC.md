# 기획서 요약 (SpecFlow AI)

> 원본: Lamina 공유 기획서 "해커톤". 전체 화면 24개 · 정책 24개.
> 이 문서는 개발 관점으로 재정리한 요약입니다.

## 서비스 개요

영업 담당자가 **자연어로 영업 문서(견적서·계약서·NDA·제안서)를 생성** → **웹 에디터에서 편집** → **Gmail/Outlook 연동으로 이메일 발송**하는 흐름을 제공한다. 관리자는 팀원·카탈로그(마스터 데이터)·크레딧·브랜딩·통계를 관리한다. 문서 생성 시 **크레딧**이 차감된다.

핵심 사용자 여정:
`영업 대시보드 → AI 문서 생성기 → 웹 에디터 → 이메일 발송`

## 화면 인벤토리 (24)

### 영업 담당자 포털 (user-web)

| 화면 | 경로 | 비고 |
|---|---|---|
| 영업 대시보드 | `/dashboard` | KPI·최근 문서 |
| AI 대화형 문서 생성기 | `/generator` | 자연어 프롬프트 |
| 웹 문서 에디터 | `/editor/:documentId` | 라인아이템 편집 |
| 이메일 발송 | `/sender/:documentId` | 다중 수신자·PDF 첨부 |
| 문서 라이브러리 | `/library` | **내 문서함** — 상태 탭·**폴더 트리 분류**(다단계)·검색/종류 필터 |
| 공용문서함 | `/library/common` | **공용문서함** — 팀 공용 기준 문서(평면 목록) |
| 베이스 템플릿 | `/library/templates` | 재사용 표준 문서 저장·복제 생성 ※MVP 확장 |
| 메일 연동 관리 | `/settings/email` | Gmail/Outlook OAuth |

> **MVP 확장 — 문서 보관함 강화**: 원본 기획서의 "상태 탭·검색"에 더해, 앱 사이드바의 "문서 보관함"을 **내 문서함**(`/library`)과 **공용문서함**(`/library/common`)으로 나눈다. ① 내 문서함은 폴더(다단계 트리)로 분류하고 검색·종류 필터를 제공하며, ② 공용문서함은 팀 공용 기준 문서를 모아 본다. 문서는 둘 중 하나에만 속하며 카드 메뉴로 두 문서함 사이를 이동한다. 스키마는 `Folder` + `Document.folderId`·`Document.isCommon` 로 반영했다.

### 관리자 콘솔 (admin-web)

| 화면 | 경로 |
|---|---|
| 관리자 로그인 | `/auth/login` |
| 통계 및 리포트 | `/analytics` |
| 팀원 초대 및 관리 | `/team/members` |
| 마스터 데이터 관리 | `/catalog` |
| 요금 및 크레딧 관리 | `/billing` |
| 브랜딩 설정 | `/settings/branding` |
| 관리자 프로필 설정 | `/account/profile` |

### Fallback / 상태 화면 (11)

각 콘솔별 빈 상태 / 로딩 / 시스템 오류(500) / 페이지 없음(404) / 점검, 그리고 오프라인(`/offline`).
→ MVP 에서는 Next.js 관례(`loading.tsx`, `error.tsx`, `not-found.tsx`)로 점진 대응.

## 정책 라이브러리 (24)

기획서 정책은 DB `policies` 테이블에 시드된다 (`prisma/seed.ts`). 카테고리별 분류:

- **인증/권한 (AUTH_\*)**: ADMIN/LEADER/SALES_REP 접근 범위, OAuth 연동, 역할 기반 라우팅
- **검증 (VAL_\*)**: 문서 금액 서버 재계산, 카탈로그 엑셀 업로드, 이메일 수신자
- **폼 (FORM_\*)**: 원(KRW) 통화, 백분율, 날짜/시간(UTC 저장·로컬 표시)
- **상태 (STATE_\*)**: 이탈 경고 컨펌, 빈 대시보드, 세션 복구, 오프라인 안내
- **접근성 (ACC_\*)**: 명도 대비(WCAG AA), 터치 타깃 44px
- **법적 (legal-\*)**: 개인정보·이용약관·환불·삭제(국내)·마케팅·접근성
- **카피 (COPY-TONE)**: 정중하고 간결한 존댓말

전체 코드·설명은 `pnpm db:studio` 의 `policies` 테이블 또는 `GET /api/policies` 로 확인한다.

## 참고: 원본 "REST API" 섹션에 대하여

기획서의 REST API 144개는 실제 백엔드 리소스가 아니라 **UI 요소 단위의 액션 스텁**(예: `email_form_recipient`, `catalog_table`)이었다. 본 프로젝트는 이를 그대로 옮기지 않고, 도메인 기반 REST API 로 재설계했다 (`docs/ARCHITECTURE.md` · `README.md` 참고).
