"use client";

import type { SectionStatus, ThreeStateValue } from "./exam-kit";
import type {
  NeuroExam,
  NeuroLimb,
  NeuroSide,
  Plantar,
  ReflexGrade,
  Tone,
} from "@/lib/clerkship/exam/neurological";
import type { ExamFinding, ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo } from "react";
import { AlertTriangleIcon, CircleDashedIcon, EyeIcon, ShieldAlertIcon } from "lucide-react";

import {
  CAUDA_OPTS,
  DANISH_OPTS,
  GAIT_OPTS,
  matchNeuroPatterns,
  MENINGISM_OPTS,
  NEURO_FINDINGS,
  NEURO_GROUPS,
  normalNeuroExam,
  POWER_PATTERN_OPTS,
  renderNeuroProse,
  SENSORY_PATTERN_OPTS,
} from "@/lib/clerkship/exam/neurological";
import { gcsTotal } from "@/lib/clerkship/exam/types";
import { cn } from "@/lib/utils";
import {
  ChipRow,
  CompactField,
  CycleLegend,
  FindingGrid,
  NormalExamButton,
  SectionCard,
  ThreeState,
  ValueChip,
} from "./exam-kit";
import { LimbFigure } from "./limb-figure";

/**
 * Neurological examination — EXAMINATION UI v2 (progressive disclosure; ADR 0074).
 * SAME NeuroExam data, handlers, value-sets and behaviour as before — presentation
 * only. Each clinical stage is a COLLAPSIBLE SectionCard summarised to one line
 * (status pill + inline positives + on-row "mark normal"); a fully-normal exam is
 * a tidy stack of "All normal" cards. The four limbs stay a tappable body figure
 * (LimbFigure) with full per-limb tone / power / reflex / plantar grading INSIDE
 * the expanded Motor section; GCS E/V/M stays inside Conscious level (GCS ≤8 is
 * surfaced as the airway emergency it is). The long binary special-sign lists
 * (meningism, cauda equina) become "tap any present" clusters with an explicit
 * examined / not-examined control (not-examined ≠ all-negative; present must-not-
 * miss keeps its reserved-red flag). The localisation panel (UMN vs LMN + where in
 * the neuraxis) is DECISION-SUPPORT (multiple on ambiguity, emergencies in red) —
 * never an auto-diagnosis. The whole-exam normal fast-path + auto-summary are kept.
 */

/** Inline-positive labels for catalog findings (group → collapsed-row summary). */
function findingSummary(findings: ExamFinding[], byCode: Map<string, ExamObservation>): string {
  return findings
    .map((x) => ({ x, o: byCode.get(x.code) }))
    .filter(({ o }) => o?.state === "present")
    .map(({ x, o }) => (o?.values?.length ? o.values.join(", ") : x.display))
    .join(" · ");
}

/** Status for a catalog-finding group (none recorded / partial / normal / findings / mnm). */
function findingStatus(
  findings: ExamFinding[],
  byCode: Map<string, ExamObservation>,
): { status: SectionStatus; count: number } {
  const obs = findings.map((x) => ({ x, o: byCode.get(x.code) }));
  const positives = obs.filter(({ o }) => o?.state === "present");
  const mnm = positives.filter(({ x }) => x.mustNotMiss);
  const touched = obs.filter(({ o }) => o && o.state !== "not_examined");
  if (mnm.length) return { status: "must_not_miss", count: mnm.length };
  if (positives.length) return { status: "findings", count: positives.length };
  if (touched.length === findings.length) return { status: "normal", count: 0 };
  if (touched.length > 0) return { status: "partial", count: 0 };
  return { status: "not_examined", count: 0 };
}

function Row({
  title,
  options,
  value,
  onPick,
}: {
  title: string;
  options: readonly string[] | { value: string; label: string }[];
  value: string | undefined;
  onPick: (v: string | undefined) => void;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <ChipRow label={title}>
      {opts.map((o) => (
        <ValueChip
          key={o.value}
          active={value === o.value}
          onClick={() => onPick(value === o.value ? undefined : o.value)}
        >
          {o.label}
        </ValueChip>
      ))}
    </ChipRow>
  );
}

function MultiRow({
  title,
  options,
  values,
  onToggle,
  alarm,
}: {
  title: string;
  options: readonly string[];
  values: string[] | undefined;
  onToggle: (v: string) => void;
  alarm?: boolean;
}) {
  return (
    <ChipRow label={title}>
      {options.map((o) => (
        <ValueChip
          key={o}
          active={(values ?? []).includes(o)}
          tone={alarm ? "alarm" : "default"}
          onClick={() => onToggle(o)}
        >
          {o}
        </ValueChip>
      ))}
    </ChipRow>
  );
}

export function NeuroExamForm({
  value,
  onChange,
}: {
  value: NeuroExam;
  onChange: (next: NeuroExam) => void;
}) {
  const findings = value.findings ?? [];
  const byCode = useMemo(() => new Map(findings.map((o) => [o.code, o])), [findings]);
  const patterns = useMemo(() => matchNeuroPatterns(value), [value]);
  const gcs = gcsTotal(value);

  const setFinding = (code: string, patch: Partial<ExamObservation> | null) => {
    const fd = NEURO_FINDINGS.find((x) => x.code === code);
    if (!fd) return;
    const others = findings.filter((o) => o.code !== code);
    if (patch === null) return onChange({ ...value, findings: others });
    const prev = byCode.get(code) ?? {
      code,
      group: fd.group,
      display: fd.display,
      state: "not_examined" as FindingState,
    };
    onChange({ ...value, findings: [...others, { ...prev, ...patch }] });
  };

  const toggle = (key: "cerebellarSigns" | "meningism" | "caudaEquina", v: string) => {
    const cur = value[key] ?? [];
    onChange({ ...value, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };

  // limb grid cell — cycles power 5→4→3→2→1→0→unset on tap
  const cyclePower = (limb: NeuroLimb) => {
    const cur = value.power?.[limb];
    const next = cur === undefined ? 5 : cur === 0 ? undefined : cur - 1;
    const rec = { ...(value.power ?? {}) };
    if (next === undefined) delete rec[limb];
    else rec[limb] = next;
    onChange({ ...value, power: rec });
  };
  const setLimb = <K extends "tone" | "reflexes">(
    key: K,
    limb: NeuroLimb,
    v: K extends "tone" ? Tone : ReflexGrade,
  ) => {
    const rec = { ...((value[key] as Partial<Record<NeuroLimb, unknown>>) ?? {}) };
    if (rec[limb] === v) delete rec[limb];
    else rec[limb] = v;
    onChange({ ...value, [key]: rec });
  };
  const setPlantar = (s: NeuroSide, p: Plantar) => {
    const rec = { ...(value.plantar ?? {}) };
    if (rec[s] === p) delete rec[s];
    else rec[s] = p;
    onChange({ ...value, plantar: rec });
  };

  // ── render a non-graded catalog finding with the kit (select = chip pick; panel = compact three-state + chips) ──
  const renderSelect = (x: ExamFinding) => {
    const o = byCode.get(x.code);
    return (
      <ChipRow key={x.code} label={x.display}>
        {x.options.map((opt) => (
          <ValueChip
            key={opt}
            active={o?.values?.[0] === opt}
            onClick={() =>
              setFinding(
                x.code,
                o?.values?.[0] === opt ? null : { state: "present", values: [opt] },
              )
            }
          >
            {opt}
          </ValueChip>
        ))}
      </ChipRow>
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
              setFinding(
                x.code,
                v === "not_examined"
                  ? null
                  : { state: v, values: v === "absent" ? [] : (o?.values ?? []) },
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
                      setFinding(x.code, {
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

  // ── §1 Conscious level (GCS) — structured-only; no clean "normal" (GCS is recorded) ──
  const gcsStatus: SectionStatus =
    gcs == null ? "not_examined" : gcs <= 8 ? "must_not_miss" : gcs < 15 ? "findings" : "normal";
  const gcsSummary = gcs != null ? `GCS ${gcs}/15${gcs <= 8 ? " · secure airway" : ""}` : "";

  // ── §2 Motor — by limb (LimbFigure grading + power pattern + inspection) ──
  const limbToneAbn = Object.values(value.tone ?? {}).filter((t) => t && t !== "normal").length;
  const limbPowerAbn = Object.values(value.power ?? {}).filter((p) => p != null && p < 5).length;
  const limbReflexAbn = Object.values(value.reflexes ?? {}).filter(
    (r) => r && r !== "normal",
  ).length;
  const plantarAbn = Object.values(value.plantar ?? {}).filter((p) => p && p !== "down").length;
  // powerPattern is a qualifier of weakness, not an independent positive, so it is
  // not counted here (it shows alongside the weak limbs in the summary/prose).
  const motorPositives =
    limbToneAbn +
    limbPowerAbn +
    limbReflexAbn +
    plantarAbn +
    (value.wasting ? 1 : 0) +
    (value.fasciculations ? 1 : 0);
  const motorTouched =
    !!value.tone ||
    !!value.power ||
    !!value.reflexes ||
    !!value.plantar ||
    value.wasting != null ||
    value.fasciculations != null ||
    value.powerPattern != null;
  const motorAllRecorded =
    !!value.tone &&
    !!value.power &&
    !!value.reflexes &&
    !!value.plantar &&
    value.wasting != null &&
    value.fasciculations != null;
  const motorStatus: SectionStatus = motorPositives
    ? "findings"
    : motorAllRecorded
      ? "normal"
      : motorTouched
        ? "partial"
        : "not_examined";
  const motorSummaryParts: string[] = [];
  if (limbPowerAbn)
    motorSummaryParts.push(`${limbPowerAbn} weak limb${limbPowerAbn > 1 ? "s" : ""}`);
  if (limbToneAbn) motorSummaryParts.push("abnormal tone");
  if (limbReflexAbn) motorSummaryParts.push("abnormal reflexes");
  if (plantarAbn) motorSummaryParts.push("upgoing/equivocal plantar");
  if (value.wasting) motorSummaryParts.push("wasting");
  if (value.fasciculations) motorSummaryParts.push("fasciculations");
  const motorSummary = motorSummaryParts.join(" · ");
  const markMotorNormal = () => {
    const n = normalNeuroExam();
    onChange({
      ...value,
      tone: n.tone,
      power: n.power,
      reflexes: n.reflexes,
      plantar: n.plantar,
      wasting: false,
      fasciculations: false,
    });
  };

  // ── §3 Sensation, coordination & gait ──
  const sensAbn =
    (value.sensoryPattern && value.sensoryPattern !== "normal" ? 1 : 0) +
    (value.romberg === "positive" ? 1 : 0) +
    (value.gait && value.gait !== "normal" ? 1 : 0) +
    (value.cerebellarSigns?.length ?? 0);
  const sensTouched =
    value.sensoryPattern != null ||
    value.romberg != null ||
    value.gait != null ||
    (value.cerebellarSigns?.length ?? 0) > 0;
  const sensAllRecorded =
    value.sensoryPattern != null && value.romberg != null && value.gait != null;
  const sensStatus: SectionStatus = sensAbn
    ? "findings"
    : sensAllRecorded
      ? "normal"
      : sensTouched
        ? "partial"
        : "not_examined";
  const sensSummaryParts: string[] = [];
  if (value.sensoryPattern && value.sensoryPattern !== "normal")
    sensSummaryParts.push(`${value.sensoryPattern.replace(/_/g, " ")} sensory`);
  if (value.romberg === "positive") sensSummaryParts.push("Romberg+");
  if (value.gait && value.gait !== "normal")
    sensSummaryParts.push(`${value.gait.replace(/_/g, " ")} gait`);
  if (value.cerebellarSigns?.length) sensSummaryParts.push(value.cerebellarSigns.join(", "));
  const sensSummary = sensSummaryParts.join(" · ");
  const markSensNormal = () => {
    const n = normalNeuroExam();
    onChange({
      ...value,
      sensoryPattern: n.sensoryPattern,
      romberg: n.romberg,
      gait: n.gait,
      cerebellarSigns: [],
    });
  };

  // ── §4 Special signs — meningism + cauda equina (positive-only emergency lists) ──
  // The domain stores ONLY present signs (no "examined-absent" concept — and the
  // input cap is exactly the option count), so an empty list is honestly
  // not-examined, never "all-negative". Any tapped sign here is a must-not-miss.
  const meningismPresent = value.meningism ?? [];
  const caudaPresent = value.caudaEquina ?? [];
  const specialPositives = meningismPresent.length + caudaPresent.length;
  const specialStatus: SectionStatus = specialPositives ? "must_not_miss" : "not_examined";
  const specialSummary = [...meningismPresent, ...caudaPresent].join(" · ");

  // ── §5 Higher function · cranial nerves · coordination (catalog groups) ──
  const detailFindings = NEURO_FINDINGS;
  const detailMeta = findingStatus(detailFindings, byCode);
  const detailSummary = findingSummary(detailFindings, byCode);
  const markDetailNormal = () => {
    const n = normalNeuroExam();
    const normalForDetail = (n.findings ?? []).map((o) => o.code);
    const others = (value.findings ?? []).filter((o) => !normalForDetail.includes(o.code));
    onChange({ ...value, findings: [...others, ...(n.findings ?? [])] });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-foreground text-[15px] font-medium tracking-[-0.015em]">
          Neurological examination
        </h3>
        {patterns.length ? (
          <span
            key={patterns.length}
            className="scale-in inline-flex items-center gap-1 rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800 tabular-nums dark:bg-teal-950/40 dark:text-teal-300"
          >
            {patterns.length} localisation{patterns.length > 1 ? "s" : ""}
          </span>
        ) : null}
        <span className="ml-auto">
          <NormalExamButton onClick={() => onChange(normalNeuroExam())} label="Normal neuro exam" />
        </span>
      </div>

      {/* Clinical sequence — collapsible SectionCards */}
      <div className="flex flex-col gap-2.5">
        {/* ── §1 Conscious level (GCS) ── */}
        <SectionCard
          index={1}
          title="Conscious level"
          status={gcsStatus}
          count={gcsStatus === "must_not_miss" ? 1 : 0}
          summary={gcsSummary}
        >
          <ChipRow label="GCS">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {(
                [
                  ["gcsE", "E", 4],
                  ["gcsV", "V", 5],
                  ["gcsM", "M", 6],
                ] as const
              ).map(([k, lbl, max]) => (
                <label key={k} className="inline-flex items-center gap-1">
                  <span className="text-muted-foreground text-[10px]">{lbl}</span>
                  <select
                    className="border-input bg-card rounded border px-1 py-1 text-[12px] tabular-nums outline-none focus-visible:border-teal-500"
                    value={value[k] ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        [k]: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    aria-label={`GCS ${lbl}`}
                  >
                    <option value="">–</option>
                    {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {gcs != null ? (
                <span
                  className={`scale-in rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${gcs <= 8 ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300" : gcs < 15 ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300"}`}
                >
                  GCS {gcs}/15{gcs <= 8 ? " · airway" : ""}
                </span>
              ) : null}
            </div>
          </ChipRow>
          <p className="text-muted-foreground text-[10px]">
            Consciousness, pupils &amp; spot-diagnosis patterns are also captured in the general
            examination + vitals.
          </p>
        </SectionCard>

        {/* ── §2 Motor — tone · power · reflexes by limb ── */}
        <SectionCard
          index={2}
          title="Motor — by limb"
          status={motorStatus}
          count={motorPositives}
          summary={motorSummary}
          onMarkNormal={markMotorNormal}
        >
          <LimbFigure
            value={value}
            cyclePower={cyclePower}
            setLimb={setLimb}
            setPlantar={setPlantar}
          />
          <CycleLegend steps={["5", "4", "3", "2", "1", "0"]} />
          <Row
            title="Power pattern"
            options={POWER_PATTERN_OPTS}
            value={value.powerPattern}
            onPick={(v) => onChange({ ...value, powerPattern: v as NeuroExam["powerPattern"] })}
          />
          <ChipRow label="Inspection">
            <ValueChip
              active={!!value.wasting}
              onClick={() => onChange({ ...value, wasting: !value.wasting })}
            >
              wasting
            </ValueChip>
            <ValueChip
              active={!!value.fasciculations}
              onClick={() => onChange({ ...value, fasciculations: !value.fasciculations })}
            >
              fasciculations
            </ValueChip>
          </ChipRow>
        </SectionCard>

        {/* ── §3 Sensation · coordination · gait ── */}
        <SectionCard
          index={3}
          title="Sensation, coordination & gait"
          status={sensStatus}
          count={sensAbn}
          summary={sensSummary}
          onMarkNormal={markSensNormal}
        >
          <Row
            title="Sensory pattern"
            options={SENSORY_PATTERN_OPTS}
            value={value.sensoryPattern}
            onPick={(v) => onChange({ ...value, sensoryPattern: v as NeuroExam["sensoryPattern"] })}
          />
          <Row
            title="Romberg"
            options={[
              { value: "negative", label: "Negative" },
              { value: "positive", label: "Positive" },
            ]}
            value={value.romberg}
            onPick={(v) => onChange({ ...value, romberg: v as NeuroExam["romberg"] })}
          />
          <Row
            title="Gait"
            options={GAIT_OPTS}
            value={value.gait}
            onPick={(v) => onChange({ ...value, gait: v as NeuroExam["gait"] })}
          />
          <MultiRow
            title="Cerebellar"
            options={DANISH_OPTS}
            values={value.cerebellarSigns}
            onToggle={(v) => toggle("cerebellarSigns", v)}
          />
        </SectionCard>

        {/* ── §4 Special signs — meningism + cauda equina (emergencies; positive-only) ── */}
        <SectionCard
          index={4}
          title="Special signs"
          status={specialStatus}
          count={specialPositives}
          summary={specialSummary}
        >
          <p className="text-muted-foreground text-[10px]">
            Tap only the signs present — these are positive-only screens, so an empty list reads as
            not examined (never asserted-absent). Any tap is a must-not-miss.
          </p>
          <MultiRow
            title="Meningism"
            options={MENINGISM_OPTS}
            values={value.meningism}
            onToggle={(v) => toggle("meningism", v)}
            alarm
          />
          <MultiRow
            title="Cauda equina"
            options={CAUDA_OPTS}
            values={value.caudaEquina}
            onToggle={(v) => toggle("caudaEquina", v)}
            alarm
          />
        </SectionCard>

        {/* ── §5 Higher function · cranial nerves · coordination ── */}
        <SectionCard
          index={5}
          title="Higher function · cranial nerves · coordination"
          status={detailMeta.status}
          count={detailMeta.count}
          summary={detailSummary}
          onMarkNormal={markDetailNormal}
        >
          <div className="flex flex-col gap-2.5">
            {NEURO_GROUPS.map((g) => {
              const inGroup = NEURO_FINDINGS.filter((x) => x.group === g.key);
              const selects = inGroup.filter((x) => x.kind === "select");
              const panels = inGroup.filter((x) => x.kind === "panel");
              return (
                <div key={g.key} className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                    {g.label}
                  </span>
                  {selects.length ? (
                    <div className="flex flex-col gap-1.5">{selects.map(renderSelect)}</div>
                  ) : null}
                  {panels.length ? <FindingGrid>{panels.map(renderPanel)}</FindingGrid> : null}
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Localisation (decision-support) */}
      {patterns.length ? (
        <div
          className={cn(
            "flex flex-col gap-1 rounded-xl border p-3",
            patterns.some((p) => p.emergency)
              ? "border-red-300 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20"
              : "border-border/70 bg-muted/20",
          )}
        >
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Localisation(s) to consider — decision support
          </span>
          {patterns.map((p) => (
            <div key={p.key} className="scale-in flex items-start gap-1.5">
              {p.emergency ? (
                <ShieldAlertIcon
                  className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400"
                  aria-hidden
                />
              ) : p.mustNotMiss ? (
                <AlertTriangleIcon
                  className="mt-0.5 size-3.5 shrink-0 text-amber-500"
                  aria-hidden
                />
              ) : (
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden />
              )}
              <span className="text-[11.5px]">
                <span
                  className={`font-semibold ${p.emergency ? "text-red-700 dark:text-red-300" : "text-foreground"}`}
                >
                  {p.label}
                </span>
                <span className="text-muted-foreground"> — {p.signature}</span>
              </span>
            </div>
          ))}
          <span className="text-muted-foreground/80 text-[10px] italic">
            Surfaced from the recorded signs — you localise + decide; never auto-diagnosed.
          </span>
        </div>
      ) : null}

      {renderNeuroProse(value) ? (
        <div className="fade-in-slow rounded-xl border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-wide text-teal-700 uppercase dark:text-teal-400">
            <CircleDashedIcon className="size-3" aria-hidden /> Auto-generated summary
          </span>
          <p className="mt-0.5 text-[12px] leading-relaxed text-teal-900/90 italic dark:text-teal-100/80">
            {renderNeuroProse(value)}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
          <EyeIcon className="size-3" aria-hidden /> Tap through the survey, or set the neuro exam
          normal and characterise only the positives.
        </p>
      )}
    </div>
  );
}
