"use client";

import type { BpStandard } from "@/lib/clerkship/exam/bp";
import type { RecordedVitals } from "@/lib/clerkship/exam/types";
import type { CapturedStateInput } from "@/lib/clerkship/reasoning/context";
import type { ScoredDifferential } from "@/lib/clerkship/reasoning/types";
import type { ProblemKind } from "@/lib/clerkship/synthesis";
import { useMemo } from "react";
import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowDownToLineIcon,
  CheckIcon,
  LightbulbIcon,
  Link2Icon,
  ListChecksIcon,
  PlusIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";

import { matchAbdoPatterns } from "@/lib/clerkship/exam/abdominal";
import { matchCvsPatterns } from "@/lib/clerkship/exam/cardiovascular";
import { matchEvfPatterns } from "@/lib/clerkship/exam/endo-vascular-foot";
import { matchMskPatterns } from "@/lib/clerkship/exam/musculoskeletal";
import { matchNeuroPatterns } from "@/lib/clerkship/exam/neurological";
import { matchRespPatterns } from "@/lib/clerkship/exam/respiratory";
import { buildCapturedContext } from "@/lib/clerkship/reasoning/context";
import { liveReasoningForCodes } from "@/lib/clerkship/reasoning/engine";
import { REASONING_MAPS } from "@/lib/clerkship/reasoning/maps";
import {
  assembleAbnormal,
  proposeProblems,
  renderProblemRepresentation,
} from "@/lib/clerkship/synthesis";
import { cn } from "@/lib/utils";
import { ValueChip } from "./exam-kit";

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
export type ProblemRow = {
  item: string;
  kind: ProblemKind;
  status: "active" | "resolved" | "linked";
  linkedTo?: string;
  provenance?: string;
};

const SOURCE_LABEL: Record<string, string> = {
  vitals: "Vitals",
  examination: "Examination",
  ros: "ROS",
  background: "Background",
};

export function AssessmentSynthesis({
  captured,
  pcCodes,
  vitals,
  bpStandard,
  differential,
  excluded,
  problems,
  onAgree,
  onExclude,
  onUnexclude,
  onConfirmProblem,
  onUpdateProblem,
  onRemoveProblem,
  onInsertSummary,
}: {
  captured: CapturedStateInput;
  pcCodes: string[];
  vitals: RecordedVitals;
  bpStandard: BpStandard;
  differential: DxRow[];
  excluded: ExcludedDx[];
  problems: ProblemRow[];
  onAgree: (dx: ScoredDifferential) => void;
  onExclude: (dx: ScoredDifferential) => void;
  onUnexclude: (text: string) => void;
  onConfirmProblem: (p: ProblemRow) => void;
  onUpdateProblem: (index: number, patch: Partial<ProblemRow>) => void;
  onRemoveProblem: (index: number) => void;
  onInsertSummary: (text: string) => void;
}) {
  // ── the assembled abnormals (vitals-up; reuses the existing engines) ──
  const items = useMemo(() => {
    const pat = (ps: { label: string; mustNotMiss?: boolean; emergency?: boolean }[]) =>
      ps.map((p) => ({ label: p.label, mustNotMiss: p.mustNotMiss, emergency: p.emergency }));
    const exam = [
      {
        system: "Respiratory",
        positives: [],
        patterns: pat(matchRespPatterns(captured.respiratory)),
      },
      {
        system: "Cardiovascular",
        positives: [],
        patterns: pat(matchCvsPatterns(captured.cardiovascular)),
      },
      { system: "Abdominal", positives: [], patterns: pat(matchAbdoPatterns(captured.abdominal)) },
      {
        system: "Neurological",
        positives: [],
        patterns: pat(matchNeuroPatterns(captured.neurological)),
      },
      {
        system: "Musculoskeletal",
        positives: [],
        patterns: pat(matchMskPatterns(captured.musculoskeletal)),
      },
      {
        system: "Endo · vascular · foot",
        positives: [],
        patterns: pat(matchEvfPatterns(captured.endoVascularFoot)),
      },
    ];
    // Exam positive findings come through the same reasoning tokens the rail
    // uses (single source); shown under one "Examination" provenance.
    const ctx = buildCapturedContext(captured);
    const rosSet = new Set(
      captured.ros.filter((o) => o.status === "present").map((o) => o.symptomDisplay),
    );
    const examPositives = ctx.positives.filter(
      (p) => !rosSet.has(p) && !captured.pmhConditions.includes(p),
    );
    return assembleAbnormal({
      vitals,
      bpStandard,
      exam: [{ system: "Examination", positives: examPositives, patterns: [] }, ...exam],
      rosPositives: captured.ros
        .filter((o) => o.status === "present")
        .map((o) => ({ symptomDisplay: o.symptomDisplay, system: o.system })),
      background: captured.pmhConditions,
    });
  }, [captured, vitals, bpStandard]);

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
  const suggestions = reasoning.scored.filter((s) => !decidedTexts.has(s.dx.trim().toLowerCase()));

  // ── the vitals-first proposed problems (minus already-confirmed) ──
  const confirmedSet = new Set(problems.map((p) => p.item.trim().toLowerCase()));
  const proposed = proposeProblems(items, differential).filter(
    (p) => !confirmedSet.has(p.item.trim().toLowerCase()),
  );

  const representation = renderProblemRepresentation(items);
  const workingDxTexts = differential.map((d) => d.text).filter((t) => t.trim());

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

      {/* ── Zone 2 · The suggested differential — the clinician decides ── */}
      <section className="border-border bg-card flex flex-col gap-2.5 rounded-xl border p-3.5 shadow-sm">
        <h4 className="font-display text-foreground inline-flex items-center gap-1.5 text-[13px] font-medium">
          <LightbulbIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
          Suggested differential — you decide
        </h4>

        {suggestions.length === 0 && excluded.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">
            {pcCodes.length
              ? "Every suggestion has been decided — your differential below is the record."
              : "Add a presenting complaint and the reasoning engine's differential appears here for your decision. Your own diagnoses go in the editor below either way."}
          </p>
        ) : null}

        {suggestions.map((s) => (
          <div
            key={s.dx}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-lg border p-2",
              s.likelihood === "must_not_miss"
                ? "border-red-300 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20"
                : "border-border bg-muted/20",
            )}
          >
            {s.likelihood === "must_not_miss" ? (
              <ShieldAlertIcon
                className="size-3.5 shrink-0 text-red-600 dark:text-red-400"
                aria-hidden
              />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-foreground text-[12.5px] font-medium">{s.dx}</span>
              <span className="text-muted-foreground text-[10.5px]">
                {s.likelihood === "must_not_miss"
                  ? "must-not-miss"
                  : s.likelihood.replace("_", " ")}
                {s.matchedRuleIn.length ? ` · for: ${s.matchedRuleIn.slice(0, 3).join(", ")}` : ""}
                {s.matchedRuleOut.length
                  ? ` · against: ${s.matchedRuleOut.slice(0, 2).join(", ")}`
                  : ""}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onAgree(s)}
                className="tap inline-flex items-center gap-1 rounded-md bg-teal-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-teal-700"
              >
                <CheckIcon className="size-3" aria-hidden /> Agree
              </button>
              <button
                type="button"
                onClick={() => onExclude(s)}
                className="tap text-muted-foreground border-border hover:text-foreground inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
              >
                <XIcon className="size-3" aria-hidden /> Exclude
              </button>
            </div>
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

        <p className="text-muted-foreground/70 text-[10px]">
          Agree records <em>your</em> working diagnosis; Exclude keeps it visible as considered
          &amp; excluded. Your own diagnoses go in the editor below — the diagnosis of record is
          always the clinician&apos;s, never the machine&apos;s.
        </p>
      </section>

      {/* ── Zone 3 · The proposed problem list (vitals-first; you confirm) ── */}
      <section className="border-border bg-card flex flex-col gap-2.5 rounded-xl border p-3.5 shadow-sm">
        <h4 className="font-display text-foreground inline-flex items-center gap-1.5 text-[13px] font-medium">
          <ListChecksIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
          Problem list — proposed vitals-first, you confirm
        </h4>

        {proposed.length ? (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.12em] uppercase">
              Proposed
            </span>
            {proposed.map((p) => (
              <div
                key={p.item}
                className="border-border/70 bg-muted/20 flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-2 py-1.5"
              >
                <span className="text-muted-foreground bg-muted rounded px-1 font-mono text-[9px] uppercase">
                  {p.kind}
                </span>
                <span className="text-foreground min-w-0 flex-1 text-[12px]">
                  {p.mustNotMiss ? (
                    <AlertTriangleIcon
                      className="mr-1 inline size-3 text-red-600 dark:text-red-400"
                      aria-label="must-not-miss"
                    />
                  ) : null}
                  {p.item}
                  <span className="text-muted-foreground/70 ml-1.5 text-[10px]">
                    {p.provenance}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onConfirmProblem({
                      item: p.item,
                      kind: p.kind,
                      status: "active",
                      provenance: p.provenance,
                    })
                  }
                  className="tap inline-flex items-center gap-1 rounded-md bg-teal-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-teal-700"
                >
                  <PlusIcon className="size-3" aria-hidden /> Confirm
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {problems.length ? (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.12em] uppercase">
              Confirmed — the list of record on save
            </span>
            {problems.map((p, i) => (
              <div
                key={`${p.item}-${i}`}
                className="border-border bg-card flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5"
              >
                <span className="text-muted-foreground bg-muted rounded px-1 font-mono text-[9px] uppercase">
                  {p.kind}
                </span>
                <span
                  className={cn(
                    "text-foreground min-w-0 flex-1 text-[12px]",
                    p.status === "resolved" && "text-muted-foreground line-through",
                  )}
                >
                  {p.item}
                  {p.status === "linked" && p.linkedTo ? (
                    <span className="text-muted-foreground ml-1.5 inline-flex items-center gap-0.5 text-[10px]">
                      <Link2Icon className="size-3" aria-hidden /> under {p.linkedTo}
                    </span>
                  ) : null}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {(["active", "resolved"] as const).map((st) => (
                    <ValueChip
                      key={st}
                      active={p.status === st}
                      onClick={() => onUpdateProblem(i, { status: st, linkedTo: undefined })}
                    >
                      {st}
                    </ValueChip>
                  ))}
                  {workingDxTexts.length && p.kind !== "diagnosis" ? (
                    <select
                      aria-label={`Link ${p.item} under a working diagnosis`}
                      className="tap border-border bg-card rounded-md border px-1 py-0.5 text-[10.5px]"
                      value={p.status === "linked" ? (p.linkedTo ?? "") : ""}
                      onChange={(e) =>
                        onUpdateProblem(
                          i,
                          e.target.value
                            ? { status: "linked", linkedTo: e.target.value }
                            : { status: "active", linkedTo: undefined },
                        )
                      }
                    >
                      <option value="">link under…</option>
                      {workingDxTexts.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRemoveProblem(i)}
                    aria-label={`Remove ${p.item}`}
                    className="tap text-muted-foreground hover:text-destructive rounded-md p-0.5"
                  >
                    <XIcon className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : proposed.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">
            Problems propose themselves here — vitals first — as the clerkship is captured; you
            confirm what becomes the list of record.
          </p>
        ) : null}

        <p className="text-muted-foreground/70 text-[10px]">
          A vital starts as its own problem and can be linked under a diagnosis as reasoning firms
          up — your act, reversible; nothing is silently removed. The committed list persists on the
          record.
        </p>
      </section>
    </div>
  );
}
