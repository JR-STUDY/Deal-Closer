"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatKRW } from "@/lib/format";
import type { OpportunityChoice } from "./types";

/**
 * ② 누구에게 — 영업 기회를 고르면 거래처가 따라온다 (F-212).
 *
 * **기회를 고르면 거래처 자유 입력 3칸을 감춘다.** 같은 사실(거래처가 누구인가)을 주장하는
 * 출처가 둘이면 어느 쪽이 문서에 박혔는지 알 수 없다 — 그래서 CRM 값 하나만 남기고,
 * 그 사실을 화면에 적어 사용자가 "왜 입력칸이 사라졌는지" 알게 한다.
 *
 * 이 컴포넌트는 표시만 한다 — 연결 여부·권한은 서버가 `orgId` 로 다시 확인한다.
 */
export function TargetFields({
  opportunities,
  opportunityId,
  onOpportunityChange,
  selectedOpportunity,
  noOpportunityValue,
  clientName,
  onClientNameChange,
  clientContact,
  onClientContactChange,
  clientEmail,
  onClientEmailChange,
  disabled,
}: {
  opportunities: OpportunityChoice[];
  opportunityId: string;
  onOpportunityChange: (id: string) => void;
  /** 고른 기회 (없으면 null) — 부모가 토스트·안내에도 쓰므로 판정을 한 곳에 둔다 */
  selectedOpportunity: OpportunityChoice | null;
  /** "기회 없이 생성" 을 뜻하는 값 (폼이 서버로 보내는 규약) */
  noOpportunityValue: string;
  clientName: string;
  onClientNameChange: (value: string) => void;
  clientContact: string;
  onClientContactChange: (value: string) => void;
  clientEmail: string;
  onClientEmailChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="opportunity-select" className="text-xs">
          영업 기회 연결
        </Label>
        <Select
          value={opportunityId}
          onValueChange={onOpportunityChange}
          disabled={disabled}
        >
          <SelectTrigger id="opportunity-select" className="w-full">
            <SelectValue placeholder="기회 없이 생성" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={noOpportunityValue}>기회 없이 생성</SelectItem>
            {opportunities.map((opportunity) => (
              <SelectItem key={opportunity.id} value={opportunity.id}>
                {opportunity.accountName} · {opportunity.name}
                {opportunity.expectedAmount > 0
                  ? ` · ${formatKRW(opportunity.expectedAmount)}`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {selectedOpportunity
            ? `${selectedOpportunity.accountName} 의 거래처 정보를 AI 에 그대로 전달하고, 생성된 문서를 이 기회에 연결합니다.`
            : "기회를 고르면 거래처 정보를 CRM 에서 가져와 채웁니다. 고르지 않으면 기회 미연결 문서가 됩니다."}
        </p>
      </div>

      {selectedOpportunity ? (
        <p className="rounded-md border border-dashed bg-background px-3 py-2 text-xs text-muted-foreground">
          거래처 정보는{" "}
          <strong className="font-medium">
            {selectedOpportunity.accountName}
          </strong>{" "}
          의 CRM 등록값을 사용합니다. 직접 입력할 필요가 없습니다.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="client-name" className="text-xs">
              고객사명
            </Label>
            <Input
              id="client-name"
              value={clientName}
              onChange={(e) => onClientNameChange(e.target.value)}
              disabled={disabled}
              placeholder="(주)글로벌커머스"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-contact" className="text-xs">
              수신 담당자
            </Label>
            <Input
              id="client-contact"
              value={clientContact}
              onChange={(e) => onClientContactChange(e.target.value)}
              disabled={disabled}
              placeholder="김레인 책임"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-email" className="text-xs">
              담당자 이메일
            </Label>
            <Input
              id="client-email"
              type="email"
              value={clientEmail}
              onChange={(e) => onClientEmailChange(e.target.value)}
              disabled={disabled}
              placeholder="rain@example.com"
            />
          </div>
        </div>
      )}
    </>
  );
}
