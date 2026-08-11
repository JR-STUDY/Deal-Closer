"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, formatKRW } from "@/lib/format";
import {
  OPPORTUNITY_MEMO_MAX,
  OPPORTUNITY_NAME_MAX,
  formatAmountInput,
  parseAmountInput,
  toOpportunityFormValues,
  type OpportunityAccountOption,
  type OpportunityDTO,
  type OpportunityFormValues,
  type OpportunityOwnerOption,
} from "@/lib/opportunity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * 기회 상세의 **인라인 실시간 수정** (기회-7).
 *
 * 수정 다이얼로그 대신 상세 화면에서 값을 바로 고친다. 필드를 누르면(마우스 클릭 또는 Tab 초점
 * + Enter·Space) 입력으로 바뀌고, blur·Enter 로 저장하며 Esc 로 되돌린다 — 표시 상태가 실제
 * `<button>` 이라 마우스 없이도 같은 경로로 도달한다 (정책 ACC_*).
 *
 * 저장은 **고친 필드 하나만** `PATCH /api/opportunities/:id` 로 보낸다. 서버가 빠진 필드를
 * 현재 값으로 채워 `parseOpportunityInput()` 한 곳으로 검증하므로 다이얼로그 저장과 제약이 같다.
 * 화면에는 먼저 반영하고(낙관적 업데이트) 실패하면 이전 값으로 되돌린 뒤 toast 로 알린다 —
 * 칸반 단계 전이와 같은 방식이다.
 *
 * **단계(stage)는 여기서 다루지 않는다** — 전이는 활동 이력과 한 트랜잭션이어야 하므로
 * 스테퍼가 `POST /api/opportunities/:id/stage` 로만 처리한다 (AGENTS.md 규칙).
 */

/** 인라인으로 고칠 수 있는 필드 */
type FieldKey = keyof OpportunityFormValues;

/** 안내 문구에 쓸 필드 이름 (정책 COPY-TONE) */
const FIELD_LABELS: Record<FieldKey, string> = {
  accountId: "거래처",
  name: "기회명",
  expectedAmount: "예상 금액",
  expectedCloseDate: "예상 마감일",
  // 거래처 담당자(Account.contactName)와 헷갈리지 않도록 못박는다 (기회-14)
  ownerId: "영업 담당자",
  memo: "메모",
};

/** 값이 비었을 때 대신 보여줄 안내 */
const EMPTY_CLOSE_DATE_HINT = "아직 정하지 않았습니다. 눌러서 입력해주세요.";
const EMPTY_MEMO_HINT =
  "아직 메모가 없습니다. 눌러서 상담 내용·경쟁사·결재 라인을 남겨보세요.";

/** 기본 정보 한 줄 — 라벨 폭을 고정해 값 길이에 따라 줄이 흔들리지 않게 한다 */
function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-3 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/**
 * 표시 상태 — 누르면 편집으로 바뀐다.
 * 연필 아이콘은 hover·초점일 때만 드러내 평소 화면을 조용하게 두되, **초점에서도 보이게** 해
 * 키보드 사용자가 "여기는 고칠 수 있는 칸"임을 알 수 있게 한다 (ACC_*).
 */
function DisplayButton({
  label,
  isEmpty,
  isSaving,
  onEdit,
  children,
}: {
  label: string;
  isEmpty: boolean;
  isSaving: boolean;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={`${label} 수정`}
      onClick={onEdit}
      className="group -mx-2 flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span
        className={cn(
          "min-w-0 flex-1 break-words",
          isEmpty && "text-muted-foreground",
        )}
      >
        {children}
      </span>
      {isSaving ? (
        <span className="shrink-0 text-xs text-muted-foreground">저장 중…</span>
      ) : (
        <Pencil
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      )}
    </button>
  );
}

/**
 * 한 줄 입력 편집기 — Enter·blur 로 저장, Esc 로 취소한다.
 *
 * Esc 로 취소하면 곧바로 언마운트되며 blur 가 뒤따를 수 있어, 저장·취소가 한 번만 일어나도록
 * ref 로 잠근다 (취소했는데 blur 가 다시 저장하는 일을 막는다).
 */
function InlineTextEditor({
  label,
  initial,
  type,
  maxLength,
  inputMode,
  transform,
  onCommit,
  onCancel,
}: {
  label: string;
  initial: string;
  type?: "text" | "date";
  maxLength?: number;
  inputMode?: "numeric";
  /** 입력을 표시 형식으로 다듬는다 (예: 금액 천단위 구분) */
  transform?: (raw: string) => string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const settled = useRef(false);

  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    onCommit(draft);
  };

  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };

  return (
    <Input
      autoFocus
      aria-label={label}
      type={type ?? "text"}
      inputMode={inputMode}
      maxLength={maxLength}
      value={draft}
      onChange={(event) =>
        setDraft(transform ? transform(event.target.value) : event.target.value)
      }
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
    />
  );
}

/** 여러 줄 편집기 — Enter 는 줄바꿈이라 blur·⌘/Ctrl+Enter 로 저장하고 Esc 로 취소한다 */
function InlineTextAreaEditor({
  label,
  initial,
  onCommit,
  onCancel,
}: {
  label: string;
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const settled = useRef(false);

  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    onCommit(draft);
  };

  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };

  return (
    <div className="space-y-1.5">
      <Textarea
        autoFocus
        aria-label={label}
        aria-describedby="opportunity-memo-hint"
        rows={5}
        maxLength={OPPORTUNITY_MEMO_MAX}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
      />
      <p id="opportunity-memo-hint" className="text-xs text-muted-foreground">
        다른 곳을 누르시거나 ⌘/Ctrl+Enter 를 누르시면 저장됩니다. Esc 를 누르시면
        되돌립니다.
      </p>
    </div>
  );
}

/** 셀렉트 편집기 — 열린 채로 시작하고, 고르면 저장·닫으면 취소한다 */
function InlineSelectEditor({
  label,
  value,
  options,
  placeholder,
  onCommit,
  onCancel,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  return (
    <Select
      defaultOpen
      value={value}
      onValueChange={onCommit}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function OpportunityInlineFields({
  opportunity,
  accounts,
  owners,
}: {
  opportunity: OpportunityDTO;
  accounts: OpportunityAccountOption[];
  owners: OpportunityOwnerOption[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<OpportunityFormValues>(() =>
    toOpportunityFormValues(opportunity),
  );
  const [editingKey, setEditingKey] = useState<FieldKey | null>(null);
  const [savingKey, setSavingKey] = useState<FieldKey | null>(null);

  const accountName =
    accounts.find((account) => account.id === values.accountId)?.companyName ??
    opportunity.accountName;
  const ownerName =
    owners.find((owner) => owner.id === values.ownerId)?.name ??
    opportunity.ownerName;

  const save = async (key: FieldKey, nextValue: string) => {
    const previous = values[key];
    setEditingKey(null);
    if (previous === nextValue) return;

    // 낙관적 반영 — 저장에 실패하면 previous 로 되돌린다
    setValues((current) => ({ ...current, [key]: nextValue }));
    setSavingKey(key);
    const failureMessage = `${FIELD_LABELS[key]} 변경을 저장하지 못했습니다.`;

    try {
      const res = await fetch(`/api/opportunities/${opportunity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: nextValue }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? failureMessage);

      // 서버가 다듬은 값(공백 제거·금액 정수화)으로 맞춰 화면과 저장값이 어긋나지 않게 한다
      setValues(toOpportunityFormValues(json.data as OpportunityDTO));
      toast.success("변경 사항을 저장했습니다.");
      // 헤더 브레드크럼처럼 서버에서 그린 부분도 함께 갱신한다
      router.refresh();
    } catch (error) {
      setValues((current) => ({ ...current, [key]: previous }));
      toast.error(error instanceof Error ? error.message : failureMessage);
    } finally {
      setSavingKey(null);
    }
  };

  /** 표시 상태 한 칸 (편집 중이 아닐 때만 쓴다) */
  const display = (key: FieldKey, content: React.ReactNode, isEmpty = false) => (
    <DisplayButton
      label={FIELD_LABELS[key]}
      isEmpty={isEmpty}
      isSaving={savingKey === key}
      onEdit={() => setEditingKey(key)}
    >
      {content}
    </DisplayButton>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <InfoRow label={FIELD_LABELS.name}>
              {editingKey === "name" ? (
                <InlineTextEditor
                  label={FIELD_LABELS.name}
                  initial={values.name}
                  maxLength={OPPORTUNITY_NAME_MAX}
                  onCommit={(next) => save("name", next)}
                  onCancel={() => setEditingKey(null)}
                />
              ) : (
                display("name", values.name)
              )}
            </InfoRow>

            <InfoRow label={FIELD_LABELS.accountId}>
              {editingKey === "accountId" ? (
                <InlineSelectEditor
                  label={FIELD_LABELS.accountId}
                  value={values.accountId}
                  placeholder="거래처를 선택해주세요"
                  options={accounts.map((account) => ({
                    value: account.id,
                    label: account.companyName,
                  }))}
                  onCommit={(next) => save("accountId", next)}
                  onCancel={() => setEditingKey(null)}
                />
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  {display("accountId", accountName)}
                  {/* 값 영역은 수정 진입에 쓰이므로 거래처로 가는 길은 따로 남긴다 */}
                  <Link
                    href={`/accounts/${values.accountId}`}
                    className="shrink-0 rounded text-xs text-muted-foreground transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    거래처 보기
                  </Link>
                </div>
              )}
            </InfoRow>

            {/* 단계는 위 스테퍼가 더 정확히(지나온·현재·남은·마감) 보여주므로 여기서 뺀다 */}
            <InfoRow label={FIELD_LABELS.expectedAmount}>
              {editingKey === "expectedAmount" ? (
                <InlineTextEditor
                  label={FIELD_LABELS.expectedAmount}
                  initial={values.expectedAmount}
                  inputMode="numeric"
                  transform={formatAmountInput}
                  onCommit={(next) => save("expectedAmount", next)}
                  onCancel={() => setEditingKey(null)}
                />
              ) : (
                display(
                  "expectedAmount",
                  formatKRW(parseAmountInput(values.expectedAmount)),
                )
              )}
            </InfoRow>

            <InfoRow label={FIELD_LABELS.expectedCloseDate}>
              {editingKey === "expectedCloseDate" ? (
                <InlineTextEditor
                  label={FIELD_LABELS.expectedCloseDate}
                  initial={values.expectedCloseDate}
                  type="date"
                  onCommit={(next) => save("expectedCloseDate", next)}
                  onCancel={() => setEditingKey(null)}
                />
              ) : (
                display(
                  "expectedCloseDate",
                  values.expectedCloseDate
                    ? formatDate(values.expectedCloseDate)
                    : EMPTY_CLOSE_DATE_HINT,
                  !values.expectedCloseDate,
                )
              )}
            </InfoRow>

            <InfoRow label={FIELD_LABELS.ownerId}>
              {editingKey === "ownerId" ? (
                <InlineSelectEditor
                  label={FIELD_LABELS.ownerId}
                  value={values.ownerId}
                  placeholder="영업 담당자를 선택해주세요"
                  options={owners.map((owner) => ({
                    value: owner.id,
                    label: owner.name,
                  }))}
                  onCommit={(next) => save("ownerId", next)}
                  onCancel={() => setEditingKey(null)}
                />
              ) : (
                display("ownerId", ownerName)
              )}
            </InfoRow>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">메모</CardTitle>
        </CardHeader>
        <CardContent>
          {editingKey === "memo" ? (
            <InlineTextAreaEditor
              label={FIELD_LABELS.memo}
              initial={values.memo}
              onCommit={(next) => save("memo", next)}
              onCancel={() => setEditingKey(null)}
            />
          ) : (
            <DisplayButton
              label={FIELD_LABELS.memo}
              isEmpty={!values.memo}
              isSaving={savingKey === "memo"}
              onEdit={() => setEditingKey("memo")}
            >
              <span className="block text-sm leading-relaxed whitespace-pre-line">
                {values.memo || EMPTY_MEMO_HINT}
              </span>
            </DisplayButton>
          )}
        </CardContent>
      </Card>
    </>
  );
}
