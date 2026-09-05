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
      <span className="scale-in bg-brand-50 text-brand-700 ring-brand-200/70 dark:bg-brand-950/40 dark:text-brand-300 dark:ring-brand-800/40 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1">
        <CheckIcon className="size-3" aria-hidden />
        Checked in
      </span>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <input type="hidden" name="reason" value="Booked patient checked in at front desk." />
      <Button type="submit" size="sm" className="tap" disabled={pending}>
        {pending ? "Checking in…" : "Check in"}
      </Button>
      {state.error ? (
        <span className="text-destructive scale-in font-mono text-[10px]">{state.error}</span>
      ) : null}
    </form>
  );
}
