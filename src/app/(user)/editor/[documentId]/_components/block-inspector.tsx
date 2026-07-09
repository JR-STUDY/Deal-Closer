"use client";

import { toast } from "sonner";
import type {
  Block,
  BlockPropsMap,
  ItemRow,
  MetaField,
  Align,
  FontFamily,
  ZOrderAction,
} from "@/lib/editor-schema";
import { uid, FONT_FAMILY_LABELS } from "@/lib/editor-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus } from "lucide-react";

const MAX_IMAGE_BYTES = 1024 * 1024; // 1MB — 로고/직인 수준

const ALIGN_LABELS: Record<Align, string> = {
  left: "왼쪽",
  center: "가운데",
  right: "오른쪽",
};

const Z_ACTIONS: { action: ZOrderAction; label: string }[] = [
  { action: "front", label: "맨 앞" },
  { action: "forward", label: "앞으로" },
  { action: "backward", label: "뒤로" },
  { action: "back", label: "맨 뒤" },
];

type Props = {
  block: Block | null;
  onChange: (patch: Partial<Block>) => void;
  onChangeProps: (propsPatch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onZOrder: (action: ZOrderAction) => void;
};

/** 색상 선택 (스와치 + hex 입력) */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
        />
      </div>
    </div>
  );
}

export function BlockInspector({
  block,
  onChange,
  onChangeProps,
  onRemove,
  onZOrder,
}: Props) {
  if (!block) {
    return (
      <aside className="w-72 shrink-0 border-l bg-background p-4">
        <p className="text-sm text-muted-foreground">
          블록을 선택하면 여기에서 편집합니다.
        </p>
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 space-y-4 overflow-auto border-l bg-background p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">블록 속성</p>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove(block.id)}
          aria-label="블록 삭제"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {/* 순서(z) */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">순서(겹침)</Label>
        <div className="flex gap-1">
          {Z_ACTIONS.map((z) => (
            <Button
              key={z.action}
              type="button"
              size="sm"
              variant="outline"
              className="flex-1 px-1 text-xs"
              onClick={() => onZOrder(z.action)}
            >
              {z.label}
            </Button>
          ))}
        </div>
      </div>

      {/* 위치·크기·순서값 */}
      <div className="grid grid-cols-3 gap-2">
        {(["x", "y", "w", "h", "z"] as const).map((k) => (
          <div key={k}>
            <Label className="text-xs uppercase text-muted-foreground">{k}</Label>
            <Input
              type="number"
              value={block[k]}
              onChange={(e) => onChange({ [k]: Number(e.target.value) || 0 })}
            />
          </div>
        ))}
      </div>

      {/* 고정 여부 */}
      <div className="flex items-center justify-between">
        <Label htmlFor="locked" className="text-sm">
          내용 고정(잠금)
        </Label>
        <Switch
          id="locked"
          checked={block.locked}
          onCheckedChange={(v) => onChange({ locked: v })}
        />
      </div>

      {!block.locked ? (
        <ContentForm block={block} onChangeProps={onChangeProps} />
      ) : (
        <p className="text-xs text-muted-foreground">
          잠금 상태입니다. 해제하면 내용을 편집할 수 있습니다.
        </p>
      )}
    </aside>
  );
}

function AlignField({
  value,
  onChange,
}: {
  value: Align;
  onChange: (a: Align) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">정렬</Label>
      <div className="flex gap-1">
        {(["left", "center", "right"] as const).map((a) => (
          <Button
            key={a}
            type="button"
            size="sm"
            variant={value === a ? "default" : "outline"}
            className="flex-1"
            onClick={() => onChange(a)}
          >
            {ALIGN_LABELS[a]}
          </Button>
        ))}
      </div>
    </div>
  );
}

function FontFamilyField({
  value,
  onChange,
}: {
  value: FontFamily;
  onChange: (f: FontFamily) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">글꼴</Label>
      <div className="flex gap-1">
        {(["sans", "serif", "mono"] as const).map((f) => (
          <Button
            key={f}
            type="button"
            size="sm"
            variant={value === f ? "default" : "outline"}
            className="flex-1 px-1"
            onClick={() => onChange(f)}
          >
            {FONT_FAMILY_LABELS[f]}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** 테두리 토글 + 색상 (텍스트/이미지 공용) */
function BorderControls({
  enabled,
  color,
  onToggle,
  onColor,
}: {
  enabled: boolean;
  color: string;
  onToggle: (v: boolean) => void;
  onColor: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="border" className="text-sm">
          테두리
        </Label>
        <Switch id="border" checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled ? (
        <ColorField label="테두리 색상" value={color} onChange={onColor} />
      ) : null}
    </div>
  );
}

/** 라벨+값 필드 목록 편집 (공급자 정보 / 거래처·견적 공용) — 라벨도 수정 가능 */
function LabeledFieldsForm({
  fields,
  labelWidth,
  onChangeProps,
}: {
  fields: MetaField[];
  labelWidth: number;
  onChangeProps: (p: Record<string, unknown>) => void;
}) {
  const patch = (next: MetaField[]) => onChangeProps({ fields: next });
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs">라벨 열 너비(px)</Label>
        <Input
          type="number"
          value={labelWidth}
          onChange={(e) =>
            onChangeProps({ labelWidth: Number(e.target.value) || 0 })
          }
        />
      </div>
      {fields.map((f) => (
        <div key={f.id} className="space-y-1 rounded border p-2">
          <div className="grid grid-cols-[1fr_1fr] gap-1">
            <Input
              placeholder="항목명"
              value={f.label}
              onChange={(e) =>
                patch(
                  fields.map((x) =>
                    x.id === f.id ? { ...x, label: e.target.value } : x,
                  ),
                )
              }
            />
            <Input
              placeholder="값"
              value={f.value}
              onChange={(e) =>
                patch(
                  fields.map((x) =>
                    x.id === f.id ? { ...x, value: e.target.value } : x,
                  ),
                )
              }
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => patch(fields.filter((x) => x.id !== f.id))}
          >
            <Trash2 className="size-4" /> 항목 삭제
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => patch([...fields, { id: uid(), label: "항목", value: "" }])}
      >
        <Plus className="size-4" /> 항목 추가
      </Button>
    </div>
  );
}

function ContentForm({
  block,
  onChangeProps,
}: {
  block: Block;
  onChangeProps: (p: Record<string, unknown>) => void;
}) {
  switch (block.type) {
    case "title":
    case "text": {
      const p = block.props as BlockPropsMap["text"];
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">텍스트</Label>
            <Textarea
              value={p.text}
              onChange={(e) => onChangeProps({ text: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">글자 크기</Label>
            <Input
              type="number"
              value={p.fontSize}
              onChange={(e) =>
                onChangeProps({ fontSize: Number(e.target.value) || 12 })
              }
            />
          </div>
          <FontFamilyField
            value={p.fontFamily}
            onChange={(f) => onChangeProps({ fontFamily: f })}
          />
          <AlignField
            value={p.align}
            onChange={(a) => onChangeProps({ align: a })}
          />
          <ColorField
            label="글자 색상"
            value={p.color}
            onChange={(v) => onChangeProps({ color: v })}
          />
          <BorderControls
            enabled={p.border}
            color={p.borderColor}
            onToggle={(v) => onChangeProps({ border: v })}
            onColor={(v) => onChangeProps({ borderColor: v })}
          />
        </div>
      );
    }
    case "supplier":
    case "clientMeta": {
      const p = block.props as BlockPropsMap["clientMeta"];
      return (
        <LabeledFieldsForm
          fields={p.fields}
          labelWidth={p.labelWidth}
          onChangeProps={onChangeProps}
        />
      );
    }
    case "itemTable": {
      const p = block.props as BlockPropsMap["itemTable"];
      const update = (rows: ItemRow[]) => onChangeProps({ rows });
      const toInt = (v: string) => Math.trunc(Number(v)) || 0;
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="showTotal" className="text-sm">
              합계 표시
            </Label>
            <Switch
              id="showTotal"
              checked={p.showTotal}
              onCheckedChange={(v) => onChangeProps({ showTotal: v })}
            />
          </div>
          {p.rows.map((r) => (
            <div key={r.id} className="space-y-1 rounded border p-2">
              <Input
                placeholder="품목명"
                value={r.name}
                onChange={(e) =>
                  update(
                    p.rows.map((x) =>
                      x.id === r.id ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
              <Input
                placeholder="설명"
                value={r.description}
                onChange={(e) =>
                  update(
                    p.rows.map((x) =>
                      x.id === r.id ? { ...x, description: e.target.value } : x,
                    ),
                  )
                }
              />
              <div className="grid grid-cols-2 gap-1">
                <Input
                  type="number"
                  placeholder="수량"
                  value={r.quantity}
                  onChange={(e) =>
                    update(
                      p.rows.map((x) =>
                        x.id === r.id
                          ? { ...x, quantity: toInt(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
                <Input
                  type="number"
                  placeholder="단가"
                  value={r.unitPrice}
                  onChange={(e) =>
                    update(
                      p.rows.map((x) =>
                        x.id === r.id
                          ? { ...x, unitPrice: toInt(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update(p.rows.filter((x) => x.id !== r.id))}
              >
                <Trash2 className="size-4" /> 행 삭제
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              update([
                ...p.rows,
                {
                  id: uid(),
                  name: "",
                  description: "",
                  quantity: 1,
                  unitPrice: 0,
                },
              ])
            }
          >
            <Plus className="size-4" /> 항목 추가
          </Button>
        </div>
      );
    }
    case "image": {
      const p = block.props as BlockPropsMap["image"];
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">이미지 업로드 (최대 1MB)</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > MAX_IMAGE_BYTES) {
                  toast.error(
                    "이미지가 너무 큽니다. 1MB 이하 파일을 사용해주세요.",
                  );
                  e.target.value = "";
                  return;
                }
                const reader = new FileReader();
                reader.onload = () =>
                  onChangeProps({ dataUrl: String(reader.result) });
                reader.readAsDataURL(file);
              }}
            />
          </div>
          <div>
            <Label className="text-xs">대체 텍스트</Label>
            <Input
              value={p.alt}
              onChange={(e) => onChangeProps({ alt: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">투명도: {p.opacity}%</Label>
            <input
              type="range"
              min={0}
              max={100}
              value={p.opacity}
              onChange={(e) =>
                onChangeProps({ opacity: Number(e.target.value) })
              }
              className="w-full"
              aria-label="투명도"
            />
          </div>
          <BorderControls
            enabled={p.border}
            color={p.borderColor}
            onToggle={(v) => onChangeProps({ border: v })}
            onColor={(v) => onChangeProps({ borderColor: v })}
          />
        </div>
      );
    }
    case "table": {
      const p = block.props as BlockPropsMap["table"];
      return (
        <div className="space-y-2">
          <Label className="text-xs">셀 내용(행=줄, 열=탭)</Label>
          <Textarea
            rows={6}
            value={p.cells.map((r) => r.join("\t")).join("\n")}
            onChange={(e) =>
              onChangeProps({
                cells: e.target.value
                  .split("\n")
                  .map((line) => line.split("\t")),
              })
            }
          />
        </div>
      );
    }
    case "divider": {
      const p = block.props as BlockPropsMap["divider"];
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">두께(px)</Label>
            <Input
              type="number"
              value={p.thickness}
              onChange={(e) =>
                onChangeProps({ thickness: Number(e.target.value) || 1 })
              }
            />
          </div>
          <ColorField
            label="색상"
            value={p.color}
            onChange={(v) => onChangeProps({ color: v })}
          />
          <div className="flex items-center justify-between">
            <Label htmlFor="dashed" className="text-sm">
              점선
            </Label>
            <Switch
              id="dashed"
              checked={p.dashed}
              onCheckedChange={(v) => onChangeProps({ dashed: v })}
            />
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}
