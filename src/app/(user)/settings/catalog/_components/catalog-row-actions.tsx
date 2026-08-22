"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  catalogDeleteMessage,
  toCatalogFormValues,
  type CatalogItemDTO,
} from "@/lib/catalog";
import { CatalogFormDialog } from "./catalog-form-dialog";

/** 삭제 확인창이 문서 수를 가져오는 동안 보여줄 문구 */
const COUNTING = "이 품목을 담은 문서가 있는지 확인하고 있습니다…";

/**
 * 품목 카탈로그 목록 행 액션 — 수정 · 삭제.
 *
 * 품목 상세 화면이 없으므로 수정도 **목록에서 폼 다이얼로그**로 한다(등록과 같은 한 벌을
 * 쓴다 — 두 벌이면 제약이 갈린다). 거래처 목록의 `account-row-actions` 와 같은 골격이다.
 *
 * 삭제 확인창은 **결과를 미리 말한다**: 품목명이 같은 문서가 몇 건인지, 그래도 이미 만든
 * 문서의 금액은 바뀌지 않는다는 사실, 그리고 지우는 대신 비활성으로 내리는 길. 문서 수는
 * 확인창을 열 때 한 번만 가져온다 — 목록 행마다 세면 페이지를 볼 때마다 조회가 10배로 는다.
 */
export function CatalogRowActions({
  item,
  categories,
}: {
  item: CatalogItemDTO;
  /** 수정 팝업의 카테고리 후보 (목록이 한 번만 조회해 내려준다) */
  categories: string[];
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  /** null = 아직 세는 중 */
  const [documentCount, setDocumentCount] = useState<number | null>(null);

  const openDelete = async () => {
    setDocumentCount(null);
    setPendingDelete(true);
    try {
      const res = await fetch(`/api/catalog/${item.id}`);
      const json = await res.json().catch(() => null);
      // 세지 못해도 삭제 자체는 막지 않는다 — 0 건으로 단정하지 않고 안내 문구만 바꾼다
      setDocumentCount(
        res.ok && typeof json?.data?.documentCount === "number"
          ? json.data.documentCount
          : -1,
      );
    } catch {
      setDocumentCount(-1);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/catalog/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error ?? "삭제에 실패했습니다.");
        return;
      }
      toast.success(`"${item.name}" 을(를) 삭제했습니다.`);
      setPendingDelete(false);
      router.refresh();
    } catch {
      toast.error("삭제에 실패했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`${item.name} 관리`}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setIsEditing(true)}>
            <Pencil aria-hidden="true" />
            수정
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={openDelete}>
            <Trash2 aria-hidden="true" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isEditing ? (
        <CatalogFormDialog
          // 최신 값으로 매번 새로 초기화한다 (파생 state 없이 리마운트로 해결)
          key={item.updatedAt}
          itemId={item.id}
          initial={toCatalogFormValues(item)}
          categories={categories}
          title="품목 수정"
          description={`"${item.name}" 의 정보를 수정합니다. 이미 만든 문서의 품목표는 담을 때의 값을 복사해 두었으므로 바뀌지 않습니다.`}
          onSaved={() => router.refresh()}
          onClose={() => setIsEditing(false)}
        />
      ) : null}

      {pendingDelete ? (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setPendingDelete(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>품목을 삭제할까요?</AlertDialogTitle>
              {/*
                문서 수는 열고 나서 도착한다. 확인창은 화면 중앙에 고정되어 **높이가 바뀌면
                위아래가 함께 움직이므로**, 문구 자리를 미리 잡아 둔다(팝업 안 비동기 목록에서
                배운 규칙과 같다).
              */}
              <AlertDialogDescription className="min-h-24">
                {documentCount === null
                  ? COUNTING
                  : documentCount < 0
                    ? `"${item.name}" 을(를) 삭제합니다. 이 품목을 담은 문서가 몇 건인지는 확인하지 못했습니다. 문서의 품목표는 담을 때 이름·단가를 복사해 두므로 삭제하셔도 이미 만든 문서의 금액은 그대로입니다. 이 작업은 되돌릴 수 없습니다.`
                    : catalogDeleteMessage(item.name, documentCount)}
              </AlertDialogDescription>
              <p className="text-xs text-muted-foreground">
                지우지 않고 <strong className="font-medium">비활성</strong> 으로
                내리시면 새 견적서의 선택 목록에서만 감춰지고 품목 기록은 남습니다.
              </p>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                disabled={isDeleting || documentCount === null}
              >
                {isDeleting ? "삭제 중…" : "삭제"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
