"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cancelDeclaredIntakeAction } from "../actions";

/**
 * Two-tap cancel — the tap-once confirm pattern avoids accidental
 * cancellations and skips a modal on mobile.
 */
export function CancelDeclaredIntakeButton({ intakeId }: { intakeId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="self-center text-[12.5px]"
      >
        <XIcon className="size-3.5" aria-hidden />
        Cancel this ticket
      </Button>
    );
  }

  return (
    <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-2 rounded-md border p-3">
      <p className="text-foreground text-[12.5px]">
        Cancel this ticket? You can rejoin the queue any time today.
      </p>
      {error ? <p className="text-destructive text-[11.5px]">{error}</p> : null}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Keep my spot
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
                setError(res.error ?? "Couldn't cancel — try again.");
                return;
              }
              router.push("/patient");
              router.refresh();
            });
          }}
        >
          {pending ? "Cancelling…" : "Yes, cancel"}
        </Button>
      </div>
    </div>
  );
}
