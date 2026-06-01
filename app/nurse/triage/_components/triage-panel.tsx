"use client";

import type { TriageSubmitState } from "../actions";
import type { VitalInterpretation, VitalTone } from "@/lib/triage/interpret";
import type {
  AcuityColour,
  AcuityLevel,
  Acvpu,
  ParameterScore,
  TriageInput,
} from "@/lib/triage/types";
import type { TriageWorklistRow } from "@/lib/triage/worklist";
import { useActionState, useEffect, useMemo, useState } from "react";
import { ChevronRightIcon, RotateCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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

/* ── Score-breakdown helpers (NEWS2 contribution + worse-of rollup) ── */

const PARAM_LABEL: Record<string, string> = {
  respiratory_rate: "Resp. rate",
  spo2: "SpO₂",
  systolic_bp: "Systolic BP",
  pulse: "Pulse",
  temperature: "Temperature",
  consciousness: "Consciousness",
  supplemental_oxygen: "Suppl. O₂",
};

/** A parameter's tone = its NEWS2 points, mirroring interpret.ts POINTS_TONE. */
function paramTone(p: ParameterScore): VitalTone {
  if (!p.present) return "missing";
  return (["normal", "borderline", "abnormal", "critical"][p.points] ?? "abnormal") as VitalTone;
}

/** Pip fill per tone — the filled cells of a parameter's contribution bar. */
const PIP_FILL: Record<VitalTone, string> = {
  normal: "border-transparent bg-muted-foreground/40",
  borderline: "border-transparent bg-amber-400",
  abnormal: "border-transparent bg-orange-500",
  critical: "border-transparent bg-rose-600",
  missing: "border-dashed border-border/60 bg-transparent",
  info: "border-transparent bg-muted-foreground/40",
};

/** Ring colour for the winning worse-of lane, by acuity colour. */
const RING_FOR: Record<AcuityColour, string> = {
  red: "ring-rose-500/70",
  orange: "ring-orange-500/70",
  yellow: "ring-amber-400/80",
  green: "ring-teal-600/70",
  blue: "ring-slate-400/70",
};

function riskWord(total: number): string {
  if (total >= 7) return "high · urgent response";
  if (total >= 5) return "medium · escalate";
  return "low";
}

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
  const isMale = row.sex?.toLowerCase().startsWith("m") ?? false;
  const [vitals, setVitals] = useState<VitalsState>(EMPTY_VITALS);
  // A male patient can never be pregnant — pin the context so the
  // engine + payload never carry a stray pregnancy state.
  const [pregnancy, setPregnancy] = useState<TriageInput["context"]["pregnancy"]>("not_pregnant");
  const effectivePregnancy = isMale ? "not_pregnant" : pregnancy;
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
        pregnancy: effectivePregnancy,
        reproductiveAgeFemale: isMale ? false : reproFemale,
        spo2Scale2Enabled: scale2,
      },
      vitals: liveVitals,
      presentDiscriminators: [...discriminators],
      adjustments: { priorLevel: (row.priorLevel as AcuityLevel | null) ?? null },
    };
    return runTriage(input);
  }, [
    liveVitals,
    row.ageYears,
    row.priorLevel,
    effectivePregnancy,
    isMale,
    reproFemale,
    scale2,
    discriminators,
  ]);

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
    pregnancy: effectivePregnancy,
    reproductive_age_female: isMale ? false : reproFemale,
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

        {/* Live computed acuity — the prominent result + what to do */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              "inline-flex items-center rounded-lg px-3 py-1.5 text-[15px] font-semibold tabular-nums",
              COLOUR_CLASS[tier.colour],
            )}
          >
            L{tier.level} · {tier.colour.toUpperCase()}
          </span>
          <span className="text-foreground/80 text-[11px] font-medium">{result.disposition}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
              target {tier.targetMinutes}m
            </span>
            {result.provisional ? (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 font-mono text-[8.5px] font-semibold tracking-wide text-amber-700 uppercase dark:bg-amber-950/30 dark:text-amber-300">
                provisional
              </span>
            ) : null}
          </div>
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
              {/* Pregnancy is meaningless for a male patient — the obstetric
                  pathway can never apply, so we hide it entirely and keep
                  the engine on not_pregnant. */}
              {isMale ? (
                <Readout label="Pregnancy" value="Not applicable" />
              ) : (
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
              )}
            </div>
            {!isMale && pregnancy === "unknown" ? (
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

          {/* Score breakdown — what each parameter contributes + worse-of */}
          <ScoreBreakdown result={result} finalTier={tier} />
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

/**
 * Score breakdown — makes the level legible: each NEWS2 parameter's
 * contribution (drivers first), then the three independent worse-of lanes
 * (score · red-flag · ESI-v5) resolving to the final acuity. The winning
 * lane is computed independently of result.level (via the most-acute fired
 * lane), so it still lights up when trend escalation or a baseline temper
 * moved the final level off every track — the long-form reasoning for that
 * lives in the Details disclosure.
 */
function ScoreBreakdown({
  result,
  finalTier,
}: {
  result: ReturnType<typeof runTriage>;
  finalTier: (typeof ACUITY_TIERS)[number];
}) {
  const lanes = [
    {
      key: "score",
      label: "NEWS2 score",
      acuity: result.scoreAcuity,
      note: result.news2 ? `total ${result.news2.total}` : null,
    },
    {
      key: "flag",
      label: "Red-flag",
      acuity: result.discriminatorAcuity,
      note: result.firedDiscriminators[0]?.label ?? null,
    },
    {
      key: "esi",
      label: "ESI-v5",
      acuity: result.esiV5Acuity,
      note: result.incompleteVitals ? "incomplete vitals" : (result.dangerVitals[0] ?? null),
    },
  ] as const;
  const winner = lanes.reduce<number | null>(
    (best, l) => (l.acuity != null && (best == null || l.acuity < best) ? l.acuity : best),
    null,
  );

  return (
    <Section title={result.news2 ? "Score breakdown · NEWS2" : "Why this level"}>
      {result.news2 ? (
        <>
          {/* 1 — Aggregate strip */}
          <div className="border-border bg-muted/30 flex items-center gap-4 rounded-lg border px-3.5 py-2.5">
            <div className="flex flex-col">
              <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.14em] uppercase">
                NEWS2 total
              </span>
              <span className="text-foreground text-[26px] leading-none font-semibold tabular-nums">
                {result.news2.total}
              </span>
            </div>
            <span className="text-muted-foreground text-[12.5px]">
              {riskWord(result.news2.total)}
            </span>
            <div className="ml-auto flex flex-col items-end gap-1">
              {result.news2.hasSingleParameterThree ? (
                <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-wide text-rose-700 uppercase dark:bg-rose-950/30 dark:text-rose-300">
                  single +3 · red score
                </span>
              ) : null}
              {result.news2.provisional ? (
                <span className="text-muted-foreground/70 font-mono text-[10px] italic">
                  provisional — missing shown as not recorded, never scored 0
                </span>
              ) : null}
            </div>
          </div>

          {/* 2 — Contribution ledger (drivers first, missing sinks) */}
          <div className="mt-3 flex flex-col gap-1">
            <div className="text-muted-foreground/80 grid grid-cols-[104px_auto_1fr] gap-3 font-mono text-[9.5px] tracking-[0.14em] uppercase">
              <span>Contribution</span>
              <span />
              <span className="text-right">drivers first</span>
            </div>
            {[...result.news2.parameters]
              .map((p) => ({ p, tone: paramTone(p) }))
              .sort((a, b) =>
                a.p.present === b.p.present ? b.p.points - a.p.points : a.p.present ? -1 : 1,
              )
              .map(({ p, tone }) => {
                const isMod = p.parameter === "supplemental_oxygen";
                const cap = isMod ? 2 : 3;
                return (
                  <div
                    key={p.parameter}
                    title={p.band}
                    className={cn(
                      "grid grid-cols-[104px_auto_1fr] items-center gap-3 rounded-md py-0.5",
                      !p.present && "opacity-60",
                    )}
                  >
                    <span className="text-foreground/90 text-[12px]">
                      {PARAM_LABEL[p.parameter] ?? p.parameter}
                    </span>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: cap }).map((_, i) => (
                        <span
                          key={i}
                          aria-hidden
                          className={cn(
                            "h-2.5 w-3 rounded-[2px] border",
                            !p.present
                              ? "border-border/60 border-dashed bg-transparent"
                              : i < p.points
                                ? PIP_FILL[tone]
                                : "border-border/50 bg-muted/40",
                          )}
                        />
                      ))}
                      {isMod ? (
                        <span className="text-muted-foreground/60 font-mono text-[8.5px] tracking-wide uppercase">
                          mod
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "text-right font-mono text-[11px] tabular-nums",
                        p.present
                          ? TONE_CHIP[tone]
                          : "text-muted-foreground/60 italic line-through",
                      )}
                    >
                      {p.band}
                    </span>
                  </div>
                );
              })}
          </div>
        </>
      ) : null}

      {/* 3 — Worse-of rollup (renders for all rulesets) */}
      <div className="border-border/70 mt-4 border-t pt-3">
        <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.14em] uppercase">
          Worse-of · most acute lane wins
        </span>
        <div className="mt-2 flex items-stretch gap-2">
          <div className="grid flex-1 grid-cols-3 gap-2">
            {lanes.map((l) => {
              const fired = l.acuity != null;
              const laneTier = fired ? ACUITY_TIERS.find((t) => t.level === l.acuity) : undefined;
              const isWinner = fired && l.acuity === winner;
              return (
                <div
                  key={l.key}
                  title={
                    l.key === "esi" && result.dangerVitals.length
                      ? result.dangerVitals.join(" · ")
                      : undefined
                  }
                  className={cn(
                    "border-border bg-muted/30 flex flex-col items-center gap-1 rounded-lg border px-2 py-2",
                    !fired && "opacity-45",
                    isWinner &&
                      laneTier &&
                      cn(
                        "ring-offset-background ring-2 ring-offset-1",
                        RING_FOR[laneTier.colour as AcuityColour],
                      ),
                  )}
                >
                  <span className="text-muted-foreground font-mono text-[9px] tracking-[0.12em] uppercase">
                    {l.label}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums",
                      fired && laneTier
                        ? COLOUR_CLASS[laneTier.colour]
                        : "text-muted-foreground/60",
                    )}
                  >
                    {fired ? `L${l.acuity}` : "—"}
                  </span>
                  {l.note ? (
                    <span className="text-muted-foreground/80 line-clamp-1 text-center text-[10px]">
                      {l.note}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="text-muted-foreground flex items-center px-0.5">
            <ChevronRightIcon className="size-5" aria-hidden />
          </div>

          <div
            className={cn(
              "flex w-[84px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2",
              COLOUR_CLASS[finalTier.colour],
            )}
          >
            <span className="font-mono text-[9px] tracking-[0.12em] uppercase opacity-80">
              Final
            </span>
            <span className="text-[15px] font-semibold tabular-nums">L{finalTier.level}</span>
            <span className="text-[9.5px] opacity-80">{finalTier.targetMinutes}m target</span>
          </div>
        </div>

        {/* Worse-of equation — null-safe operands, true final level */}
        <p className="text-muted-foreground mt-2 text-[11px]">
          worse-of(
          <span className="font-mono tabular-nums">{result.scoreAcuity ?? "—"}</span>,{" "}
          <span className="font-mono tabular-nums">{result.discriminatorAcuity ?? "—"}</span>,{" "}
          <span className="font-mono tabular-nums">{result.esiV5Acuity ?? "—"}</span>) →{" "}
          <span className="text-foreground font-mono font-semibold tabular-nums">
            L{result.level}
          </span>
        </p>
      </div>

      {/* 4 — Details disclosure: full engine reasoning (trend/baseline/qSOFA) */}
      <details className="group mt-3">
        <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 font-mono text-[10px] tracking-[0.14em] uppercase">
          <ChevronRightIcon
            className="size-3 transition-transform group-open:rotate-90"
            aria-hidden
          />
          Details
        </summary>
        <ul className="mt-2 flex flex-col gap-1 pl-4">
          {result.reasoning.map((line, i) => (
            <li key={i} className="text-foreground/80 font-mono text-[11px] leading-relaxed">
              {line}
            </li>
          ))}
        </ul>
      </details>

      {/* 5 — Non-blocking clinician flags */}
      {result.flags.length > 0 ? (
        <div className="mt-3 flex flex-col gap-1">
          {result.flags.map((f, i) => (
            <p key={i} className="text-[11.5px] text-amber-700 dark:text-amber-300">
              ⚑ {f}
            </p>
          ))}
        </div>
      ) : null}
    </Section>
  );
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
    <div className="grid grid-cols-[1fr_104px_1fr] items-center gap-3">
      <span className="text-foreground text-[12.5px]">{label}</span>
      {/* Input + unit as separate columns so the typed value never sits
          under the unit suffix. The unit has its own reserved width. */}
      <div
        className={cn(
          "border-input bg-card flex h-8 items-center rounded-sm border transition-all duration-150",
          "focus-within:border-teal-500 focus-within:shadow-[0_0_0_2px_rgba(20,184,166,0.15)]",
          "dark:focus-within:border-teal-400",
          TONE_RING[i.tone],
        )}
      >
        <input
          inputMode="decimal"
          value={v}
          onChange={(e) => set(e.target.value)}
          placeholder="—"
          className="text-foreground placeholder:text-muted-foreground/40 h-full min-w-0 flex-1 bg-transparent px-2 text-right font-mono text-[13px] tabular-nums outline-none"
        />
        <span className="text-muted-foreground/70 border-border/60 pointer-events-none border-l px-2 font-mono text-[9.5px] whitespace-nowrap">
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
    <div className="grid grid-cols-[1fr_104px_1fr] items-center gap-3">
      <span className="text-foreground text-[12.5px]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-card text-foreground h-8 rounded-sm border px-1.5 text-[12px] outline-none focus-visible:border-teal-500 focus-visible:shadow-[0_0_0_2px_rgba(20,184,166,0.15)]"
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
