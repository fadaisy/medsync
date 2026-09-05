"use client";

import { useState, useTransition } from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { markMedicationTakenAction } from "../actions";

/**
 * Single-click "I took this" button for a self-medication. Optimistic
 * UI: turns into a "Taken" pill while the action settles. If the
 * server returns an error, falls back to the original state.
 */
export function MarkTakenButton({
  medicationId,
  label = "Take",
  completedLabel = "Taken",
  showCompleted = false,
}: {
  medicationId: string;
  label?: string;
  completedLabel?: string;
  /** Whether to render the completed look from server state (e.g. all
   * expected doses already taken today). */
  showCompleted?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [localTaken, setLocalTaken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDone = showCompleted || localTaken;

  if (isDone) {
    return (
      <span className="bg-brand-50 text-brand-700 ring-brand-200/70 dark:bg-brand-950/40 dark:text-brand-300 dark:ring-brand-800/40 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ring-1">
        <CheckIcon className="size-3.5" aria-hidden />
        {completedLabel}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          setLocalTaken(true);
          startTransition(async () => {
            const res = await markMedicationTakenAction(medicationId);
            if (!res.ok) {
              setLocalTaken(false);
              setError(res.error ?? "Couldn't record that.");
            }
          });
        }}
      >
        {pending ? "Saving…" : label}
      </Button>
      {error ? <span className="text-destructive font-mono text-[10px]">{error}</span> : null}
    </div>
  );
}
