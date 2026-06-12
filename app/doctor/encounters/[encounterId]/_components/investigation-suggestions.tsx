"use client";

import type { SuggestedInvestigation } from "@/lib/clerkship/suggestions/types";
import { useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  FlaskConicalIcon,
  LightbulbIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";

import {
  INVESTIGATION_SETS_CSO_SIGNED,
  suggestedInvestigationsFor,
} from "@/lib/clerkship/suggestions/investigations";
import { cn } from "@/lib/utils";

/**
 * Investigation suggestions (W1) — DECISION-SUPPORT, never autonomous. Derives an
 * optional, SOURCED, tap-to-accept list of investigations from the presenting
 * complaint (via the cited, CSO-signed investigation-set catalog). Pre-fills
 * nothing: a tap adds the test to the existing investigations rows (then it's
 * captured + audited through the normal save path); a must-not-miss is always
 * surfaced (reserved-red), even at low probability. NO doses here. Every row shows
 * its WHY + SOURCE + CONFIDENCE so the clinician can judge. Until the CSO signs the
 * catalog tranche, a "preview" banner makes the unsigned status explicit.
 */

type Row = { kind: string; text: string; loinc: string; justification: string };

/** Map a test name to the existing investigations "kind" select. */
function inferKind(test: string): Row["kind"] {
  const t = test.toLowerCase();
  if (/x-?ray|\bct\b|ultrasound|\becho|mri|imaging|radiograph|doppler|angiogr/.test(t))
    return "imaging";
  if (
    /ecg|sp[o0]2|oximetr|glucose|\brdt\b|peak flow|spirometr|urinalysis|urine|capillary|v?bg|blood gas|ketone|bedside/.test(
      t,
    )
  )
    return "bedside";
  return "bloods";
}

function toRow(s: SuggestedInvestigation): Row {
  const src = `${s.source.guideline} ${s.source.version}`;
  return {
    kind: inferKind(s.test),
    text: s.test,
    loinc: s.loinc ?? "",
    justification: `${s.rationale} — ${src}`,
  };
}

export function InvestigationSuggestions({
  pcCodes,
  existing,
  onAccept,
}: {
  pcCodes: string[];
  /** test texts already present in the investigations list (to mark "added"). */
  existing: string[];
  onAccept: (row: Row) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const all = suggestedInvestigationsFor(pcCodes);
  const suggestions = all.filter((s) => !dismissed.has(s.test));
  if (!suggestions.length) return null;

  const added = new Set(existing.map((t) => t.toLowerCase().trim()));

  return (
    <div className="border-border bg-muted/20 fade-in-slow flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <LightbulbIcon className="size-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
        <span className="text-foreground text-[12.5px] font-semibold">
          Suggested investigations
        </span>
        {!INVESTIGATION_SETS_CSO_SIGNED ? (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide text-amber-800 uppercase dark:bg-amber-950/40 dark:text-amber-300">
            preview · pending CSO sign-off
          </span>
        ) : null}
      </div>

      <ul className="flex flex-col gap-1.5">
        {suggestions.map((s) => {
          const isAdded = added.has(s.test.toLowerCase().trim());
          return (
            <li
              key={s.test}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-2",
                s.mustNotMiss
                  ? "border-red-300 bg-red-50/60 ring-1 ring-red-500/20 dark:border-red-900/50 dark:bg-red-950/20"
                  : "border-border bg-card",
              )}
            >
              <div className="flex items-start gap-2">
                {s.mustNotMiss ? (
                  <AlertTriangleIcon
                    className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400"
                    aria-label="must-not-miss"
                  />
                ) : (
                  <FlaskConicalIcon
                    className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
                    aria-hidden
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-foreground text-[12.5px] font-medium">{s.test}</span>
                    {s.loinc ? (
                      <span className="text-muted-foreground font-mono text-[10px]">{s.loinc}</span>
                    ) : null}
                    <span
                      className={cn(
                        "rounded px-1 text-[9px] font-medium tracking-wide uppercase",
                        s.ugandaTier === "core"
                          ? "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
                          : "text-muted-foreground bg-muted",
                      )}
                    >
                      {s.ugandaTier === "core" ? "core" : "context"}
                    </span>
                    {s.confidence === "needs_cso_input" ? (
                      <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        needs CSO input
                      </span>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-[11px] leading-snug">
                    {s.rationale} · <span className="italic">why:</span> {s.why.join(", ")}
                  </p>
                  <p className="text-muted-foreground/80 text-[10px]">
                    {s.source.guideline} {s.source.version}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {isAdded ? (
                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-teal-700 dark:text-teal-300">
                      <CheckIcon className="size-3.5" aria-hidden /> added
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAccept(toRow(s))}
                      className="tap inline-flex items-center gap-1 rounded-md bg-teal-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-teal-700"
                    >
                      <PlusIcon className="size-3.5" aria-hidden /> add
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDismissed((prev) => new Set(prev).add(s.test))}
                    aria-label={`Dismiss ${s.test} suggestion`}
                    className="tap text-muted-foreground hover:text-foreground rounded-md p-1"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground/80 text-[10px] italic">
        Decision-support — you decide; nothing is recorded until you add it. Drug doses are handled
        in the prescribing tool, never here.
      </p>
    </div>
  );
}
