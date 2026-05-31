"use client";

import type { TriageSubmitState } from "../actions";
import type { VitalInterpretation, VitalTone } from "@/lib/triage/interpret";
import type { AcuityLevel, Acvpu, TriageInput } from "@/lib/triage/types";
import type { TriageWorklistRow } from "@/lib/triage/worklist";
import { useActionState, useEffect, useMemo, useState } from "react";
import { RotateCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ACUITY_TIERS } from "@/lib/triage/constants";
import { TRIAGE_DISCRIMINATORS } from "@/lib/triage/discriminators";
import { runTriage } from "@/lib/triage/engine";
import { interpretVitals } from "@/lib/triage/interpret";
import { cn } from "@/lib/utils";
import { submitTriageAction } from "../actions";

/**
 * The centered triage dialog. The pure engine (lib/triage) runs LIVE in
 * the browser as vitals are entered — so the acuity + every vital's
 * interpretation update visibly before commit (kickoff §0.2). On submit
 * the SAME function re-runs authoritatively server-side under authority
 * + audit (no drift). Down-overrides are cadre-gated (R1).
 */

const COLOUR_CLASS: Record<string, string> = {
  red: "bg-rose-600 text-white",
  orange: "bg-orange-500 text-white",
  yellow: "bg-amber-400 text-amber-950",
  green: "bg-teal-600 text-white",
  blue: "bg-slate-400 text-white",
};

const TONE_CHIP: Record<VitalTone, string> = {
  normal: "text-muted-foreground",
  borderline: "text-amber-700 dark:text-amber-300",
  abnormal: "text-orange-700 dark:text-orange-300",
  critical: "text-rose-700 dark:text-rose-300",
  missing: "text-muted-foreground/60 italic",
  info: "text-muted-foreground",
};

const TONE_RING: Record<VitalTone, string> = {
  normal: "",
  borderline: "ring-1 ring-amber-300/60 dark:ring-amber-500/30",
  abnormal: "ring-1 ring-orange-400/60 dark:ring-orange-500/40",
  critical: "ring-1 ring-rose-500/60 dark:ring-rose-500/50",
  missing: "",
  info: "",
};

interface VitalsState {
  respiratoryRate: string;
  spo2: string;
  oxygen: "air" | "oxygen";
  systolicBp: string;
  diastolicBp: string;
  pulse: string;
  consciousness: Acvpu;
  temperature: string;
  bloodGlucose: string;
}

const EMPTY_VITALS: VitalsState = {
  respiratoryRate: "",
  spo2: "",
  oxygen: "air",
  systolicBp: "",
  diastolicBp: "",
  pulse: "",
  consciousness: "A",
  temperature: "",
  bloodGlucose: "",
};

function num(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function TriagePanel({
  row,
  mayDownTriage,
  onClose,
}: {
  row: TriageWorklistRow | null;
  mayDownTriage: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      {row ? (
        <DialogContent
          showCloseButton
          className="flex max-h-[92vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          <PanelBody key={row.intakeId} row={row} mayDownTriage={mayDownTriage} onClose={onClose} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function PanelBody({
  row,
  mayDownTriage,
  onClose,
}: {
  row: TriageWorklistRow;
  mayDownTriage: boolean;
  onClose: () => void;
}) {
  const [vitals, setVitals] = useState<VitalsState>(EMPTY_VITALS);
  const [pregnancy, setPregnancy] = useState<TriageInput["context"]["pregnancy"]>("not_pregnant");
  // Reproductive-age female is auto-seeded from sex + age (drives the
  // unknown-pregnancy flag); the clinician can still toggle it.
  const autoReproFemale =
    (row.sex?.toLowerCase().startsWith("f") ?? false) &&
    row.ageYears != null &&
    row.ageYears >= 12 &&
    row.ageYears <= 50;
  const [reproFemale, setReproFemale] = useState(autoReproFemale);
  const [scale2, setScale2] = useState(false);
  const [discriminators, setDiscriminators] = useState<Set<string>>(new Set());
  const [assigned, setAssigned] = useState<AcuityLevel | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const [state, formAction, pending] = useActionState<TriageSubmitState, FormData>(
    submitTriageAction,
    {},
  );
  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  const liveVitals = useMemo(
    () => ({
      respiratoryRate: num(vitals.respiratoryRate),
      spo2: num(vitals.spo2),
      oxygen: vitals.oxygen,
      systolicBp: num(vitals.systolicBp),
      diastolicBp: num(vitals.diastolicBp),
      pulse: num(vitals.pulse),
      consciousness: vitals.consciousness,
      temperature: num(vitals.temperature),
      bloodGlucose: num(vitals.bloodGlucose),
    }),
    [vitals],
  );

  const result = useMemo(() => {
    const input: TriageInput = {
      context: {
        ageYears: row.ageYears,
        pregnancy,
        reproductiveAgeFemale: reproFemale,
        spo2Scale2Enabled: scale2,
      },
      vitals: liveVitals,
      presentDiscriminators: [...discriminators],
      adjustments: { priorLevel: (row.priorLevel as AcuityLevel | null) ?? null },
    };
    return runTriage(input);
  }, [liveVitals, row.ageYears, row.priorLevel, pregnancy, reproFemale, scale2, discriminators]);

  const interp = useMemo(() => interpretVitals(liveVitals, result), [liveVitals, result]);

  const computed = result.level;
  const effectiveAssigned = assigned ?? computed;
  const direction =
    effectiveAssigned < computed ? "up" : effectiveAssigned > computed ? "down" : "none";
  const downBlocked = direction === "down" && !mayDownTriage;
  const needsReason = direction === "down";

  const tier = ACUITY_TIERS.find((t) => t.level === computed)!;
  const scopedDiscriminators = TRIAGE_DISCRIMINATORS.filter(
    (d) =>
      d.source === "manual" && (d.appliesTo === "all" || d.appliesTo === ruleToPop(result.ruleset)),
  );

  const name = row.displayName ?? row.patientUnknownLabel ?? "Unidentified patient";
  const metaBits = [
    row.patientCode,
    row.ageYears != null ? `${row.ageYears}y` : "age unknown",
    row.sex ?? null,
  ].filter(Boolean);

  const payload = JSON.stringify({
    intake_id: row.intakeId,
    patient_user_id: row.patientUserId,
    age_years: row.ageYears,
    pregnancy,
    reproductive_age_female: reproFemale,
    spo2_scale2_enabled: scale2,
    vitals: liveVitals,
    present_discriminators: [...discriminators],
    prior_level: row.priorLevel ?? null,
    assigned_level: effectiveAssigned,
    override_reason: overrideReason.trim() || undefined,
  });

  return (
    <>
      {/* ── Header: identity + live acuity ─────────────────────── */}
      <header
        className={cn("flex items-start justify-between gap-4 border-b px-6 py-5", "border-border")}
      >
        <div className="flex min-w-0 flex-col gap-1">
          {row.priorLevel != null ? (
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-wide text-amber-700 uppercase dark:bg-amber-950/30 dark:text-amber-300">
              <RotateCwIcon className="size-2.5" aria-hidden />
              Re-triage · was L{row.priorLevel}
            </span>
          ) : (
            <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
              {row.entryTypeName}
            </span>
          )}
          <h2 className="font-display text-foreground truncate text-[20px] leading-tight font-medium tracking-[-0.01em]">
            {name}
          </h2>
          <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
            {metaBits.join(" · ")}
          </span>
        </div>

        {/* Live computed acuity — the prominent result */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              "inline-flex items-center rounded-lg px-3 py-1.5 text-[15px] font-semibold tabular-nums",
              COLOUR_CLASS[tier.colour],
            )}
          >
            L{tier.level} · {tier.colour.toUpperCase()}
          </span>
          <span className="text-muted-foreground font-mono text-[10px]">
            target {tier.targetMinutes}m{result.provisional ? " · provisional" : ""}
          </span>
        </div>
      </header>

      {/* ── Scrollable body ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-6">
          {result.lifeThreat ? (
            <div className="rounded-lg border border-rose-500/40 bg-rose-50/60 px-3.5 py-2.5 dark:bg-rose-950/20">
              <p className="text-[12.5px] font-semibold text-rose-700 dark:text-rose-300">
                Immediate life threat — Level 1, resuscitate now.
              </p>
              <p className="text-[11.5px] text-rose-700/80 dark:text-rose-300/80">
                {result.lifeThreatReasons.join("; ")}
              </p>
            </div>
          ) : null}

          {/* Population */}
          <Section title="Patient">
            <div className="grid grid-cols-2 gap-3">
              <Readout
                label="Age"
                value={row.ageYears != null ? `${row.ageYears} years` : "Unknown — confirm"}
                mono
              />
              <Field label="Pregnancy">
                <Select
                  value={pregnancy}
                  onChange={(v) => setPregnancy(v as typeof pregnancy)}
                  options={[
                    ["not_pregnant", "Not pregnant"],
                    ["pregnant", "Pregnant"],
                    ["postpartum_6wk", "≤6wk postpartum"],
                    ["unknown", "Unknown"],
                  ]}
                />
              </Field>
            </div>
            {pregnancy === "unknown" ? (
              <Check checked={reproFemale} onChange={setReproFemale}>
                Female of reproductive age (flags confirm-pregnancy)
              </Check>
            ) : null}
          </Section>

          {/* Vitals with live interpretation */}
          <Section title="Vitals · interpretation updates live">
            <div className="flex flex-col gap-2">
              <VitalRow
                label="Resp. rate"
                unit="/min"
                v={vitals.respiratoryRate}
                set={(x) => setVitals({ ...vitals, respiratoryRate: x })}
                i={interp.respiratoryRate}
              />
              <VitalRow
                label="SpO₂"
                unit="%"
                v={vitals.spo2}
                set={(x) => setVitals({ ...vitals, spo2: x })}
                i={interp.spo2}
              />
              <SelectRow
                label="Air / oxygen"
                value={vitals.oxygen}
                onChange={(v) => setVitals({ ...vitals, oxygen: v as "air" | "oxygen" })}
                options={[
                  ["air", "Room air"],
                  ["oxygen", "On O₂"],
                ]}
                i={interp.oxygen}
              />
              <VitalRow
                label="Systolic BP"
                unit="mmHg"
                v={vitals.systolicBp}
                set={(x) => setVitals({ ...vitals, systolicBp: x })}
                i={interp.systolicBp}
              />
              <VitalRow
                label="Diastolic BP"
                unit="mmHg"
                v={vitals.diastolicBp}
                set={(x) => setVitals({ ...vitals, diastolicBp: x })}
                i={interp.diastolicBp}
              />
              <VitalRow
                label="Pulse"
                unit="/min"
                v={vitals.pulse}
                set={(x) => setVitals({ ...vitals, pulse: x })}
                i={interp.pulse}
              />
              <SelectRow
                label="Consciousness"
                value={vitals.consciousness}
                onChange={(v) => setVitals({ ...vitals, consciousness: v as Acvpu })}
                options={[
                  ["A", "Alert"],
                  ["C", "New confusion"],
                  ["V", "Voice"],
                  ["P", "Pain"],
                  ["U", "Unresponsive"],
                ]}
                i={interp.consciousness}
              />
              <VitalRow
                label="Temperature"
                unit="°C"
                v={vitals.temperature}
                set={(x) => setVitals({ ...vitals, temperature: x })}
                i={interp.temperature}
              />
              <VitalRow
                label="Glucose"
                unit="mmol/L"
                v={vitals.bloodGlucose}
                set={(x) => setVitals({ ...vitals, bloodGlucose: x })}
                i={interp.bloodGlucose}
              />
            </div>
            <Check checked={scale2} onChange={setScale2}>
              Use SpO₂ Scale 2 (confirmed hypercapnic / COPD target 88–92%)
            </Check>
          </Section>

          {/* Red flags */}
          <Section title="Red-flags">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {scopedDiscriminators.map((d) => (
                <Check
                  key={d.code}
                  checked={discriminators.has(d.code)}
                  onChange={(on) => {
                    const next = new Set(discriminators);
                    if (on) next.add(d.code);
                    else next.delete(d.code);
                    setDiscriminators(next);
                  }}
                >
                  {d.label} <span className="text-muted-foreground">· min L{d.minAcuity}</span>
                </Check>
              ))}
            </div>
          </Section>

          {/* Why this level */}
          <Section title="Why this level">
            <ul className="border-border bg-muted/30 flex flex-col gap-1 rounded-lg border p-3">
              {result.reasoning.map((line, i) => (
                <li key={i} className="text-foreground/80 font-mono text-[11px] leading-relaxed">
                  {line}
                </li>
              ))}
            </ul>
            {result.flags.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1">
                {result.flags.map((f, i) => (
                  <p key={i} className="text-[11.5px] text-amber-700 dark:text-amber-300">
                    ⚑ {f}
                  </p>
                ))}
              </div>
            ) : null}
          </Section>
        </div>
      </div>

      {/* ── Footer: assign + submit ────────────────────────────── */}
      <footer className="border-border bg-muted/40 flex flex-col gap-3 border-t px-6 py-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
            Assign acuity
          </span>
          <div className="flex gap-1.5">
            {ACUITY_TIERS.map((t) => {
              const isDown = t.level > computed;
              const blocked = isDown && !mayDownTriage;
              const selected = effectiveAssigned === t.level;
              return (
                <button
                  key={t.level}
                  type="button"
                  disabled={blocked}
                  onClick={() => setAssigned(t.level)}
                  title={
                    blocked ? "Only a doctor / clinical officer may assign a lower acuity" : ""
                  }
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-[12px] font-semibold transition-colors",
                    selected
                      ? COLOUR_CLASS[t.colour]
                      : "border-border bg-card text-muted-foreground hover:text-foreground border",
                    blocked && "cursor-not-allowed opacity-40",
                  )}
                >
                  L{t.level}
                </button>
              );
            })}
          </div>
          <p
            className={cn(
              "text-[11px]",
              direction === "none"
                ? "text-muted-foreground"
                : direction === "up"
                  ? "text-orange-700 dark:text-orange-300"
                  : "text-rose-700 dark:text-rose-300",
            )}
          >
            {direction === "none"
              ? "Confirming the computed level."
              : direction === "up"
                ? "Escalating above the computed level."
                : `Down-triage — a reason is required${downBlocked ? " (your cadre cannot down-triage)" : ""}.`}
          </p>
        </div>

        {needsReason ? (
          <textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            rows={2}
            minLength={8}
            placeholder="Why is a lower acuity clinically appropriate? (audited)"
            className="border-input bg-background focus-visible:ring-ring/50 rounded-md border p-2 text-[13px] outline-none focus-visible:ring-[3px]"
          />
        ) : null}

        {state.error ? <p className="text-destructive text-[12px]">{state.error}</p> : null}

        <form action={formAction} className="flex items-center justify-end gap-2">
          <input type="hidden" name="payload" value={payload} />
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={pending || downBlocked || (needsReason && overrideReason.trim().length < 8)}
          >
            {pending
              ? "Saving…"
              : row.priorLevel != null
                ? `Re-assign L${effectiveAssigned}`
                : `Assign L${effectiveAssigned}`}
          </Button>
        </form>
      </footer>
    </>
  );
}

/* ─── small presentational primitives ─────────────────────────── */

function ruleToPop(ruleset: string): "adult" | "paediatric" | "obstetric" {
  if (ruleset === "paediatric_pews") return "paediatric";
  if (ruleset === "obstetric_meows") return "obstetric";
  return "adult";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      {children}
    </label>
  );
}

function Readout({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span
        className={cn(
          "border-border bg-muted/40 text-foreground rounded-md border px-3 py-2 text-[13px]",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-input bg-background text-foreground focus-visible:ring-ring/50 rounded-md border px-3 py-2 text-[13px] outline-none focus-visible:ring-[3px]"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** A vital row: label · numeric input · live interpretation chip. */
function VitalRow({
  label,
  unit,
  v,
  set,
  i,
}: {
  label: string;
  unit: string;
  v: string;
  set: (x: string) => void;
  i: VitalInterpretation;
}) {
  return (
    <div className="grid grid-cols-[1fr_92px_1fr] items-center gap-3">
      <span className="text-foreground text-[12.5px]">{label}</span>
      <div className="relative">
        <Input
          inputMode="decimal"
          value={v}
          onChange={(e) => set(e.target.value)}
          className={cn("h-8 pr-1 text-right font-mono tabular-nums", TONE_RING[i.tone])}
        />
        <span className="text-muted-foreground/60 pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[9px]">
          {unit}
        </span>
      </div>
      <InterpChip i={i} />
    </div>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  options,
  i,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  i: VitalInterpretation;
}) {
  return (
    <div className="grid grid-cols-[1fr_92px_1fr] items-center gap-3">
      <span className="text-foreground text-[12.5px]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-background text-foreground focus-visible:ring-ring/50 h-8 rounded-md border px-1.5 text-[12px] outline-none focus-visible:ring-[3px]"
      >
        {options.map(([v, lbl]) => (
          <option key={v} value={v}>
            {lbl}
          </option>
        ))}
      </select>
      <InterpChip i={i} />
    </div>
  );
}

function InterpChip({ i }: { i: VitalInterpretation }) {
  return (
    <span className={cn("text-[11px] leading-tight", TONE_CHIP[i.tone])}>{i.label || "—"}</span>
  );
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-[12px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-3.5 accent-teal-600"
      />
      <span className="text-foreground/90">{children}</span>
    </label>
  );
}
