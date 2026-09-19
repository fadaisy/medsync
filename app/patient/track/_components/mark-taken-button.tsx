"use client";

import { useOptimistic, useState, useTransition } from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { markMedicationTakenAction } from "../actions";

/**
 * Single-click "I took this" button for a self-medication. It turns into a
 * "Taken" pill while the write settles, and falls back to the button with
 * the server's own words underneath if the write fails.
 *
 * The confirmed look is `useOptimistic`, never a `useState` flag, and that
 * is the whole design of this component. A local flag has no way to un-set
 * itself: the track hub renders this button inside a row keyed on the
 * *medication*, so React keeps the component across re-renders and the pill
 * it flipped to stays flipped for the session — on a twice-daily medicine
 * the evening dose then could not be recorded at all without a hard reload,
 * and an as-needed medicine could be recorded exactly once. An optimistic
 * value reverts by itself the moment the transition that set it settles,
 * which is precisely when the revalidated server tree — the next slot, or
 * the recorded one — arrives to replace it.
 */
export function MarkTakenButton({
  medicationId,
  scheduledForIso,
  label = "Take",
  size = "sm",
}: {
  medicationId: string;
  /** The slot this take fills, as an ISO instant. Omit for an off-schedule
   * or as-needed dose — the take is then recorded against no slot. */
  scheduledForIso?: string;
  label?: string;
  /** `iconLg` is the 44px control the dose timeline puts in a row beside the
   * dose status; `label` becomes its accessible name. */
  size?: "sm" | "iconLg";
}) {
  const [pending, startTransition] = useTransition();
  const [taken, markTaken] = useOptimistic<boolean, boolean>(false, (_was, next) => next);
  const [error, setError] = useState<string | null>(null);

  const iconOnly = size === "iconLg";

  // No `dark:` overrides on the completed pill: `.dark` swaps --brand-50 and
  // --brand-700 to each other's values, so this pair flips by itself. The
  // overrides it used to carry inverted it a second time and washed it out.
  if (taken) {
    return (
      <span className="bg-brand-50 text-brand-700 ring-brand-200/70 text-body-s inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ring-1">
        <CheckIcon className="size-3.5" aria-hidden />
        Taken
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size={size}
        // `sm` is ~24px tall; min-h-11 restores the 44px touch floor without
        // inventing a size, as cancel-button and med-actions already do.
        className={iconOnly ? undefined : "min-h-11"}
        aria-label={iconOnly ? label : undefined}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            // Inside the transition, not before it: that is what ties the
            // optimistic value to this write's lifetime.
            markTaken(true);
            const res = await markMedicationTakenAction(medicationId, scheduledForIso);
            if (!res.ok) setError(res.error ?? "Couldn't record that.");
          });
        }}
      >
        {iconOnly ? <CheckIcon aria-hidden /> : pending ? "Saving…" : label}
      </Button>
      {error ? (
        // `ncd-reveal` — a 150ms opacity fade. Not `scale-in`: that one is
        // `--ease-spring`, and a failed write is not a thing that should pop.
        <span role="alert" className="text-destructive ncd-reveal text-caption font-mono">
          {error}
        </span>
      ) : null}
    </div>
  );
}
