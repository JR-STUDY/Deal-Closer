import type { ReactNode } from "react";

/**
 * 상세 화면의 2단 골격 — 기회 상세·거래처 상세 공용 (기회-4 · 2차 피드백 9).
 *
 * 좌측은 **"이것이 무엇인지"**(기본 정보·담당자·메모·진행 단계),
 * 우측은 **"무슨 일이 있었는지"**(이력·연관 문서·연관 기회) 다.
 * `lg` 미만에서는 한 단으로 쌓이고 좌측이 먼저 온다 — 값을 먼저 보고 이력을 나중에 본다.
 *
 * 골격을 컴포넌트로 묶은 이유는 하나다 — **두 상세가 같은 자리에 같은 것을 두어야** 화면을
 * 옮길 때 눈이 다시 적응하지 않는다. 폭·간격·분기점을 화면마다 적어 두면 한쪽만 손봤을 때
 * 조용히 어긋난다. 각 단 안쪽 간격(`space-y-6`)까지 여기서 정한다.
 *
 * 상호작용이 없으므로 서버 컴포넌트이며 클라이언트 번들을 늘리지 않는다.
 */
export function DetailColumns({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-6 lg:grid-cols-2">
      {/* min-w-0: 긴 값(회사명·문서 제목)이 격자 칸을 밀어 넓히지 못하게 막는다 */}
      <div className="min-w-0 space-y-6">{left}</div>
      <div className="min-w-0 space-y-6">{right}</div>
    </div>
  );
}
