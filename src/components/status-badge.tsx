import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  OPPORTUNITY_STAGE_LABELS,
  type DocumentStatus,
  type DocumentType,
  type OpportunityStage,
} from "@/lib/constants";

const STATUS_STYLES: Record<DocumentStatus, string> = {
  DRAFT:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  SENT: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  COMPLETED:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  VOID: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
};

/** 문서 상태 배지 (초안 / 발송완료 / 계약완료 / 폐기) */
export function StatusBadge({ status }: { status: string }) {
  const s = status as DocumentStatus;
  return (
    <Badge className={cn("border-0", STATUS_STYLES[s])}>
      {DOCUMENT_STATUS_LABELS[s] ?? status}
    </Badge>
  );
}

/**
 * 영업 기회 단계별 배지 색 (F-111 · F-112).
 * 진행 단계는 초기 → 제안 → 협상 순으로 색이 짙어지고, 마감은 수주=초록 / 실주=회색이다.
 * 명도대비(ACC_*)를 위해 라이트·다크 각각 색을 지정한다.
 */
const STAGE_STYLES: Record<OpportunityStage, string> = {
  INITIAL: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  PROPOSAL: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  NEGOTIATION:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  WON: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  LOST: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
};

/** 영업 기회 단계 배지 (초기 / 제안 / 검토·협상 / 수주 / 실주) */
export function StageBadge({ stage }: { stage: string }) {
  const s = stage as OpportunityStage;
  return (
    <Badge className={cn("border-0", STAGE_STYLES[s])}>
      {OPPORTUNITY_STAGE_LABELS[s] ?? stage}
    </Badge>
  );
}

/** 문서 종류 배지 (견적서 / 계약서 / NDA / 제안서) */
export function DocTypeBadge({ type }: { type: string }) {
  const t = type as DocumentType;
  return (
    <Badge variant="outline" className="font-normal">
      {DOCUMENT_TYPE_LABELS[t] ?? type}
    </Badge>
  );
}
