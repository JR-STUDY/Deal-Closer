import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * 목록 행 전체를 상세로 이어주는 링크 (거래처-1 · 기회 목록 공용).
 *
 * 링크 자체는 첫 칸의 이름 텍스트에 있고, `::after` 덮개가 행 전체를 채워 **행 어디를 눌러도**
 * 상세로 간다. 행에 `onClick` 을 달아 `router.push` 하는 방식과 달리
 * - 클라이언트 JS 가 늘지 않고 (서버 컴포넌트 그대로),
 * - Tab 으로 초점을 받고 Enter 로 들어갈 수 있으며 (마우스 전용이 되지 않는다, ACC_*),
 * - ⌘·중클릭 새 탭, 링크 주소 복사가 그대로 된다.
 *
 * 쓰는 법 — 세 조각이 함께 있어야 한다:
 * 1. `<TableRow className={ROW_LINK_ROW}>` — 덮개가 이 행에 맞춰진다
 * 2. 이름 칸에 `<RowLink href=…>` — 덮개를 만드는 링크
 * 3. 행 안의 다른 링크·`⋯` 메뉴 칸에 `ROW_LINK_ABOVE` — 덮개 위로 올려 자기 클릭을 지킨다
 */

/** 1. 덮개의 기준이 되는 행 */
export const ROW_LINK_ROW = "relative";

/**
 * 3. 덮개보다 위에 놓을 칸 (⋯ 메뉴·행 안의 다른 링크).
 * 이게 없으면 덮개가 위를 지나가 메뉴가 눌리지 않는다.
 */
export const ROW_LINK_ABOVE = "relative z-10";

export function RowLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        // 행 전체를 덮는다 — 행 어디를 눌러도 이 링크가 눌린다
        "after:absolute after:inset-0 after:content-['']",
        className,
      )}
    >
      {children}
    </Link>
  );
}
