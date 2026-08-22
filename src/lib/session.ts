import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { prisma } from "./db";

/**
 * MVP 단계에는 실제 인증이 없다.
 * 데모 시드 데이터의 고정 사용자/조직을 "현재 컨텍스트"로 사용한다.
 * 추후 실제 인증(NextAuth 등) 도입 시 이 모듈만 교체하면 된다.
 *
 * 조회 함수는 React.cache 로 감싸 같은 요청 안에서 여러 서버 컴포넌트
 * (레이아웃 + 페이지)가 호출해도 DB 왕복이 1번만 발생한다.
 * → docs/REACT_BEST_PRACTICES.md · server-cache-react
 *
 * ## 왜 `connection()` 을 먼저 기다리는가
 *
 * 이 모듈은 DB 만 읽고 쿠키·헤더를 보지 않는다. 그래서 Next 는 "요청과 무관한 값" 으로 보고
 * 세션을 읽는 화면을 **빌드 시점에 정적으로 프리렌더**했다 — `/settings/profile`
 * ·`/settings/email`·`/team/members` 등이 그랬다. 개발 서버에서는 매 요청 렌더되므로
 * 아무 증상이 없지만, `next build` 후에는 **빌드 당시의 값이 굳는다**: 회사 정보를 저장해도
 * 화면이 그대로이고(`router.refresh()` 도 정적 셸을 다시 받는다) 원인을 폼·API 에서 찾게 된다.
 *
 * `connection()` 은 "이 렌더는 실제 요청이 있어야 한다" 는 선언이다. 세션 조회 한 곳에 두면
 * 세션을 읽는 **모든** 화면이 자동으로 요청 시 렌더로 내려가므로, 화면마다
 * `export const dynamic = "force-dynamic"` 을 흩어 적지 않아도 된다(하나를 빠뜨리면 그
 * 화면만 조용히 굳는다). 실제 인증이 붙으면 쿠키를 읽으면서 같은 성질을 얻으므로
 * 그때 이 줄은 없어도 된다 — 지금은 인증이 없어서 대신 세워 두는 것이다.
 */

const DEMO_REP_EMAIL = "rain.kim@rainmaker.ai";
const DEMO_ADMIN_EMAIL = "admin@rainmaker.ai";

/** 현재 데모 조직 */
export const getCurrentOrg = cache(async () => {
  await connection();
  return prisma.organization.findFirstOrThrow();
});

/** 영업 담당자 포털(user-web)의 현재 사용자 — 김레인 */
export const getCurrentUser = cache(async () => {
  await connection();
  return prisma.user.findUniqueOrThrow({
    where: { email: DEMO_REP_EMAIL },
    include: { org: true },
  });
});

/** 관리자 콘솔(admin-web)의 현재 사용자 — 관리자 */
export const getAdminUser = cache(async () => {
  await connection();
  return prisma.user.findUniqueOrThrow({
    where: { email: DEMO_ADMIN_EMAIL },
    include: { org: true },
  });
});
