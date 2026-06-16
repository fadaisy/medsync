"use client";

import { CheckIcon, PlusIcon } from "lucide-react";

import { reconcileDiagnosis } from "@/lib/clerkship/diagnosis/reconcile";
import { cn } from "@/lib/utils";

/**
 * Diagnosis-driven feature reconciliation — for each SELECTED (committed) working
 * diagnosis, look across the whole clerkship for its supporting features and show
 * them split into PRESENT (already captured — auto-confirmed ✓) and MISSING (not
 * captured — a blank ＋ the clinician taps to capture into the ROS). Decision-
 * support: it confirms what's there and prompts for what's not; it never
 * fabricates — a missing feature stays missing until the clinician taps it.
 */

export interface SymptomMeta {
  display: string;
  system: string;
}

export function DiagnosisReconciliation({
  differentials,
  symptomCodes,
  conditionCodes,
  symptomMeta,
  conditionMeta,
  onCaptureSymptom,
}: {
  differentials: string[];
  symptomCodes: Set<string>;
  conditionCodes: Set<string>;
  symptomMeta: Map<string, SymptomMeta>;
  conditionMeta: Map<string, string>;
  onCaptureSymptom: (obs: { symptomCode: string; symptomDisplay: string; system: string }) => void;
}) {
  const rows = differentials
    .map((text) => ({ text, rec: reconcileDiagnosis(text, { symptomCodes, conditionCodes }) }))
    .filter((r) => r.rec.symptoms.length > 0 || r.rec.risks.length > 0);

  if (!rows.length) return null;

  return (
    <section className="border-border bg-card flex flex-col gap-2.5 rounded-xl border p-3.5 shadow-sm">
      <h4 className="font-display text-foreground inline-flex items-center gap-1.5 text-[13px] font-medium">
        <CheckIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
        Supporting features — your selected diagnoses
      </h4>

      {rows.map(({ text, rec }) => {
        const presentSym = rec.symptoms.filter((s) => s.present);
        const missingSym = rec.symptoms.filter((s) => !s.present);
        const presentRisk = rec.risks.filter((r) => r.present);
        const missingRisk = rec.risks.filter((r) => !r.present);
        return (
          <div
            key={text}
            className="border-border/60 flex flex-col gap-1.5 border-t pt-2 first:border-0 first:pt-0"
          >
            <span className="text-foreground text-[12.5px] font-medium">{text}</span>

            {rec.symptoms.length ? (
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-[9.5px] tracking-wide uppercase">
                  Symptoms — {presentSym.length}/{rec.symptoms.length} captured
                </span>
                <div className="flex flex-wrap gap-1">
                  {presentSym.map((s) => (
                    <span
                      key={s.code}
                      className="inline-flex items-center gap-1 rounded-md bg-teal-100 px-1.5 py-0.5 text-[11px] text-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
                    >
                      <CheckIcon className="size-3" aria-hidden />
                      {symptomMeta.get(s.code)?.display ?? s.code}
                    </span>
                  ))}
                  {missingSym.map((s) => {
                    const meta = symptomMeta.get(s.code);
                    return (
                      <button
                        key={s.code}
                        type="button"
                        disabled={!meta}
                        onClick={() =>
                          meta &&
                          onCaptureSymptom({
                            symptomCode: s.code,
                            symptomDisplay: meta.display,
                            system: meta.system,
                          })
                        }
                        title={
                          meta
                            ? "Capture as present (ROS)"
                            : "No catalog display — capture manually"
                        }
                        className={cn(
                          "tap inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[11px]",
                          meta
                            ? "border-border text-muted-foreground hover:border-teal-500 hover:text-teal-700 dark:hover:text-teal-300"
                            : "border-border/50 text-muted-foreground/50 cursor-not-allowed",
                        )}
                      >
                        <PlusIcon className="size-3" aria-hidden />
                        {meta?.display ?? s.code}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {rec.risks.length ? (
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-[9.5px] tracking-wide uppercase">
                  Risk factors — {presentRisk.length}/{rec.risks.length} recorded
                </span>
                <div className="flex flex-wrap gap-1">
                  {presentRisk.map((r) => (
                    <span
                      key={r.code}
                      className="inline-flex items-center gap-1 rounded-md bg-teal-100 px-1.5 py-0.5 text-[11px] text-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
                    >
                      <CheckIcon className="size-3" aria-hidden />
                      {conditionMeta.get(r.code) ?? r.code}
                    </span>
                  ))}
                  {missingRisk.map((r) => (
                    <span
                      key={r.code}
                      title="Not recorded — add in Background if present"
                      className="border-border/60 text-muted-foreground/70 inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[11px]"
                    >
                      {conditionMeta.get(r.code) ?? r.code}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      <p className="text-muted-foreground/70 text-[10px]">
        Auto-confirmed from what you captured; tap a missing symptom to record it as present.
        Nothing is auto-filled — missing features stay blank until you add them. Risk factors are
        recorded in Background.
      </p>
    </section>
  );
}
