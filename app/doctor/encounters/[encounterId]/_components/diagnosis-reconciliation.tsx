"use client";

import { CheckIcon, PlusIcon } from "lucide-react";

import { reconcileDiagnosis } from "@/lib/clerkship/diagnosis/reconcile";
import { cn } from "@/lib/utils";

/**
 * Supporting-feature reconciliation for ONE committed working diagnosis: scan the
 * whole clerkship for its features and split them into PRESENT (already captured —
 * auto-confirmed ✓) and MISSING (not captured — a dashed ＋ the clinician taps to
 * capture into the ROS). Decision-support: it confirms what's there and prompts
 * for what's not; it NEVER fabricates — a missing feature stays missing until the
 * clinician taps it. Rendered inline beneath each working-diagnosis row.
 */

export interface SymptomMeta {
  display: string;
  system: string;
}

export function DiagnosisFeatures({
  text,
  symptomCodes,
  conditionCodes,
  symptomMeta,
  conditionMeta,
  onCaptureSymptom,
}: {
  text: string;
  symptomCodes: Set<string>;
  conditionCodes: Set<string>;
  symptomMeta: Map<string, SymptomMeta>;
  conditionMeta: Map<string, string>;
  onCaptureSymptom: (obs: { symptomCode: string; symptomDisplay: string; system: string }) => void;
}) {
  const rec = reconcileDiagnosis(text, { symptomCodes, conditionCodes });
  if (!rec.symptoms.length && !rec.risks.length) return null;

  const presentSym = rec.symptoms.filter((s) => s.present);
  const missingSym = rec.symptoms.filter((s) => !s.present);
  const presentRisk = rec.risks.filter((r) => r.present);
  const missingRisk = rec.risks.filter((r) => !r.present);

  return (
    <div className="border-border/60 flex flex-col gap-1.5 border-t pt-2">
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
                  aria-label={
                    meta
                      ? `Capture ${meta.display} as present`
                      : `${s.code} — no catalog display, capture manually`
                  }
                  onClick={() =>
                    meta &&
                    onCaptureSymptom({
                      symptomCode: s.code,
                      symptomDisplay: meta.display,
                      system: meta.system,
                    })
                  }
                  title={
                    meta ? "Capture as present (ROS)" : "No catalog display — capture manually"
                  }
                  className={cn(
                    "tap inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[11px]",
                    meta
                      ? "border-border text-muted-foreground hover:border-teal-500 hover:text-teal-700 dark:hover:border-teal-400 dark:hover:text-teal-300"
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
}
