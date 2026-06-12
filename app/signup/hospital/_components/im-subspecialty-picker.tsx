"use client";

import { useEffect, useState } from "react";

import { Checkbox } from "@/components/forms";
import { cn } from "@/lib/utils";

export interface ImSpecialty {
  id: string;
  name: string;
  code: string;
}

interface Props {
  specialties: ReadonlyArray<ImSpecialty>;
  /** Show + enable only when the user has ticked Internal Medicine in the parent step. */
  internalMedicineCheckboxName: string;
}

/**
 * IM sub-specialty multi-select that reveals itself when the user
 * ticks the "Internal Medicine" department checkbox in the same form.
 *
 * Watches the DOM for the parent checkbox's `change` event — the
 * MultiStepForm wraps every step in a single <form>, so a sibling-
 * checkbox listener works without prop drilling. Uses `name`
 * attributes to find the checkbox (cleaner than refs across step
 * boundaries).
 */
export function ImSubspecialtyPicker({ specialties, internalMedicineCheckboxName }: Props) {
  const [imTicked, setImTicked] = useState(false);

  useEffect(() => {
    function poll() {
      const el = document.querySelector<HTMLInputElement>(
        `input[name="${internalMedicineCheckboxName}"][value="INTERNAL_MEDICINE"]`,
      );
      setImTicked(!!el?.checked);
    }
    poll();
    document.addEventListener("change", poll, true);
    return () => document.removeEventListener("change", poll, true);
  }, [internalMedicineCheckboxName]);

  return (
    <fieldset
      className={cn(
        "border-border bg-muted/40 ease-expo-out mt-3 rounded-md border p-3 transition-[opacity,transform,border-color] duration-300",
        imTicked ? "border-teal-100 dark:border-teal-100/40" : "pointer-events-none opacity-50",
      )}
    >
      <legend className="text-foreground px-1 text-[12px] font-medium">
        Internal Medicine sub-specialties
        <span className="text-muted-foreground ml-2 text-[11px] font-normal">
          {imTicked ? "Pick the ones you actively run." : "Tick Internal Medicine above to enable."}
        </span>
      </legend>
      <div className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2">
        {specialties.map((s) => (
          <Checkbox
            key={s.id}
            name="im_subspecialties"
            value={s.id}
            label={s.name}
            disabled={!imTicked}
          />
        ))}
      </div>
    </fieldset>
  );
}
