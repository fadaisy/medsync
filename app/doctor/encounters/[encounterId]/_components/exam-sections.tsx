"use client";

import type { SectionStatus, ThreeStateValue } from "./exam-kit";
import type { ExamFinding, ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo } from "react";
import { CircleDashedIcon, EyeIcon } from "lucide-react";

import { EXAM_FINDING_BY_CODE, EXAM_FINDINGS, EXAM_GROUPS } from "@/lib/clerkship/exam/catalog";
import { normalGeneralExam, renderExamProse } from "@/lib/clerkship/exam/engine";
import {
  CompactField,
  FindingGrid,
  NormalExamButton,
  PresentCluster,
  SectionCard,
  ThreeState,
  ValueChip,
} from "./exam-kit";

/**
 * General examination — EXAMINATION UI v2 (progressive disclosure). Same
 * ExamObservation data, handlers and value-sets as before; presentation only.
 * Each catalog group is a COLLAPSIBLE SectionCard summarised to one line (status
 * pill + inline positives + on-row "mark normal"); a fully-normal exam is a tidy
 * stack of "All normal" cards. Inside a section, selects are compact chip-pickers
 * and panels are compact three-states (detail revealed only when present). The
 * spot-diagnosis pattern list collapses to a single "tap any present" cluster
 * (with an explicit examined / not-examined control — not-examined ≠ all-negative).
 * The whole-exam fast-path + the auto-summary are preserved. Nothing auto-recorded.
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
  if ((o.values ?? []).length && (o.values ?? []).every((v) => NORMAL_SELECT.has(v))) return false;
  return true;
}

const SPOT = "spot_diagnosis";
const groupOf = (code: string) => EXAM_FINDING_BY_CODE[code]?.group;

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

  // ── per-section: set the whole group normal (reuses the exact whole-exam normal) ──
  const markGroupNormal = (key: string) => {
    const normal = normalGeneralExam();
    const others = value.filter((o) => groupOf(o.code) !== key);
    const forGroup = normal.filter((o) => groupOf(o.code) === key);
    onChange([...others, ...forGroup]);
  };

  // ── per-section status / count / inline-positive summary for the collapsed row ──
  const sectionMeta = (
    findings: ExamFinding[],
  ): { status: SectionStatus; count: number; summary: string } => {
    const obs = findings.map((x) => ({ x, o: byCode.get(x.code) }));
    const positives = obs.filter(({ o }) => isFinding(o));
    const mnm = positives.filter(({ x }) => x.mustNotMiss);
    const touched = obs.filter(({ o }) => o && o.state !== "not_examined");
    const summary = positives
      .map(({ x, o }) => (o?.values?.length ? o.values.join(", ") : x.display))
      .join(" · ");
    if (mnm.length) return { status: "must_not_miss", count: mnm.length, summary };
    if (positives.length) return { status: "findings", count: positives.length, summary };
    if (touched.length === findings.length) return { status: "normal", count: 0, summary: "" };
    if (touched.length > 0) return { status: "partial", count: 0, summary: "" };
    return { status: "not_examined", count: 0, summary: "" };
  };

  // ── spot-diagnosis cluster (long binary list → one "tap any present" block) ──
  const spotFindings = EXAM_FINDINGS.filter((x) => x.group === SPOT);
  const spotPresent = spotFindings
    .filter((x) => byCode.get(x.code)?.state === "present")
    .map((x) => x.code);
  const spotExamined = spotFindings.every(
    (x) => (byCode.get(x.code)?.state ?? "not_examined") !== "not_examined",
  );
  const toggleSpot = (code: string) => {
    const cur = byCode.get(code)?.state;
    if (cur === "present") set(code, spotExamined ? { state: "absent", values: [] } : null);
    else set(code, { state: "present", values: [] });
  };
  const setSpotExamined = (examined: boolean) => {
    const others = value.filter((o) => groupOf(o.code) !== SPOT);
    if (!examined) return onChange(others);
    const forGroup: ExamObservation[] = spotFindings.map((x) => {
      const ex = byCode.get(x.code);
      if (ex?.state === "present") return ex;
      return { code: x.code, group: SPOT, display: x.display, state: "absent", values: [] };
    });
    onChange([...others, ...forGroup]);
  };

  // ── compact renderers ──
  const renderSelect = (x: ExamFinding) => {
    const o = byCode.get(x.code);
    return (
      <div key={x.code} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-foreground flex min-w-0 items-center gap-1 text-[12px]">
          {x.display}
        </span>
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
  };

  const renderPanel = (x: ExamFinding) => {
    const o = byCode.get(x.code);
    const state: ThreeStateValue = o?.state ?? "not_examined";
    return (
      <CompactField
        key={x.code}
        label={x.display}
        mustNotMiss={x.mustNotMiss}
        flag={x.ugandaFlag}
        control={
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
        }
        detail={
          state === "present" && x.options.length
            ? x.options.map((opt) => {
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
              })
            : undefined
        }
      />
    );
  };

  const renderSection = (findings: ExamFinding[]) => {
    const selects = findings.filter((x) => x.kind === "select");
    const panels = findings.filter((x) => x.kind === "panel");
    return (
      <>
        {selects.length ? (
          <div className="flex flex-col gap-2.5">{selects.map(renderSelect)}</div>
        ) : null}
        {panels.length ? <FindingGrid>{panels.map(renderPanel)}</FindingGrid> : null}
      </>
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

      {/* Clinical sequence — one collapsible SectionCard per catalog group */}
      <div className="flex flex-col gap-2.5">
        {EXAM_GROUPS.map((group, i) => {
          const findings = EXAM_FINDINGS.filter((x) => x.group === group.key);
          const { status, count, summary } = sectionMeta(findings);
          return (
            <SectionCard
              key={group.key}
              index={i + 1}
              title={group.label}
              status={status}
              count={count}
              summary={summary}
              onMarkNormal={() => markGroupNormal(group.key)}
            >
              {group.key === SPOT ? (
                <PresentCluster
                  label="tap any that are present"
                  options={findings.map((x) => ({
                    value: x.code,
                    label: x.display,
                    mustNotMiss: x.mustNotMiss,
                  }))}
                  present={spotPresent}
                  examined={spotExamined}
                  onToggle={toggleSpot}
                  onSetExamined={setSpotExamined}
                />
              ) : (
                renderSection(findings)
              )}
            </SectionCard>
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
