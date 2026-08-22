import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  TRACKING_PIXEL_HEADERS,
  isTrackingId,
  trackingPixelBytes,
} from "@/lib/email-tracking";

/**
 * GET /api/mail/track/:trackingId — 메일 열람 기록 + 1×1 투명 GIF (F-234).
 *
 * ## 인증이 없다 (없어야 한다)
 * 부르는 쪽은 **수신자의 메일 클라이언트**다 — 우리 사용자가 아니고 세션도 쿠키도 없다.
 * 그래서 조직 범위(`document.orgId`)로 좁힐 수 없고, 대신 `trackingId` 가 추측 불가능한
 * 난수(UUID v4 · 122비트)라는 사실이 유일한 방어선이다 (`@/lib/email-tracking` 참고).
 * 그 대가로 이 라우트는 **읽을 수 있는 것을 아무것도 돌려주지 않는다** — 성공·실패 모두
 * 같은 이미지 한 장이다.
 *
 * ## 모르는 id 도 이미지를 돌려준다 (404 가 아니다)
 * ① 고객 메일에 깨진 이미지가 뜨면 안 되고, ② 404 와 200 이 갈리면 유효한 id 를 찾는
 * 탐색 도구가 된다. 기록만 조용히 건너뛴다.
 *
 * ## 캐시를 막는다
 * 프록시·클라이언트가 픽셀을 캐시하면 두 번째 열람이 서버에 오지 않아 `openCount` 가 1 에서
 * 멈춘다. 헤더는 `TRACKING_PIXEL_HEADERS` 한 곳에 모아 두었다.
 * (Next 15 부터 GET 라우트 핸들러는 기본이 동적이라 프레임워크 캐시는 걸리지 않는다.)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> },
) {
  const { trackingId } = await params;

  // 형식이 아니면 조회도 하지 않는다 (아무 문자열이나 DB 를 태우지 않는다)
  if (isTrackingId(trackingId)) {
    try {
      await recordOpen(trackingId.trim());
    } catch (error) {
      /*
       * 기록에 실패해도 이미지는 내려간다 — 수신자 화면에 깨진 이미지가 뜨는 것이
       * 열람 1건을 잃는 것보다 나쁘다. 원인은 로그로 남긴다(조용히 넘기지 않는다).
       */
      console.error(
        `[mail-track] 열람 기록 실패: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return new Response(trackingPixelBytes(), { headers: TRACKING_PIXEL_HEADERS });
}

/**
 * 열람 기록 — `openedAt` 은 **최초 1회만**, `openCount` 는 매번 증가.
 *
 * 규칙 자체는 `firstOpenAt()` 이 한 문장으로 적어 두었고(`scripts/email-tracking.test.ts`
 * 가 지킨다) 여기서는 그것을 **동시성 안전하게 SQL 로 옮긴다** — 읽고 계산해서 쓰면
 * 동시 요청에서 증가가 유실되기 때문이다.
 *
 * 두 사실을 한 문장으로 쓸 수 없어(최초 열람은 조건부, 횟수는 항상) `updateMany` 두 번으로
 * 나누되 **첫 번째 결과(count)로 분기**한다. 순서가 중요하다 —
 * ① `openedAt: null` 인 행만 골라 시각과 횟수를 함께 올린다.
 * ② ①이 아무 행도 바꾸지 못했을 때만(이미 열린 건 · 없는 id) 횟수만 올린다.
 *
 * ①을 하고 나서 조건 없이 ②를 부르면, 방금 ①이 채운 행이 ②의 조건에도 걸려 **첫 열람이
 * 2회로 잡힌다.** 또 `findFirst` 로 읽어 `openCount + 1` 을 계산해 쓰면 동시 요청에서
 * 증가가 유실된다(둘 다 3 을 읽고 4 를 쓴다) — 그래서 항상 Prisma 의 원자적 `increment`
 * 를 쓴다. 동시에 들어온 두 개의 첫 열람은 DB 가 쓰기를 직렬화하므로 ①이 한 번만
 * 성공하고 나머지는 ②로 흘러, `openedAt` 은 가장 먼저 도착한 시각으로 남는다.
 */
async function recordOpen(trackingId: string): Promise<void> {
  const now = new Date();

  const firstOpen = await prisma.emailLog.updateMany({
    where: { trackingId, openedAt: null },
    data: { openedAt: now, openCount: { increment: 1 } },
  });
  if (firstOpen.count > 0) return;

  await prisma.emailLog.updateMany({
    where: { trackingId, openedAt: { not: null } },
    data: { openCount: { increment: 1 } },
  });
}
