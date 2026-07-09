"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { Document, DocumentItem } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DocumentMetaFields } from "./document-meta-fields";
import { LineItemsEditor, type EditableItem } from "./line-items-editor";

type EditorClientProps = {
  document: Document & { items: DocumentItem[] };
};

/**
 * 문서 제목·거래처·종류·라인아이템(또는 총액)을 편집하고 저장하는 웹 에디터.
 * - 라인 항목이 있는 문서: 총액을 항목 합계로 서버에서 재계산한다.
 * - 라인 항목이 없는 문서: 총액을 직접 입력한다 (계약서·NDA 등 정액 문서).
 *   → 항목 없는 문서를 저장할 때 총액이 0 으로 덮어써지지 않도록 분기한다.
 *
 * 편집 상태는 로컬 state 로 관리하므로, 다른 문서로 이동하면 상위에서
 * `key={document.id}` 로 remount 하여 새 문서 값으로 초기화한다.
 */
export function EditorClient({ document }: EditorClientProps) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();

  // 원래 라인 항목이 있었는지 — 저장 시 "항목 비우기"와 "정액 문서"를 구분하는 기준
  const hadItems = document.items.length > 0;

  // prop 에서 파생한 초기값은 지연 초기화로 1회만 계산한다.
  const [title, setTitle] = useState(() => document.title);
  const [clientName, setClientName] = useState(() => document.clientName ?? "");
  const [type, setType] = useState(() => document.type);
  const [amount, setAmount] = useState(() => document.amount);
  const [items, setItems] = useState<EditableItem[]>(() =>
    document.items.map((item) => ({
      key: item.id,
      name: item.name,
      description: item.description ?? "",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  );

  // 새 행에 부여할 로컬 키 카운터 (사용자 액션 시점에만 증가)
  const newKeyRef = useRef(0);

  const itemsTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items],
  );

  // 라인 항목이 없고 원래도 없던 문서 → 총액 직접 입력 모드
  const lumpSum = items.length === 0 && !hadItems;
  const total = lumpSum ? amount : itemsTotal;

  const updateItem = <K extends keyof EditableItem>(
    key: string,
    field: K,
    value: EditableItem[K],
  ) => {
    setItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, [field]: value } : item,
      ),
    );
  };

  const addItem = () => {
    newKeyRef.current += 1;
    setItems((prev) => [
      ...prev,
      {
        key: `new-${newKeyRef.current}`,
        name: "",
        description: "",
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast.error("문서 제목을 입력해주세요.");
      return;
    }

    startSaving(async () => {
      try {
        const payload: Record<string, unknown> = {
          title: title.trim(),
          clientName,
          type,
        };
        if (items.length > 0) {
          // 라인 항목 편집 → 서버가 총액을 항목 합계로 재계산
          payload.items = items.map(
            ({ name, description, quantity, unitPrice }) => ({
              name,
              description,
              quantity,
              unitPrice,
            }),
          );
        } else if (hadItems) {
          // 원래 있던 항목을 모두 비움 → 항목 삭제 + 총액 0
          payload.items = [];
        } else {
          // 정액 문서 → 총액만 반영 (items 미전송으로 기존 총액 보존)
          payload.amount = amount;
        }

        const res = await fetch(`/api/documents/${document.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();

        toast.success("저장되었습니다.");
        router.refresh();
      } catch {
        toast.error("저장에 실패했습니다.");
      }
    });
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <DocumentMetaFields
        clientName={clientName}
        onClientNameChange={setClientName}
        type={type}
        onTypeChange={setType}
        amount={amount}
        onAmountChange={setAmount}
        total={total}
        lumpSum={lumpSum}
      />

      {/* 제목 편집 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">문서 제목</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="doc-title" className="sr-only">
            문서 제목
          </Label>
          <Input
            id="doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* 라인아이템 편집 */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">견적 항목</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="size-3.5" />
            항목 추가
          </Button>
        </CardHeader>
        <CardContent>
          {lumpSum ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              라인 항목이 없는 문서입니다. 위의 총액을 직접 입력하거나,
              &ldquo;항목 추가&rdquo;로 견적 항목을 구성하면 총액이 항목 합계로
              자동 계산됩니다.
            </p>
          ) : (
            <LineItemsEditor
              items={items}
              total={itemsTotal}
              onUpdate={updateItem}
              onRemove={removeItem}
            />
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "저장 중…" : "저장"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
