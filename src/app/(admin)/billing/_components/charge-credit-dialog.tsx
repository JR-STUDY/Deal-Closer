"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatNumber } from "@/lib/format";

const PRESET_AMOUNTS = [50, 100, 200];

/** 크레딧 충전 다이얼로그 — 금액 입력 후 충전을 목업 처리한다 */
export function ChargeCreditDialog() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("100");

  function handleCharge() {
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("충전할 크레딧 수량을 올바르게 입력해 주세요.");
      return;
    }
    toast.success(`${formatNumber(value)} Credits 충전이 완료되었습니다 (데모).`);
    setOpen(false);
    setAmount("100");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Sparkles className="size-4" />
          크레딧 충전
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>크레딧 충전</DialogTitle>
          <DialogDescription>
            충전할 크레딧 수량을 입력해 주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-1.5">
            {PRESET_AMOUNTS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount(String(preset))}
              >
                +{formatNumber(preset)}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="charge-amount">충전 수량 (Credits)</Label>
            <Input
              id="charge-amount"
              type="number"
              min={1}
              placeholder="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button onClick={handleCharge}>충전하기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
