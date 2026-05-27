"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { setMedicationStateAction } from "../../actions";

/**
 * Pause / stop a medication. Two-step confirm to prevent fumbled
 * taps — patient taps "Stop taking", then "Confirm stop".
 */
export function StopMedicationButton({
  medicationId,
  medicationName,
}: {
  medicationId: string;
  medicationName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-[11px]">Stop taking {medicationName}?</span>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1 text-[11.5px] transition-colors"
        >
          Cancel
        </button>
        <Button
          type="button"
          variant="emergency"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await setMedicationStateAction(medicationId, "ended");
              if (!res.ok) {
                setError(res.error ?? "Couldn't stop that.");
              }
              setConfirming(false);
            });
          }}
        >
          {pending ? "Stopping…" : "Confirm stop"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-muted-foreground hover:text-foreground text-[11.5px] underline-offset-2 transition-colors hover:underline"
      >
        Stop taking
      </button>
      {error ? <span className="text-destructive font-mono text-[10px]">{error}</span> : null}
    </div>
  );
}
