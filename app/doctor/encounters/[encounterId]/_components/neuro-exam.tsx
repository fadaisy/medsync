"use client";

import type {
  NeuroExam,
  NeuroLimb,
  NeuroSide,
  Plantar,
  ReflexGrade,
  Tone,
} from "@/lib/clerkship/exam/neurological";
import type { ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  MinusCircleIcon,
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
  NEURO_LIMBS,
  normalNeuroExam,
  POWER_PATTERN_OPTS,
  REFLEX_OPTS,
  renderNeuroProse,
  SENSORY_PATTERN_OPTS,
  TONE_OPTS,
} from "@/lib/clerkship/exam/neurological";
import { gcsTotal } from "@/lib/clerkship/exam/types";

/**
 * Neurological examination — tap-first, structured grading (GCS E/V/M · MRC 0–5 ·
 * reflex grades · tone · plantar), motor/sensory/reflexes by limb & side. The
 * localisation panel (UMN vs LMN + where in the neuraxis) is DECISION-SUPPORT
 * (multiple on ambiguity, emergencies in red) — never an auto-diagnosis. GCS ≤8
 * is surfaced as the airway emergency it is (consistent with resus Disability).
 * Consciousness/pupils overlap reused from the general exam.
 */

const EASE = "transition-colors duration-150 ease-expo-out";
const chip = (active: boolean) =>
  `tap rounded-md px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${EASE} ${active ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200" : "text-foreground/70 ring-border hover:bg-muted/60"}`;
const seg = (active: boolean, tone: "muted" | "teal" = "muted") =>
  `tap inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${EASE} ${
    active
      ? tone === "teal"
        ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200"
        : "bg-slate-100 text-slate-700 ring-slate-400/50 dark:bg-slate-800 dark:text-slate-200"
      : "text-muted-foreground ring-border hover:bg-muted/60"
  }`;

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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-muted-foreground w-24 shrink-0 text-[11px]">{title}</span>
      <div className="flex flex-wrap gap-1">
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            className={chip(value === o.value)}
            onClick={() => onPick(value === o.value ? undefined : o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiRow({
  title,
  options,
  values,
  onToggle,
}: {
  title: string;
  options: readonly string[];
  values: string[] | undefined;
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-muted-foreground w-24 shrink-0 text-[11px]">{title}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={chip((values ?? []).includes(o))}
            onClick={() => onToggle(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

const POWER_TONE = (p: number) =>
  p <= 2
    ? "border-red-400 text-red-700 dark:text-red-300"
    : p < 5
      ? "border-amber-400 text-amber-700 dark:text-amber-300"
      : "border-teal-400 text-teal-700 dark:text-teal-300";

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

  const findingsCount = findings.filter((o) => o.state === "present").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-foreground text-[13px] font-semibold">Neurological examination</span>
        {patterns.length ? (
          <span
            key={patterns.length}
            className="scale-in rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 tabular-nums dark:bg-teal-950/40 dark:text-teal-300"
          >
            {patterns.length} localisation{patterns.length > 1 ? "s" : ""}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => onChange(normalNeuroExam())}
          className={`tap text-muted-foreground hover:bg-muted hover:text-foreground ml-auto rounded-md px-2.5 py-1 text-[11.5px] font-medium ${EASE}`}
        >
          Normal neuro exam
        </button>
      </div>

      {/* GCS */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-muted-foreground w-24 shrink-0 text-[11px]">GCS</span>
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

      {/* Limb grid — power (tap-to-cycle) / tone / reflexes */}
      <div className="border-border/70 flex flex-col gap-2 rounded-lg border p-2.5">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          Motor — by limb
        </span>
        <div className="grid grid-cols-[auto_repeat(4,1fr)] items-center gap-x-2 gap-y-1.5 text-[11px]">
          <span />
          {NEURO_LIMBS.map((l) => (
            <span
              key={l.limb}
              className="text-muted-foreground text-center text-[10px] font-medium"
            >
              {l.short}
            </span>
          ))}
          {/* Power row */}
          <span className="text-muted-foreground text-[11px]">Power /5</span>
          {NEURO_LIMBS.map((l) => {
            const p = value.power?.[l.limb];
            return (
              <button
                key={l.limb}
                type="button"
                onClick={() => cyclePower(l.limb)}
                className={`tap bg-card rounded-md border py-1 text-center font-mono text-[12px] tabular-nums ${EASE} ${p === undefined ? "border-border text-muted-foreground border-dashed" : POWER_TONE(p)}`}
                aria-label={`${l.label} power ${p ?? "not tested"} of 5`}
              >
                {p ?? "–"}
              </button>
            );
          })}
        </div>
        <span className="text-muted-foreground text-[10px]">Tap power to cycle 5→0→unset.</span>
        <Row
          title="Power pattern"
          options={POWER_PATTERN_OPTS}
          value={value.powerPattern}
          onPick={(v) => onChange({ ...value, powerPattern: v as NeuroExam["powerPattern"] })}
        />
        {/* Tone + reflexes per limb */}
        <div className="flex flex-col gap-1.5">
          {NEURO_LIMBS.map((l) => (
            <div key={l.limb} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-muted-foreground w-12 shrink-0 text-[11px]">{l.short}</span>
              <div className="flex flex-wrap gap-1">
                {TONE_OPTS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={chip(value.tone?.[l.limb] === t.value)}
                    onClick={() => setLimb("tone", l.limb, t.value)}
                  >
                    {t.label}
                  </button>
                ))}
                <span className="text-border mx-0.5 self-center">·</span>
                {REFLEX_OPTS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={chip(value.reflexes?.[l.limb] === r.value)}
                    onClick={() => setLimb("reflexes", l.limb, r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground w-24 shrink-0 text-[11px]">Plantars</span>
          {(["right", "left"] as NeuroSide[]).map((s) => (
            <div key={s} className="flex items-center gap-1">
              <span className="text-muted-foreground text-[10px]">{s === "right" ? "R" : "L"}</span>
              {(["down", "up", "equivocal"] as Plantar[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={
                    p === "up" && value.plantar?.[s] === "up"
                      ? "tap rounded-md bg-red-100 px-2 py-0.5 text-[11.5px] text-red-700 ring-1 ring-red-500/40 ring-inset dark:bg-red-950/40 dark:text-red-300"
                      : chip(value.plantar?.[s] === p)
                  }
                  onClick={() => {
                    const rec = { ...(value.plantar ?? {}) };
                    if (rec[s] === p) delete rec[s];
                    else rec[s] = p;
                    onChange({ ...value, plantar: rec });
                  }}
                >
                  {p === "up" ? "↑ up" : p === "down" ? "↓ down" : "equivocal"}
                </button>
              ))}
            </div>
          ))}
          <button
            type="button"
            className={chip(!!value.wasting)}
            onClick={() => onChange({ ...value, wasting: !value.wasting })}
          >
            wasting
          </button>
          <button
            type="button"
            className={chip(!!value.fasciculations)}
            onClick={() => onChange({ ...value, fasciculations: !value.fasciculations })}
          >
            fasciculations
          </button>
        </div>
      </div>

      {/* Sensory + gait + cerebellar */}
      <div className="flex flex-col gap-1.5">
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
      </div>

      {/* Special — meningism + cauda equina (emergencies) */}
      <div className="border-border/70 flex flex-col gap-1.5 rounded-lg border p-2.5">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          Special signs
        </span>
        <MultiRow
          title="Meningism"
          options={MENINGISM_OPTS}
          values={value.meningism}
          onToggle={(v) => toggle("meningism", v)}
        />
        <MultiRow
          title="Cauda equina"
          options={CAUDA_OPTS}
          values={value.caudaEquina}
          onToggle={(v) => toggle("caudaEquina", v)}
        />
      </div>

      {/* Localisation (decision-support) */}
      {patterns.length ? (
        <div className="border-border/70 bg-muted/20 flex flex-col gap-1 rounded-lg border p-2.5">
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Localisation(s) to consider — decision support
          </span>
          {patterns.map((p) => (
            <div key={p.key} className="flex items-start gap-1.5">
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

      {/* Non-graded findings — collapsed */}
      <div className="border-border/70 overflow-hidden rounded-lg border">
        <button
          type="button"
          onClick={() => setOpenFindings((o) => !o)}
          className="bg-muted/30 hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <ChevronDownIcon
            className={`text-muted-foreground size-3.5 transition-transform ${openFindings ? "" : "-rotate-90"}`}
            aria-hidden
          />
          <span className="text-foreground flex-1 text-[12.5px] font-semibold">
            Higher function · cranial nerves · coordination
          </span>
          {findingsCount ? (
            <span className="rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
              {findingsCount}
            </span>
          ) : null}
        </button>
        {openFindings ? (
          <div className="flex flex-col">
            {NEURO_GROUPS.map((g) => {
              const inGroup = NEURO_FINDINGS.filter((x) => x.group === g.key);
              return (
                <div key={g.key} className="border-border/40 border-t first:border-t-0">
                  <div className="text-muted-foreground bg-muted/20 px-3 py-1 text-[10px] font-medium tracking-wide uppercase">
                    {g.label}
                  </div>
                  <div className="divide-border/50 divide-y">
                    {inGroup.map((x) => {
                      const o = byCode.get(x.code);
                      return (
                        <div key={x.code} className="flex flex-col gap-1 px-3 py-1.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="flex min-w-0 flex-1 items-center gap-1.5">
                              <span className="text-foreground text-[12.5px]">{x.display}</span>
                              {x.mustNotMiss ? (
                                <AlertTriangleIcon
                                  className="size-3 text-amber-500"
                                  aria-label="must-not-miss"
                                />
                              ) : null}
                            </span>
                            {x.kind === "select" ? (
                              <div className="flex flex-wrap justify-end gap-1">
                                {x.options.map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    className={chip(o?.values?.[0] === opt)}
                                    onClick={() =>
                                      setFinding(
                                        x.code,
                                        o?.values?.[0] === opt
                                          ? null
                                          : { state: "present", values: [opt] },
                                      )
                                    }
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  aria-pressed={o?.state === "absent"}
                                  className={seg(o?.state === "absent")}
                                  onClick={() =>
                                    setFinding(
                                      x.code,
                                      o?.state === "absent"
                                        ? null
                                        : { state: "absent", values: [] },
                                    )
                                  }
                                >
                                  <MinusCircleIcon className="size-3" aria-hidden /> Normal
                                </button>
                                <button
                                  type="button"
                                  aria-pressed={o?.state === "present"}
                                  className={seg(o?.state === "present", "teal")}
                                  onClick={() =>
                                    setFinding(
                                      x.code,
                                      o?.state === "present" ? null : { state: "present" },
                                    )
                                  }
                                >
                                  <CheckIcon className="size-3" aria-hidden />{" "}
                                  {x.options.length ? "Findings" : "Present"}
                                </button>
                              </div>
                            )}
                          </div>
                          {x.kind === "panel" && o?.state === "present" && x.options.length ? (
                            <div className="flex flex-wrap gap-1 pl-1">
                              {x.options.map((opt) => {
                                const on = o.values?.includes(opt);
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    className={chip(!!on)}
                                    onClick={() =>
                                      setFinding(x.code, {
                                        values: on
                                          ? (o.values ?? []).filter((v) => v !== opt)
                                          : [...(o.values ?? []), opt],
                                      })
                                    }
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <p className="text-muted-foreground border-border/40 border-t px-3 py-1.5 text-[10px]">
              Consciousness, pupils &amp; spot-diagnosis patterns are also captured in the general
              examination + vitals.
            </p>
          </div>
        ) : null}
      </div>

      {renderNeuroProse(value) ? (
        <div className="rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
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
