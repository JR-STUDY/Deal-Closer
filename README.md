# RAINMAKER (Deal-Closer)

AI로 영업 문서(견적서·계약서·NDA·제안서)를 생성하고, 웹에서 편집한 뒤 이메일로 발송하는 **영업 문서 자동화 SaaS MVP**.

- **영업 담당자 포털(user-web)** — 대시보드 · AI 문서 생성 · 웹 에디터 · 이메일 발송 · 문서 보관함 · 메일 연동 · 메일 템플릿
- **관리자 콘솔(admin-web)** — 팀원 관리 · 마스터 데이터 · 요금/크레딧 · 브랜딩 · 통계

## 빠른 시작

전제: Node.js 20+ (권장 22), pnpm 9+

```bash
pnpm install            # 의존성 설치 (postinstall 이 Prisma Client 자동 생성)
cp .env.example .env    # 환경 변수 준비
pnpm db:migrate         # SQLite 마이그레이션 적용
pnpm db:seed            # 데모 데이터 시드
pnpm dev                # http://localhost:3000
```

첫 화면에서 **영업 포털** 또는 **관리자 콘솔** 로 진입할 수 있습니다 (MVP 는 인증 없이 데모 계정으로 동작).

## 주요 명령어

| 명령 | 설명 |
|---|---|
| `pnpm dev` | 개발 서버 |
| `pnpm build` / `pnpm start` | 프로덕션 빌드 / 실행 |
| `pnpm typecheck` | 타입 검사 |
| `pnpm lint` | ESLint |
| `pnpm db:migrate` | 스키마 변경 → 마이그레이션 |
| `pnpm db:seed` | 데모 데이터 시드 |
| `pnpm db:studio` | Prisma Studio (DB GUI) |
| `pnpm db:reset` | DB 초기화 후 재적용 |
| `pnpm doctor` | react-doctor 코드 진단 (보안·성능·정확성) |
| `pnpm doctor:push` | 푸시 전 변경분 검증 (pre-push 훅이 자동 실행) |
| `pnpm doctor:staged` | staged 변경분 점검 (수동) |

## 기술 스택

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui**
- **SQLite** + **Prisma 7** (better-sqlite3 driver adapter)
- 패키지 매니저 **pnpm**

## 콘솔 & 라우트

**영업 담당자 포털 (user-web)**

| 화면 | 경로 |
|---|---|
| 영업 대시보드 | `/dashboard` |
| AI 문서 생성기 | `/generator` |
| 웹 문서 에디터 (블록 캔버스) | `/editor/[documentId]` |
| 이메일 발송 | `/sender/[documentId]` |
| 문서 보관함 (내 문서함) | `/library` |
| 공용문서함 | `/library/common` |
| 메일 연동 관리 | `/settings/email` |
| 메일 템플릿 | `/settings/templates` |
| 프로필 설정 | `/settings/profile` |

**관리자 콘솔 (admin-web)**

| 화면 | 경로 |
|---|---|
| 로그인 | `/auth/login` |
| 통계·리포트 | `/analytics` |
| 팀원 관리 | `/team/members` |
| 마스터 데이터 | `/catalog` |
| 요금·크레딧 | `/billing` |
| 브랜딩 설정 | `/settings/branding` |
| 메일 도메인 설정 | `/settings/mail-domain` |
| 프로필 설정 | `/account/profile` |

## REST API (SQLite 조회 / MVP 목업)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET / POST | `/api/documents` | 문서 목록 / 생성 |
| GET / PATCH / DELETE | `/api/documents/[id]` | 문서 단건 / 수정 / 삭제 |
| POST | `/api/documents/[id]/send` | 이메일 발송 (이력 기록) |
| POST | `/api/generate` | AI 문서 생성 (첨부·참고문서 반영 + 크레딧 차감, 목업) |
| GET | `/api/attachments/[id]` | AI 생성 첨부 파일 다운로드 |
| GET / POST | `/api/folders` | 폴더 목록 / 생성 |
| PATCH / DELETE | `/api/folders/[id]` | 폴더 이름변경·이동 / 삭제 |
| POST | `/api/folders/reorder` | 폴더 형제 순서변경 |
| GET | `/api/catalog` | 카탈로그 |
| GET | `/api/credits` | 크레딧 지갑·거래내역 |
| GET | `/api/stats` | 대시보드 통계 |
| GET | `/api/policies` | 정책 라이브러리 |
| GET | `/api/email-accounts` | 메일 연동 계정 |
| GET / POST | `/api/email-templates` | 메일 템플릿 목록 / 생성 |
| PATCH / DELETE | `/api/email-templates/[id]` | 메일 템플릿 수정 / 삭제 |
| PATCH | `/api/signature` | 메일 서명 저장 |
| GET / POST | `/api/mail-domains` | 팀 발신 도메인 목록 / 등록(관리자) |
| PATCH / DELETE | `/api/mail-domains/[id]` | 팀 발신 도메인 인증·기본지정·별칭 / 삭제 |
| PATCH | `/api/mail-preference` | 담당자 발신 신원 선택(개인 계정 ↔ 팀 도메인) |

## 코드 품질 · CI

- **[react-doctor](https://github.com/millionco/react-doctor)** 로 React 코드의 보안·성능·정확성을 정적 분석합니다 (API 키 불필요).
- **PR 자동 리뷰**: PR 을 열면 `.github/workflows/react-doctor.yml` 이 실행되어 요약 코멘트·인라인 리뷰·커밋 상태를 남깁니다. 초기에는 advisory(항상 통과)이며, 팀 합의 후 CI 게이트로 승격할 수 있습니다.
- **푸시 시 자동 검증**: `git push` 시 husky `pre-push` 훅이 변경분을 스캔해 **새 error 가 있으면 push 를 차단**합니다(기존 warning 은 통과). 팀원은 `pnpm install` 시 자동 활성화됩니다. 우회는 `git push --no-verify`.
- **수동 로컬 점검**: 전체 진단 `pnpm doctor`, staged 변경분 `pnpm doctor:staged`.

## 팀 문서 (룰)

- **[AGENTS.md](./AGENTS.md)** / **[CLAUDE.md](./CLAUDE.md)** — 팀·AI 공용 개발 룰 (스택·컨벤션·DB·커밋)
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — 아키텍처·도메인 모델·데이터 흐름
- **[docs/SPEC.md](./docs/SPEC.md)** — 원본 기획서 요약 (24화면 / 정책 24개)
- **[docs/REACT_BEST_PRACTICES.md](./docs/REACT_BEST_PRACTICES.md)** — React/Next 성능 베스트 프랙티스 (Vercel 70규칙 정리)

## 라이선스

[LICENSE](./LICENSE) 참고.
