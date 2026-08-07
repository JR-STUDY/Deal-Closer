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

브랜딩(`Branding` 모델)은 **레이아웃을 바꾸지 않는 위치에만** 반영한다.
사용자가 배치한 절대좌표 위에 배너·머리말을 끼우면 본문과 겹치기 때문이다.

| 필드 | 반영 위치 |
|---|---|
| `primaryColor` | 품목표 헤더 밑줄, 합계 행 강조색 |
| `logoUrl` | 비어 있는 이미지 블록의 대체 이미지 |
| `companyName` | PDF 제목 메타데이터, 공급자 블록의 **빈** "상호" 값 |

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
