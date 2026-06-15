"use client";

import type { CatalogSearchResult } from "@/lib/clerkship/diagnosis/search";
import type { DiagnosisSuggestion } from "@/lib/clerkship/diagnosis/suggest";
import type { BpStandard } from "@/lib/clerkship/exam/bp";
import type { RecordedVitals } from "@/lib/clerkship/exam/types";
import type { CapturedStateInput } from "@/lib/clerkship/reasoning/context";
import type { ScoredDifferential } from "@/lib/clerkship/reasoning/types";
import { useMemo } from "react";
import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowDownToLineIcon,
  CheckIcon,
  PlusIcon,
  ShieldAlertIcon,
  StethoscopeIcon,
  XIcon,
} from "lucide-react";

import { assembleClerkshipAbnormal } from "@/lib/clerkship/assemble";
import { matchNcds } from "@/lib/clerkship/diagnosis/ncd-suggest";
import { suggestDiagnoses } from "@/lib/clerkship/diagnosis/suggest";
import { buildCapturedContext } from "@/lib/clerkship/reasoning/context";
import { liveReasoningForCodes } from "@/lib/clerkship/reasoning/engine";
import { REASONING_MAPS } from "@/lib/clerkship/reasoning/maps";
import { renderProblemRepresentation } from "@/lib/clerkship/synthesis";
import { cn } from "@/lib/utils";
import { DiagnosisPicker } from "./diagnosis-picker";

/**
 * Assessment / Synthesis — the clerkship's convergence (GATE A-signed model).
 * Three zones, all DECISION-SUPPORT (assemble + propose; the clinician decides):
 *
 *  1. The ABNORMAL SUMMARY — everything already flagged abnormal, assembled
 *     vitals-up with provenance; one tap inserts the problem representation into
 *     the editable Summary field (never auto-set; never invents a finding).
 *  2. The SUGGESTED DIFFERENTIAL — the reasoning engine's live output, per item
 *     Agree (records the CLINICIAN'S working diagnosis) / Exclude (kept visible
 *     as "considered & excluded" — must-not-miss never silently dropped). The
 *     manual editor below remains the "add your own" path. The diagnosis of
 *     record is always the clinician's.
 *  3. The PROPOSED PROBLEM LIST — vitals-first (abnormal vitals are first-class
 *     problems until a diagnosis subsumes them → working diagnoses → unexplained
 *     findings → active background). The doctor confirms / removes / links a
 *     problem under a working diagnosis (active / resolved / linked; nothing
 *     silently removed). Committed problems persist via the versioned spine.
 */

export type DxRow = { text: string; icd10: string; mustNotMiss: boolean };
export type ExcludedDx = { text: string; mustNotMiss: boolean };

const SOURCE_LABEL: Record<string, string> = {
  vitals: "Vitals",
  examination: "Examination",
  ros: "ROS",
  background: "Background",
};

/** Short clinical tags for diagnosis evidence kinds. */
const EVIDENCE_TAG: Record<string, string> = {
  feature: "For",
  symptom: "Sx",
  risk: "Risk",
  against: "Against",
};

export function AssessmentSynthesis({
  captured,
  pcCodes,
  vitals,
  bpStandard,
  differential,
  excluded,
  onAgree,
  onExclude,
  onUnexclude,
  onInsertSummary,
  onPickDiagnosis,
}: {
  captured: CapturedStateInput;
  pcCodes: string[];
  vitals: RecordedVitals;
  bpStandard: BpStandard;
  differential: DxRow[];
  excluded: ExcludedDx[];
  onAgree: (dx: ScoredDifferential) => void;
  onExclude: (dx: ScoredDifferential) => void;
  onUnexclude: (text: string) => void;
  onInsertSummary: (text: string) => void;
  /** Commit a diagnosis chosen from the catalog picker (same path as Select). */
  onPickDiagnosis: (r: CatalogSearchResult) => void;
}) {
  // ── the assembled abnormals (vitals-up; the shared single-source assembly,
  //    reused by the disposition cross-check so the two can never disagree) ──
  const items = useMemo(
    () => assembleClerkshipAbnormal(captured, vitals, bpStandard),
    [captured, vitals, bpStandard],
  );

  // ── the reasoning engine's live differential (the rail's same computation) ──
  const reasoning = useMemo(
    () => liveReasoningForCodes(REASONING_MAPS, pcCodes, buildCapturedContext(captured)),
    [pcCodes, captured],
  );

  const decidedTexts = useMemo(
    () =>
      new Set([
        ...differential.map((d) => d.text.trim().toLowerCase()),
        ...excluded.map((d) => d.text.trim().toLowerCase()),
      ]),
    [differential, excluded],
  );

  // ── the diagnostic-logic suggestions (GATE B) ──
  // The reasoning engine's scored differential, re-presented as ranked,
  // evidence-backed diagnosis suggestions (joined with the catalog's ICD-10 +
  // provenance). Borrowed, not recomputed — so they correspond to the rail.
  // Must-not-miss floats regardless of support; decided ones drop out.
  const suggestionList = useMemo(
    () =>
      suggestDiagnoses(reasoning.scored).filter(
        (s) => !decidedTexts.has(s.dx.trim().toLowerCase()),
      ),
    [reasoning.scored, decidedTexts],
  );

  const representation = renderProblemRepresentation(items);

  // ── the NCD layer (GATE C; gated dark until CSO sign-off) ──
  // Match the NCD catalog against the captured codes (HPC + ROS-present symptoms;
  // PMH conditions normalised to codes). Surfaced FIRST, ranked by support, with
  // cited defining criteria shown. matchNcds is empty until the catalog is signed.
  const ncdSuggestions = useMemo(() => {
    const symptomCodes = new Set<string>([
      ...captured.hpcItems.map((h) => h.symptomCode),
      ...captured.ros.filter((o) => o.status === "present").map((o) => o.symptomCode),
    ]);
    const conditionCodes = new Set<string>(
      captured.pmhConditions.map((d) =>
        d
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_"),
      ),
    );
    return matchNcds({ symptomCodes, conditionCodes }).filter(
      (n) => !decidedTexts.has(n.dx.trim().toLowerCase()),
    );
  }, [captured, decidedTexts]);

  // Select a suggestion = the clinician's working diagnosis (carries the catalog
  // ICD-10); Reject = considered & excluded (must-not-miss retained).
  const selectSuggestion = (sg: DiagnosisSuggestion) => {
    const s = reasoning.scored.find((x) => x.dx === sg.dx);
    if (s) onAgree(s);
  };
  const rejectSuggestion = (sg: DiagnosisSuggestion) => {
    const s = reasoning.scored.find((x) => x.dx === sg.dx);
    if (s) onExclude(s);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Zone 1 · The abnormal summary (vitals-up, assembled) ── */}
      <section className="border-border bg-card flex flex-col gap-2.5 rounded-xl border p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-display text-foreground inline-flex items-center gap-1.5 text-[13px] font-medium">
            <ActivityIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
            Abnormal findings — assembled, vitals-up
          </h4>
          {representation ? (
            <button
              type="button"
              onClick={() => onInsertSummary(representation)}
              className="tap text-muted-foreground border-border ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:text-teal-700 dark:hover:text-teal-300"
            >
              <ArrowDownToLineIcon className="size-3" aria-hidden /> Insert into summary
            </button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">
            Nothing flagged abnormal yet — abnormal vitals, positive findings, cluster patterns, ROS
            positives and active background assemble here as you capture them. Not-examined is never
            summarised as normal.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              {(["vitals", "examination", "ros", "background"] as const).map((src) => {
                const inSrc = items.filter((i) => i.source === src);
                if (!inSrc.length) return null;
                return (
                  <div key={src} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-muted-foreground w-24 shrink-0 font-mono text-[9.5px] tracking-[0.12em] uppercase">
                      {SOURCE_LABEL[src]}
                    </span>
                    <div className="flex min-w-0 flex-wrap gap-1">
                      {inSrc.map((i, n) => (
                        <span
                          key={`${i.label}-${n}`}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ring-1 ring-inset",
                            i.severity === "critical"
                              ? "bg-red-50 text-red-700 ring-red-500/30 dark:bg-red-950/30 dark:text-red-300"
                              : i.severity === "borderline"
                                ? "bg-amber-50 text-amber-800 ring-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300"
                                : "bg-muted/40 text-foreground/80 ring-border",
                          )}
                          title={i.detail}
                        >
                          {i.mustNotMiss ? (
                            <AlertTriangleIcon className="size-3" aria-label="must-not-miss" />
                          ) : null}
                          {i.label}
                          {i.detail ? (
                            <span className="text-muted-foreground/80 text-[9.5px]">
                              {i.detail}
                            </span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-muted-foreground border-border/60 border-t pt-2 text-[12px] leading-relaxed italic">
              {representation}
            </p>
          </>
        )}
        <p className="text-muted-foreground/70 text-[10px]">
          Assembled from captured findings only — provenance on every item; you refine the summary,
          it never invents a finding.
        </p>
      </section>

      {/* ── Zone 2 · Diagnostic logic — ranked, evidence-backed suggestions ── */}
      <section className="border-border bg-card flex flex-col gap-2.5 rounded-xl border p-3.5 shadow-sm">
        <h4 className="font-display text-foreground inline-flex items-center gap-1.5 text-[13px] font-medium">
          <StethoscopeIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
          Diagnostic logic — ranked suggestions, you select
        </h4>

        {/* NCD layer — surfaced first, ranked by support, with cited defining
            criteria + what's met shown. Gated dark until CSO sign-off. */}
        {ncdSuggestions.length ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.12em] uppercase">
              Chronic conditions (NCDs) — supported by this clerkship
            </span>
            {ncdSuggestions.map((n) => (
              <div
                key={n.code}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-2",
                  n.mustNotMiss
                    ? "border-red-300 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/15"
                    : "border-border bg-muted/20",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-foreground text-[12.5px] font-medium">
                    {n.mustNotMiss ? (
                      <ShieldAlertIcon
                        className="mr-1 inline size-3.5 text-red-600 dark:text-red-400"
                        aria-label="must-not-miss"
                      />
                    ) : null}
                    {n.dx}
                  </span>
                  {n.icd10 ? (
                    <span className="text-muted-foreground font-mono text-[9.5px]">{n.icd10}</span>
                  ) : null}
                  <span className="rounded bg-teal-100 px-1 text-[8.5px] font-semibold tracking-wide text-teal-800 uppercase dark:bg-teal-950/40 dark:text-teal-300">
                    NCD
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onPickDiagnosis({
                        code: n.code,
                        display: n.dx,
                        icd10: n.icd10,
                        category: "ncd",
                        mustNotMiss: n.mustNotMiss,
                      })
                    }
                    className="tap ml-auto inline-flex items-center gap-1 rounded-md bg-teal-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-teal-700"
                  >
                    <CheckIcon className="size-3" aria-hidden /> Select
                  </button>
                </div>
                {n.matchedSymptoms.length || n.matchedRiskFactors.length ? (
                  <p className="text-muted-foreground text-[10.5px]">
                    supported by: {[...n.matchedSymptoms, ...n.matchedRiskFactors].join(", ")}
                  </p>
                ) : null}
                {n.definingCriteria.length ? (
                  <p className="text-muted-foreground/80 text-[10px]">
                    defining criteria (confirm — not auto-applied):{" "}
                    {n.definingCriteria
                      .slice(0, 3)
                      .map((c) => `${c.measure} ${c.threshold}`)
                      .join("; ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {suggestionList.length === 0 && excluded.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">
            {pcCodes.length
              ? "Every suggestion has been decided — your selected diagnoses below are the record."
              : "Add a presenting complaint and the diagnosis catalog's matches appear here, ranked by support, for your decision. Your own diagnoses go in the editor below either way."}
          </p>
        ) : null}

        {suggestionList.map((sg) => (
          <div
            key={sg.dx}
            className={cn(
              "flex flex-col gap-1.5 rounded-lg border p-2",
              sg.mustNotMiss
                ? "border-red-300 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20"
                : "border-border bg-muted/20",
            )}
          >
            <div className="flex flex-wrap items-start gap-2">
              {sg.mustNotMiss ? (
                <ShieldAlertIcon
                  className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400"
                  aria-label="must-not-miss"
                />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-foreground text-[12.5px] font-medium">{sg.dx}</span>
                  {sg.icd10 ? (
                    <span className="text-muted-foreground font-mono text-[9.5px]">{sg.icd10}</span>
                  ) : null}
                  <span
                    className={cn(
                      "rounded px-1 text-[9px] font-semibold tracking-wide uppercase",
                      sg.mustNotMiss
                        ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                        : sg.status === "supported"
                          ? "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
                          : "text-muted-foreground bg-muted",
                    )}
                  >
                    {sg.mustNotMiss ? "must-not-miss" : sg.status}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => selectSuggestion(sg)}
                  className="tap inline-flex items-center gap-1 rounded-md bg-teal-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-teal-700"
                >
                  <CheckIcon className="size-3" aria-hidden /> Select
                </button>
                <button
                  type="button"
                  onClick={() => rejectSuggestion(sg)}
                  className="tap text-muted-foreground border-border hover:text-foreground inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
                >
                  <XIcon className="size-3" aria-hidden /> Reject
                </button>
              </div>
            </div>
            {sg.evidence.length ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-muted-foreground/70 text-[9.5px]">why:</span>
                {sg.evidence.map((e) => (
                  <span
                    key={`${e.kind}:${e.label}`}
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] ring-1 ring-inset",
                      e.kind === "against"
                        ? "text-muted-foreground/70 bg-muted/30 ring-border"
                        : "ring-border bg-card",
                    )}
                  >
                    <span className="text-muted-foreground/60 text-[8px] font-semibold tracking-wide uppercase">
                      {EVIDENCE_TAG[e.kind]}
                    </span>
                    {e.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}

        {excluded.length ? (
          <div className="border-border/60 flex flex-col gap-1 border-t pt-2">
            <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.12em] uppercase">
              Considered &amp; excluded — kept on the record
            </span>
            <div className="flex flex-wrap gap-1">
              {excluded.map((d) => (
                <span
                  key={d.text}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ring-1 ring-inset",
                    d.mustNotMiss
                      ? "bg-red-50/60 text-red-700/80 ring-red-500/30 dark:bg-red-950/20 dark:text-red-300/80"
                      : "text-muted-foreground bg-muted/40 ring-border",
                  )}
                >
                  {d.mustNotMiss ? <AlertTriangleIcon className="size-3" aria-hidden /> : null}
                  <span className="line-through">{d.text}</span>
                  <button
                    type="button"
                    onClick={() => onUnexclude(d.text)}
                    aria-label={`Reconsider ${d.text}`}
                    className="tap hover:text-foreground"
                    title="Reconsider"
                  >
                    <PlusIcon className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* The doctor's "select a diagnosis from the catalog" picker — commits
            via the SAME differential path as a ranked suggestion. */}
        <div className="border-border/60 flex flex-col gap-1.5 border-t pt-2.5">
          <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.12em] uppercase">
            Or select a diagnosis from the catalog
          </span>
          <DiagnosisPicker onPick={onPickDiagnosis} />
        </div>

        <p className="text-muted-foreground/70 text-[10px]">
          Suggestions are the reasoning engine&apos;s differential matched against the diagnosis
          catalog, ranked by support (must-not-miss surfaces regardless) — a suggestion, never a
          verdict. Select records <em>your</em> working diagnosis (it carries the catalog ICD-10 +
          feeds workup next); Reject keeps it considered &amp; excluded. Add your own below — the
          diagnosis of record is always the clinician&apos;s.
        </p>
      </section>
    </div>
  );
}
