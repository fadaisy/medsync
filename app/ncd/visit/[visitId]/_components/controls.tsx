"use client";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** A segmented single choice: real radio buttons, keyboard-operable, one tap each (§4 Forms). */
export function Seg({
  label,
  value,
  onChange,
  options,
  big = false,
  hideLabel = true,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  options: readonly (readonly [string, string])[];
  big?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className={cn("text-label mb-1", hideLabel && "sr-only")}>{label}</legend>
      <div className="bg-ink-100 inline-flex flex-wrap gap-0.5 rounded-lg p-0.5">
        {options.map(([v, l]) => (
          <label
            key={v}
            className={cn(
              "text-label has-[:focus-visible]:shadow-focus inline-flex cursor-pointer items-center justify-center rounded-md px-3 transition-colors duration-100",
              big ? "h-11 min-w-20" : "h-8",
              value === v
                ? "bg-background text-foreground shadow-xs"
                : "text-ink-600 hover:text-foreground",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={label}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
            />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const FIELD_WORDS: Record<string, string> = {
  systolic: "Systolic pressure outside 60–300",
  diastolic: "Diastolic pressure outside 30–200",
  systolic_not_above_diastolic: "Systolic not above diastolic",
  weight_kg: "Weight outside 20–300 kg",
  height_cm: "Height outside 100–220 cm",
  glucose_mmol: "Glucose outside 1.0–60.0 mmol/L",
  hba1c_percent: "HbA1c outside 3.0–20.0%",
  creatinine_umol: "Creatinine outside 20–2,500 µmol/L",
  acr_mg_mmol: "ACR outside 0–1,000 mg/mmol",
  total_cholesterol: "Total cholesterol outside 1–20 mmol/L",
  ldl: "LDL outside 0.3–15 mmol/L",
};

/** §5.5: values outside a plausible range are shown back for confirmation, never blocked. */
export function ConfirmValues({
  fields,
  onCancel,
  onConfirm,
}: {
  fields: string[] | null;
  onCancel: () => void;
  onConfirm: (f: string[]) => void;
}) {
  return (
    <EditorDialog open={!!fields} onOpenChange={(o) => (o ? null : onCancel())} width="medium">
      <SheetHeader>
        <SheetTitle>Check these values</SheetTitle>
        <SheetDescription>
          They are outside the usual range. Confirm them if they are right, or go back and correct
          them.
        </SheetDescription>
      </SheetHeader>
      <SheetBody>
        <ul className="text-body-s flex list-disc flex-col gap-1 pl-5">
          {(fields ?? []).map((f) => (
            <li key={f}>{FIELD_WORDS[f] ?? f}</li>
          ))}
        </ul>
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={onCancel}>
          Go back
        </Button>
        <Button onClick={() => onConfirm(fields ?? [])}>Confirm and save</Button>
      </SheetFooter>
    </EditorDialog>
  );
}
