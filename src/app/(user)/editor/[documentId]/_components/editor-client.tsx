"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Document, DocumentItem } from "@/generated/prisma/client";
import { formatKRW } from "@/lib/format";
import { DocTypeBadge } from "@/components/status-badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EditableItem = Pick<
  DocumentItem,
  "id" | "name" | "description" | "quantity" | "unitPrice"
>;

type EditorClientProps = {
  document: Document & { items: DocumentItem[] };
};

/** 문서 제목/거래처/라인아이템을 로컬 상태로 편집하는 웹 에디터 (데모: 실제 저장 없음) */
export function EditorClient({ document }: EditorClientProps) {
  const [title, setTitle] = useState(document.title);
  const [items, setItems] = useState<EditableItem[]>(
    document.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  );

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items],
  );

  const updateItem = <K extends keyof EditableItem>(
    id: string,
    key: K,
    value: EditableItem[K],
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    );
  };

  const handleSave = () => {
    toast.success("저장되었습니다 (데모)");
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* 문서 메타 정보 */}
      <Card>
        <CardContent className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">거래처</p>
            <p className="mt-1 font-medium">{document.clientName ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">종류</p>
            <div className="mt-1">
              <DocTypeBadge type={document.type} />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">총액</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatKRW(total)}
            </p>
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
        <CardHeader>
          <CardTitle className="text-base">견적 항목</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>품목명 / 설명</TableHead>
                <TableHead className="text-right">수량</TableHead>
                <TableHead className="text-right">단가</TableHead>
                <TableHead className="text-right">금액</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="min-w-56">
                    <Input
                      value={item.name}
                      onChange={(e) =>
                        updateItem(item.id, "name", e.target.value)
                      }
                      className="mb-1.5 font-medium"
                    />
                    <Input
                      value={item.description ?? ""}
                      onChange={(e) =>
                        updateItem(item.id, "description", e.target.value)
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
                          item.id,
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
                          item.id,
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
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="text-right font-semibold">
                  합계
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatKRW(total)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleSave}>저장</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
