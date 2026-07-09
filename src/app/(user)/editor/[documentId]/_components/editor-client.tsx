"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { Document, DocumentItem } from "@/generated/prisma/client";
import { formatKRW } from "@/lib/format";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem as SelectOption,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** 편집용 라인아이템 — key 는 DB id 가 아닌 로컬 렌더용 식별자 */
type EditableItem = {
  key: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

type EditorClientProps = {
  document: Document & { items: DocumentItem[] };
};

/**
 * 문서 제목·거래처·종류·라인아이템(또는 총액)을 편집하고 저장하는 웹 에디터.
 * - 라인 항목이 있는 문서: 총액을 항목 합계로 서버에서 재계산한다.
 * - 라인 항목이 없는 문서: 총액을 직접 입력한다 (계약서·NDA 등 정액 문서).
 *   → 항목 없는 문서를 저장할 때 총액이 0 으로 덮어써지지 않도록 분기한다.
 */
export function EditorClient({ document }: EditorClientProps) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();

  // 원래 라인 항목이 있었는지 — 저장 시 "항목 비우기"와 "정액 문서"를 구분하는 기준
  const hadItems = document.items.length > 0;

  const [title, setTitle] = useState(document.title);
  const [clientName, setClientName] = useState(document.clientName ?? "");
  const [type, setType] = useState(document.type);
  const [amount, setAmount] = useState(document.amount);
  const [items, setItems] = useState<EditableItem[]>(
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
      {/* 문서 메타 정보 (편집 가능) */}
      <Card>
        <CardContent className="grid gap-6 sm:grid-cols-3">
          <div>
            <Label
              htmlFor="doc-client"
              className="text-xs text-muted-foreground"
            >
              거래처
            </Label>
            <Input
              id="doc-client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="거래처명"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="doc-type" className="text-xs text-muted-foreground">
              종류
            </Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="doc-type" className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((t) => (
                  <SelectOption key={t} value={t}>
                    {DOCUMENT_TYPE_LABELS[t as DocumentType]}
                  </SelectOption>
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
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>품목명 / 설명</TableHead>
                  <TableHead className="text-right">수량</TableHead>
                  <TableHead className="text-right">단가</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      항목이 없습니다. &ldquo;항목 추가&rdquo;로 견적 항목을
                      추가해주세요.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell className="min-w-56">
                        <Input
                          value={item.name}
                          onChange={(e) =>
                            updateItem(item.key, "name", e.target.value)
                          }
                          placeholder="품목명"
                          className="mb-1.5 font-medium"
                        />
                        <Input
                          value={item.description}
                          onChange={(e) =>
                            updateItem(item.key, "description", e.target.value)
                          }
                          placeholder="설명(선택)"
                          className="text-xs text-muted-foreground"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(
                              item.key,
                              "quantity",
                              Number(e.target.value) || 0,
                            )
                          }
                          className="ml-auto w-20 text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItem(
                              item.key,
                              "unitPrice",
                              Number(e.target.value) || 0,
                            )
                          }
                          className="ml-auto w-28 text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatKRW(item.quantity * item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(item.key)}
                          aria-label="항목 삭제"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">
                    합계
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatKRW(itemsTotal)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
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
