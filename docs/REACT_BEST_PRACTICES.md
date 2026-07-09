# React / Next.js 성능 베스트 프랙티스

> **출처**: Vercel Engineering — [vercel-labs/agent-skills · react-best-practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) (MIT)
> 70개 규칙 · 8개 카테고리. 이 문서는 원본을 **이 프로젝트(Next.js 16 / React 19 / Prisma 7 / shadcn)** 맥락에 맞게 정리한 것입니다.
> 개별 규칙의 상세 설명·예시는 원본 `rules/<규칙명>.md` 를 참고하세요.

## AI·팀 사용 규칙

React/Next 코드를 **작성·리뷰·리팩터링할 때** 이 문서의 우선순위를 따른다. 상충하면 **위 카테고리(낮은 번호)가 우선**한다.

| 우선순위 | 카테고리 | 영향도 | 접두사 |
|---|---|---|---|
| 1 | 워터폴 제거 (Eliminating Waterfalls) | **CRITICAL** | `async-` |
| 2 | 번들 크기 최적화 (Bundle Size) | **CRITICAL** | `bundle-` |
| 3 | 서버 성능 (Server-Side) | HIGH | `server-` |
| 4 | 클라이언트 데이터 페칭 (Client-Side) | MEDIUM-HIGH | `client-` |
| 5 | 리렌더 최적화 (Re-render) | MEDIUM | `rerender-` |
| 6 | 렌더링 성능 (Rendering) | MEDIUM | `rendering-` |
| 7 | JavaScript 성능 | LOW-MEDIUM | `js-` |
| 8 | 고급 패턴 (Advanced) | LOW | `advanced-` |

> **이 프로젝트의 특성**: 화면 대부분이 **서버 컴포넌트 + Prisma 조회**다. 따라서 `async-`(워터폴)·`server-`(서버 성능) 카테고리가 실무상 가장 큰 영향을 준다. 클라이언트 컴포넌트(`_components/*`)에는 `rerender-`·`bundle-` 이 적용된다.

---

## 이 프로젝트에서 특히 중요한 규칙 (Top 6)

### 1. 독립 쿼리는 `Promise.all` 로 병렬화 — `async-parallel` ✅ 적용 중

서로 의존하지 않는 조회를 순차 `await` 하면 워터폴이 생긴다. 반드시 병렬로.

```ts
// ❌ 순차 — 각 쿼리 시간이 합산됨
const total = await prisma.document.count({ where });
const sent = await prisma.document.count({ where: { ...where, status: "SENT" } });

// ✅ 병렬 — 가장 느린 쿼리 하나 시간 (src/app/(user)/dashboard/page.tsx 참고)
const [total, sent, completed] = await Promise.all([
  prisma.document.count({ where }),
  prisma.document.count({ where: { ...where, status: "SENT" } }),
  prisma.document.count({ where: { ...where, status: "COMPLETED" } }),
]);
```

### 2. 요청 내 중복 조회는 `React.cache` 로 제거 — `server-cache-react` ✅ 적용 중

같은 요청에서 여러 서버 컴포넌트가 같은 함수를 호출하면 쿼리가 중복된다. `cache()` 로 감싸면 **요청 단위로 1번만** 실행된다.

```ts
// src/lib/session.ts — 레이아웃과 페이지가 같은 요청에서 각각 호출해도 쿼리 1회
import { cache } from "react";

export const getCurrentOrg = cache(async () => {
  return prisma.organization.findFirstOrThrow();
});
```

> 이 프로젝트에서는 `(user)/layout.tsx` 가 `getCurrentUser()` 를, 각 페이지가 `getCurrentOrg()` 를 호출한다. `cache()` 로 중복 DB 왕복을 없앤다.

### 3. 클라이언트로 넘기는 데이터는 최소화·직렬화 가능하게 — `server-serialization` / `server-dedup-props`

서버 컴포넌트 → 클라이언트 컴포넌트로 **함수·클래스 인스턴스는 넘길 수 없다**. plain object/직렬화 가능한 값만, 그리고 필요한 필드만 넘긴다.

```tsx
// ❌ 함수(아이콘 컴포넌트)를 prop 으로 전달 → 런타임 에러
<AppSidebar nav={userNav} />   // userNav 항목에 icon: LucideIcon(함수) 포함

// ✅ variant 만 넘기고, 클라이언트 컴포넌트가 nav 를 직접 import
<AppSidebar variant="user" user={{ name, roleLabel }} />
```

> 초기 세팅에서 실제로 이 실수(함수 prop 전달)로 전 페이지가 500 이 났고, 위 방식으로 수정했다. 클라이언트에 넘기기 전 **plain object 인지, 필드가 최소인지** 항상 확인한다.

### 4. 무거운 클라이언트 컴포넌트는 `next/dynamic` — `bundle-dynamic-imports`

에디터, 차트, 리치 텍스트 등 초기 화면에 불필요한 무거운 컴포넌트는 동적 임포트로 초기 번들에서 분리한다.

```tsx
import dynamic from "next/dynamic";
const EditorClient = dynamic(() => import("./_components/editor-client"));
```

### 5. 컴포넌트 안에서 컴포넌트를 정의하지 않는다 — `rerender-no-inline-components`

부모가 리렌더될 때마다 자식이 새로 생성되어 상태가 초기화되고 성능이 나빠진다. 컴포넌트는 **항상 모듈 최상위**에 정의한다.

### 6. 조건부 렌더는 `&&` 대신 삼항 연산자 — `rendering-conditional-render` ✅ 적용 중

`count && <X/>` 는 `count` 가 `0` 일 때 `0` 을 렌더한다. `cond ? <X/> : null` 을 사용한다.

```tsx
// ✅ 이 프로젝트 컨벤션 (page-header.tsx, status-badge.tsx 등)
{description ? <p>{description}</p> : null}
```

---

## 전체 규칙 카탈로그

### 1. 워터폴 제거 (`async-`) — CRITICAL
- `async-cheap-condition-before-await` — await 전에 값싼 동기 조건 먼저 검사
- `async-defer-await` — await 를 실제 사용하는 분기 안으로 이동
- `async-parallel` — 독립 작업은 `Promise.all()`
- `async-dependencies` — 부분 의존은 `better-all` 활용
- `async-api-routes` — API 라우트에서 promise 를 일찍 시작하고 늦게 await
- `async-suspense-boundaries` — Suspense 로 콘텐츠 스트리밍

### 2. 번들 크기 (`bundle-`) — CRITICAL
- `bundle-barrel-imports` — barrel 파일 대신 직접 import
- `bundle-analyzable-paths` — 정적 분석 가능한 import/경로 사용
- `bundle-dynamic-imports` — 무거운 컴포넌트는 `next/dynamic`
- `bundle-defer-third-party` — 애널리틱스·로깅은 hydration 이후 로드
- `bundle-conditional` — 기능이 켜질 때만 모듈 로드
- `bundle-preload` — hover/focus 시 프리로드로 체감 속도 개선

### 3. 서버 성능 (`server-`) — HIGH
- `server-auth-actions` — 서버 액션도 API 처럼 인증
- `server-cache-react` — `React.cache()` 로 요청 내 중복 제거
- `server-cache-lru` — 요청 간 캐싱은 LRU 캐시
- `server-dedup-props` — RSC props 중복 직렬화 방지
- `server-hoist-static-io` — 정적 I/O(폰트·로고)는 모듈 레벨로 hoist
- `server-no-shared-module-state` — RSC/SSR 에서 모듈 레벨 가변 요청 상태 금지
- `server-serialization` — 클라이언트로 넘기는 데이터 최소화
- `server-parallel-fetching` — 컴포넌트 구조를 바꿔 페치 병렬화
- `server-parallel-nested-fetching` — 중첩 페치를 `Promise.all` 로
- `server-after-nonblocking` — 비차단 작업은 `after()`

### 4. 클라이언트 데이터 페칭 (`client-`) — MEDIUM-HIGH
- `client-swr-dedup` — SWR 로 요청 자동 중복 제거
- `client-event-listeners` — 전역 이벤트 리스너 중복 제거
- `client-passive-event-listeners` — scroll 은 passive 리스너
- `client-localstorage-schema` — localStorage 데이터 버전·최소화

### 5. 리렌더 최적화 (`rerender-`) — MEDIUM
- `rerender-defer-reads` — 콜백에서만 쓰는 상태는 구독하지 않기
- `rerender-memo` — 비싼 작업은 memo 컴포넌트로 분리
- `rerender-memo-with-default-value` — 비원시 기본 prop 은 hoist
- `rerender-dependencies` — effect 의존성은 원시값으로
- `rerender-derived-state` — 원시값이 아닌 파생 boolean 을 구독
- `rerender-derived-state-no-effect` — effect 말고 렌더 중 파생
- `rerender-functional-setstate` — 안정적 콜백엔 함수형 setState
- `rerender-lazy-state-init` — 비싼 초기값은 `useState(() => ...)`
- `rerender-simple-expression-in-memo` — 단순 원시값엔 memo 지양
- `rerender-split-combined-hooks` — 의존성 독립적인 훅은 분리
- `rerender-move-effect-to-event` — 상호작용 로직은 이벤트 핸들러로
- `rerender-transitions` — 비긴급 업데이트는 `startTransition`
- `rerender-use-deferred-value` — 비싼 렌더는 deferValue 로 입력 반응성 유지
- `rerender-use-ref-transient-values` — 빈번한 일시값은 ref
- `rerender-no-inline-components` — 컴포넌트 안에서 컴포넌트 정의 금지

### 6. 렌더링 성능 (`rendering-`) — MEDIUM
- `rendering-animate-svg-wrapper` — SVG 대신 div 래퍼 애니메이션
- `rendering-content-visibility` — 긴 목록엔 `content-visibility`
- `rendering-hoist-jsx` — 정적 JSX 는 컴포넌트 밖으로
- `rendering-svg-precision` — SVG 좌표 정밀도 축소
- `rendering-hydration-no-flicker` — 클라이언트 전용 데이터는 inline script
- `rendering-hydration-suppress-warning` — 예상된 mismatch 는 suppress
- `rendering-activity` — show/hide 는 Activity 컴포넌트
- `rendering-conditional-render` — 조건부는 `&&` 대신 삼항
- `rendering-usetransition-loading` — 로딩 상태는 `useTransition` 선호
- `rendering-resource-hints` — React DOM 리소스 힌트로 프리로드
- `rendering-script-defer-async` — script 태그에 defer/async

### 7. JavaScript 성능 (`js-`) — LOW-MEDIUM
- `js-batch-dom-css` — CSS 변경은 클래스/cssText 로 묶기
- `js-index-maps` — 반복 조회는 Map 구축
- `js-cache-property-access` — 루프에서 객체 속성 캐시
- `js-cache-function-results` — 함수 결과를 모듈 레벨 Map 에 캐시
- `js-cache-storage` — localStorage/sessionStorage 읽기 캐시
- `js-combine-iterations` — 여러 filter/map 을 한 루프로
- `js-length-check-first` — 비싼 비교 전 배열 length 검사
- `js-early-exit` — 함수 조기 반환
- `js-hoist-regexp` — RegExp 생성은 루프 밖으로
- `js-min-max-loop` — min/max 는 sort 대신 루프
- `js-set-map-lookups` — O(1) 조회는 Set/Map
- `js-tosorted-immutable` — 불변엔 `toSorted()`
- `js-flatmap-filter` — map+filter 는 `flatMap` 한 번에
- `js-request-idle-callback` — 비핵심 작업은 idle 시간으로

### 8. 고급 패턴 (`advanced-`) — LOW
- `advanced-effect-event-deps` — `useEffectEvent` 결과를 effect 의존성에 넣지 않기
- `advanced-event-handler-refs` — 이벤트 핸들러를 ref 에 저장
- `advanced-init-once` — 앱 로드당 1회 초기화
- `advanced-use-latest` — 안정적 콜백 ref 는 `useLatest`

---

## PR·코드 생성 체크리스트

- [ ] 독립 조회를 순차 `await` 하지 않았는가 → `Promise.all` (`async-parallel`)
- [ ] 여러 서버 컴포넌트가 호출하는 조회 함수를 `React.cache()` 로 감쌌는가 (`server-cache-react`)
- [ ] 클라이언트 컴포넌트에 함수·비직렬화 객체를 넘기지 않았는가 (`server-serialization`)
- [ ] 클라이언트에 필요한 필드만 넘기는가 (`server-dedup-props`)
- [ ] 무거운 클라이언트 컴포넌트를 `next/dynamic` 으로 분리했는가 (`bundle-dynamic-imports`)
- [ ] barrel import 대신 직접 import 하는가 (`bundle-barrel-imports`)
- [ ] 컴포넌트를 다른 컴포넌트 안에서 정의하지 않았는가 (`rerender-no-inline-components`)
- [ ] 조건부 렌더에 `&&` 대신 삼항을 썼는가 (`rendering-conditional-render`)
