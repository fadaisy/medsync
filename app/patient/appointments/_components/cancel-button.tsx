"use client";

import type { PatientApptActionState } from "../actions";
import { useActionState, useId, useState } from "react";

import {
  ResponsiveSheet,
  ResponsiveSheetBody,
  ResponsiveSheetContent,
  ResponsiveSheetDescription,
  ResponsiveSheetFooter,
  ResponsiveSheetHeader,
  ResponsiveSheetTitle,
} from "@/components/responsive/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelMyAppointmentAction } from "../actions";

/**
 * Patient cancel control: a secondary button that opens a sheet — a bottom
 * sheet on a phone, a right panel at `md:` — holding the visit summary and the
 * reason the Edge Function requires (≥ 8 chars).
 *
 * It replaced a 12px bare text link that turned red on hover: below the 44px
 * touch floor, and red is reserved for clinical emergencies. Cancelling your
 * own appointment is neither.
 *
 * The mutation itself is untouched. `cancelMyAppointmentAction` still carries
 * its `x-request-id` to the `cancel-appointment` function and still returns the
 * server's own message, which is rendered verbatim: a patient who cannot cancel
 * must be told exactly why, not "something went wrong".
 */
export function CancelButton({
  appointmentId,
  /** "Dr Ada · Internal Medicine · Thu, Mar 12 · 14:00" — what is being cancelled. */
  summary,
}: {
  appointmentId: string;
  summary: string;
}) {
  const [requested, setRequested] = useState(false);
  const [state, formAction, pending] = useActionState<PatientApptActionState, FormData>(
    cancelMyAppointmentAction,
    {},
  );
  const reasonId = useId();
  const errorId = useId();

  // On success the action revalidates and this row re-renders as "cancelled",
  // which unmounts the button — but the sheet would sit open over the list for
  // the width of that round trip. Derived, not an effect: once the server says
  // ok the sheet is closed, and there is nothing left here to reopen.
  const open = requested && !state.ok;

  return (
    <>
      {/* size="sm" is the plan's control, but sm is ~24px tall — min-h-11
          restores the 44px target without inventing a size. */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setRequested(true)}
        className="min-h-11 self-start px-3.5"
      >
        Cancel visit
      </Button>

      <ResponsiveSheet open={open} onOpenChange={setRequested}>
        <ResponsiveSheetContent>
          <ResponsiveSheetHeader>
            <ResponsiveSheetTitle>Cancel this visit?</ResponsiveSheetTitle>
            <ResponsiveSheetDescription>{summary}</ResponsiveSheetDescription>
          </ResponsiveSheetHeader>

          {/* `contents` so the body still scrolls and the footer still pins:
              the sheet lays its own children out, and the form is only here to
              carry the submission. */}
          <form action={formAction} className="contents">
            <input type="hidden" name="appointment_id" value={appointmentId} />

            <ResponsiveSheetBody className="flex flex-col">
              <Label htmlFor={reasonId}>Why are you cancelling?</Label>
              <Input
                id={reasonId}
                name="reason"
                required
                minLength={8}
                placeholder="e.g. I'm travelling that week"
                aria-invalid={!!state.error}
                aria-describedby={state.error ? errorId : undefined}
              />
              <p className="text-muted-foreground text-caption mt-1.5">
                At least 8 characters. Your care team sees this.
              </p>
            </ResponsiveSheetBody>

            <ResponsiveSheetFooter>
              {state.error ? (
                <p
                  id={errorId}
                  role="alert"
                  className="text-destructive text-body-s ncd-reveal sm:mr-auto sm:self-center"
                >
                  {state.error}
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRequested(false)}
                disabled={pending}
              >
                Keep it
              </Button>
              <Button type="submit" variant="secondary" disabled={pending}>
                {pending ? "Cancelling…" : "Cancel visit"}
              </Button>
            </ResponsiveSheetFooter>
          </form>
        </ResponsiveSheetContent>
      </ResponsiveSheet>
    </>
  );
}
