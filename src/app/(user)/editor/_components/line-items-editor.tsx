"use client";

import { Trash2 } from "lucide-react";
import { formatKRW } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
export type EditableItem = {
  key: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

type LineItemsEditorProps = {
  items: EditableItem[];
  total: number;
  onUpdate: <K extends keyof EditableItem>(
    key: string,
    field: K,
    value: EditableItem[K],
  ) => void;
  onRemove: (key: string) => void;
};

/** 견적 라인아이템 표 편집기 (품목·수량·단가 입력, 행 삭제, 합계 표시) */
export function LineItemsEditor({
  items,
  total,
  onUpdate,
  onRemove,
}: LineItemsEditorProps) {
  return (
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
                  onChange={(e) => onUpdate(item.key, "name", e.target.value)}
                  placeholder="품목명"
                  className="mb-1.5 font-medium"
                />
                <Input
                  value={item.description}
                  onChange={(e) =>
                    onUpdate(item.key, "description", e.target.value)
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
                    onUpdate(item.key, "quantity", Number(e.target.value) || 0)
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
                    onUpdate(item.key, "unitPrice", Number(e.target.value) || 0)
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
                  onClick={() => onRemove(item.key)}
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
            {formatKRW(total)}
          </TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  );
}
