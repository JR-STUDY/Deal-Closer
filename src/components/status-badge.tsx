import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  type DocumentStatus,
  type DocumentType,
} from "@/lib/constants";

const STATUS_STYLES: Record<DocumentStatus, string> = {
  DRAFT:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  SENT: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  COMPLETED:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
};

/** 문서 상태 배지 (초안 / 발송완료 / 계약완료) */
export function StatusBadge({ status }: { status: string }) {
  const s = status as DocumentStatus;
  return (
    <Badge className={cn("border-0", STATUS_STYLES[s])}>
      {DOCUMENT_STATUS_LABELS[s] ?? status}
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
