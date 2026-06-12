"use client";

import type { ThreeStateValue } from "./exam-kit";
import type {
  NeuroExam,
  NeuroLimb,
  NeuroSide,
  Plantar,
  ReflexGrade,
  Tone,
} from "@/lib/clerkship/exam/neurological";
import type { ExamFinding, ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  ShieldAlertIcon,
} from "lucide-react";

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
  CycleLegend,
  NormalExamButton,
  StageCard,
  ThreeState,
  ValueChip,
} from "./exam-kit";
import { LimbFigure } from "./limb-figure";

/**
 * Neurological examination — REWORKED PRESENTATION (ADR 0074). Same NeuroExam
 * data, handlers, value-sets and behaviour as before; restructured into the
 * clinical examination sequence as numbered StageCards, with the four limbs as a
 * tappable body figure (LimbFigure) as the signature spatial control and the
 * shared exam-kit controls. GCS is still shown by E/V/M components (GCS ≤8 is
 * surfaced as the airway emergency it is). The localisation panel (UMN vs LMN +
 * where in the neuraxis) is DECISION-SUPPORT (multiple on ambiguity, emergencies
 * in red) — never an auto-diagnosis. not-examined ≠ normal is preserved.
 */

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
  const [openFindings, setOpenFindings] = useState(false);
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

  const findingsCount = findings.filter((o) => o.state === "present").length;

  // ── render a non-graded catalog finding with the kit (select = chip pick; panel = three-state + chips) ──
  const renderFinding = (x: ExamFinding) => {
    const o = byCode.get(x.code);
    if (x.kind === "select") {
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
    }
    const state: ThreeStateValue = o?.state ?? "not_examined";
    return (
      <div key={x.code} className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-foreground text-[12.5px]">{x.display}</span>
            {x.mustNotMiss ? (
              <AlertTriangleIcon className="size-3 text-amber-500" aria-label="must-not-miss" />
            ) : null}
          </span>
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
        </div>
        {state === "present" && x.options.length ? (
          <div className="flex flex-wrap gap-1 pl-1">
            {x.options.map((opt) => {
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

      <div className="flex flex-col gap-3.5">
        {/* ── Stage 1 — Conscious level (GCS) ── */}
        <StageCard
          index={1}
          title="Conscious level"
          complete={gcs != null}
          hint="Eye · Verbal · Motor"
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
        </StageCard>

        {/* ── Stage 2 — Motor: tone · power · reflexes by limb ── */}
        <StageCard
          index={2}
          title="Motor — by limb"
          hint="tap a limb to grade · then tone / power / reflexes"
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
        </StageCard>

        {/* ── Stage 3 — Sensation · coordination · gait ── */}
        <StageCard index={3} title="Sensation, coordination & gait">
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
        </StageCard>

        {/* ── Stage 4 — Special signs (meningism + cauda equina — emergencies) ── */}
        <StageCard index={4} title="Special signs" hint="meningism · cauda equina">
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
        </StageCard>

        {/* ── Stage 5 — Higher function · cranial nerves · coordination (collapsed) ── */}
        <StageCard
          index={5}
          title="Higher function · cranial nerves · coordination"
          count={findingsCount}
        >
          <button
            type="button"
            onClick={() => setOpenFindings((o) => !o)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-start text-[11.5px] font-medium"
            aria-expanded={openFindings}
          >
            <ChevronDownIcon
              className={`size-3.5 transition-transform ${openFindings ? "" : "-rotate-90"}`}
              aria-hidden
            />
            {openFindings ? "Hide detailed findings" : "Record detailed findings"}
          </button>
          {openFindings ? (
            <div className="stagger-children flex flex-col gap-2.5">
              {NEURO_GROUPS.map((g) => {
                const inGroup = NEURO_FINDINGS.filter((x) => x.group === g.key);
                return (
                  <div key={g.key} className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      {g.label}
                    </span>
                    {inGroup.map(renderFinding)}
                  </div>
                );
              })}
            </div>
          ) : null}
        </StageCard>
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
      ) : null}
    </div>
  );
}
