"use client";

import Link from "next/link";
import { PenLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * 미리보기 다이얼로그 (기회-19) — 문서·표준 양식 공용.
 *
 * 문서를 확인하려고 편집 화면까지 들어갔다 돌아오면 기회 상세에서 하던 일이 끊긴다.
 * 그래서 **여기서 내용을 보고**, 고쳐야 할 때만 편집 화면으로 넘어간다.
 *
 * 본문은 서버가 만든 인쇄용 HTML(`GET /api/documents/:id/preview`, 양식은
 * `/api/templates/:id/preview`)을 iframe 으로 띄운다 — 실제 PDF 와 같은 생성기를 쓰므로
 * "미리보기와 결과물이 다른" 일이 없다. 대상이 늘어도 렌더러는 하나다.
 * iframe 은 `sandbox` 로 스크립트·폼을 차단한다. 문서 본문은 전부 사용자 입력이라
 * 같은 출처에서 무엇이든 실행될 여지를 남기지 않는다.
 *
 * 다이얼로그는 Esc·바깥 클릭으로 닫히고 초점이 갇히지 않는다 (radix Dialog · 정책 ACC_*).
 */
export function DocumentPreviewDialog({
  id,
  title,
  open,
  onOpenChange,
  previewUrl,
  editHref,
}: {
  /** 미리보기 대상 id — 대상이 바뀔 때 iframe 을 다시 만드는 key 로도 쓴다 */
  id: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 기본은 문서 미리보기 — 표준 양식처럼 다른 대상이면 넘긴다 */
  previewUrl?: string;
  /** 기본은 문서 편집 화면. `null` 이면 편집 버튼을 감춘다 */
  editHref?: string | null;
}) {
  const src = previewUrl ?? `/api/documents/${id}/preview`;
  const href = editHref === undefined ? `/editor/${id}` : editHref;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] max-w-[92vw] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">미리보기 · {title}</DialogTitle>
          <DialogDescription>
            저장된 내용을 그대로 보여드립니다. 내용을 고치시려면 아래 편집
            바로가기를 눌러주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/40">
          <iframe
            // 문서를 바꿔 열 때 이전 문서가 남지 않도록 key 로 다시 만든다
            key={id}
            src={src}
            title={`${title} 미리보기`}
            sandbox=""
            className="h-[60svh] w-full bg-white"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          {href ? (
            <Button asChild>
              <Link href={href}>
                <PenLine className="size-4" aria-hidden="true" />
                편집 바로가기
              </Link>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
