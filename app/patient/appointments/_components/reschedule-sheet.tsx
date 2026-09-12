"use client";

import type { SessionOption } from "../_lib/session-options";
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
import { cn } from "@/lib/utils";
import { rescheduleMyAppointmentAction } from "../actions";

/**
 * Patient reschedule control — ADR 0084 §13, and the first caller
 * `reschedule-appointment` has had since it shipped.
 *
 * It sits ABOVE cancel, in DOM order and in weight, because the evidence says
 * the order matters: in a 1,500-slot NHS QI series, reminders with no way out
 * cut DNAs but pushed short-notice cancellations from 0.6% to 7.2%, and only
 * 20 of 35 freed slots were reused for want of a clerk. The Edge Function
 * releases the old slot itself — 'rescheduled' is not a live status, so the
 * time is back in the offer with nobody in the loop.
 *
 * Same shape as `CancelButton` deliberately: a `size="sm"` trigger lifted to
 * the 44px floor, a sheet (bottom on a phone, right panel at `md:`), the
 * reason the Edge Function requires, and the server's own message rendered
 * verbatim — a patient who cannot move a visit must be told exactly why.
 */
export function RescheduleSheet({
  appointmentId,
  /** "Dr Ada · Internal Medicine · Thu, Mar 12 · 14:00" — what is being moved. */
  summary,
  options,
}: {
  appointmentId: string;
  summary: string;
  options: ReadonlyArray<SessionOption>;
}) {
  const [requested, setRequested] = useState(false);
  const [state, formAction, pending] = useActionState<PatientApptActionState, FormData>(
    rescheduleMyAppointmentAction,
    {},
  );
  const reasonId = useId();
  const errorId = useId();

  // Derived, not an effect: once the server says ok the row re-renders at its
  // new day and this control unmounts, so there is nothing left to reopen.
  const open = requested && !state.ok;

  return (
    <>
      {/* size="sm" is ~24px tall — min-h-11 restores the 44px target without
          inventing a size. `brandSoft` rather than `primary`: one saturated
          element per screen, and the page's primary is "Book a visit". It
          still outweighs the secondary cancel beside it, which is what §13
          asks for. */}
      <Button
        type="button"
        variant="brandSoft"
        size="sm"
        onClick={() => setRequested(true)}
        className="min-h-11 self-start px-3.5"
      >
        Move this visit
      </Button>

      <ResponsiveSheet open={open} onOpenChange={setRequested}>
        <ResponsiveSheetContent>
          <ResponsiveSheetHeader>
            <ResponsiveSheetTitle>Move this visit</ResponsiveSheetTitle>
            <ResponsiveSheetDescription>{summary}</ResponsiveSheetDescription>
          </ResponsiveSheetHeader>

          {/* `contents` so the body still scrolls and the footer still pins. */}
          <form action={formAction} className="contents">
            <input type="hidden" name="appointment_id" value={appointmentId} />

            <ResponsiveSheetBody className="flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2">
                <legend className="text-foreground text-body-s mb-2 font-medium">
                  Choose from the days the clinic has open.
                </legend>

                {/* Native radios, one flat list — the shallowest structure the
                    HCI4D evidence endorses, and the browser's own arrow-key
                    traversal and form value come free. No client state. */}
                {options.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "tap bg-card dark:shadow-card flex min-h-14 cursor-pointer items-center gap-3 rounded-lg px-4 py-3 shadow-xs",
                      "has-[:checked]:bg-accent has-[:checked]:ring-brand-300 has-[:checked]:ring-1",
                      "has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                      "md:hover:brightness-[0.98] dark:md:hover:brightness-110",
                    )}
                  >
                    <input
                      type="radio"
                      name="slot"
                      value={option.value}
                      required
                      className="peer sr-only"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground text-body-m block truncate font-medium">
                        {option.dayLabel}
                      </span>
                      <span className="text-muted-foreground text-body-s block truncate">
                        {option.sessionLabel}
                      </span>
                    </span>
                    {/* The word changes, not only the fill — state is never
                        colour alone. Hidden from assistive tech because the
                        radio already announces itself as selected. */}
                    <span
                      aria-hidden
                      className="text-caption border-border text-muted-foreground shrink-0 rounded-full border px-2.5 py-1 peer-checked:hidden"
                    >
                      Choose
                    </span>
                    <span
                      aria-hidden
                      className="text-caption bg-primary text-primary-foreground hidden shrink-0 rounded-full px-2.5 py-1 peer-checked:inline-block"
                    >
                      Selected
                    </span>
                  </label>
                ))}

                {/* Says what the session choice actually resolves to. NOT the
                    same-day door's "we cannot tell you the hour" — that is the
                    queue's promise, and a booked visit does hold a time. */}
                <p className="text-muted-foreground text-body-s">
                  The clinic takes the earliest free time in the session you choose.
                </p>
              </fieldset>

              <div className="flex flex-col">
                <Label htmlFor={reasonId}>Why are you moving it?</Label>
                <Input
                  id={reasonId}
                  name="reason"
                  required
                  minLength={8}
                  placeholder="e.g. I cannot travel that day"
                  aria-invalid={!!state.error}
                  aria-describedby={state.error ? errorId : undefined}
                />
                <p className="text-muted-foreground text-caption mt-1.5">
                  At least 8 characters. Your care team sees this.
                </p>
              </div>
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
              <Button type="submit" disabled={pending}>
                {pending ? "Moving…" : "Move this visit"}
              </Button>
            </ResponsiveSheetFooter>
          </form>
        </ResponsiveSheetContent>
      </ResponsiveSheet>
    </>
  );
}
