/**
 * `server-only` 스텁 (테스트 실행 전용).
 *
 * `server-only` 는 Next.js 번들러가 별칭으로 잡아주는 가드라 tsx/node 로는 해석되지 않는다.
 * `tsconfig.scripts.json` 의 paths 가 이 파일로 매핑해, `scripts/mailer.test.mts` 가
 * server-only 모듈(`src/lib/mailer.ts`)을 그대로 import 할 수 있게 한다.
 * 앱 빌드에는 쓰이지 않는다 — 클라이언트 컴포넌트 가드는 그대로 동작한다.
 */
export {};
