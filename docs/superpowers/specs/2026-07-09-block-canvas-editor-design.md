# 블록 캔버스 문서 에디터 — 설계 문서

- 작성일: 2026-07-09
- 대상 화면: `/editor/:documentId` (영업 담당자 포털)
- 상태: 승인됨 → 구현 계획 작성 예정

## 1. 배경 / 문제

현재 `/editor/[documentId]` 는 **제목 입력 + 견적 항목 테이블**만 고정 자리에서 편집하는 단순 폼(`editor-client.tsx`)이다. 저장은 `toast` 목업으로 실제 저장되지 않는다.

요구사항: 웹에서 **기획서(영업 문서) 양식과 블록들을 드래그드랍으로 위치·내용·폼을 조절**하는 에디터로 교체한다. 참고 자료로 실무 견적서 엑셀 양식(`직판 유지보수 견적서 양식`)을 받았고, 이 양식은 A4 한 장 위에 공급자 정보·제목·거래처 메타·품목표·안내문이 2D로 배치된 구조이며 "고객사명·견적일 등 일부만 편집 가능, 나머지는 고정값" 이라는 실무 관례를 담고 있다.

## 2. 확정된 결정 (브레인스토밍 결과)

| 항목 | 결정 |
|---|---|
| 배치 모델 | **자유 캔버스 2D 배치** (A4 비율 캔버스 위 절대 좌표) |
| 블록 팔레트 범위 | **도메인 블록 + 범용 블록** 둘 다 |
| 저장 방식 | **실제 저장** — `Document.contentJson`(기존 미사용 필드) 활용, `PATCH /api/documents/:id` |
| 드래그·리사이즈 구현 | **react-rnd** (v10.5.3, peer `react >=16.3.0` → React 19 호환 확인됨) |
| 스키마 변경 | **없음** (contentJson 기존 필드 재사용) |

## 3. 화면 구성 (3-패널 레이아웃)

```
┌────────┬──────────────────────────┬──────────────┐
│ 팔레트  │       A4 캔버스            │  인스펙터     │
│(블록목록)│  (블록 드래그·이동·리사이즈) │ (선택 블록 속성)│
└────────┴──────────────────────────┴──────────────┘
 상단 툴바: [저장]  [발송하기]   (미저장 시 이탈 경고)
```

- **팔레트(좌)**: 추가 가능한 블록 목록. 캔버스로 드래그하면 새 블록이 추가된다.
- **캔버스(중앙)**: A4 비율. 블록을 드래그로 이동, 모서리 핸들로 크기 조절(react-rnd). 클릭 시 선택.
- **인스펙터(우)**: 선택된 블록의 위치/크기, 내용 폼, `고정 여부(locked)`, 정렬/글꼴 등 편집.
- **툴바(상단)**: 저장, 발송하기(기존 `/sender` 로 이동). 미저장 변경이 있으면 이탈 경고(STATE_).

## 4. 블록 카탈로그

### 도메인 블록 (견적서 업무를 아는 부품)
| type | 이름 | props(주요) | 비고 |
|---|---|---|---|
| `title` | 문서 제목 | text, align, fontSize | "견 적 서" 등 대형 제목 |
| `supplier` | 공급자 정보 | companyName, regNo, ceo, address, tel, fax, email, manager | 기본값은 **Branding**(+데모)에서 자동 채움 |
| `clientMeta` | 거래처·견적 메타 | fields[] (고객사명/수신자/견적일/유효기간/서비스제공기간/견적금액/견적번호) | 입력 폼 성격 |
| `itemTable` | 품목 표 | rows[{name, description, quantity, unitPrice}], showTotal | **수량×단가 합계 자동 계산** |

### 범용 블록 (레고 조각)
| type | 이름 | props(주요) | 비고 |
|---|---|---|---|
| `text` | 자유 텍스트 | text(멀티라인), align, fontSize | 안내·약관 등 |
| `table` | 범용 표 | rows[][], hasHeader | OS 지원표 등 |
| `image` | 이미지/로고 | dataUrl, alt, fit | MVP는 data URL / 브랜딩 로고 |
| `divider` | 구분선 | orientation | (포함) |

### 블록 공통 속성
모든 블록은 다음 공통 필드를 가진다: `id, type, x, y, w, h, z, locked`.
- **`locked`(고정 여부)**: 엑셀 양식의 "수정 불가 고정값" 개념 반영. 켜면 내용 편집을 잠근다(이동/선택은 편집 모드에서 계속 가능, 잠금은 내용 폼 대상).

## 5. 데이터 모델 (`Document.contentJson`)

contentJson 에 아래 형태의 JSON 문자열을 저장한다.

```jsonc
{
  "version": 1,
  "canvas": { "w": 794, "h": 1123 },          // A4 @96dpi(px)
  "blocks": [
    {
      "id": "b1", "type": "title",
      "x": 220, "y": 90, "w": 360, "h": 60, "z": 1,
      "locked": false,
      "props": { "text": "견 적 서", "align": "center", "fontSize": 28 }
    },
    {
      "id": "b2", "type": "itemTable",
      "x": 40, "y": 420, "w": 714, "h": 220, "z": 1,
      "locked": false,
      "props": {
        "rows": [{ "name": "...", "description": "...", "quantity": 1, "unitPrice": 40000 }],
        "showTotal": true
      }
    }
  ]
}
```

### 단일 소스 원칙 / 시딩
- **contentJson 이 에디터의 단일 소스(source of truth)** 다.
- 처음 여는 문서(contentJson 이 null)는 **견적서 기본 템플릿**으로 시드한다: title / supplier / clientMeta / itemTable / (안내) text 블록을 미리 배치. 이때 기존 `DocumentItem` 행들을 `itemTable` 블록의 rows 로 옮겨 담아 **데이터 유실을 방지**한다.
- 새 편집 세션 이후로는 contentJson 이 기준이 된다. `DocumentItem` 테이블은 레거시로 남기며, 새 에디터는 이를 직접 수정하지 않는다(이중 소스 방지).

### 저장 흐름
저장 버튼 → `PATCH /api/documents/:id` 로 다음을 전송한다.
- `contentJson`: 위 JSON 직렬화 문자열
- `amount`: `itemTable` 합계를 **서버에서 재계산**(정책 VAL_ — 금액 서버 재계산). MVP 에서는 클라이언트가 계산한 값을 보내되 서버가 신뢰하지 않고 재계산하도록 라우트를 보강한다.
- `title`: 제목 블록 텍스트(또는 문서 제목 필드) 동기화
- `clientName`: `clientMeta` 블록의 고객사명 추출

> 참고: 현행 `PATCH /api/documents/:id` 는 이미 `contentJson`, `title`, `amount`, `clientName` 필드를 받는다. `amount` 서버 재계산 로직만 보강이 필요할 수 있다.

## 6. 컴포넌트 구조

`src/app/(user)/editor/[documentId]/` 아래:

```
page.tsx                      # 서버: 문서 로드 → contentJson 파싱 or 기본 템플릿 시드 → 초기 모델 전달
_components/
  document-editor.tsx         # "use client" 최상위 — 블록 상태·선택·dirty 오케스트레이션
  block-palette.tsx           # 좌: 추가 가능한 블록 목록(드래그 소스)
  editor-canvas.tsx           # 중앙: A4 캔버스, 블록 렌더·드롭 처리
  canvas-block.tsx            # 개별 블록의 react-rnd 래퍼(이동/리사이즈/선택)
  block-inspector.tsx         # 우: 선택 블록 속성 편집
  editor-toolbar.tsx          # 상단: 저장/발송
  blocks/                     # 타입별 렌더러
    title-block.tsx
    text-block.tsx
    supplier-block.tsx
    client-meta-block.tsx
    item-table-block.tsx
    table-block.tsx
    image-block.tsx
    divider-block.tsx
```

공용 라이브러리:
```
src/lib/editor-schema.ts      # 블록/문서 TS 타입, 기본 템플릿, 파싱/검증, 합계 계산 헬퍼
```

- 기존 `editor-client.tsx` 는 위 구조로 **교체(삭제)** 한다.
- 파일은 단일 책임으로 작게 유지한다(각 블록 렌더러 분리, 캔버스/인스펙터/툴바 분리).

## 7. 성능 · 정책 준수

- **성능(REACT_BEST_PRACTICES)**: 에디터는 단일 client 아일랜드. 블록별 `React.memo` 로 드래그 중 불필요한 리렌더 최소화. 클라이언트 컴포넌트에 함수/비직렬화 객체 전달 지양. 서버 조회는 `page.tsx` 에서 수행.
- **정책**:
  - `STATE_*`: 미저장 변경 존재 시 이탈 경고(beforeunload/라우트 이탈 컨펌).
  - `VAL_*`: 금액(amount)은 저장 시 서버에서 재계산.
  - `FORM_CURRENCY_KRW`: 금액은 원(KRW) 정수, `@/lib/format` 의 `formatKRW` 사용.
  - `COPY-TONE`: 모든 UI 텍스트 한국어 존댓말.
  - `ACC_*`: 명도 대비(WCAG AA), 터치 타깃 44px, 키보드 접근 고려.

## 8. 범위에서 제외 (YAGNI)

- PDF 내보내기(발송은 기존 `/sender` 담당, 인쇄 CSS는 후속 과제)
- 다중 페이지 문서
- 실시간 협업
- undo/redo (후속 선택 과제)
- 이미지 **서버 업로드**(MVP 는 data URL / 브랜딩 로고만)

## 9. 문서 · 의존성 갱신 (AGENTS 규칙)

기획서 준수 원칙에 따라 변경을 함께 반영한다.
- `docs/SPEC.md`: 에디터 행 비고를 "라인아이템 편집" → "블록 캔버스 에디터(2D 배치·contentJson 저장)" 로 갱신.
- `AGENTS.md`: 에디터 관련 설명이 있으면 갱신.
- `package.json`: `react-rnd` 의존성 추가(pnpm).
- 스키마 변경 없음(contentJson 기존 필드 사용) → 마이그레이션 불필요.

## 10. 성공 기준 (검증 관점)

1. 문서 편집 화면에서 팔레트의 블록을 캔버스로 드래그해 추가할 수 있다.
2. 캔버스의 블록을 드래그로 이동, 모서리로 크기 조절할 수 있다.
3. 블록 선택 시 인스펙터에서 내용·위치·크기·고정여부를 편집할 수 있다.
4. 도메인 블록(공급자/거래처/품목표)이 기대대로 동작한다(공급자 기본값 채움, 품목표 합계 자동 계산).
5. 저장 후 새로고침해도 배치·내용이 유지된다(contentJson 저장/복원).
6. 기존 문서를 처음 열면 기본 템플릿 + 기존 DocumentItem 행이 품목표로 시드된다.
7. `pnpm typecheck`, `pnpm lint`, `pnpm doctor` 통과.
