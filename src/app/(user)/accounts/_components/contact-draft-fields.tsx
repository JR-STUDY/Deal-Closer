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
  resolveBatchIsPrimary,
  type ContactFormValues,
} from "@/lib/contact";

/**
 * 거래처 등록 팝업의 담당자 입력 묶음 (거래처-8 · 2차 피드백 8번).
 *
 * 거래처를 만들 때 담당자를 **여러 명** 함께 넣는다. 저장 전에는 담당자를 붙일 자리가
 * 없어서, 등록 직후 상세로 들어가 한 명씩 다시 넣는 왕복이 생기기 때문이다.
 *
 * 대표는 **행마다 놓인 라디오**로 직접 고른다 — 라디오라 하나만 켜지고, 그 하나가
 * "담당자가 1명 이상이면 대표는 정확히 1명" 불변식을 화면에서 그대로 보여준다.
 * 판정 자체는 `@/lib/contact` 의 `resolveBatchIsPrimary` 가 단일 기준이며(아무도 고르지
 * 않으면 첫 담당자), 서버도 같은 함수를 쓴다. 담당자 0명도 정상이라 처음에는 빈 상태다.
 *
 * 값의 형식 검증은 여기서 하지 않는다 — 저장 직전에 `parseContactInputs` 한 곳을
 * 통과시킨다. 폼과 API 가 같은 규칙을 쓰려면 규칙이 두 군데 있으면 안 된다.
 */

/** 편집 중인 담당자 한 줄. `key` 는 React 목록 식별자이며 저장할 때는 보내지 않는다 */
export type ContactDraft = ContactFormValues & { key: string };

/** 대표를 정확히 1명으로 맞춘 새 목록 (첫 행 자동 대표·대표 삭제 시 승격을 함께 처리한다) */
function withResolvedPrimary(rows: ContactDraft[]): ContactDraft[] {
  const flags = resolveBatchIsPrimary(rows);
  return rows.map((row, index) => ({ ...row, isPrimary: flags[index] }));
}

export function ContactDraftFields({
  rows,
  onChange,
  disabled,
}: {
  rows: ContactDraft[];
  onChange: (rows: ContactDraft[]) => void;
  disabled?: boolean;
}) {
  // 라디오 그룹 이름·입력 id 의 뿌리. 한 화면에 폼이 둘 있어도 서로 간섭하지 않는다
  const groupId = useId();
  // 행 식별자. 순번을 쓰면 가운데 행을 지웠을 때 남은 행의 입력이 뒤섞인다
  const nextRowNo = useRef(1);

  const addRow = () => {
    const key = `row-${nextRowNo.current}`;
    nextRowNo.current += 1;
    onChange(withResolvedPrimary([...rows, { ...EMPTY_CONTACT_FORM, key }]));
  };

  const removeRow = (key: string) => {
    onChange(withResolvedPrimary(rows.filter((row) => row.key !== key)));
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
