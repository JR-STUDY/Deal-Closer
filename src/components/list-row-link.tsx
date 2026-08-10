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
 *
 * 표가 `table-fixed` 라 이름이 칸을 넘칠 수 있어 **말줄임은 이 컴포넌트가 맡는다** —
 * 호출부가 매번 붙이지 않아도 두 목록이 같은 자리에서 같게 잘린다. 전체 값은 `title` 로 넘긴다.
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
  title,
  className,
  children,
}: {
  href: string;
  /** 잘렸을 때 확인할 전체 값 (칸 폭이 고정이라 긴 이름은 말줄임된다) */
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        // 칸 폭을 채우는 블록이라야 안쪽 말줄임이 칸 기준으로 잘린다
        "block rounded transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        // 행 전체를 덮는다 — 행 어디를 눌러도 이 링크가 눌린다
        "after:absolute after:inset-0 after:content-['']",
        className,
      )}
    >
      {/*
        말줄임(`overflow: hidden`)은 **반드시 이 안쪽 span 이 맡는다.**
        링크 자신에 걸면 덮개(`::after`)가 overflow 안에 들어가 잘릴 여지가 생긴다.
        span 은 덮개의 형제라 어떤 경우에도 덮개를 자르지 않는다.
      */}
      <span className="block truncate">{children}</span>
    </Link>
  );
}
