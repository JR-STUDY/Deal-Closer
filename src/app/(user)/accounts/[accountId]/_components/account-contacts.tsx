"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Star, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  resolveDeletion,
  sortContacts,
  toContactFormValues,
  type ContactDTO,
} from "@/lib/contact";
import { ContactAddDialog } from "./contact-add-dialog";
import { ContactFormDialog, type PrimaryLock } from "./contact-form-dialog";

/**
 * 거래처 담당자 관리 카드 (거래처-8).
 *
 * 목록 화면은 대표 1명만 보여주고, 담당자의 추가·수정·삭제·대표 지정은 **여기서 전부** 한다.
 * 규칙 판정은 화면이 하지 않는다 — `@/lib/contact` 순수 함수와 서버가 같은 기준을 쓰고,
 * 이 컴포넌트는 그 결과를 보여주기만 한다(삭제 확인창의 승격 예고도 같은 함수로 계산한다).
 *
 * 저장 후에는 `router.refresh()` 로 서버 컴포넌트를 다시 그린다. 담당자 목록은 대표 해제까지
 * 함께 움직여서 한 건만 낙관적으로 갈아끼우면 다른 행과 어긋난다.
 */
export function AccountContacts({
  accountId,
  companyName,
  contacts,
}: {
  accountId: string;
  companyName: string;
  contacts: ContactDTO[];
}) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<ContactDTO | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ContactDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 대표가 맨 앞, 그다음 등록 순 — 목록에 노출되는 사람이 맨 위에 있어야 읽힌다
  const sorted = sortContacts(contacts);

  /** ⋯ 메뉴의 "대표로 지정" — 현재 값을 그대로 보내고 대표 여부만 올린다 */
  const handleSetPrimary = async (contact: ContactDTO) => {
    setBusyId(contact.id);
    try {
      const res = await fetch(
        `/api/accounts/${accountId}/contacts/${contact.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: contact.name,
            position: contact.position ?? "",
            phone: contact.phone ?? "",
            email: contact.email ?? "",
            isPrimary: true,
          }),
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error ?? "대표 담당자 지정에 실패했습니다.");
        return;
      }
      toast.success(`${contact.name} 님을 대표 담당자로 지정했습니다.`);
      router.refresh();
    } catch {
      toast.error("대표 담당자 지정에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (contact: ContactDTO) => {
    setBusyId(contact.id);
    try {
      const res = await fetch(
        `/api/accounts/${accountId}/contacts/${contact.id}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "삭제에 실패했습니다.");
        return;
      }
      // 승격은 조용히 일어나면 안 된다 — 목록에 나오는 이름이 바뀌기 때문이다
      const promoted = json?.data?.promoted as { name: string } | null;
      toast.success(
        promoted
          ? `${contact.name} 님을 삭제하고 ${promoted.name} 님을 대표 담당자로 지정했습니다.`
          : `${contact.name} 님을 삭제했습니다.`,
      );
      setPendingDelete(null);
      router.refresh();
    } catch {
      toast.error("삭제에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  /** 수정 다이얼로그의 대표 스위치 잠금 상태 (왜 못 바꾸는지까지 다이얼로그가 알린다) */
  const editingLock: PrimaryLock = editing?.isPrimary ? "current" : "none";

  // 삭제 확인창에서 미리 알릴 승격 대상 — 서버와 같은 순수 함수로 계산한다
  const successor = pendingDelete
    ? resolveDeletion(sorted, pendingDelete.id).promoted
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">
            담당자
            {sorted.length > 0 ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {sorted.length}명
              </span>
            ) : null}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsAdding(true)}
            disabled={busyId !== null}
          >
            <UserPlus className="size-4" aria-hidden="true" />
            담당자 추가
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            아직 등록된 담당자가 없습니다. 담당자를 추가하시면 첫 분이 대표
            담당자가 되어 거래처 목록에 표시됩니다.
          </p>
        ) : (
          <ul className="divide-y">
            {sorted.map((contact) => (
              <li
                key={contact.id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium break-all">
                      {contact.name}
                    </span>
                    {contact.position ? (
                      <span className="text-sm break-all text-muted-foreground">
                        {contact.position}
                      </span>
                    ) : null}
                    {contact.isPrimary ? (
                      <Badge variant="secondary">
                        <Star className="size-3" aria-hidden="true" />
                        대표
                      </Badge>
                    ) : null}
                  </div>
                  {contact.phone || contact.email ? (
                    <div className="text-sm leading-relaxed text-muted-foreground">
                      {contact.phone ? (
                        <span className="tabular-nums">{contact.phone}</span>
                      ) : null}
                      {contact.phone && contact.email ? (
                        <span aria-hidden="true"> · </span>
                      ) : null}
                      {contact.email ? (
                        <span className="break-all">{contact.email}</span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      연락처를 입력하지 않았습니다.
                    </p>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label={`${contact.name} 담당자 관리`}
                      disabled={busyId !== null}
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(contact)}>
                      <Pencil aria-hidden="true" />
                      수정
                    </DropdownMenuItem>
                    {/* 이미 대표면 올릴 곳이 없다 — 내리는 항목은 두지 않는다(대표 0명 방지) */}
                    {contact.isPrimary ? null : (
                      <DropdownMenuItem
                        onSelect={() => handleSetPrimary(contact)}
                      >
                        <Star aria-hidden="true" />
                        대표로 지정
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setPendingDelete(contact)}
                    >
                      <Trash2 aria-hidden="true" />
                      삭제
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {isAdding ? (
        // 추가는 **여러 명**을 한 번에 받는다 (4차 피드백 2) — 등록 팝업과 같은 입력 묶음이다
        <ContactAddDialog
          accountId={accountId}
          companyName={companyName}
          existingContactCount={sorted.length}
          onSaved={() => router.refresh()}
          onClose={() => setIsAdding(false)}
        />
      ) : null}

      {editing ? (
        <ContactFormDialog
          // 최신 값으로 매번 새로 초기화한다 (파생 state 없이 리마운트로 해결)
          key={editing.updatedAt}
          accountId={accountId}
          contactId={editing.id}
          initial={toContactFormValues(editing)}
          title="담당자 수정"
          description={`"${editing.name}" 님의 정보를 수정합니다.`}
          primaryLock={editingLock}
          onSaved={() => router.refresh()}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {pendingDelete ? (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>담당자를 삭제할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                {`"${pendingDelete.name}" 님을 이 거래처의 담당자에서 삭제합니다. 이 작업은 되돌릴 수 없습니다.`}
                {successor
                  ? ` 대표 담당자이므로 삭제 후에는 ${successor.name} 님이 대표 담당자가 됩니다.`
                  : ""}
                {pendingDelete.isPrimary && !successor
                  ? " 마지막 담당자라서 삭제하시면 목록의 담당자 칸이 비게 됩니다."
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busyId !== null}>
                취소
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete(pendingDelete);
                }}
                disabled={busyId !== null}
              >
                {busyId === pendingDelete.id ? "삭제 중…" : "삭제"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </Card>
  );
}
