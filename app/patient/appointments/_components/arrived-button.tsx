"use client";

import type { PatientApptActionState } from "../actions";
import { useActionState } from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { markArrivedAction } from "../actions";

/**
 * "I have arrived" — shown only on a confirmed, in-person visit whose day is
 * today in the clinic's zone (the page decides; this only submits). One tap,
 * no reason to type: the audit reason is fixed, and the server's refusal
 * sentence is rendered verbatim when it declines.
 */
export function ArrivedButton({ appointmentId }: { appointmentId: string }) {
  const [state, formAction, pending] = useActionState<PatientApptActionState, FormData>(
    markArrivedAction,
    {},
  );

  if (state.ok) {
    return (
      <span className="bg-brand-50 text-brand-700 ring-brand-200/70 text-body-s inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ring-1">
        <CheckIcon className="size-3.5" aria-hidden />
        You&rsquo;re in the queue
      </span>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Telling the desk…" : "I have arrived"}
      </Button>
      {state.error ? (
        <p role="alert" className="text-status-caution-fg text-body-s">
          {state.error}
        </p>
      ) : null}
      <p className="text-muted-foreground text-caption">
        Tap this when you are at the hospital. It puts you in the queue without going to the desk.
      </p>
    </form>
  );
}
