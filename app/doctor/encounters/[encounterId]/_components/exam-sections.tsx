"use client";

import type { ThreeStateValue } from "./exam-kit";
import type { ExamFinding, ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo } from "react";
import { AlertTriangleIcon, CircleDashedIcon, EyeIcon } from "lucide-react";

import { EXAM_FINDINGS, EXAM_GROUPS } from "@/lib/clerkship/exam/catalog";
import { normalGeneralExam, renderExamProse } from "@/lib/clerkship/exam/engine";
import { NormalExamButton, StageCard, ThreeState, ValueChip } from "./exam-kit";

/**
 * General examination — REWORKED PRESENTATION (ADR 0074). Same ExamObservation
 * data, handlers, value-sets and behaviour as before; restructured into the real
 * clinical sequence (end-of-bed → spot diagnosis → hands → face → neck →
 * peripheries) as numbered StageCards, using the shared exam-kit controls. Each
 * panel is captured with the honest three-state (not-examined ≠ normal); selects
 * pick a single graded value; sub-value chips reveal only when a finding is
 * present. The "normal general exam" fast-path and the auto-generated prose
 * summary are preserved. Decision-support — nothing auto-recorded.
 */

/** Graded select values that are not, in themselves, a positive finding. */
const NORMAL_SELECT = new Set([
  "well",
  "none",
  "normal",
  "not raised",
  "central",
  "present",
  "warm",
  "≤2 s",
  "well-hydrated",
]);

/** A non-normal positive: present, and not a select sitting on a normal value. */
function isFinding(o: ExamObservation | undefined): boolean {
  if (!o || o.state !== "present") return false;
  // a select holding a normal value is not a "finding"
  if ((o.values ?? []).length && (o.values ?? []).every((v) => NORMAL_SELECT.has(v))) return false;
  return true;
}

/* Per-stage hints, keyed by catalog group. The groups + order themselves come
   straight from EXAM_GROUPS (single source of truth) so a new catalog group can
   never be silently dropped from the UI. */
const STAGE_HINTS: Record<string, string> = {
  inspection: "end of the bed",
  spot_diagnosis: "gestalt → focused exam",
};

export function ExamSections({
  value,
  onChange,
}: {
  value: ExamObservation[];
  onChange: (next: ExamObservation[]) => void;
}) {
  const byCode = useMemo(() => new Map(value.map((o) => [o.code, o])), [value]);

  function set(code: string, patch: Partial<ExamObservation> | null) {
    const f = EXAM_FINDINGS.find((x) => x.code === code);
    if (!f) return;
    const others = value.filter((o) => o.code !== code);
    if (patch === null) return onChange(others);
    const prev = byCode.get(code) ?? {
      code,
      group: f.group,
      display: f.display,
      state: "not_examined" as FindingState,
    };
    onChange([...others, { ...prev, ...patch }]);
  }

  const totalFindings = value.filter((o) => isFinding(o)).length;
  const totalTouched = value.filter((o) => o.state !== "not_examined").length;

  // ── render one catalog finding with the kit ──
  //   select → single-pick ValueChip row · panel → ThreeState + reveal value chips
  const renderFinding = (x: ExamFinding) => {
    const o = byCode.get(x.code);

    const label = (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="text-foreground text-[12.5px]">{x.display}</span>
        {x.mustNotMiss ? (
          <AlertTriangleIcon className="size-3 text-amber-500" aria-label="must-not-miss" />
        ) : null}
        {x.ugandaFlag ? (
          <span className="text-muted-foreground bg-muted rounded px-1 text-[9px] uppercase">
            {x.ugandaFlag}
          </span>
        ) : null}
      </span>
    );

    if (x.kind === "select") {
      return (
        <div key={x.code} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          {label}
          <div className="flex flex-wrap justify-end gap-1">
            {x.options.map((opt) => (
              <ValueChip
                key={opt}
                active={o?.values?.[0] === opt}
                onClick={() =>
                  set(x.code, o?.values?.[0] === opt ? null : { state: "present", values: [opt] })
                }
              >
                {opt}
              </ValueChip>
            ))}
          </div>
        </div>
      );
    }

    const state: ThreeStateValue = o?.state ?? "not_examined";
    return (
      <div key={x.code} className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          {label}
          <ThreeState
            value={state}
            findingsLabel={x.options.length ? "Findings" : "Present"}
            onChange={(v) =>
              set(
                x.code,
                v === "not_examined"
                  ? null
                  : v === "absent"
                    ? { state: "absent", values: [] }
                    : { state: "present", values: o?.values ?? [] },
              )
            }
          />
        </div>
        {state === "present" && x.options.length ? (
          <div className="scale-in flex flex-wrap gap-1 pl-1">
            {x.options.map((opt) => {
              const on = o?.values?.includes(opt);
              return (
                <ValueChip
                  key={opt}
                  active={!!on}
                  onClick={() =>
                    set(x.code, {
                      values: on
                        ? (o?.values ?? []).filter((v) => v !== opt)
                        : [...(o?.values ?? []), opt],
                    })
                  }
                >
                  {opt}
                </ValueChip>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-foreground text-[15px] font-medium tracking-[-0.015em]">
          General examination
        </h3>
        {totalFindings ? (
          <span
            key={totalFindings}
            className="scale-in rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800 tabular-nums dark:bg-teal-950/40 dark:text-teal-300"
          >
            {totalFindings} finding{totalFindings > 1 ? "s" : ""}
          </span>
        ) : null}
        <span className="ml-auto">
          <NormalExamButton
            onClick={() => onChange(normalGeneralExam())}
            label="Normal general exam"
          />
        </span>
      </div>

      {/* Clinical sequence — one StageCard per catalog group */}
      <div className="flex flex-col gap-3.5">
        {EXAM_GROUPS.map((stage, i) => {
          const findings = EXAM_FINDINGS.filter((x) => x.group === stage.key);
          const groupObs = findings.map((x) => byCode.get(x.code));
          const nFindings = groupObs.filter((o) => isFinding(o)).length;
          const complete = groupObs.every((o) => o && o.state !== "not_examined");
          return (
            <StageCard
              key={stage.key}
              index={i + 1}
              title={stage.label}
              hint={STAGE_HINTS[stage.key]}
              complete={complete}
              count={nFindings}
            >
              {findings.map(renderFinding)}
            </StageCard>
          );
        })}
      </div>

      {/* Auto-generated documentation summary (honest: not-examined ≠ normal) */}
      {totalTouched ? (
        <div className="fade-in-slow rounded-xl border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-wide text-teal-700 uppercase dark:text-teal-400">
            <CircleDashedIcon className="size-3" aria-hidden /> Auto-generated summary
          </span>
          <p className="mt-0.5 text-[12px] leading-relaxed text-teal-900/90 italic dark:text-teal-100/80">
            {renderExamProse(value)}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
          <EyeIcon className="size-3" aria-hidden /> Tap through the survey, or set the routine
          survey normal and characterise only the positives.
        </p>
      )}
    </div>
  );
}
