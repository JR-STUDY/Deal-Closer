"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { PanelRightOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * 상세 화면의 공용 골격 — 기회 상세·거래처 상세가 함께 쓴다 (3차 피드백 1).
 *
 * 이전에는 좌우 2단(`DetailColumns`)이었다. 우측 절반을 이력·연관 문서 탭이 **늘** 차지했고,
 * 탭이라 항상 하나는 열려 있어 끌 수가 없었다. 이제 본문이 전체 폭을 쓰고, 부가 정보는
 * 오른쪽에서 밀려 나오는 **트레이(드로어)** 로 필요할 때만 꺼낸다.
 *
 * 골격을 컴포넌트로 묶는 이유는 그대로다 — **두 상세가 같은 자리에 같은 것을 두어야** 화면을
 * 옮길 때 눈이 다시 적응하지 않는다. 한쪽만 드로어가 되면 그 대칭이 깨진다.
 *
 * ## 비모달이다 (초점을 가두지 않고 바탕을 막지 않는다)
 *
 * 사용자가 요구한 것은 "바탕 색을 **살짝만** 다르게" 였다 — 바탕을 가리라는 뜻이 아니라
 * 뒤에 무언가 떠 있다는 것만 알리라는 뜻이다. 그래서 딤 오버레이도, 초점 가둠도, 스크롤
 * 잠금도 두지 않는다. 드로어를 열어 둔 채 왼쪽 본문을 읽고 고칠 수 있다.
 *
 * shadcn `sheet` 를 쓰지 않은 이유도 같다 — 그쪽은 radix Dialog 기반 **모달**이라
 * ① `bg-black/10 + backdrop-blur` 오버레이가 바탕 글자를 흐리고, ② 초점을 가두며,
 * ③ 스크롤을 잠근다. 게다가 `document.body` 로 portal 되어 `fixed inset-y-0` 로 뜨므로
 * 페이지 헤더까지 덮는다. 여기서 필요한 것은 **본문 영역 안에서** 미끄러져 나오는 트레이다.
 *
 * ## 떠 있다는 것은 **그림자**로 알린다 — 바탕색을 바꾸지 않는다
 *
 * 한때 열리면 바탕(스크롤 영역)이 `bg-foreground/5` 로 어두워졌다. 걷어낸 이유는 둘이다.
 *
 * ① **머리글에 이음선이 생긴다.** 이 컴포넌트가 칠할 수 있는 것은 스크롤 영역뿐이고
 *    `PageHeader` 는 **형제**라 손이 닿지 않는다. 그래서 실측(1440×900) 스크롤 영역이
 *    `y=77` 에서 시작하는 만큼, 드로어를 열면 머리글 바로 아래에 폭 전체를 가로지르는
 *    **각진 회색 띠**가 생겼다 — 머리글(흰색)과 드로어(흰색)가 한 덩어리로 붙어 보이고
 *    본문만 다른 판으로 떨어져 나갔다.
 * ② **강조가 뒤집힌다.** 라이트에서 `--card` 와 `--background` 은 둘 다 흰색이라, 바탕만
 *    어두워지면 **카드가 흰 판으로 도드라지고** 정작 새로 나타난 드로어는 그 카드들과
 *    같은 흰색으로 남는다. 국소적인 조작 하나에 화면 전체가 다시 칠해지는데, 그 결과로
 *    가장 눈에 덜 드는 것이 드로어다.
 *
 * 지금은 드로어가 **자기 왼쪽 그림자**로 스스로를 들어올린다. 겹쳐 뜬 것이 바탕에
 * 그림자를 떨어뜨리는 것은 현실의 이치라 설명이 필요 없고, **국소적**이라 이음선이
 * 생기지 않으며, 그림자가 드로어와 함께 움직이므로 바탕 전환(200ms)과 드로어 이동
 * (300ms)이 어긋나 **색이 먼저 끝나 버리는 일**도 구조적으로 없다.
 *
 * `shadow-2xl` 로는 안 된다 — `0 25px 50px -12px` 는 **아래로** 떨어지는 그림자여서
 * 왼쪽 모서리에는 거의 아무것도 그리지 않는다(실측: 열어도 드로어 왼쪽에 그라데이션이
 * 보이지 않았다). 그래서 바탕 틴트가 그 몫을 대신하고 있었던 것이다. 지금은 x 오프셋을
 * 왼쪽으로 준 그림자를 직접 적는다.
 *
 * 다크에서는 그림자가 거의 보이지 않지만 대신 **표면색이 이미 갈린다**(바탕 0.145 <
 * 드로어 `--card` 0.205). 라이트는 둘 다 흰색이라 그림자가, 다크는 표면색이 맡는다 —
 * 두 테마에서 각각 제 몫을 하는 단서가 있다. `border-l` 은 양쪽 공통이다.
 */

export type DetailPanel = {
  /** 탭 값 겸 트리거 식별자 */
  id: string;
  label: string;
  /** 트리거·탭에 함께 표시할 건수 */
  count: number;
  /** 서버에서 렌더한 내용을 그대로 받는다 (클라이언트 번들을 늘리지 않는다) */
  content: ReactNode;
};

/** 라벨 + 건수 (트리거·탭이 같은 표기를 쓴다) */
function PanelLabel({ label, count }: { label: string; count: number }) {
  return (
    <>
      {label}
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </>
  );
}

export function DetailShell({
  panels,
  children,
}: {
  panels: DetailPanel[];
  /** 본문 — 이 상세가 "무엇인지" (기본 정보·담당자·메모·진행 단계) */
  children: ReactNode;
}) {
  const drawerId = useId();
  const [isOpen, setIsOpen] = useState(false);
  /** 닫혀 있어도 마지막으로 보던 탭을 기억한다 (다시 열면 그 자리에서 이어 본다) */
  const [activeId, setActiveId] = useState(panels[0]?.id ?? "");
  /** 초점을 되돌릴 트리거를 찾기 위한 참조 (id → 버튼) */
  const triggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  /** 마지막으로 드로어를 연 트리거 */
  const openedBy = useRef<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  /** 현재 탭 (구성이 바뀌어 사라졌으면 첫 탭으로 본다 — 렌더 중 도출이라 효과가 필요 없다) */
  const activePanel = panels.find((panel) => panel.id === activeId) ?? panels[0];
  const currentId = activePanel?.id ?? "";

  /**
   * 닫으면 초점이 **지금 열려 있던 탭의 트리거**로 돌아간다 (정책 ACC_*).
   * 드로어 안에서 탭을 바꾼 뒤 닫았다면 처음 눌렀던 트리거가 아니라 지금 보던 탭의
   * 트리거로 돌아가야 "방금 닫은 것" 위에 초점이 놓인다.
   */
  const close = () => {
    setIsOpen(false);
    const target =
      triggerRefs.current.get(currentId) ??
      triggerRefs.current.get(openedBy.current ?? "");
    target?.focus();
  };

  /** 트리거 하나가 여닫이(on/off)를 겸한다 — 열려 있는 탭을 다시 누르면 닫힌다 */
  const toggle = (id: string) => {
    if (isOpen && currentId === id) {
      close();
      return;
    }
    const wasClosed = !isOpen;
    openedBy.current = id;
    setActiveId(id);
    setIsOpen(true);
    /*
     * 키보드로도 드로어 안으로 들어가야 한다 — 열릴 때 초점을 패널로 옮긴다 (ACC_*).
     *
     * **`preventScroll` 없이 `focus()` 하면 화면이 통째로 튄다.** 이 시점의 드로어는
     * 아직 `translate-x-full` 상태(전환 시작 전)라 시각적으로 바깥칸(`overflow-hidden`)
     * 밖에 있고, 브라우저는 초점 받은 요소를 보이게 하려고 **바깥칸을 가로로 스크롤한다**
     * — `overflow:hidden` 도 프로그램으로는 스크롤되므로 막히지 않는다.
     * 실측: 열자마자 바깥칸 `scrollLeft` 가 0 → 544(드로어 폭)로 뛰어 본문이 x=336 →
     * -208 로 끌려갔고, 전환이 진행돼 `scrollWidth` 가 줄면 그 값이 다시 0 으로 깎이며
     * 본문이 제자리로 튕겨 돌아왔다. 초점만 옮기면 되므로 스크롤은 거절한다.
     */
    if (wasClosed) {
      requestAnimationFrame(() =>
        drawerRef.current?.focus({ preventScroll: true }),
      );
    }
  };

  /**
   * Esc 로 닫는다. **전역(window)·본문 전체 리스너로 두지 않는다.**
   *  - 전역이면 드로어 안에서 띄운 문서 미리보기 팝업의 Esc 와 겹쳐 두 겹이 한꺼번에 닫힌다
   *    (팝업은 body 로 portal 되므로 드로어 안에서 키 이벤트가 올라오지 않는다).
   *  - 본문 전체면 인라인 수정의 Esc(되돌리기)까지 드로어를 닫아 버린다.
   * 그래서 **드로어와 트리거 줄** 두 곳에만 건다 — 초점이 둘 중 하나에 있을 때가
   * 사용자가 "이 패널"을 다루고 있는 순간이다.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !isOpen) return;
    event.stopPropagation();
    close();
  };

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {/*
        바탕 — 스크롤·`[scrollbar-gutter:stable]` 은 여기 그대로 남는다. 드로어는 이 위에
        절대 위치로 겹치므로 열고 닫아도 이 칸의 폭이 변하지 않는다 (스크롤바가 사라지거나
        본문이 가로로 밀리지 않는다).

        **여닫이로 이 칸의 배경을 바꾸지 않는다** — 머리글은 이 컴포넌트의 형제라 함께 칠할
        수 없어서, 칠하면 머리글 바로 아래에 각진 이음선이 생긴다 (위 주석 참고).
      */}
      <div className="min-w-0 flex-1 overflow-auto p-8 [scrollbar-gutter:stable]">
        <div className="mx-auto max-w-5xl space-y-6">
          {/*
            트리거는 **본문 안에 남는다** — 어디를 눌러야 이력·문서를 볼 수 있는지 화면에
            보여야 한다. **왼쪽에 둔다**: 드로어는 오른쪽에서 겹쳐 들어오므로 오른쪽 끝에
            두면 열자마자 자기 트리거가 가려져 다시 누를 수도, 다른 탭으로 건너뛸 수도 없다.
          */}
          <div
            onKeyDown={handleKeyDown}
            className="flex flex-wrap items-center gap-2"
          >
            {panels.map((panel) => {
              const isActive = isOpen && panel.id === currentId;
              return (
                <button
                  key={panel.id}
                  type="button"
                  ref={(element) => {
                    triggerRefs.current.set(panel.id, element);
                  }}
                  aria-expanded={isActive}
                  aria-controls={drawerId}
                  onClick={() => toggle(panel.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    // 열린 탭은 색만이 아니라 테두리 강조로도 구분한다 (ACC_*)
                    isActive &&
                      "border-primary text-primary hover:bg-background",
                  )}
                >
                  <PanelRightOpen className="size-4" aria-hidden="true" />
                  <PanelLabel label={panel.label} count={panel.count} />
                </button>
              );
            })}
          </div>

          {children}
        </div>
      </div>

      {/*
        드로어 — 항상 마운트해 두고 `translate-x` 로만 미끄러진다. 그래야 들어올 때와
        나갈 때가 같은 방식으로 움직이고, 닫힌 동안에는 `inert` 가 초점·포인터·보조기기에서
        통째로 빼 준다. `prefers-reduced-motion` 에서는 이동 없이 즉시 자리를 잡는다.
      */}
      <div
        id={drawerId}
        ref={drawerRef}
        role="region"
        aria-label={activePanel ? `${activePanel.label} 패널` : "연관 정보 패널"}
        tabIndex={-1}
        inert={!isOpen}
        onKeyDown={handleKeyDown}
        className={cn(
          "absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l bg-card outline-none sm:w-[28rem] xl:w-[34rem]",
          // 왼쪽으로 떨어지는 그림자 — 이것이 "떠 있다" 는 유일한 단서다 (shadow-* 유틸은
          // 모두 아래로 떨어져 왼쪽 모서리에 아무것도 그리지 않는다)
          "shadow-[-12px_0_32px_-10px_rgb(0_0_0/0.22)]",
          "transition-transform duration-300 ease-out motion-reduce:transition-none",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {activePanel ? (
          <Tabs
            value={currentId}
            onValueChange={setActiveId}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              {/* 드로어 안에서 탭을 바꾼다 — 이력 ↔ 연관 문서를 닫았다 열 필요가 없다 */}
              <TabsList>
                {panels.map((panel) => (
                  <TabsTrigger key={panel.id} value={panel.id}>
                    <PanelLabel label={panel.label} count={panel.count} />
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="패널 닫기"
                onClick={close}
              >
                <X aria-hidden="true" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {panels.map((panel) => (
                <TabsContent key={panel.id} value={panel.id}>
                  {panel.content}
                </TabsContent>
              ))}
            </div>
          </Tabs>
        ) : null}
      </div>
    </div>
  );
}
