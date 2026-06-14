"use client";

import type { Disposition } from "@/lib/clerkship/disposition";
import type { BpStandard } from "@/lib/clerkship/exam/bp";
import type { RecordedVitals } from "@/lib/clerkship/exam/types";
import type { AcuityLevel } from "@/lib/triage/types";
import { useMemo } from "react";
import { AlertTriangleIcon, ShieldCheckIcon } from "lucide-react";

import { crossCheckDisposition } from "@/lib/clerkship/disposition";

/**
 * Disposition cross-check — DECISION-SUPPORT, never a gate. Reuses the
 * already-CSO-signed thresholds (NEWS2 aggregate + single-3, reduced GCS,
 * out-of-range glucose, abnormal BP) plus the must-not-miss exam EMERGENCY
 * patterns to derive the minimum disposition the recorded state supports, and
 * surfaces a quiet prompt when the chosen disposition is less acute. It never
 * blocks, never auto-sets, and invents no thresholds — the clinician's call
 * stands. Renders nothing until a disposition is chosen and a floor exists.
 */
export function DispositionCheck({
  chosen,
  vitals,
  bpStandard,
  examEmergencies,
  triageAcuity,
}: {
  chosen: string;
  vitals: RecordedVitals;
  bpStandard: BpStandard;
  examEmergencies: string[];
  triageAcuity?: AcuityLevel | null;
}) {
  const result = useMemo(
    () =>
      crossCheckDisposition({
        chosen: (chosen || null) as Disposition | null,
        vitals,
        bpStandard,
        examEmergencies,
        triageAcuity: triageAcuity ?? null,
      }),
    [chosen, vitals, bpStandard, examEmergencies, triageAcuity],
  );

  // Nothing to say until a disposition is chosen and the state sets a floor.
  if (!chosen || result.expected === "none") return null;

  const floorLabel = result.expected === "escalate" ? "admission or escalation" : "observation";

  if (result.diverges) {
    return (
      <div
        role="alert"
        className="scale-in flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2.5 ring-1 ring-amber-500/20 dark:border-amber-900/50 dark:bg-amber-950/25"
      >
        <AlertTriangleIcon
          className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[12px] font-semibold text-amber-900 dark:text-amber-200">
            The recorded findings point to {floorLabel} — you selected “{chosen}”. Review or
            confirm.
          </p>
          <p className="text-[11px] leading-snug text-amber-800/90 dark:text-amber-300/90">
            {result.reasons.join(" · ")}
          </p>
          <p className="text-[10px] text-amber-700/80 italic dark:text-amber-400/70">
            Decision-support — your disposition stands; this only flags a possible mismatch.
          </p>
        </div>
      </div>
    );
  }

  // Consistent: a quiet confirmation that the choice matches the recorded acuity.
  return (
    <div className="text-muted-foreground border-border bg-muted/20 flex items-start gap-2 rounded-lg border p-2.5">
      <ShieldCheckIcon
        className="mt-0.5 size-3.5 shrink-0 text-teal-600 dark:text-teal-400"
        aria-hidden
      />
      <p className="text-[11px] leading-snug">
        Disposition consistent with the recorded acuity ({result.reasons.join(" · ") || "—"}).
      </p>
    </div>
  );
}
