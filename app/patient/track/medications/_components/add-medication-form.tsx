"use client";

import type { AddMedState } from "../../actions";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMedicationAction } from "../../actions";

const PATTERNS = [
  { value: "once_daily", label: "Once a day" },
  { value: "twice_daily", label: "Twice a day" },
  { value: "thrice_daily", label: "Three times a day" },
  { value: "as_needed", label: "As needed" },
  { value: "custom", label: "Custom" },
] as const;

export function AddMedicationForm() {
  const [state, formAction] = useActionState<AddMedState, FormData>(
    addMedicationAction,
    {} as AddMedState,
  );
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (state.ok && formRef.current) {
      formRef.current.reset();
    }
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="med-name" className="text-[11px] tracking-tight">
          Name
        </Label>
        <Input id="med-name" name="name" placeholder="e.g. Metformin" maxLength={120} required />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="med-dose" className="text-[11px] tracking-tight">
            Dose (optional)
          </Label>
          <Input id="med-dose" name="dose" placeholder="500 mg" maxLength={60} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="med-pattern" className="text-[11px] tracking-tight">
            How often
          </Label>
          <select
            id="med-pattern"
            name="schedule_pattern"
            defaultValue="once_daily"
            className="border-input bg-background text-foreground focus-visible:ring-ring/50 rounded-md border px-3 py-2 text-[13px] outline-none focus-visible:ring-[3px]"
          >
            {PATTERNS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="med-instructions" className="text-[11px] tracking-tight">
          Instructions (optional)
        </Label>
        <Input
          id="med-instructions"
          name="instructions"
          placeholder="With food, in the morning…"
          maxLength={240}
        />
      </div>

      {state.error ? (
        <p className="text-destructive border-destructive/30 bg-destructive/5 rounded-md border px-3 py-2 text-[12px] leading-relaxed">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <Button type="submit">Add medication</Button>
      </div>
    </form>
  );
}
