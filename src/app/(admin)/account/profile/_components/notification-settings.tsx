"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const NOTIFICATIONS = [
  {
    key: "approval",
    label: "승인 요청 알림",
    description: "팀원의 승인 요청이 들어오면 알려드립니다.",
    defaultChecked: true,
  },
  {
    key: "contractCompleted",
    label: "계약 완료 알림",
    description: "문서가 계약완료 상태로 전환되면 알려드립니다.",
    defaultChecked: true,
  },
  {
    key: "systemNotice",
    label: "시스템 공지 알림",
    description: "서비스 점검 및 주요 공지사항을 알려드립니다.",
    defaultChecked: false,
  },
] as const;

/** 알림 설정 카드 — 스위치 변경 시 저장을 목업 처리한다 */
export function NotificationSettings() {
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(
      NOTIFICATIONS.map((n) => [n.key, n.defaultChecked]),
    ),
  );

  function handleToggle(key: string, label: string, next: boolean) {
    setChecked((prev) => ({ ...prev, [key]: next }));
    toast.success(`${label}이 ${next ? "켜짐" : "꺼짐"}으로 변경되었습니다.`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">알림 설정</CardTitle>
        <CardDescription>
          받고 싶은 알림 유형을 선택해 주세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {NOTIFICATIONS.map((notification, index) => (
          <div key={notification.key}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <Label htmlFor={`notif-${notification.key}`}>
                  {notification.label}
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {notification.description}
                </p>
              </div>
              <Switch
                id={`notif-${notification.key}`}
                checked={checked[notification.key]}
                onCheckedChange={(next) =>
                  handleToggle(notification.key, notification.label, next)
                }
              />
            </div>
            {index < NOTIFICATIONS.length - 1 ? (
              <Separator className="mt-4" />
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
