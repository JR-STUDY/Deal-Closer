import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import {
  CLOSED_OPPORTUNITY_STAGES,
  OPEN_OPPORTUNITY_STAGES,
} from "@/lib/constants";
import { StageBadge } from "@/components/status-badge";

/**
 * 영업 기회 단계 흐름 안내 (목록 상단, F-111 · F-112).
 *
 * 목록에는 단계 배지만 있어서 단계가 몇 개인지·어떤 순서인지 알 방법이 없다. 한 줄로 순서를 보여준다.
 * 진행 3단계는 화살표로 잇고, 마감 2개(수주·실주)는 순차가 아니므로 "또는"으로 병렬 표시한다.
 *
 * 상호작용이 없어 서버 컴포넌트다. 단계 목록은 상수에서 파생하고, 색은 목록 배지와 같아야
 * 눈으로 이어지므로 `StageBadge` 를 그대로 재사용한다 (색을 새로 정의하지 않는다).
 * 표가 아래로 밀리지 않도록 높이를 최소화한다.
 */
export function StageFlowGuide() {
  return (
    <div
      role="group"
      aria-label="영업 기회 단계 흐름"
      className="rounded-lg border bg-muted/40 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {OPEN_OPPORTUNITY_STAGES.map((stage, index) => (
          <Fragment key={stage}>
            {index > 0 ? (
              <ChevronRight
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted-foreground"
              />
            ) : null}
            <StageBadge stage={stage} />
          </Fragment>
        ))}

        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />

        {CLOSED_OPPORTUNITY_STAGES.map((stage, index) => (
          <Fragment key={stage}>
            {index > 0 ? (
              <span className="text-xs text-muted-foreground">또는</span>
            ) : null}
            <StageBadge stage={stage} />
          </Fragment>
        ))}
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        견적서를 보내면 제안으로, 계약서를 보내면 검토/협상으로 자동 이동합니다.
      </p>
    </div>
  );
}
