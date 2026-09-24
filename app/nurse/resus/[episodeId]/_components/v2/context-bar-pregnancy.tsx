"use client";

import type { ContextPatch } from "./context-bar";
import type { PatientContextFlags, PregnancyState } from "@/lib/resus/model";
import { useId, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PREGNANCY_STATES } from "@/lib/resus/model";
import { cn } from "@/lib/utils";
import { SELECTED } from "./step-panel-chips";

/**
 * Resus Desk v2 — the context bar's pregnancy control (part of context-bar.tsx).
 * A menu, not a <select>: arrowing through a closed select fires `change` per
 * option in several browsers, and each change is a recorded context event.
 * Gestation weeks apply to confirmed AND postpartum (ALS-MOD-07); a typo never
 * clears a recorded gestation — only an emptied field does.
 */

export const CHIP =
  "tap text-body-s inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 disabled:opacity-60";
export const ON = SELECTED;
export const OFF = "border-border bg-card text-foreground hover:bg-muted";

const LABEL: Record<PregnancyState, string> = {
  none: "Pregnancy: none",
  possible: "Pregnancy: possible",
  confirmed: "Pregnancy: confirmed",
  postpartum: "Postpartum",
};
const withWeeks = (p: PregnancyState) => p === "confirmed" || p === "postpartum";

export function PregnancyControl({
  flags,
  readOnly,
  write,
}: {
  flags: PatientContextFlags;
  readOnly: boolean;
  write: (patch: ContextPatch) => void;
}) {
  const [weeksError, setWeeksError] = useState(false);
  const errorId = useId();
  const setPregnancy = (p: PregnancyState) =>
    write({ pregnancy: p, gestationWeeks: withWeeks(p) ? flags.gestationWeeks : null });
  const on = flags.pregnancy !== "none";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={readOnly}
          render={<button type="button" className={cn(CHIP, on ? ON : OFF)} />}
        >
          {on ? <CheckIcon className="size-3.5" aria-hidden /> : null}
          {LABEL[flags.pregnancy]}
          <ChevronDownIcon className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuRadioGroup
            value={flags.pregnancy}
            onValueChange={(v: PregnancyState) => {
              if (v !== flags.pregnancy) setPregnancy(v);
            }}
          >
            {PREGNANCY_STATES.map((p) => (
              <DropdownMenuRadioItem
                key={p}
                value={p}
                closeOnClick
                className="text-body-s min-h-11 px-3"
              >
                {LABEL[p]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {withWeeks(flags.pregnancy) ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <label className="text-body-s text-muted-foreground inline-flex items-center gap-1.5">
            <input
              key={flags.gestationWeeks ?? "none"}
              type="number"
              inputMode="numeric"
              min={1}
              max={45}
              defaultValue={flags.gestationWeeks ?? ""}
              disabled={readOnly}
              aria-label="Gestation (weeks)"
              aria-invalid={weeksError || undefined}
              aria-describedby={weeksError ? errorId : undefined}
              onBlur={(e) => {
                const el = e.currentTarget;
                const raw = el.value.trim();
                // A number input reports "" for unparseable text ("2O"): badInput tells them apart.
                if (raw === "" && !el.validity.badInput) {
                  setWeeksError(false);
                  if (flags.gestationWeeks !== null) write({ gestationWeeks: null });
                  return;
                }
                const n = Math.round(Number(raw));
                if (el.validity.badInput || !Number.isFinite(n) || n < 1 || n > 45) {
                  setWeeksError(true);
                  el.value = flags.gestationWeeks == null ? "" : String(flags.gestationWeeks);
                  return;
                }
                setWeeksError(false);
                if (n !== flags.gestationWeeks) write({ gestationWeeks: n });
              }}
              className="border-border bg-card text-body-l sm:text-body-s text-foreground focus-visible:shadow-focus min-h-11 w-16 rounded-md border px-2 font-mono tabular-nums"
            />
            weeks
          </label>
          {weeksError ? (
            <span
              id={errorId}
              role="status"
              className="text-caption text-amber-800 dark:text-amber-200"
            >
              Weeks 1–45 — not saved
            </span>
          ) : flags.gestationWeeks == null && !readOnly ? (
            <span className="text-caption text-amber-800 dark:text-amber-200">
              Gestation not recorded — enter weeks (ALS-MOD-07)
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );
}
