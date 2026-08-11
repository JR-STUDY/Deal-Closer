import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowRightLeft,
  CircleDot,
  FilePlus2,
  FileText,
  Send,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StatusBadge, DocTypeBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import type { ActivityEventType } from "@/lib/constants";
import { formatDate, formatDateTime, formatKRW } from "@/lib/format";

/**
 * 기회 상세의 이력·연관 문서 (F-111 · F-114).
 *
 * 기회 생성·단계 변경·문서 연결·문서 발송·수주·실주가 한 줄기로 쌓인다. `detail` 파싱과
 * 라벨링·문서 링크 판정은 서버 컴포넌트가 마치고, 여기서는 표시만 한다.
 *
 * shadcn Tabs 만 클라이언트 컴포넌트이고 목록 내용은 서버에서 렌더한다
 * (클라이언트로 내려보내는 JS 를 늘리지 않는다).
 */

export type TimelineEntry = {
  id: string;
  /** 원본 이벤트 유형 — 아이콘·색을 고르는 기준 */
  eventType: string;
  /** ACTIVITY_EVENT_LABELS 로 옮긴 표시용 라벨 */
  label: string;
  actorName: string;
  occurredAt: Date;
  /** 단계 변경·수신자처럼 부가 설명이 있으면 한 줄로 (없으면 null) */
  detailText: string | null;
  /** 관련 문서로 가는 링크. 문서가 지워졌거나 연결이 끊겼으면 null. */
  documentHref: string | null;
  documentTitle: string | null;
  /** 문서 종류 (원본 값 — 배지가 라벨로 옮긴다). 알 수 없으면 null. */
  documentType: string | null;
  /** 문서 금액 (KRW 정수). 알 수 없으면 null — 0원과 구분해야 하므로 null 로 둔다. */
  documentAmount: number | null;
};

/**
 * 이벤트 유형별 아이콘·색 (F-114).
 * 수주=emerald / 실주=rose 는 `StageBadge` 와 같은 계열이라 목록 배지와 눈으로 이어진다.
 * 라이트·다크 각각 지정해 명도대비를 지킨다 (정책 ACC_*).
 */
const EVENT_STYLES: Record<
  ActivityEventType,
  { icon: ComponentType<{ className?: string }>; className: string }
> = {
  OPPORTUNITY_CREATED: {
    icon: Target,
    className: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  },
  STAGE_CHANGED: {
    icon: ArrowRightLeft,
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  },
  DOCUMENT_CREATED: {
    icon: FilePlus2,
    className:
      "bg-slate-200 text-slate-700 dark:bg-slate-500/25 dark:text-slate-300",
  },
  DOCUMENT_SENT: {
    icon: Send,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
  },
  WON: {
    icon: Trophy,
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
  LOST: {
    icon: XCircle,
    className:
      "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  },
};

/** 정의 밖 이벤트도 이력 목록이 깨지지 않게 중립 표시로 받는다 */
const FALLBACK_EVENT_STYLE = {
  icon: CircleDot,
  className: "bg-muted text-muted-foreground",
};

function eventStyle(eventType: string) {
  return EVENT_STYLES[eventType as ActivityEventType] ?? FALLBACK_EVENT_STYLE;
}

export type LinkedDocument = {
  id: string;
  title: string;
  type: string;
  status: string;
  amount: number;
  createdAt: Date;
};

/** 탭 안의 빈 상태 안내 — 다음에 할 일이 있으면 버튼으로 함께 안내한다 (기회-3) */
function EmptyPanel({
  message,
  action,
}: {
  message: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-md border border-dashed p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {action ? (
        <Button asChild className="mt-4">
          <Link href={action.href}>
            <FilePlus2 className="size-4" aria-hidden="true" />
            {action.label}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * 이력 한 줄에 붙는 문서 요약 — 제목 · 종류 · 금액 (기회-13).
 * 이력만 보고도 "무슨 문서였는지"를 알 수 있어야 문서를 열어보지 않아도 흐름이 읽힌다.
 * 금액은 아는 경우에만 보여준다 (0원과 "모름"은 다르다).
 */
function TimelineDocument({ entry }: { entry: TimelineEntry }) {
  const title = entry.documentTitle ?? "문서 열기";
  const summary = (
    <>
      <FileText className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{title}</span>
      {entry.documentType ? <DocTypeBadge type={entry.documentType} /> : null}
      {entry.documentAmount === null ? null : (
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {formatKRW(entry.documentAmount)}
        </span>
      )}
    </>
  );

  // 문서가 지워졌거나 연결이 끊겼으면 링크 없이 남은 정보만 보여준다
  if (!entry.documentHref) {
    return (
      <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {summary}
      </span>
    );
  }
  return (
    <Link
      href={entry.documentHref}
      className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded text-xs font-medium text-primary transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {summary}
    </Link>
  );
}

/** 탭 라벨 + 건수 */
function TabLabel({ label, count }: { label: string; count: number }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      <span className="text-xs text-muted-foreground">{count}</span>
    </span>
  );
}

export function OpportunityDetailTabs({
  timeline,
  documents,
  opportunityId,
}: {
  timeline: TimelineEntry[];
  documents: LinkedDocument[];
  /** 빈 상태에서 이 기회에 연결된 문서를 만들러 갈 때 쓴다 (기회-2 · 기회-3) */
  opportunityId: string;
}) {
  const newDocumentHref = `/generator?opportunityId=${encodeURIComponent(opportunityId)}`;

  return (
    <Tabs defaultValue="timeline" className="gap-4">
      <TabsList>
        <TabsTrigger value="timeline">
          <TabLabel label="이력" count={timeline.length} />
        </TabsTrigger>
        <TabsTrigger value="documents">
          <TabLabel label="연관 문서" count={documents.length} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="timeline">
        {timeline.length === 0 ? (
          <EmptyPanel message="아직 기록된 활동이 없습니다. 단계를 바꾸거나 문서를 발송하시면 이력이 쌓입니다." />
        ) : (
          // 아이콘 칸(1.75rem)과 본문 칸을 격자로 나눠 픽셀 보정 없이 정렬한다 (기회-10)
          <ol className="space-y-5">
            {timeline.map((entry, index) => {
              const { icon: Icon, className } = eventStyle(entry.eventType);
              const isLast = index === timeline.length - 1;
              return (
                <li
                  key={entry.id}
                  className="relative grid grid-cols-[1.75rem_1fr] gap-x-3"
                >
                  {/* 세로 연결선 — 아이콘 아래에서 다음 아이콘까지만 잇는다 (마지막 항목 뒤로는 끊는다) */}
                  {isLast ? null : (
                    <span
                      aria-hidden="true"
                      className="absolute top-7 -bottom-5 left-[0.875rem] w-px -translate-x-1/2 bg-border"
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full",
                      className,
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  {/* 아이콘 중심(0.875rem)에 제목 첫 줄 중심(text-sm 줄높이 1.25rem 의 절반)을 맞춘다 */}
                  <div className="min-w-0 pt-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-sm font-medium">{entry.label}</p>
                      <time
                        dateTime={entry.occurredAt.toISOString()}
                        className="text-xs text-muted-foreground"
                      >
                        {formatDateTime(entry.occurredAt)}
                      </time>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.actorName}
                      {entry.detailText ? ` · ${entry.detailText}` : ""}
                    </p>
                    {entry.documentHref ||
                    entry.documentTitle ||
                    entry.documentType ? (
                      <TimelineDocument entry={entry} />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </TabsContent>

      <TabsContent value="documents">
        {documents.length === 0 ? (
          <EmptyPanel
            message="이 기회에 연결된 문서가 아직 없습니다. 견적서·계약서를 만드시면 여기에 모이고, 발송하시면 단계도 함께 옮겨집니다."
            action={{ href: newDocumentHref, label: "문서 생성으로 이동" }}
          />
        ) : (
          <ul className="divide-y rounded-md border">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/editor/${document.id}`}
                    className="truncate font-medium transition-colors hover:text-primary hover:underline"
                  >
                    {document.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(document.createdAt)} 생성
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-medium">
                    {formatKRW(document.amount)}
                  </span>
                  <DocTypeBadge type={document.type} />
                  <StatusBadge status={document.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}
