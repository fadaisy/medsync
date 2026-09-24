"use client";

import type { ArrestPrompt, ArrestState, PatientContextFlags } from "@/lib/resus/model";
import { useState } from "react";
import { CircleAlertIcon, ClockIcon, InfoIcon, ShieldAlertIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtMs, Overline, toneClass } from "./arrest-console-model";

/**
 * NEXT — the engine's prompts (severity-ordered, each carrying its catalog text and rule
 * ID) plus two timing lines the engine leaves to the UI: when the adrenaline window opens,
 * and when the antiarrhythmic becomes eligible. Overdue and due are amber (with the word),
 * info is neutral. The child banner replaces the engine's paediatric prompt (said once).
 */

interface Line extends ArrestPrompt {
  /** A short clock beside the text ("in 0:48", "+0:12"). */
  clock?: string;
}

const SEVERITY_WORD: Record<ArrestPrompt["severity"], string | null> = {
  overdue: "Overdue",
  due: "Due",
  info: null,
};

function nextLines(a: ArrestState, now: number): Line[] {
  const out: Line[] = a.prompts
    .filter((p) => p.id !== "paediatric")
    .map((p) => {
      if (p.id.startsWith("cycle_") && a.cycle.dueAtMs !== null) {
        const d = a.cycle.dueAtMs - now;
        return { ...p, clock: d > 0 ? `in ${fmtMs(d)}` : `+${fmtMs(-d)}` };
      }
      if (
        p.id === "adrenaline" &&
        a.adrenaline.status === "window_open" &&
        a.adrenaline.overdueAtMs
      )
        return { ...p, clock: `overdue in ${fmtMs(a.adrenaline.overdueAtMs - now)}` };
      if (p.id === "adrenaline" && a.adrenaline.status === "overdue" && a.adrenaline.overdueAtMs)
        return { ...p, clock: `+${fmtMs(now - a.adrenaline.overdueAtMs)}` };
      return p;
    });
  if (a.status !== "in_arrest") return out;
  const adr = a.adrenaline;
  if (adr.status === "waiting" && adr.opensAtMs !== null && adr.lastAtMs !== null)
    out.push({
      id: "adrenaline_wait",
      ruleId: adr.ruleIds[0] ?? "ALS-ADR-03",
      severity: "info",
      text: `Adrenaline window opens in ${fmtMs(adr.opensAtMs - now)} (last dose ${fmtMs(now - adr.lastAtMs)} ago)`,
    });
  if (adr.status === "not_yet_eligible")
    out.push({
      id: "adrenaline_wait",
      ruleId: adr.ruleIds[0] ?? "ALS-ADR-01",
      severity: "info",
      text: `Adrenaline — ${adr.reason}`,
    });
  const aa = a.antiarrhythmic;
  if (aa.status === "not_eligible" && a.rhythms.some((r) => r.rhythm === "vf_pvt"))
    out.push({
      id: "antiarrhythmic_wait",
      ruleId: aa.ruleIds[0] ?? "ALS-AA-04",
      severity: "info",
      text: `${aa.drug === "amiodarone" ? "Amiodarone" : "Lidocaine"} — ${aa.reason}`,
    });
  return out;
}

const ICON = { overdue: CircleAlertIcon, due: ClockIcon, info: InfoIcon } as const;

export function NextPanel({ arrest, now }: { arrest: ArrestState; now: number }) {
  const [all, setAll] = useState(false);
  const lines = nextLines(arrest, now);
  // Phone: the top two lines, then "N more" (the tablet shows them all).
  const PHONE_TOP = 2;

  return (
    <section
      aria-label="Next"
      className="border-border bg-card flex flex-col gap-2 rounded-lg border p-3"
    >
      <Overline>Next</Overline>
      {lines.length === 0 ? (
        <p className="text-body-s text-muted-foreground">Nothing due now.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {lines.map((l, i) => {
            const Icon = ICON[l.severity];
            const word = SEVERITY_WORD[l.severity];
            return (
              <li
                key={`${l.id}-${i}`}
                data-rule={l.ruleId}
                className={cn(
                  "text-body-s flex items-start gap-2 rounded-md border px-2.5 py-2",
                  l.severity === "info" ? "border-transparent" : toneClass(l.severity),
                  i >= PHONE_TOP && !all && "hidden sm:flex",
                )}
              >
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  {word ? <span className="font-medium">{word}: </span> : null}
                  {l.text}
                </span>
                {l.clock ? (
                  <span className="text-caption shrink-0 font-mono tabular-nums">{l.clock}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {lines.length > PHONE_TOP ? (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="tap text-body-s min-h-11 self-start rounded-md px-1 font-medium text-teal-700 sm:hidden"
        >
          {all ? "Show fewer" : `${lines.length - PHONE_TOP} more`}
        </button>
      ) : null}
    </section>
  );
}

/** SPECIAL — active special-circumstance modifiers (amber) and the child banner. */
export function SpecialBanner({
  arrest,
  flags,
}: {
  arrest: ArrestState;
  flags: PatientContextFlags;
}) {
  const mods = arrest.modifiers.filter((m) => m.id !== "paediatric");
  // ALS-MOD-07 needs the gestation: ask for it rather than stay silent.
  const gestationMissing =
    (flags.pregnancy === "confirmed" || flags.pregnancy === "postpartum") &&
    flags.gestationWeeks === null;
  if (!arrest.paediatric && mods.length === 0 && !gestationMissing)
    return (
      <p className="text-body-s text-muted-foreground hidden sm:block">
        <span className="text-overline uppercase">Special</span> · none active
      </p>
    );
  return (
    <section
      aria-label="Special circumstances"
      className={cn("flex flex-col gap-1.5 rounded-lg border p-3", toneClass("due"))}
    >
      <p className="text-overline flex items-center gap-1.5 uppercase">
        <ShieldAlertIcon aria-hidden className="size-4" />
        Special
      </p>
      {arrest.paediatric ? (
        <p className="text-body-s font-medium">
          Child — clocks and logging only; weight-based doses (PLS not built)
        </p>
      ) : null}
      {mods.map((m) => (
        <p key={m.id} data-rule={m.ruleIds.join(" ")} className="text-body-s">
          {m.label}
        </p>
      ))}
      {gestationMissing ? (
        <p className="text-body-s" data-rule="ALS-MOD-07">
          Gestation not recorded — enter weeks (ALS-MOD-07)
        </p>
      ) : null}
    </section>
  );
}
