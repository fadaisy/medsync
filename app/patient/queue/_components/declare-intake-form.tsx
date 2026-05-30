"use client";

import type { DeclareIntakeState } from "../actions";
import Link from "next/link";
import { useActionState, useState } from "react";
import { TicketIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { declareIntakeAction } from "../actions";

interface DepartmentOption {
  id: string;
  name: string;
  openNow: boolean;
  /** Why it's closed if !openNow — surfaced honestly under the radio. */
  reason: string | null;
  ahead: number;
}

interface Props {
  departments: ReadonlyArray<DepartmentOption>;
  /** If no department is open right now, we don't show the submit at all. */
  anyOpen: boolean;
  hospitalName: string;
}

/**
 * The patient-side "what dept are you here for?" picker. Submits to
 * declareIntakeAction → pt-declare-intake Edge Function. The page
 * already surfaced the existing-intake / existing-appointment paths
 * before rendering this, so we only worry about the happy path +
 * error recovery here.
 */
export function DeclareIntakeForm({ departments, anyOpen, hospitalName }: Props) {
  const [state, action, pending] = useActionState<DeclareIntakeState, FormData>(
    declareIntakeAction,
    {},
  );
  const [selected, setSelected] = useState<string | null>(null);

  if (!anyOpen) {
    return (
      <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4">
        <span className="text-foreground text-[13.5px] font-medium">
          No departments are taking walk-ins right now at {hospitalName}.
        </span>
        <p className="text-muted-foreground text-[12.5px] leading-snug">
          Same-day walk-in hours haven&rsquo;t been published, or none are open at the moment. You
          can book a future visit instead.
        </p>
        <Link
          href="/patient/book"
          className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1.5 text-[12px] font-medium text-white shadow-xs transition-colors hover:bg-teal-700"
        >
          Book a future visit
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          Department
        </legend>
        <ul className="flex flex-col gap-2">
          {departments.map((d) => {
            const id = `dept_${d.id}`;
            const isSelected = selected === d.id;
            return (
              <li key={d.id}>
                <label
                  htmlFor={id}
                  className={
                    !d.openNow
                      ? "border-border bg-card flex cursor-not-allowed items-center gap-3 rounded-xl border p-3.5 opacity-60"
                      : isSelected
                        ? "flex cursor-pointer items-center gap-3 rounded-xl border border-teal-500/50 bg-teal-50/50 p-3.5 ring-1 ring-teal-500/30 dark:border-teal-400/40 dark:bg-teal-950/20"
                        : "border-border bg-card flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors hover:border-teal-300"
                  }
                >
                  <input
                    id={id}
                    type="radio"
                    name="receiving_department_id"
                    value={d.id}
                    disabled={!d.openNow}
                    onChange={() => setSelected(d.id)}
                    className="size-4 accent-teal-600"
                    required
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-foreground text-[13.5px] font-medium">{d.name}</span>
                    {d.openNow ? (
                      <span className="text-muted-foreground text-[11.5px]">
                        {d.ahead === 0 ? "No one in line" : `${d.ahead} ahead right now`}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[11.5px]">
                        Not available — {d.reason}.
                      </span>
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="presenting_complaint"
          className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase"
        >
          What brings you in?{" "}
          <span className="text-muted-foreground/70 normal-case">(optional)</span>
        </label>
        <textarea
          id="presenting_complaint"
          name="presenting_complaint"
          rows={3}
          maxLength={500}
          placeholder="A short note helps the team prepare — e.g. follow-up for diabetes, persistent cough for 3 days."
          className="border-input bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-ring/50 focus-visible:border-ring rounded-md border p-3 text-[13px] shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
        />
      </div>

      {state.error ? (
        <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-1 rounded-md border p-3">
          <p className="text-destructive text-[12.5px]">{state.error}</p>
          {state.existing_appointment_id ? (
            <Link
              href="/patient/appointments"
              className="text-foreground self-start text-[12px] font-medium underline underline-offset-2 hover:text-teal-700 dark:hover:text-teal-300"
            >
              View today&rsquo;s booking →
            </Link>
          ) : null}
          {state.existing_intake_id ? (
            <Link
              href={`/patient/queue/${state.existing_intake_id}`}
              className="text-foreground self-start text-[12px] font-medium underline underline-offset-2 hover:text-teal-700 dark:hover:text-teal-300"
            >
              View your queue ticket →
            </Link>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" disabled={pending || !selected} className="w-full justify-center">
        <TicketIcon className="size-3.5" aria-hidden />
        {pending ? "Saving your spot…" : "Join today's queue"}
      </Button>

      <p className="text-muted-foreground text-center text-[11px] leading-snug">
        A ticket isn&rsquo;t a guarantee of being seen by a specific clinician or at a fixed time.
        The team works through the line in order.
      </p>
    </form>
  );
}
