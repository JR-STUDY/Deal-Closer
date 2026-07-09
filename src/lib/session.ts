import "server-only";
import { cache } from "react";
import { prisma } from "./db";

/**
 * MVP 단계에는 실제 인증이 없다.
 * 데모 시드 데이터의 고정 사용자/조직을 "현재 컨텍스트"로 사용한다.
 * 추후 실제 인증(NextAuth 등) 도입 시 이 모듈만 교체하면 된다.
 *
 * 조회 함수는 React.cache 로 감싸 같은 요청 안에서 여러 서버 컴포넌트
 * (레이아웃 + 페이지)가 호출해도 DB 왕복이 1번만 발생한다.
 * → docs/REACT_BEST_PRACTICES.md · server-cache-react
 */

const DEMO_REP_EMAIL = "rain.kim@rainmaker.ai";
const DEMO_ADMIN_EMAIL = "admin@rainmaker.ai";

/** 현재 데모 조직 */
export const getCurrentOrg = cache(async () => {
  return prisma.organization.findFirstOrThrow();
});

/** 영업 담당자 포털(user-web)의 현재 사용자 — 김레인 */
export const getCurrentUser = cache(async () => {
  return prisma.user.findUniqueOrThrow({
    where: { email: DEMO_REP_EMAIL },
    include: { org: true },
  });
});

/** 관리자 콘솔(admin-web)의 현재 사용자 — 관리자 */
export const getAdminUser = cache(async () => {
  return prisma.user.findUniqueOrThrow({
    where: { email: DEMO_ADMIN_EMAIL },
    include: { org: true },
  });
});
