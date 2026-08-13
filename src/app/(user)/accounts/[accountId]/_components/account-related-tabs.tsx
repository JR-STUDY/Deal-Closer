import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  StatusBadge,
  DocTypeBadge,
  StageBadge,
} from "@/components/status-badge";
import { formatDate, formatDateTime, formatKRW } from "@/lib/format";

/**
 * 거래처 상세의 연관 데이터 (F-103).
 * 영업 기회 탭은 Phase 2(F-111)에서 실제 데이터로 채워지며, 각 기회는 상세로 이동한다.
 *
 * shadcn Tabs 만 클라이언트 컴포넌트이고 목록 내용은 서버에서 렌더한다
 * (클라이언트로 내려보내는 JS 를 늘리지 않는다).
 */

export type RelatedOpportunity = {
  id: string;
  name: string;
  stage: string;
  expectedAmount: number;
  expectedCloseDate: Date | null;
  owner: { name: string };
};

export type RelatedDocument = {
  id: string;
  title: string;
  type: string;
  status: string;
  amount: number;
  createdAt: Date;
};

export type RelatedEmailLog = {
  id: string;
  subject: string;
  recipients: string;
  status: string;
  sentAt: Date;
  openedAt: Date | null;
  document: { title: string };
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

export function AccountRelatedTabs({
  opportunities,
  documents,
  emailLogs,
}: {
  opportunities: RelatedOpportunity[];
  documents: RelatedDocument[];
  emailLogs: RelatedEmailLog[];
}) {
  return (
    <Tabs defaultValue="opportunities" className="gap-4">
      <TabsList>
        <TabsTrigger value="opportunities">
          <TabLabel label="영업 기회" count={opportunities.length} />
        </TabsTrigger>
        <TabsTrigger value="documents">
          <TabLabel label="문서" count={documents.length} />
        </TabsTrigger>
        <TabsTrigger value="emails">
          <TabLabel label="이메일 이력" count={emailLogs.length} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="opportunities">
        {opportunities.length === 0 ? (
          <EmptyPanel message="아직 이 거래처에 등록된 영업 기회가 없습니다. 기회를 만들면 예상 금액·단계가 여기에 표시됩니다." />
        ) : (
          <ul className="divide-y rounded-md border">
            {opportunities.map((opportunity) => (
              <li
                key={opportunity.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/opportunities/${opportunity.id}`}
                    className="truncate font-medium transition-colors hover:text-primary hover:underline"
                  >
                    {opportunity.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    담당 {opportunity.owner.name}
                    {opportunity.expectedCloseDate
                      ? ` · 예상 마감 ${formatDate(opportunity.expectedCloseDate)}`
                      : " · 예상 마감 미정"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-medium">
                    {formatKRW(opportunity.expectedAmount)}
                  </span>
                  <StageBadge stage={opportunity.stage} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="documents">
        {documents.length === 0 ? (
          <EmptyPanel message="이 거래처의 기회에 연결된 문서가 아직 없습니다. 기회에서 문서를 만들면 여기에 모입니다." />
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

      <TabsContent value="emails">
        {emailLogs.length === 0 ? (
          <EmptyPanel message="이 거래처로 발송된 메일이 아직 없습니다. 문서를 발송하면 발송 시각과 열람 여부가 여기에 남습니다." />
        ) : (
          <ul className="divide-y rounded-md border">
            {emailLogs.map((log) => (
              <li key={log.id} className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="min-w-0 truncate font-medium">{log.subject}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(log.sentAt)}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {log.document.title} · 수신 {log.recipients}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {log.status === "FAILED"
                    ? "발송 실패"
                    : log.openedAt
                      ? `열람 ${formatDateTime(log.openedAt)}`
                      : "아직 열람하지 않았습니다."}
                </p>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}
