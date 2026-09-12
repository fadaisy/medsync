"use client";

import type { ReceptionActionState } from "../../actions";
import { useActionState } from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { checkInPatientAction } from "../../actions";

export function CheckInButton({
  appointmentId,
  alreadyArrived,
  patientLabel,
}: {
  appointmentId: string;
  alreadyArrived: boolean;
  /** Code of the person this button checks in — the accessible name, so a
   * screen reader hears which row's button has focus. */
  patientLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ReceptionActionState, FormData>(
    checkInPatientAction,
    {},
  );

  if (alreadyArrived || state.ok) {
    return (
      <span className="bg-brand-50 text-brand-700 ring-brand-200/70 text-caption inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ring-1">
        <CheckIcon className="size-3" aria-hidden />
        Checked in
      </span>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <input type="hidden" name="reason" value="Booked patient checked in at front desk." />
      <Button
        type="submit"
        size="sm"
        className="tap min-h-11 px-4"
        disabled={pending}
        aria-label={`Check in ${patientLabel}`}
      >
        {pending ? "Checking in…" : "Check in"}
      </Button>
      {state.error ? (
        <span role="alert" className="text-destructive text-caption font-mono">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
