"use client";

import { formatKRW } from "@/lib/format";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

type DocumentMetaFieldsProps = {
  clientName: string;
  onClientNameChange: (value: string) => void;
  type: string;
  onTypeChange: (value: string) => void;
  amount: number;
  onAmountChange: (value: number) => void;
  total: number;
  /** 라인 항목이 없는 정액 문서 → 총액 직접 입력 */
  lumpSum: boolean;
};

/** 편집 화면 상단의 문서 메타 정보(거래처·종류·총액) 편집 카드 */
export function DocumentMetaFields({
  clientName,
  onClientNameChange,
  type,
  onTypeChange,
  amount,
  onAmountChange,
  total,
  lumpSum,
}: DocumentMetaFieldsProps) {
  return (
    <Card>
      <CardContent className="grid gap-6 sm:grid-cols-3">
        <div>
          <Label htmlFor="doc-client" className="text-xs text-muted-foreground">
            거래처
          </Label>
          <Input
            id="doc-client"
            value={clientName}
            onChange={(e) => onClientNameChange(e.target.value)}
            placeholder="거래처명"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="doc-type" className="text-xs text-muted-foreground">
            종류
          </Label>
          <Select value={type} onValueChange={onTypeChange}>
            <SelectTrigger id="doc-type" className="mt-1.5 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {DOCUMENT_TYPE_LABELS[t as DocumentType]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label
            htmlFor={lumpSum ? "doc-amount" : undefined}
            className="text-xs text-muted-foreground"
          >
            총액{lumpSum ? " (직접 입력)" : ""}
          </Label>
          {lumpSum ? (
            <Input
              id="doc-amount"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => onAmountChange(Number(e.target.value) || 0)}
              className="mt-1.5 tabular-nums"
            />
          ) : (
            <p className="mt-2.5 text-lg font-semibold tabular-nums">
              {formatKRW(total)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
