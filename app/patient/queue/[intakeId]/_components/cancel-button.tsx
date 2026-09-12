"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cancelDeclaredIntakeAction } from "../actions";

/**
 * Self-cancel while `declared` (ADR 0034 §5) — a two-tap confirm rather than a
 * modal, because the whole interaction is one sentence and a phone should not
 * need a sheet for it.
 *
 * Not red and not `variant="emergency"`: telling the hospital you are no
 * longer coming today is not a clinical emergency, and red on a patient
 * surface is reserved for one (`DESIGN-medsync.md`). The mutation itself is
 * untouched — `cancelDeclaredIntakeAction` keeps its `x-request-id` and its
 * audit path, and the server's own message is rendered verbatim.
 */
export function CancelDeclaredIntakeButton({ intakeId }: { intakeId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      // `size="sm"` is ~24px tall; `min-h-11` restores the 44px touch floor
      // without inventing a size.
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        className="min-h-11 self-center px-3.5"
      >
        I am not coming today
      </Button>
    );
  }

  return (
    <div className="bg-card dark:shadow-card flex flex-col gap-3 rounded-xl p-4 shadow-xs">
      <p className="text-foreground text-body-m">
        Take your place out of today&rsquo;s line? You can tell us again any time today.
      </p>
      {error ? (
        <p role="alert" className="text-destructive text-body-s ncd-reveal">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Keep my place
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await cancelDeclaredIntakeAction(intakeId);
              if (!res.ok) {
                setError(res.error ?? "That did not go through — try again.");
                return;
              }
              router.push("/patient");
              router.refresh();
            });
          }}
        >
          {pending ? "Removing…" : "Yes, remove my place"}
        </Button>
      </div>
    </div>
  );
}
