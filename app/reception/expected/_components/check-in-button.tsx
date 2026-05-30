"use client";

import type { ReceptionActionState } from "../../actions";
import { useActionState } from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { checkInPatientAction } from "../../actions";

export function CheckInButton({
  appointmentId,
  alreadyArrived,
}: {
  appointmentId: string;
  alreadyArrived: boolean;
}) {
  const [state, formAction, pending] = useActionState<ReceptionActionState, FormData>(
    checkInPatientAction,
    {},
  );

  if (alreadyArrived || state.ok) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[11.5px] font-medium text-teal-700 ring-1 ring-teal-200/70 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800/40">
        <CheckIcon className="size-3" aria-hidden />
        Checked in
      </span>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <input type="hidden" name="reason" value="Booked patient checked in at front desk." />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Checking in…" : "Check in"}
      </Button>
      {state.error ? (
        <span className="text-destructive font-mono text-[10px]">{state.error}</span>
      ) : null}
    </form>
  );
}
