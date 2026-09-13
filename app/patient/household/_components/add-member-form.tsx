"use client";

import type { HouseholdActionState } from "../actions";
import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addHouseholdMemberAction } from "../actions";

const RELATIONSHIPS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "parent", label: "My parent" },
  { value: "spouse", label: "My spouse" },
  { value: "child", label: "My adult child" },
  { value: "guardian", label: "Someone I look after" },
  { value: "relative", label: "Another relative" },
  { value: "vht", label: "Someone in my village (VHT)" },
  { value: "other", label: "Someone else" },
];

const FIELD = "flex flex-col gap-1.5";

/**
 * Name, phone, date of birth or age, relationship, and the adult declaration
 * — the whole of what a booking identity is (PRD §2.8). Nothing clinical is
 * asked, and nothing may be added here. The server's sentence is shown
 * verbatim, including the minor refusal.
 */
export function AddMemberForm() {
  const [state, formAction, pending] = useActionState<HouseholdActionState, FormData>(
    addHouseholdMemberAction,
    {},
  );
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <form
      // Remount once per success so the fields clear without an effect — and
      // only then: a later refusal must not wipe what was just typed.
      key={state.stamp ?? 0}
      action={formAction}
      className="bg-card dark:shadow-card flex flex-col gap-4 rounded-xl p-5 shadow-xs"
      aria-describedby={state.error ? errorId : undefined}
    >
      <div className={FIELD}>
        <Label htmlFor={`${id}-name`}>Their name</Label>
        <Input id={`${id}-name`} name="member_label" required maxLength={80} autoComplete="off" />
        <p className="text-muted-foreground text-caption">As you would say it at the desk.</p>
      </div>

      <div className={FIELD}>
        <Label htmlFor={`${id}-phone`}>Their phone</Label>
        <Input
          id={`${id}-phone`}
          name="phone_e164"
          type="tel"
          inputMode="tel"
          required
          placeholder="07XX XXX XXX"
          className="font-mono"
        />
        <p className="text-muted-foreground text-caption">
          Their own number if they have one. A text about the visit goes there, not to you.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={FIELD}>
          <Label htmlFor={`${id}-dob`}>Date of birth</Label>
          <Input id={`${id}-dob`} name="date_of_birth" type="date" />
        </div>
        <div className={FIELD}>
          <Label htmlFor={`${id}-age`}>or age in years</Label>
          <Input
            id={`${id}-age`}
            name="age_years"
            type="number"
            inputMode="numeric"
            min={0}
            max={130}
          />
        </div>
      </div>

      <div className={FIELD}>
        <Label htmlFor={`${id}-rel`}>Who they are to you</Label>
        <select
          id={`${id}-rel`}
          name="relationship"
          required
          defaultValue=""
          className="border-input bg-card text-foreground text-body-m focus-visible:shadow-focus min-h-11 rounded-lg border px-3 outline-none"
        >
          <option value="" disabled>
            Choose one
          </option>
          {RELATIONSHIPS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <label className="text-body-s flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="declared_adult"
          required
          className="accent-brand-500 mt-1 size-4 shrink-0"
        />
        <span className="text-foreground">
          This person is an adult (18 or older).{" "}
          <span className="text-muted-foreground">Booking for a child is not available yet.</span>
        </span>
      </label>

      {state.error ? (
        <p id={errorId} role="alert" className="text-status-caution-fg text-body-s">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-brand-700 text-body-s font-medium">
          Added. They now appear as a choice when you book.
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Adding…" : "Add to my list"}
      </Button>
    </form>
  );
}
