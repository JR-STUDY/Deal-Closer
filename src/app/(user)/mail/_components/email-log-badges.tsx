import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import {
  EMAIL_LOG_STATUS_LABELS,
  EMAIL_OPEN_FAILED_TOOLTIP,
  EMAIL_OPEN_OPENED_CAVEAT,
  EMAIL_OPEN_STATE_LABELS,
  EMAIL_OPEN_UNOPENED_TOOLTIP,
  emailOpenState,
  isEmailLogStatus,
  type EmailOpenState,
} from "@/lib/email-log";
import { HintTooltip } from "@/components/hint-tooltip";
import { ROW_LINK_ABOVE } from "@/components/list-row-link";

/**
 * 발송 이력의 상태·열람 표기 — **목록과 상세가 같은 컴포넌트를 쓴다**.
 *
 * 같은 사실(성공/실패, 열람/미열람)을 두 화면이 따로 그리면 한쪽만 손봤을 때 문구·색이
 * 갈라진다(`@/components/status-badge` 가 문서 상태·기회 단계에 하는 역할과 같다).
 * 상태 판정 자체는 `@/lib/email-log` 순수 함수가 하고 여기서는 **그리기만** 한다.
 *
 * 색은 문서 상태 배지와 같은 계열을 쓴다 — 성공=emerald · 실패=rose. 라이트·다크 각각
 * 지정해 명도대비를 지키고(ACC_*), **색만으로 구분하지 않도록** 글자로도 성공·실패를 적는다.
 */
const STATUS_STYLES: Record<string, string> = {
  SENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  FAILED: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
};

export function EmailStatusBadge({ status }: { status: string }) {
  // DB 의 status 는 String 이라 정의 밖 값이 들어올 수 있다 — 값을 지어내지 않고 그대로 보여준다
  const label = isEmailLogStatus(status)
    ? `발송 ${EMAIL_LOG_STATUS_LABELS[status]}`
    : status;
  return (
    <Badge className={cn("border-0", STATUS_STYLES[status] ?? "")}>
      {label}
    </Badge>
  );
}

/**
 * 열람 확인 한 칸 — 목록의 좁은 칸에 맞춰 **날짜만** 보이고 정확한 시각·기록 횟수는 툴팁으로
 * 접는다 (기회 목록의 최근 수정일 칸과 같은 방식).
 *
 * **확인된 것만 주장한다.** 기록이 없을 때 "미열람"(=읽지 않았다)이라고 적지 않는다 —
 * 이미지를 차단한 메일 앱에서는 읽어도 기록이 남지 않으므로 우리가 알 수 없는 사실이다.
 * 반대로 기록이 있어도 프록시가 미리 불러온 것일 수 있어 툴팁이 그 단서를 함께 적는다.
 * 발송이 실패한 건은 열람을 아예 논하지 않는다. 낱말·문구는 `@/lib/email-log` 한 곳이고
 * 판정은 `emailOpenState()` 한 곳이다.
 *
 * `inRow` 를 주면 트리거를 행 덮개 위로 올린다 (`RowLink` 의 `::after` 아래에서는 툴팁이
 * 열리지 않는다). 상세 화면에서는 덮개가 없으므로 주지 않는다.
 */
export function OpenStateCell({
  log,
  inRow = false,
}: {
  log: { status: string; openedAt: Date | null; openCount: number };
  inRow?: boolean;
}) {
  const state: EmailOpenState = emailOpenState(log);
  const triggerClass = cn("inline-block", inRow && ROW_LINK_ABOVE);

  if (state === "failed") {
    return (
      <HintTooltip className={triggerClass} content={EMAIL_OPEN_FAILED_TOOLTIP}>
        <span className="text-muted-foreground">
          {EMAIL_OPEN_STATE_LABELS.failed}
        </span>
      </HintTooltip>
    );
  }

  // 열람 시각을 그대로 조건에 쓴다 — 단정(`as Date`)하지 않아도 좁혀진다
  if (state === "opened" && log.openedAt) {
    return (
      <HintTooltip
        className={triggerClass}
        content={`${formatDateTime(log.openedAt)} 최초 열람 기록 · 총 ${formatNumber(
          Math.max(1, log.openCount),
        )}회 기록 · ${EMAIL_OPEN_OPENED_CAVEAT}`}
      >
        <span className="tabular-nums">{formatDate(log.openedAt)}</span>
      </HintTooltip>
    );
  }

  return (
    <HintTooltip
      className={triggerClass}
      content={EMAIL_OPEN_UNOPENED_TOOLTIP}
    >
      <span className="text-muted-foreground">
        {EMAIL_OPEN_STATE_LABELS.unopened}
      </span>
    </HintTooltip>
  );
}
