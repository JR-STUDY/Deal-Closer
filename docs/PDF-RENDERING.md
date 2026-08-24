# PDF 렌더링

> 대상: `src/lib/pdf.ts`(서버 전용 렌더) · `src/lib/pdf-html.ts`(인쇄용 HTML 생성)
> 관련: [PRD-IMPLEMENTATION-PLAN.md](PRD-IMPLEMENTATION-PLAN.md) Phase 0-2 · §7 결정 항목

## 방식

블록 캔버스(`Document.contentJson`)는 절대좌표 배치라 HTML 재현이 단순하다.
좌표를 직접 그리지 않고 **인쇄용 HTML → 헤드리스 브라우저 print** 로 PDF 바이트를 만든다.
메일 첨부에 서버 PDF 바이트가 필요하므로 클라이언트 `window.print()` 로는 불가하다.

```
contentJson ─ parseContentJson ─▶ EditorDoc
                                    │
                     public/ 이미지 인라인(data URL)
                                    ▼
                     buildDocumentHtml()  ← 브랜딩 반영
                                    ▼
                puppeteer-core page.pdf() ─▶ Uint8Array
```

`@page` 크기를 캔버스 크기와 일치시켜 **캔버스 1페이지 = PDF 1장**이 되게 한다
(`preferCSSPageSize: true`).

## API

| 함수 | 용도 |
|---|---|
| `renderDocumentPdf({ doc, title, branding?, timeoutMs? })` | `EditorDoc` → `Uint8Array` |
| `renderDocumentPdfFromContentJson({ contentJson, title, branding?, timeoutMs? })` | `Document.contentJson` → `Uint8Array \| null` (내용이 없거나 깨졌으면 `null`) |
| `checkKoreanFonts(timeoutMs?)` | 한글 글꼴 진단 (아래 참고) |
| `resolveChromeExecutable()` | 브라우저 실행 파일 경로 확인 |

### 부르는 곳은 둘, 재료는 하나

| 경로 | 무엇을 하는가 |
|---|---|
| `GET /api/documents/:id/pdf` | 미리보기(`?inline=1`)·다운로드 (F-223) |
| `POST /api/documents/:id/send` | 발송 첨부 (F-232) — 렌더가 실패하면 **전송·DB 기록 전에 502 로 멈춘다** |

둘 다 `@/lib/document-render` 의 `loadDocumentRenderInput()` 에서 **같은 재료**(조직 범위 조회 ·
`contentJson` 이 없을 때의 기본 문서 시드 · 회사 정보)를 받고, 파일명은 `@/lib/document-file` 의
`documentPdfFileName()` 하나가 정한다. 인쇄용 HTML 미리보기(`GET /api/documents/:id/preview`)도
같은 재료를 쓴다 — 세 경로가 각자 조회하면 어느 한쪽만 손봤을 때 **담당자가 화면에서 확인한 것과
다른 PDF** 가 고객에게 첨부되고, 그건 화면으로 알 수 없다.

한글 파일명은 `contentDisposition()` 이 `filename` 과 `filename*`(RFC 5987)을 **함께** 적는다.

브랜딩(`Branding` 모델)은 **레이아웃을 바꾸지 않는 위치에만** 반영한다.
사용자가 배치한 절대좌표 위에 배너·머리말을 끼우면 본문과 겹치기 때문이다.

| 필드 | 반영 위치 |
|---|---|
| `primaryColor` | 품목표 헤더 밑줄, 합계 행 강조색 |
| `companyName` | PDF 제목 메타데이터 + 아래 회사 정보 반영 |
| `logoUrl` · `stampUrl` | 역할이 `logo`·`stamp` 인 **빈** 이미지 블록 |
| `ceoName` · `bizRegNo` · `address` · `phone` | 공급자 블록의 **빈** 칸 (역할로 지목) |

### 회사 정보 반영은 문서 단계에서 한 번만 한다

판정은 `editor-schema.ts` 의 `withCompanyDefaults(doc, company)` **순수 함수 하나**이고,
`buildDocumentHtml` 이 렌더 직전에 그 함수를 지난다. **에디터 페이지도 같은 함수를 지난다**
(`src/app/(user)/editor/**/page.tsx`).

예전에는 이 폴백이 인쇄 렌더러 안에 흩어져 있었다 — `renderFieldTable(props, cls, fallbacks)`
가 빈 `상호` 를 메우고 `renderImage` 가 빈 이미지에 로고를 넣었다. 그러면 **캔버스에는 빈 칸,
PDF 에만 값**이 되어 사용자가 화면에서 확인할 수 없는 내용이 고객에게 발송된다. 지금은
렌더러가 블록에 담긴 값만 그리고, 값을 정하는 곳은 위 함수 하나다.

지키는 선은 넷이다.

- **사용자가 적은 값은 덮지 않는다** — 비어 있는 칸만 채운다.
- **역할로 지목한다** (`MetaFieldRole` · `ImageRole`). `alt`·라벨 문자열 비교는 사용자가
  라벨을 고치는 순간 끊긴다. 역할이 **없는** 빈 이미지 블록에는 아무것도 넣지 않는다 —
  예전에는 빈 이미지면 무엇이든 로고가 찍혀서, 자리만 잡아 둔 칸에 로고가 인쇄됐다.
- **블록을 만들지 않는다** — 인감 블록을 놓는 것은 시드(`seedTemplate` ·
  `buildDocFromSpec`)의 일이고, 인감이 등록되지 않은 조직에는 **블록 자체를 만들지
  않는다**(빈 이미지 블록은 회색 자리표시자가 되어 견적서에 남는다).
- 바뀔 것이 없으면 **같은 객체**를 돌려준다 (불필요한 리렌더·미저장 표시 방지).

인감의 기본 자리는 `STAMP_BOX`(x 684 · y 126 · 68×68) — 공급자 블록 오른쪽 위에 겹친다.
겹침 순서는 `reorderZ(..., "front")` 로 정한다(z 를 손으로 계산하지 않는다).
`Branding` 에 이메일 컬럼이 없어 공급자 블록의 `이메일` 칸은 **라벨만** 두고 비워 둔다.

브랜딩 조립은 `toPdfBranding(record, fallbackCompanyName)` 한 곳에서 한다 — `PdfBranding`
의 필드를 모두 **필수(nullable)** 로 둔 이유가 이것이다(옵셔널이면 호출측이 하나를
빠뜨려도 타입 검사가 통과하고 런타임에만 값이 사라진다).

## 실행 환경 요구사항

### 1. 브라우저

`puppeteer-core` 는 브라우저를 내려받지 않는다. **실행 파일이 서버에 있어야 한다.**

```bash
# Debian / Ubuntu
apt-get install -y chromium            # 또는 google-chrome-stable
```

경로는 아래 순서로 찾는다. 표준 경로에 없으면 환경변수로 지정한다.

| 환경변수 | 비고 |
|---|---|
| `PDF_CHROME_PATH` | 최우선 |
| `CHROME_PATH` | |
| `PUPPETEER_EXECUTABLE_PATH` | |
| (없으면) OS 별 표준 경로 | macOS `/Applications/Google Chrome.app/...`, 리눅스 `/usr/bin/chromium` 등 |

| 환경변수 | 용도 |
|---|---|
| `PDF_CHROME_NO_SANDBOX=1` | 샌드박스를 못 쓰는 컨테이너용 탈출구. **기본은 샌드박스 유지** |

### 2. 한글 글꼴 (필수)

브라우저는 **서버에 설치된 글꼴**로 렌더한다. 한글 글꼴이 없는 서버에서는 본문이 두부(□)로 나온다.
슬림 컨테이너 이미지에는 대개 한글 글꼴이 없으므로 반드시 설치한다.

```bash
# Debian / Ubuntu
apt-get install -y fonts-noto-cjk fonts-nanum fonts-nanum-coding

# Alpine
apk add --no-cache font-noto-cjk
```

`fonts-noto-cjk` 만으로도 고딕·명조가 해결된다. `fonts-nanum-coding` 은 고정폭(D2Coding 계열) 문서용이다.

**글꼴 스택 순서 주의** (`pdf-html.ts` 의 `PRINT_FONT_STACKS`): 글꼴 대체는 글자 단위로 왼쪽부터 찾는다.
고딕 글꼴을 앞에 두면 사용자가 명조를 골라도 한글만 고딕으로 나온다. 계열에 맞는 한글 글꼴을
라틴 글꼴 바로 뒤에 두고, 맨 끝의 고딕은 두부 방지용 최후 수단으로만 둔다.

## 검증

`checkKoreanFonts()` 는 CSS 에 적은 이름이 아니라 **브라우저가 실제로 사용한 글꼴**을
CDP(`CSS.getPlatformFontsForNode`)로 읽는다. 배포 후 한 번 돌려 두부 렌더를 미리 잡는다.

```ts
const report = await checkKoreanFonts();
// { byFamily: { sans: [...], serif: [...], mono: [...] }, missing: [], ok: true }
```

`missing` 이 비어 있지 않으면 해당 계열의 한글 글꼴이 없다는 뜻이다(대체 글꼴 `LastResort` 검출).

개발 머신(macOS) 확인 결과 예시:

```
sans   → .SF NS, Apple SD Gothic Neo
serif  → NanumMyeongjo, Georgia
mono   → D2Coding ligature
```

macOS 는 `NanumGothic` · `NanumMyeongjo` 를 자동 활성 글꼴 자산
(`/System/Library/AssetsV2/…_Font8/`)으로 제공한다. 폰트 폴더에는 파일이 없지만 CoreText 가
공급하므로 브라우저는 정상적으로 찾는다. `fc-list`/`fc-match`(fontconfig)는 이 자산을 보지
못하므로 macOS 에서는 판단 근거로 쓰지 말 것 — `checkKoreanFonts()` 결과가 기준이다.

## 알아둘 것

- **호출당 브라우저 1개를 띄운다.** 문서당 약 1.5초가 든다. 발송 빈도가 높아지면 브라우저
  인스턴스 재사용을 검토한다(현재는 수명 관리 복잡도를 피해 단순하게 둔다).
- **이미지 출처를 제한한다.** `data:` · 루트 상대경로(`public/` 안, 경로 탈출·4MB 검사) ·
  공인 http(s) 만 허용하고 사설·루프백 대역은 차단한다. 헤드리스 브라우저를 통한 내부망
  조회를 막기 위해서다.
- **본문은 전량 HTML 이스케이프**, 색상은 hex 화이트리스트로 건다(CSS 주입 차단).
- `next.config.ts` 의 `serverExternalPackages` 에 `puppeteer-core` 가 있어야 한다.
  번들되면 브라우저 실행이 깨진다.
