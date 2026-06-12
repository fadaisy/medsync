"use client";

import type { ReceptionActionState } from "../../actions";
import { useActionState } from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { checkInDeclaredIntakeAction } from "../../actions";

/**
 * Reception flips a patient-declared queue ticket to 'arrived' +
 * inserts the dept queue row. Calls ha-check-in-patient with the
 * intake_id branch (migration 0035 extension).
 */
export function CheckInDeclaredButton({ intakeId }: { intakeId: string }) {
  const [state, formAction, pending] = useActionState<ReceptionActionState, FormData>(
    checkInDeclaredIntakeAction,
    {},
  );

  if (state.ok) {
    return (
      <span className="scale-in inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[11.5px] font-medium text-teal-700 ring-1 ring-teal-200/70 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800/40">
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
      <Button type="submit" size="sm" className="tap" disabled={pending}>
        {pending ? "Checking in…" : "Check in"}
      </Button>
      {state.error ? (
        <span className="text-destructive scale-in font-mono text-[10px]">{state.error}</span>
      ) : null}
    </form>
  );
}
