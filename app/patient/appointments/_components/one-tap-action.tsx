"use client";

import type { PatientApptActionState } from "../actions";
import { useActionState } from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A one-tap Server Action with the house feedback: pending words, the
 * server's refusal sentence verbatim, and a chip once it is done (the row
 * re-renders on revalidate; the chip covers the round trip). Gate E's four
 * patient verbs — confirm attendance, take the offered place, leave the
 * list, book the next day — are all this shape, so there is one of it.
 */
export function OneTapAction({
  action,
  fields,
  label,
  pendingLabel,
  doneLabel,
  hint,
  variant = "primary",
}: {
  action: (prev: PatientApptActionState, formData: FormData) => Promise<PatientApptActionState>;
  fields: Record<string, string>;
  label: string;
  pendingLabel: string;
  doneLabel: string;
  /** One plain sentence under the button, when the action needs explaining. */
  hint?: string;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction, pending] = useActionState<PatientApptActionState, FormData>(action, {});

  if (state.ok) {
    return (
      <span className="bg-brand-50 text-brand-700 ring-brand-200/70 text-body-s inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ring-1">
        <CheckIcon className="size-3.5" aria-hidden />
        {doneLabel}
      </span>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button
        type="submit"
        variant={variant}
        size={variant === "primary" ? "lg" : "sm"}
        disabled={pending}
        className={variant === "primary" ? "w-full sm:w-fit" : "min-h-11 self-start px-3.5"}
      >
        {pending ? pendingLabel : label}
      </Button>
      {state.error ? (
        <p role="alert" className="text-status-caution-fg text-body-s">
          {state.error}
        </p>
      ) : null}
      {hint ? <p className="text-muted-foreground text-caption">{hint}</p> : null}
    </form>
  );
}
