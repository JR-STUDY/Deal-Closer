"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { OPPORTUNITY_NAME_MAX } from "@/lib/opportunity";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 갱신 기회 만들기 (F-115 · F-306) — 수주한 기회 상세의 헤더 액션.
 *
 * 수주로 끝난 거래는 대개 다음 해에 다시 온다. 그 다음 건을 **새 기회**로 세우고
 * 이전 건과 이어 둔다(`previousOpportunityId` 체인) — 원본은 `수주` 로 그대로 남는다.
 * 단계를 되돌려 재활용하지 않는다: 그러면 이미 딴 계약의 기록이 사라진다.
 *
 * **판정은 이 컴포넌트가 하지 않는다.** 상세 화면이 `@/lib/opportunity-renewal` 의
 * 순수 함수로 한 번 판정해 `canRenew` 를 내려 주고, 서버(`POST .../renewal`)가 같은
 * 함수로 다시 판정한다 — 같은 규칙이 세 곳에 있으면 갈라진다.
 *
 * 이미 갱신한 기회에는 버튼 대신 **다음 기회로 가는 링크**를 둔다. 갈 수 없는 문을
 * 그려 두지 않고, 대신 어디로 이어졌는지 알려 주는 편이 낫다.
 *
 * 폼에서 정하는 값은 **기회명과 예상 마감일뿐**이다 — 거래처·영업 담당자는 원본에서
 * 물려받고(갱신의 뜻이 그것이다), 예상 금액은 확정 문서에서 파생되므로 폼에 없다(기회-6).
 */
export function RenewalOpportunityButton({
  opportunityId,
  canRenew,
  nextOpportunity,
  suggestedName,
  suggestedCloseDate,
}: {
  opportunityId: string;
  /** 상세 화면이 순수 함수로 내린 판정 (여기서 다시 판단하지 않는다) */
  canRenew: boolean;
  /** 이미 이어진 다음 기회 (없으면 null) */
  nextOpportunity: { id: string; name: string } | null;
  /** `{원본명} (갱신)` — 서버가 같은 함수로 만든 값이라 화면과 저장이 같다 */
  suggestedName: string;
  /** `YYYY-MM-DD` — 원본 마감일 + 1년 (지난 계약이면 다음 해로 밀어 낸 값) */
  suggestedCloseDate: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(suggestedName);
  const [closeDate, setCloseDate] = useState(suggestedCloseDate);
  const [isSaving, setIsSaving] = useState(false);

  if (nextOpportunity) {
    return (
      <Button variant="outline" asChild>
        <Link href={`/opportunities/${nextOpportunity.id}`}>
          <ArrowRight className="size-4" aria-hidden="true" />
          갱신 기회 보기
        </Link>
      </Button>
    );
  }

  if (!canRenew) return null;

  const submit = async () => {
    setIsSaving(true);
    const failureMessage = "갱신 기회를 만들지 못했습니다.";
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/renewal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expectedCloseDate: closeDate }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? failureMessage);
        return;
      }
      const created = json.data as { id: string; name: string };
      toast.success(`“${created.name}” 을(를) 만들었습니다.`);
      /*
       * 새 기회로 옮겨 가되 `router.push` 전에 캐시를 비운다 — 원본 상세도 "갱신 기회
       * 보기" 로 바뀌어야 하므로, 뒤로 돌아왔을 때 예전 화면이 남아 있으면 같은 버튼을
       * 한 번 더 누르게 된다 (발송 후 되돌아가는 흐름과 같은 이유).
       */
      router.refresh();
      router.push(`/opportunities/${created.id}`);
    } catch {
      toast.error(failureMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const trimmedName = name.trim();
  const canSubmit =
    !isSaving && trimmedName.length > 0 && trimmedName.length <= OPPORTUNITY_NAME_MAX;

  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        <RefreshCw className="size-4" aria-hidden="true" />
        갱신 기회 만들기
      </Button>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (isSaving) return;
          setIsOpen(open);
          // 닫았다 다시 열면 제안값에서 시작한다 (고치다 만 값이 남아 있으면 헷갈린다)
          if (!open) {
            setName(suggestedName);
            setCloseDate(suggestedCloseDate);
          }
        }}
      >
        {/* 껍데기는 넘치지 않고 본문만 스크롤한다 (기회 등록 팝업과 같은 골격) */}
        <DialogContent className="flex max-h-[90svh] flex-col gap-4 overflow-hidden sm:max-w-md">
          <DialogHeader className="shrink-0">
            <DialogTitle>갱신 기회 만들기</DialogTitle>
            <DialogDescription>
              같은 거래처·같은 영업 담당자로 새 기회를 초기 단계에 만들고 이
              기회와 이어 둡니다. 예상 금액은 새 기회에 문서를 연결하시면
              정해집니다.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
            <div className="space-y-1.5">
              <Label htmlFor="renewal-name">
                기회명
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              </Label>
              <Input
                id="renewal-name"
                value={name}
                maxLength={OPPORTUNITY_NAME_MAX}
                disabled={isSaving}
                onChange={(event) => setName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                이전 기회명에서 따온 이름입니다. 자유롭게 고치실 수 있습니다.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="renewal-close-date">예상 마감일</Label>
              <Input
                id="renewal-close-date"
                type="date"
                value={closeDate}
                disabled={isSaving}
                onChange={(event) => setCloseDate(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                이전 마감일에서 1년 뒤로 채워 두었습니다. 비워 두시면 미정이
                됩니다.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => setIsOpen(false)}
            >
              취소
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {isSaving ? "만드는 중…" : "만들기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
