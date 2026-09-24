"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon, SyringeIcon } from "lucide-react";

import { ANAPHYLAXIS_PROTOCOL } from "@/lib/resus/reference/abcde-catalog";
import { ALS_REFS } from "@/lib/resus/reference/als-catalog";
import { getResusDose } from "@/lib/resus/reference/doses";
import { findingLabel } from "@/lib/resus/reference/presentation";
import { refValue } from "@/lib/resus/reference/ref";
import { AIRWAY_ADAPTER, CIRCULATION_ADAPTER, EXPOSURE_ADAPTER } from "@/lib/resus/survey/floor";
import { ADULT_MIN_AGE_YEARS } from "@/lib/resus/survey/vitals-bands";
import { cn } from "@/lib/utils";
import { useDeskCtx } from "./desk-context";

/**
 * Resus Desk v2 — the Protocols chip (prompt §5.7; P7). The v1 anaphylaxis bar,
 * collapsed by default; it surfaces itself (open, amber) when an allergen
 * trigger is in context or urticaria / angioedema / facial swelling is
 * recorded. In cardiac arrest it shows only the ALS line (ALS-DRG-06) and the
 * IM prompt is gone. Children never see an adult number.
 */

const TRIGGERS = ["urticaria_angioedema", "swelling_face"];
const dose = getResusDose(ANAPHYLAXIS_PROTOCOL.firstLineDoseId);

export function ProtocolsChip() {
  const { store, ui, flags, inArrest, ageYears } = useDeskCtx();
  const events = store.activeEvents;
  const child = ageYears != null && ageYears < ADULT_MIN_AGE_YEARS;
  const hits = useMemo(
    () =>
      (
        [
          ["A", AIRWAY_ADAPTER.latest(events)?.present],
          ["C", CIRCULATION_ADAPTER.latest(events)?.present],
          ["E", EXPOSURE_ADAPTER.latest(events)?.present],
        ] as const
      ).flatMap(([step, present]) =>
        (present ?? []).filter((c) => TRIGGERS.includes(c)).map((c) => findingLabel(step, c)),
      ),
    [events],
  );
  const surfaced = flags.allergenTrigger || hits.length > 0;
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? surfaced;

  if (inArrest) {
    const line = refValue(ALS_REFS["ALS-DRG-06"]!);
    return (
      <div role="note" className="border-border bg-card flex flex-col gap-1 rounded-lg border p-3">
        <p className="text-overline text-muted-foreground uppercase">Protocols · Anaphylaxis</p>
        <p className="text-body-s text-foreground">
          In cardiac arrest: {child ? line.split(" — ")[0] : line}
        </p>
      </div>
    );
  }

  const why = [...(flags.allergenTrigger ? ["allergen trigger"] : []), ...hits].join(", ");
  return (
    <div
      className={cn(
        "rounded-lg border",
        surfaced
          ? "border-amber-300 bg-amber-50/60 dark:border-amber-700/60 dark:bg-amber-950/20"
          : "border-border bg-card",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
        className="tap text-body-s flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left"
      >
        <span className="flex flex-col">
          <span>
            <span className="text-muted-foreground">Protocols · </span>
            <span className="text-foreground font-medium">Anaphylaxis</span>
          </span>
          {surfaced ? (
            <span className="text-caption text-amber-800 dark:text-amber-200">because {why}</span>
          ) : null}
        </span>
        <ChevronDownIcon
          className={cn(
            "ease-expo-out size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-border text-body-s text-foreground flex flex-col gap-2 border-t p-3">
          <p>{ANAPHYLAXIS_PROTOCOL.recognition}</p>
          {child ? (
            <p>Child: the prescribe dialog gives the dose for the age band.</p>
          ) : (
            <p>
              <span className="font-medium">{dose.drug}:</span> {dose.adultDose}
            </p>
          )}
          {dose.timing ? <p className="text-muted-foreground">{dose.timing}</p> : null}
          <ul className="text-muted-foreground list-disc pl-5">
            {ANAPHYLAXIS_PROTOCOL.adjuncts.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p className="text-amber-800 dark:text-amber-200">
            {ANAPHYLAXIS_PROTOCOL.notRecommended}
          </p>
          <p className="text-muted-foreground">{ANAPHYLAXIS_PROTOCOL.refractory}</p>
          <p className="text-caption text-muted-foreground">{ANAPHYLAXIS_PROTOCOL.source}</p>
          {store.readOnly ? null : (
            <button
              type="button"
              onClick={() =>
                ui.openPrescribe({
                  recCode: "anaphylaxis_im_adrenaline",
                  recLabel: "Anaphylaxis — IM adrenaline",
                })
              }
              className="tap text-body-s bg-primary text-primary-foreground hover:bg-primary-hover inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 font-medium"
            >
              <SyringeIcon className="size-4" aria-hidden />
              Prescribe / record
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
