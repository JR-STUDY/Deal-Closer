"use client";

import { useState } from "react";
import {
  AtSign,
  Plus,
  BadgeCheck,
  ShieldCheck,
  Star,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MAIL_DOMAIN_STATUS_LABELS } from "@/lib/constants";
import { MAIL_CC_MAX_LENGTH, type TeamMailDomainDTO } from "@/lib/mail-domain";

/** 서버 응답에서 { data } 를 꺼낸다 (실패 시 error 던짐). */
async function callApi<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    throw new Error(json?.error ?? "요청을 처리하지 못했습니다.");
  }
  return json.data as T;
}

export function MailDomainManager({
  initialDomains,
}: {
  initialDomains: TeamMailDomainDTO[];
}) {
  const [domains, setDomains] = useState(initialDomains);
  const [newDomain, setNewDomain] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  // 진행 중인 행 액션 (버튼 중복 클릭 방지)
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim() || isAdding) return;
    setIsAdding(true);
    try {
      const created = await callApi<TeamMailDomainDTO>(
        "/api/mail-domains",
        "POST",
        { domain: newDomain, label: newLabel },
      );
      setDomains((prev) => [...prev, created]);
      setNewDomain("");
      setNewLabel("");
      toast.success(`${created.domain} 도메인을 등록했습니다. 인증을 진행해주세요.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "등록에 실패했습니다.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleVerify = async (id: string) => {
    setBusyId(id);
    try {
      const updated = await callApi<TeamMailDomainDTO>(
        `/api/mail-domains/${id}`,
        "PATCH",
        { verify: true },
      );
      setDomains((prev) => prev.map((d) => (d.id === id ? updated : d)));
      toast.success(`${updated.domain} 도메인을 인증했습니다.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "인증에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    setBusyId(id);
    try {
      const updated = await callApi<TeamMailDomainDTO>(
        `/api/mail-domains/${id}`,
        "PATCH",
        { isDefault: true },
      );
      // 기본은 조직당 1개 → 나머지는 해제 표시
      setDomains((prev) =>
        prev.map((d) =>
          d.id === id ? updated : { ...d, isDefault: false },
        ),
      );
      toast.success(`${updated.domain} 을(를) 기본 발신 도메인으로 지정했습니다.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "지정에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string, domain: string) => {
    setBusyId(id);
    try {
      await callApi(`/api/mail-domains/${id}`, "DELETE");
      setDomains((prev) => prev.filter((d) => d.id !== id));
      toast.success(`${domain} 도메인을 삭제했습니다.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* 도메인 등록 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">새 도메인 등록</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            발신에 사용할 회사 도메인을 입력하세요. 등록 후 인증을 완료하면
            담당자가 선택할 수 있습니다.
          </p>
        </div>
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="new-domain">도메인</Label>
            <Input
              id="new-domain"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="specflow.ai"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="new-label">
              별칭 <span className="text-muted-foreground">(선택)</span>
            </Label>
            <Input
              id="new-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="회사 공식 도메인"
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={!newDomain.trim() || isAdding}>
            {isAdding ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            등록
          </Button>
        </form>
      </section>

      {/* 등록된 도메인 목록 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">등록된 도메인</h2>

        {domains.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
            <AtSign className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              아직 등록된 발신 도메인이 없습니다. 위에서 회사 도메인을 등록해
              보세요.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {domains.map((domain) => {
              const busy = busyId === domain.id;
              const verified = domain.status === "VERIFIED";
              return (
                <Card key={domain.id}>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">
                          @{domain.domain}
                        </span>
                        {verified ? (
                          <Badge className="border-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                            <BadgeCheck className="size-3.5" />
                            {MAIL_DOMAIN_STATUS_LABELS.VERIFIED}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-amber-700 dark:text-amber-300"
                          >
                            {MAIL_DOMAIN_STATUS_LABELS.PENDING}
                          </Badge>
                        )}
                        {domain.isDefault ? (
                          <Badge variant="secondary">
                            <Star className="size-3.5" />
                            기본
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {domain.label
                          ? domain.label
                          : verified
                            ? "담당자가 발신 주소로 선택할 수 있습니다."
                            : "DNS 인증 대기 중입니다. 인증을 완료해주세요."}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!verified ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => handleVerify(domain.id)}
                        >
                          {busy ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="size-3.5" />
                          )}
                          인증 완료 처리
                        </Button>
                      ) : !domain.isDefault ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => handleSetDefault(domain.id)}
                        >
                          <Star className="size-3.5" />
                          기본으로 설정
                        </Button>
                      ) : null}

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`${domain.domain} 삭제`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {domain.domain} 도메인을 삭제할까요?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              이 도메인을 발신 주소로 선택한 담당자는 개인 연동
                              계정으로 자동 복귀합니다. 이 작업은 되돌릴 수
                              없습니다.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                handleDelete(domain.id, domain.domain)
                              }
                            >
                              삭제
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    </div>

                    <div className="border-t pt-4">
                      <DomainCcEditor
                        domain={domain}
                        onSaved={(updated) =>
                          setDomains((prev) =>
                            prev.map((d) => (d.id === updated.id ? updated : d)),
                          )
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/** 도메인 카드 하단의 기본 참조(CC) 편집기 — 저장 시 PATCH defaultCc */
function DomainCcEditor({
  domain,
  onSaved,
}: {
  domain: TeamMailDomainDTO;
  onSaved: (updated: TeamMailDomainDTO) => void;
}) {
  const [cc, setCc] = useState(domain.defaultCc);
  const [saving, setSaving] = useState(false);
  const dirty = cc !== domain.defaultCc;

  const save = async () => {
    setSaving(true);
    try {
      const updated = await callApi<TeamMailDomainDTO>(
        `/api/mail-domains/${domain.id}`,
        "PATCH",
        { defaultCc: cc },
      );
      onSaved(updated);
      setCc(updated.defaultCc); // 정규화된 값으로 반영
      toast.success("기본 참조(CC)를 저장했습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`cc-${domain.id}`} className="text-xs font-medium">
          기본 참조(CC)
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!dirty || saving}
          onClick={save}
        >
          {saving ? "저장 중…" : "참조 저장"}
        </Button>
      </div>
      <Textarea
        id={`cc-${domain.id}`}
        value={cc}
        maxLength={MAIL_CC_MAX_LENGTH}
        onChange={(e) => setCc(e.target.value)}
        placeholder="team@company.com; sales@company.com"
        className="min-h-16 font-mono text-xs"
      />
      <p className="text-xs text-muted-foreground">
        이 도메인으로 발송할 때 참조(CC)에 자동으로 채워집니다. 세미콜론(;)으로
        여러 명을 구분하세요. 기본값은 영업팀 전원입니다.
      </p>
    </div>
  );
}
