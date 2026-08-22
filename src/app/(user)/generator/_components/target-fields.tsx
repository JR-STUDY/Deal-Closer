"use client";

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
 * 이 문서를 **누구에게** 보내는지 — 영업 기회 하나를 고르는 것이 전부다 (F-212).
 *
 * ## 거래처를 손으로 적는 칸을 두지 않는다
 *
 * 예전에는 기회를 고르지 않았을 때 `고객사명`·`수신 담당자`·`담당자 이메일` 3칸이 나타났다.
 * 걷어낸 이유는 셋이다.
 *
 *  1. **같은 사실의 출처가 둘이 된다.** 거래처는 CRM(`Account`·`Contact`)에 있고 기회를
 *     고르면 그 값이 그대로 간다. 손으로 적는 길을 열어 두면 CRM 에 없는 거래처명이 문서에
 *     박히고, 나중에 그 문서를 기회에 붙일 때 본문과 기회가 서로 다른 거래처를 주장한다
 *     (확정 문서 금액을 한 곳에서만 쓰는 것과 같은 이유다).
 *  2. **적어도 AI 는 프롬프트에서 읽는다.** `A사에 서버 5대 견적서` 라고 쓰면 거래처명은
 *     이미 지시문에 있다. 같은 값을 두 번 묻는 셈이었다.
 *  3. **칸 셋이 팝오버의 대부분을 차지했다.** 기회를 고르는 일이 이 팝오버의 목적인데,
 *     정작 그 선택기는 위에 한 줄이고 아래로 입력 셋이 붙어 있었다.
 *
 * 기회 연결은 **끝까지 선택**이다 — 고르지 않으면 "기회 미연결" 빠른 초안이 되고, 거래처
 * 정보는 지시문과 첨부에서 나온다. 나중에 기회에 붙이는 길은 문서 보관함에 있다.
 */
export function TargetFields({
  opportunities,
  opportunityId,
  onOpportunityChange,
  selectedOpportunity,
  noOpportunityValue,
  disabled,
}: {
  opportunities: OpportunityChoice[];
  opportunityId: string;
  onOpportunityChange: (id: string) => void;
  /** 고른 기회 (없으면 null) — 부모가 토스트·안내에도 쓰므로 판정을 한 곳에 둔다 */
  selectedOpportunity: OpportunityChoice | null;
  /** "기회 없이 생성" 을 뜻하는 값 (폼이 서버로 보내는 규약) */
  noOpportunityValue: string;
  disabled: boolean;
}) {
  return (
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
          ? `${selectedOpportunity.accountName} 의 CRM 등록값을 AI 에 그대로 전달하고, 만든 문서를 이 기회에 연결합니다.`
          : "기회를 고르시면 거래처·담당자를 CRM 에서 가져옵니다. 고르지 않으시면 기회 미연결 문서가 되고, 거래처는 지시문에 적으신 대로 들어갑니다."}
      </p>
    </div>
  );
}
