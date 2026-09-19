"use client";

import type { ReceptionActionState } from "../../actions";
import { useActionState, useState } from "react";
import { UserXIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markNoShowAction } from "../../actions";

/**
 * Two taps, not one: a no-show is a status the patient cannot undo, so the
 * first tap only opens the reason field and the second commits it. Rendered
 * beside Check in only for a confirmed booking whose time has passed —
 * the same gate `ha-mark-no-show` enforces.
 */
export function NoShowButton({
  appointmentId,
  patientLabel,
}: {
  appointmentId: string;
  /** Code of the person this marks — the accessible name for the row's button. */
  patientLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ReceptionActionState, FormData>(
    markNoShowAction,
    {},
  );

  if (state.ok) {
    return (
      <span className="bg-muted text-muted-foreground ring-border text-caption inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ring-1">
        <UserXIcon className="size-3" aria-hidden />
        No-show
      </span>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="tap min-h-11 px-4"
        onClick={() => setOpen(true)}
        aria-label={`Mark ${patientLabel} as no-show`}
      >
        No-show…
      </Button>
    );
  }

  return (
    <form action={formAction} className="reveal-up flex flex-col items-end gap-1.5">
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <Input
        name="reason"
        required
        minLength={8}
        // The "No-show…" button that had focus is gone; without this, focus
        // drops to <body> and a keyboard user has to find the field again.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        placeholder="Why — e.g. didn't arrive; called, no answer"
        aria-label={`Reason for marking ${patientLabel} as no-show (at least 8 characters, audited)`}
        aria-invalid={!!state.error}
        className="w-64 max-w-full"
      />
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Keep
        </Button>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Recording…" : "Mark no-show"}
        </Button>
      </div>
      {state.error ? (
        <span role="alert" className="text-destructive text-caption font-mono">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
