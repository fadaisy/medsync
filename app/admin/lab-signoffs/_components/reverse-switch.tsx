"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reverseCutoverAction } from "@/lib/lab/cutover-actions";

/** CO-5: one superadmin requests the reversal with a reason; a different one approves it. */
export function ReverseSwitch({
  cutoverId,
  hospitalId,
  requestedByOther,
  requestedByMe,
}: {
  cutoverId: string;
  hospitalId: string;
  requestedByOther: boolean;
  requestedByMe: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const go = (approve: boolean) =>
    start(async () => {
      const r = await reverseCutoverAction({
        cutoverId,
        hospitalId,
        reason: approve ? null : reason,
        approve,
      });
      setSaid(
        r.ok
          ? {
              ok: true,
              text: approve ? "Reversed. The old path is open again." : "Reversal requested.",
            }
          : { ok: false, text: r.error },
      );
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-2">
      {requestedByOther ? (
        <div>
          <Button type="button" variant="secondary" onClick={() => go(true)} disabled={pending}>
            Approve the reversal
          </Button>
        </div>
      ) : requestedByMe ? (
        <StatusWord tone="caution">Waiting for a second superadmin</StatusWord>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-body-s flex min-w-72 flex-1 flex-col gap-1">
            <span className="text-muted-foreground">Why reverse it</span>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              className="min-h-11 sm:min-h-9"
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={() => go(false)}
            disabled={pending || reason.trim().length < 10}
          >
            Request reversal
          </Button>
        </div>
      )}
      <p role="status" aria-live="polite" className="text-body-s min-h-5">
        {said ? said.ok ? said.text : <StatusWord tone="caution">{said.text}</StatusWord> : null}
      </p>
    </div>
  );
}
