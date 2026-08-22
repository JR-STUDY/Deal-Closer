"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CATALOG_CATEGORY_MAX,
  CATALOG_DEFAULT_UNIT,
  CATALOG_DESCRIPTION_MAX,
  CATALOG_NAME_MAX,
  CATALOG_SKU_MAX,
  CATALOG_UNIT_MAX,
  parseCatalogInput,
  type CatalogFormValues,
  type CatalogSaveResult,
} from "@/lib/catalog";
import { parseIntInput } from "@/lib/editor-schema";
import { formatKRW } from "@/lib/format";

/** 단가 입력칸의 최대 글자수 — 32비트 상한(10자리)에 쉼표·단위를 넣어도 남는 폭 */
const UNIT_PRICE_INPUT_MAX = 20;

type CatalogFormDialogProps = {
  /** 값이 있으면 수정(PATCH), 없으면 등록(POST) */
  itemId?: string;
  initial: CatalogFormValues;
  /** 이미 쓰이는 카테고리 — 같은 이름을 다시 타이핑하지 않게 후보로 준다 */
  categories: string[];
  title: string;
  description?: string;
  /** 저장 성공 시 (부모가 목록을 다시 조회한다) */
  onSaved: (item: CatalogSaveResult) => void;
  /** 다이얼로그가 닫힐 때 (성공·취소 공통) */
  onClose: () => void;
};

/** 한 줄 입력 (라벨 + 입력 + 보조 설명) */
function Field({
  id,
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  hint,
  required = false,
  list,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  list?: string;
  inputMode?: "numeric";
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      <Input
        id={id}
        value={value}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        list={list}
        inputMode={inputMode}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * 품목 등록·수정 다이얼로그 (`/settings/catalog`).
 *
 * **등록과 수정이 이 한 벌을 공유한다** — 카탈로그에는 상세 화면이 없으므로 편집도
 * 목록에서 팝업으로 한다(거래처 목록의 `account-form-dialog` 와 같은 선례). 두 벌로
 * 나누면 한쪽만 손봤을 때 등록과 수정의 제약이 갈린다.
 *
 * 검증은 `@/lib/catalog` 의 `parseCatalogInput()` **하나**이고 서버도 같은 함수를 쓴다 —
 * 화면에서만 막은 것은 막은 것이 아니다. 단가는 캔버스·인스펙터와 같은
 * `parseIntInput()` 으로 읽어 **저장될 값을 입력칸 아래에 미리 보여준다**(쉼표·`원`·소수점을
 * 너그럽게 받는 대신, 무엇이 저장되는지는 숨기지 않는다).
 *
 * 부모는 열고 싶을 때만 마운트한다. `key` 를 주면 열 때마다 initial 로 새로 초기화된다.
 */
export function CatalogFormDialog({
  itemId,
  initial,
  categories,
  title,
  description,
  onSaved,
  onClose,
}: CatalogFormDialogProps) {
  const uid = useId();
  const [form, setForm] = useState<CatalogFormValues>(() => initial);
  const [isSaving, setIsSaving] = useState(false);

  const set = <K extends keyof CatalogFormValues>(
    key: K,
    value: CatalogFormValues[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const categoryListId = `${uid}-categories`;
  // 저장될 단가 — 서버가 쓰는 것과 **같은 파서**의 결과다
  const parsedUnitPrice = parseIntInput(form.unitPrice);
  const canSubmit =
    form.category.trim().length > 0 && form.name.trim().length > 0 && !isSaving;

  const handleSubmit = async () => {
    // 폼도 서버와 같은 순수 함수로 먼저 검증한다 (길이·단가 상한까지 같은 문구로 안내)
    const parsed = parseCatalogInput({ ...form });
    if ("error" in parsed) {
      toast.error(parsed.error);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(
        itemId ? `/api/catalog/${itemId}` : "/api/catalog",
        {
          method: itemId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "저장에 실패했습니다.");
        return;
      }
      const saved = json.data as CatalogSaveResult;
      /*
        `onSaved` 가 **닫기까지 맡는다.** 여기서 `onClose()` 를 이어서 부르면 그 동기 state
        업데이트가 부모의 `router.refresh()` 트랜지션을 끊어, 저장은 됐는데 목록 행이
        옛 값을 그대로 보여준다(호출측 주석에 실측을 적어 두었다).
      */
      onSaved(saved);
      toast.success(itemId ? "품목을 수정했습니다." : "품목을 등록했습니다.");
      // SKU 중복은 막지 않는다 — 대신 그 사실을 알린다 (라우트 주석에 근거를 적어 두었다)
      if (saved.duplicateSkuCount > 0) {
        toast.warning(
          `SKU "${saved.sku}" 를 쓰는 품목이 이미 ${saved.duplicateSkuCount}개 있습니다. 의도한 것이 아니면 SKU 를 확인해 주세요.`,
        );
      }
    } catch {
      toast.error("저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/*
        높이는 내용에 맞추고 화면을 넘길 때만 스크롤한다. 스크롤은 본문(form)만 진다 —
        다이얼로그 전체에 overflow 를 걸면 제목·저장 버튼·닫기(×)까지 함께 밀려 올라간다.
      */}
      <DialogContent className="flex max-h-[90svh] flex-col gap-4 overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {/* -mx-4 px-4 : 스크롤바는 팝업 가장자리에 두고 입력의 포커스 링은 잘리지 않게 한다 */}
        <form
          className="-mx-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) handleSubmit();
          }}
        >
          {/*
            카테고리는 목록의 탭이자 묶음 기준이라 **글자가 정확히 같아야** 한 묶음이 된다.
            그래서 이미 쓰이는 이름을 후보로 준다 — 새 자동완성 위젯을 만들지 않고 브라우저
            기본 `datalist` 를 쓴다: 후보가 이미 화면에 다 떠 있는 유한 목록이라 debounce
            검색이 필요 없고, 콤보박스를 하나 더 만들면 `account-combobox` 와 두 벌이 된다.
          */}
          <Field
            id={`${uid}-category`}
            label="카테고리"
            required
            value={form.category}
            onChange={(v) => set("category", v)}
            maxLength={CATALOG_CATEGORY_MAX}
            placeholder="예: 소프트웨어"
            list={categories.length > 0 ? categoryListId : undefined}
            hint="목록의 카테고리 탭이 이 값으로 묶입니다. 기존 카테고리를 고르시거나 새로 입력하실 수 있습니다."
          />
          {categories.length > 0 ? (
            <datalist id={categoryListId}>
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          ) : null}

          <Field
            id={`${uid}-name`}
            label="품목명"
            required
            value={form.name}
            onChange={(v) => set("name", v)}
            maxLength={CATALOG_NAME_MAX}
            placeholder="예: 통합 보안 솔루션 라이선스"
            hint="견적서 품목표에 이 이름이 그대로 들어갑니다."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${uid}-sku`}
              label="SKU"
              value={form.sku}
              onChange={(v) => set("sku", v)}
              maxLength={CATALOG_SKU_MAX}
              placeholder="예: SEC-ENT-01"
              hint="사내 품번·거래처 코드입니다. 비워 두셔도 됩니다."
            />
            <Field
              id={`${uid}-unit`}
              label="단위"
              value={form.unit}
              onChange={(v) => set("unit", v)}
              maxLength={CATALOG_UNIT_MAX}
              placeholder={CATALOG_DEFAULT_UNIT}
              hint={`예: ${CATALOG_DEFAULT_UNIT} · 식 · 대/월. 비우시면 ${CATALOG_DEFAULT_UNIT} 로 저장됩니다.`}
            />
          </div>

          {/*
            저장될 금액을 미리 보여준다 — 파서는 쉼표·통화기호·`원` 을 걷어내고 소수점 앞까지만
            읽으므로(음수는 0), 입력한 글자와 저장되는 값이 다를 수 있다. 그 사실을 숨기지 않는다.
          */}
          <Field
            id={`${uid}-unit-price`}
            label="단가"
            value={form.unitPrice}
            onChange={(v) => set("unitPrice", v)}
            maxLength={UNIT_PRICE_INPUT_MAX}
            placeholder="예: 1,200,000"
            inputMode="numeric"
            hint={`원(KRW) 단위로 저장됩니다 · 저장될 단가: ${formatKRW(parsedUnitPrice)}`}
          />

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-description`}>설명</Label>
            <Textarea
              id={`${uid}-description`}
              value={form.description}
              maxLength={CATALOG_DESCRIPTION_MAX}
              rows={3}
              placeholder="사양·구성 등 견적서에 함께 적을 내용을 남겨주세요."
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border px-3 py-3">
            <div className="space-y-1">
              <Label htmlFor={`${uid}-is-active`}>활성</Label>
              <p
                id={`${uid}-is-active-hint`}
                className="text-xs text-muted-foreground"
              >
                활성 품목만 견적서 품목표의 선택 목록에 나타납니다. 더 이상
                판매하지 않는 품목은 지우지 않고 비활성으로 내려두실 수 있습니다.
              </p>
            </div>
            <Switch
              id={`${uid}-is-active`}
              checked={form.isActive}
              aria-describedby={`${uid}-is-active-hint`}
              onCheckedChange={(checked) => set("isActive", checked)}
            />
          </div>
        </form>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSaving ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
