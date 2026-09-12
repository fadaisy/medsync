"use client";

import type { ReceptionActionState } from "../actions";
import { useActionState } from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { checkInDeclaredIntakeAction } from "../actions";

/**
 * Reception flips a patient-declared queue ticket to 'arrived' +
 * inserts the dept queue row. Calls ha-check-in-patient with the
 * intake_id branch (migration 0035 extension).
 *
 * Lives at the workspace root, not inside a route, because both places a
 * clerk meets a declared patient use it: the Expected list, and a name
 * match on Find.
 */
export function CheckInDeclaredButton({
  intakeId,
  patientLabel,
}: {
  intakeId: string;
  /** Name or code of the person this button checks in — the accessible
   * name, so a screen reader hears which row's button has focus. */
  patientLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ReceptionActionState, FormData>(
    checkInDeclaredIntakeAction,
    {},
  );

  if (state.ok) {
    return (
      <span className="bg-brand-50 text-brand-700 ring-brand-200/70 text-caption inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ring-1">
        <CheckIcon className="size-3" aria-hidden />
        Checked in
      </span>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="intake_id" value={intakeId} />
      <input
        type="hidden"
        name="reason"
        value="Patient-declared queue ticket checked in at front desk."
      />
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
