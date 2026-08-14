"use client";

import { useId, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CONTACT_EMAIL_MAX,
  CONTACT_NAME_MAX,
  CONTACT_PHONE_FORMAT,
  CONTACT_PHONE_MAX,
  CONTACT_POSITION_MAX,
  EMPTY_CONTACT_FORM,
  withAppendPrimary,
  type ContactFormValues,
} from "@/lib/contact";

/**
 * 담당자 여러 명을 한 번에 넣는 입력 묶음 (거래처-8 · 2차 피드백 8번 · 4차 피드백 2).
 *
 * **거래처 등록 팝업과 거래처 상세의 "담당자 추가" 가 이 묶음을 함께 쓴다** — 같은 일을
 * 하는 두 폼이 다르게 생기면 사용자가 화면마다 다시 배워야 한다.
 *
 * 대표는 **행마다 놓인 라디오**로 직접 고른다 — 라디오라 하나만 켜지고, 그 하나가
 * "담당자가 1명 이상이면 대표는 정확히 1명" 불변식을 화면에서 그대로 보여준다.
 * 판정 자체는 `@/lib/contact` 의 `resolveAppendIsPrimary` 가 단일 기준이고 서버도 같은
 * 함수를 쓴다 — **이미 담당자가 있는 거래처**(`existingContactCount > 0`)에 덧붙일 때는
 * 아무도 미리 켜지 않는다. 켜 두면 담당자를 한 명 더 넣었을 뿐인데 대표가 바뀐다.
 *
 * 값의 형식 검증은 여기서 하지 않는다 — 저장 직전에 `parseContactAdditions` 한 곳을
 * 통과시킨다. 폼과 API 가 같은 규칙을 쓰려면 규칙이 두 군데 있으면 안 된다.
 */

/** 편집 중인 담당자 한 줄. `key` 는 React 목록 식별자이며 저장할 때는 보내지 않는다 */
export type ContactDraft = ContactFormValues & { key: string };

export function ContactDraftFields({
  rows,
  onChange,
  disabled,
  existingContactCount = 0,
}: {
  rows: ContactDraft[];
  onChange: (rows: ContactDraft[]) => void;
  disabled?: boolean;
  /** 이 거래처에 이미 있는 담당자 수. 0 이면 첫 행이 자동으로 대표가 된다 */
  existingContactCount?: number;
}) {
  // 라디오 그룹 이름·입력 id 의 뿌리. 한 화면에 폼이 둘 있어도 서로 간섭하지 않는다
  const groupId = useId();
  // 행 식별자. 순번을 쓰면 가운데 행을 지웠을 때 남은 행의 입력이 뒤섞인다
  const nextRowNo = useRef(1);

  const addRow = () => {
    const key = `row-${nextRowNo.current}`;
    nextRowNo.current += 1;
    onChange(
      withAppendPrimary(existingContactCount, [
        ...rows,
        { ...EMPTY_CONTACT_FORM, key },
      ]),
    );
  };

  const removeRow = (key: string) => {
    onChange(
      withAppendPrimary(
        existingContactCount,
        rows.filter((row) => row.key !== key),
      ),
    );
  };

  const patchRow = (key: string, patch: Partial<ContactFormValues>) => {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const selectPrimary = (key: string) => {
    onChange(rows.map((row) => ({ ...row, isPrimary: row.key === key })));
  };

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const fieldId = (field: string) => `${groupId}-${row.key}-${field}`;
        return (
          <div key={row.key} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              {/*
                라디오의 접근성 이름이 "대표" 뿐이면 어느 담당자인지 알 수 없어 순번을
                붙인다 (정책 ACC_*). 옆의 "대표" 글자는 눈으로 보는 표시다.
              */}
              <input
                type="radio"
                name={`${groupId}-primary`}
                className="size-4 shrink-0 accent-primary"
                checked={row.isPrimary}
                disabled={disabled}
                aria-label={`담당자 ${index + 1} 을(를) 대표로 지정`}
                onChange={() => selectPrimary(row.key)}
              />
              <span className="text-xs text-muted-foreground">대표</span>
              <span className="text-sm font-medium">담당자 {index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto size-8"
                disabled={disabled}
                aria-label={`담당자 ${index + 1} 삭제`}
                onClick={() => removeRow(row.key)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={fieldId("name")} className="text-xs">
                  담당자명
                  <span className="text-destructive" aria-hidden="true">
                    *
                  </span>
                </Label>
                <Input
                  id={fieldId("name")}
                  value={row.name}
                  maxLength={CONTACT_NAME_MAX}
                  placeholder="예: 김지훈"
                  disabled={disabled}
                  onChange={(e) => patchRow(row.key, { name: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={fieldId("position")} className="text-xs">
                  직책
                </Label>
                <Input
                  id={fieldId("position")}
                  value={row.position}
                  maxLength={CONTACT_POSITION_MAX}
                  placeholder="예: 구매팀 과장"
                  disabled={disabled}
                  onChange={(e) =>
                    patchRow(row.key, { position: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={fieldId("phone")} className="text-xs">
                  연락처
                </Label>
                <Input
                  id={fieldId("phone")}
                  type="tel"
                  value={row.phone}
                  maxLength={CONTACT_PHONE_MAX}
                  placeholder={CONTACT_PHONE_FORMAT}
                  disabled={disabled}
                  onChange={(e) => patchRow(row.key, { phone: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={fieldId("email")} className="text-xs">
                  이메일
                </Label>
                <Input
                  id={fieldId("email")}
                  type="email"
                  value={row.email}
                  maxLength={CONTACT_EMAIL_MAX}
                  placeholder="예: jihoon@abc.co.kr"
                  disabled={disabled}
                  onChange={(e) => patchRow(row.key, { email: e.target.value })}
                />
              </div>
            </div>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed"
        disabled={disabled}
        onClick={addRow}
      >
        <Plus className="size-4" aria-hidden="true" />
        담당자 추가하기
      </Button>
    </div>
  );
}
