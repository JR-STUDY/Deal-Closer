"use client";

import Link from "next/link";
import { Send, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  documentId: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
};

export function EditorToolbar({ documentId, dirty, saving, onSave }: Props) {
  return (
    <div className="flex items-center gap-2">
      {dirty ? (
        <span className="text-xs text-muted-foreground">
          저장되지 않은 변경사항
        </span>
      ) : null}
      <Button onClick={onSave} disabled={saving || !dirty}>
        <Save className="size-4" />
        {saving ? "저장 중…" : "저장"}
      </Button>
      <Button asChild variant="outline">
        <Link
          href={`/sender/${documentId}`}
          onClick={(e) => {
            // beforeunload 는 SPA 라우트 이동을 못 잡으므로 여기서 직접 확인 (정책 STATE_)
            if (
              dirty &&
              !window.confirm(
                "저장하지 않은 변경사항이 있습니다. 페이지를 이동하시겠습니까?",
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <Send className="size-4" />
          발송하기
        </Link>
      </Button>
    </div>
  );
}
