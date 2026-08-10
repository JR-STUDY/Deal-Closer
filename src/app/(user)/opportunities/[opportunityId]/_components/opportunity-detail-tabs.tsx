import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, DocTypeBadge } from "@/components/status-badge";
import { formatDate, formatDateTime, formatKRW } from "@/lib/format";

/**
 * 기회 상세의 타임라인·연관 문서 (F-111 · F-114).
 *
 * 지금 쌓이는 이력은 OPPORTUNITY_CREATED 하나뿐이지만, Phase 3 의 단계 전이·문서 발송
 * 이력이 그대로 이 목록에 얹히도록 구조를 맞춰 둔다. `detail` 파싱과 라벨링은 서버
 * 컴포넌트가 마치고 표시 문자열만 넘겨받는다.
 *
 * shadcn Tabs 만 클라이언트 컴포넌트이고 목록 내용은 서버에서 렌더한다
 * (클라이언트로 내려보내는 JS 를 늘리지 않는다).
 */

export type TimelineEntry = {
  id: string;
  /** ACTIVITY_EVENT_LABELS 로 옮긴 표시용 라벨 */
  label: string;
  actorName: string;
  occurredAt: Date;
  /** 단계 변경처럼 부가 설명이 있으면 한 줄로 (없으면 null) */
  detailText: string | null;
};

export type LinkedDocument = {
  id: string;
  title: string;
  type: string;
  status: string;
  amount: number;
  createdAt: Date;
};

/** 탭 안의 빈 상태 안내 */
function EmptyPanel({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      {message}
    </p>
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
}: {
  timeline: TimelineEntry[];
  documents: LinkedDocument[];
}) {
  return (
    <Tabs defaultValue="timeline" className="gap-4">
      <TabsList>
        <TabsTrigger value="timeline">
          <TabLabel label="타임라인" count={timeline.length} />
        </TabsTrigger>
        <TabsTrigger value="documents">
          <TabLabel label="연관 문서" count={documents.length} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="timeline">
        {timeline.length === 0 ? (
          <EmptyPanel message="아직 기록된 활동이 없습니다. 단계를 바꾸거나 문서를 발송하시면 이력이 쌓입니다." />
        ) : (
          <ol className="space-y-4 border-l pl-6">
            {timeline.map((entry) => (
              <li key={entry.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 -left-[1.9375rem] size-2.5 rounded-full border-2 border-background bg-primary"
                />
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
              </li>
            ))}
          </ol>
        )}
      </TabsContent>

      <TabsContent value="documents">
        {documents.length === 0 ? (
          <EmptyPanel message="이 기회에 연결된 문서가 아직 없습니다. 견적서·계약서를 만들면 여기에 모입니다." />
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
