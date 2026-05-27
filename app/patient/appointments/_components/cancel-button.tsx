"use client";

import type { PatientApptActionState } from "../actions";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelMyAppointmentAction } from "../actions";

/**
 * Patient cancel control. Click → inline confirm form (reason ≥ 8
 * chars) → submit. The page revalidates so the row's status flips
 * to "cancelled" on next render.
 *
 * Lives client-side so the inline confirm + transient state stay
 * snappy on slow connections.
 */
export function CancelButton({ appointmentId }: { appointmentId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<PatientApptActionState, FormData>(
    cancelMyAppointmentAction,
    {},
  );

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-muted-foreground text-[12px] transition-colors hover:text-red-700 dark:hover:text-red-300"
      >
        Cancel this appointment
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <Input
        name="reason"
        required
        minLength={8}
        autoFocus
        placeholder="Reason for cancelling (≥ 8 chars)"
        aria-invalid={!!state.error}
      />
      {state.error ? (
        <p role="alert" className="text-[12px] text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-muted-foreground hover:text-foreground text-[12px]"
        >
          Keep it
        </button>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Cancelling…" : "Confirm cancel"}
        </Button>
      </div>
    </form>
  );
}
