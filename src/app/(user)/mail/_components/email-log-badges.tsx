import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import {
  EMAIL_LOG_STATUS_LABELS,
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
 * 열람 여부 한 칸 — 목록의 좁은 칸에 맞춰 **날짜만** 보이고 정확한 시각·열람 횟수는 툴팁으로
 * 접는다 (기회 목록의 최근 수정일 칸과 같은 방식).
 *
 * 발송이 실패한 건에는 "미열람" 을 적지 않는다 — 나가지 않은 메일의 미열람은 사실이지만
 * "보냈는데 아직 안 봤다" 로 읽힌다. 판정은 `emailOpenState()` 한 곳이다.
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
      <HintTooltip
        className={triggerClass}
        content="발송이 실패해 열람 여부를 알 수 없습니다."
      >
        <span className="text-muted-foreground">—</span>
      </HintTooltip>
    );
  }

  // 열람 시각을 그대로 조건에 쓴다 — 단정(`as Date`)하지 않아도 좁혀진다
  if (state === "opened" && log.openedAt) {
    return (
      <HintTooltip
        className={triggerClass}
        content={`${formatDateTime(log.openedAt)} 최초 열람 · 총 ${formatNumber(
          Math.max(1, log.openCount),
        )}회 열람`}
      >
        <span className="tabular-nums">{formatDate(log.openedAt)}</span>
      </HintTooltip>
    );
  }

  return (
    <HintTooltip
      className={triggerClass}
      content="수신자가 아직 메일을 열지 않았습니다. 본문에 삽입된 추적 이미지를 불러오면 열람 시각이 기록됩니다."
    >
      <span className="text-muted-foreground">미열람</span>
    </HintTooltip>
  );
}
