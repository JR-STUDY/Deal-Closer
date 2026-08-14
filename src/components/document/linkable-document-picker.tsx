"use client";

import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatKRW } from "@/lib/format";
import { DocTypeBadge, StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * 기회에 연결할 보관함 문서 선택 (기회-5 2번 · 기회-17).
 *
 * 등록 팝업과 기회 상세가 **같은 후보 목록**을 보도록 한 컴포넌트로 모은다.
 * 후보 규칙(아직 어느 기회에도 붙지 않음 · 폐기 아님)은 서버가 정한다 —
 * 화면이 스스로 거르면 서버가 거부하는 문서를 목록에 띄우게 된다.
 *
 * 선택은 실제 `<input type="checkbox">` 다. 목록을 흉내 낸 div 로 만들면 키보드 이동·
 * 화면 낭독기 안내를 전부 다시 만들어야 한다 (정책 ACC_*).
 */

export type LinkableDocumentItem = {
  id: string;
  title: string;
  type: string;
  status: string;
  /** 총액 (KRW 정수) — 이 문서가 확정되면 그대로 기회의 예상 금액이 된다 */
  amount: number;
  createdAt: string;
};

export function LinkableDocumentPicker({
  selectedIds,
  onChange,
  disabled,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  // 체크박스 id 의 뿌리 — 한 화면에 이 목록이 둘 있어도 라벨이 엉키지 않는다
  const fieldPrefix = useId();
  const [documents, setDocuments] = useState<LinkableDocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // 후보는 한 번만 읽는다. 목록이 크지 않아 걸러내기는 화면에서 즉시 처리한다.
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/documents?linkable=1", {
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error);
        setDocuments(json.data as LinkableDocumentItem[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("문서 목록을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  const keyword = query.trim().toLowerCase();
  const visible = keyword
    ? documents.filter((document) =>
        document.title.toLowerCase().includes(keyword),
      )
    : documents;

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((one) => one !== id)
        : [...selectedIds, id],
    );
  };

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        문서를 불러오는 중입니다…
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (documents.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        연결할 수 있는 문서가 없습니다. 보관함의 문서가 모두 다른 기회에
        연결되어 있거나 폐기된 상태입니다.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        type="search"
        value={query}
        aria-label="문서 제목으로 찾기"
        placeholder="문서 제목으로 찾기"
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
      />

      {/*
        컬럼 폭을 고정한다 (2차 피드백 2번 — 목록 화면과 같은 규칙).
        표 기본값(table-layout: auto)은 **그 순간 남아 있는 행**으로 폭을 다시 계산해서,
        검색어를 한 글자 넣을 때마다 칸 경계가 옮겨가고 긴 제목이 걸리면 좌우 스크롤까지 생긴다.
        `table-fixed` 는 머리행에 적힌 폭만 보므로 검색 전후로 자리가 그대로다.
        남는 폭은 **문서 칸 하나만** 흡수한다(폭을 적지 않은 유일한 칸).
      */}
      <div className="max-h-56 overflow-y-auto rounded-md border">
        <Table className="table-fixed">
          {/* 머리행은 스크롤해도 남는다 — 어느 칸이 금액인지 보이지 않으면 폭 고정이 무의미하다 */}
          <TableHeader className="sticky top-0 z-10 bg-popover">
            <TableRow>
              {/* 40px: 체크박스(16px) + 셀 좌우 여백 */}
              <TableHead className="w-10">
                <span className="sr-only">선택</span>
              </TableHead>
              {/* 폭 미지정 = 남는 폭 전부 */}
              <TableHead>문서</TableHead>
              {/* 120px: "₩1,800,000,000"(10억대)까지 한 줄로 들어가는 폭 */}
              <TableHead className="w-[120px] text-right">금액</TableHead>
              {/* 72px·88px: 가장 긴 배지("제안서"·"발송완료") 기준 */}
              <TableHead className="w-[72px]">종류</TableHead>
              <TableHead className="w-[88px]">상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((document) => {
              const isSelected = selectedIds.includes(document.id);
              const checkboxId = `${fieldPrefix}-${document.id}`;
              return (
                <TableRow
                  key={document.id}
                  className={cn(isSelected && "bg-muted")}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      id={checkboxId}
                      className="size-4 accent-primary"
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => toggle(document.id)}
                    />
                  </TableCell>
                  {/* 말줄임 + title — 잘린 자리에 커서를 올리면 전체 제목이 뜬다 */}
                  <TableCell className="overflow-hidden">
                    <label
                      htmlFor={checkboxId}
                      className="block cursor-pointer truncate font-medium"
                      title={document.title}
                    >
                      {document.title}
                    </label>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatDate(document.createdAt)} 생성
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatKRW(document.amount)}
                  </TableCell>
                  <TableCell>
                    <DocTypeBadge type={document.type} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={document.status} />
                  </TableCell>
                </TableRow>
              );
            })}

            {/*
              0건일 때도 표 골격(머리행)은 남는다 — 표가 통째로 사라졌다 나타나면
              지웠을 때 폭이 다시 튀고, 이 목록이 표인지도 알 수 없다.
            */}
            {visible.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={5}
                  className="p-4 text-center text-muted-foreground"
                >
                  &ldquo;{query.trim()}&rdquo; 와 일치하는 문서가 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
