"use client";

import type { TriageSubmitState } from "../actions";
import type { AcuityLevel, Acvpu, TriageInput } from "@/lib/triage/types";
import type { TriageWorklistRow } from "@/lib/triage/worklist";
import { useActionState, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { ACUITY_TIERS } from "@/lib/triage/constants";
import { TRIAGE_DISCRIMINATORS } from "@/lib/triage/discriminators";
import { runTriage } from "@/lib/triage/engine";
import { cn } from "@/lib/utils";
import { submitTriageAction } from "../actions";

/**
 * The transparent triage panel. The pure engine (lib/triage) runs LIVE
 * in the browser as the clinician enters vitals — so the reasoning
 * builds visibly before they commit (kickoff §0.2). On submit, the same
 * pure function re-runs server-side authoritatively under authority +
 * audit (no drift — one engine). The clinician confirms or overrides
 * the computed level; down-overrides are gated by cadre (R1).
 */

const COLOUR_CLASS: Record<string, string> = {
  red: "bg-rose-600 text-white",
  orange: "bg-orange-500 text-white",
  yellow: "bg-amber-400 text-amber-950",
  green: "bg-teal-600 text-white",
  blue: "bg-slate-400 text-white",
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
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-[620px]">
        {row ? (
          <PanelBody key={row.intakeId} row={row} mayDownTriage={mayDownTriage} onClose={onClose} />
        ) : null}
      </SheetContent>
    </Sheet>
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
  const [ageYears, setAgeYears] = useState<string>("");
  const [pregnancy, setPregnancy] = useState<TriageInput["context"]["pregnancy"]>("not_pregnant");
  const [reproFemale, setReproFemale] = useState(false);
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

  // Live, pure, in-browser computation — identical to the server.
  const result = useMemo(() => {
    const input: TriageInput = {
      context: {
        ageYears: num(ageYears),
        pregnancy,
        reproductiveAgeFemale: reproFemale,
        spo2Scale2Enabled: scale2,
      },
      vitals: {
        respiratoryRate: num(vitals.respiratoryRate),
        spo2: num(vitals.spo2),
        oxygen: vitals.oxygen,
        systolicBp: num(vitals.systolicBp),
        diastolicBp: num(vitals.diastolicBp),
        pulse: num(vitals.pulse),
        consciousness: vitals.consciousness,
        temperature: num(vitals.temperature),
        bloodGlucose: num(vitals.bloodGlucose),
      },
      presentDiscriminators: [...discriminators],
      adjustments: { priorLevel: (row.priorLevel as AcuityLevel | null) ?? null },
    };
    return runTriage(input);
  }, [vitals, ageYears, pregnancy, reproFemale, scale2, discriminators, row.priorLevel]);

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

  const who = row.patientCode ?? row.patientUnknownLabel ?? "Unknown patient";

  const payload = JSON.stringify({
    intake_id: row.intakeId,
    patient_user_id: row.patientUserId,
    age_years: num(ageYears),
    pregnancy,
    reproductive_age_female: reproFemale,
    spo2_scale2_enabled: scale2,
    vitals: {
      respiratoryRate: num(vitals.respiratoryRate),
      spo2: num(vitals.spo2),
      oxygen: vitals.oxygen,
      systolicBp: num(vitals.systolicBp),
      diastolicBp: num(vitals.diastolicBp),
      pulse: num(vitals.pulse),
      consciousness: vitals.consciousness,
      temperature: num(vitals.temperature),
      bloodGlucose: num(vitals.bloodGlucose),
    },
    present_discriminators: [...discriminators],
    prior_level: row.priorLevel ?? null,
    assigned_level: effectiveAssigned,
    override_reason: overrideReason.trim() || undefined,
  });

  return (
    <>
      <SheetHeader className="gap-3 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-foreground font-mono text-[15px] font-medium tabular-nums">
              {who}
            </span>
            <span className="text-muted-foreground text-[12px]">{row.entryTypeName}</span>
          </div>
          {/* Live computed acuity badge */}
          <div className="flex flex-col items-end gap-1">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold",
                COLOUR_CLASS[tier.colour],
              )}
            >
              L{tier.level} · {tier.colour.toUpperCase()}
            </span>
            <span className="text-muted-foreground font-mono text-[10px]">
              target {tier.targetMinutes}m{result.provisional ? " · provisional" : ""}
            </span>
          </div>
        </div>
      </SheetHeader>

      <SheetBody className="flex flex-col gap-5 px-6 py-2">
        {result.lifeThreat ? (
          <div className="rounded-md border border-rose-500/40 bg-rose-50/50 px-3 py-2 dark:bg-rose-950/20">
            <p className="text-[12.5px] font-semibold text-rose-700 dark:text-rose-300">
              Immediate life threat — Level 1, resus now.
            </p>
            <p className="text-[11.5px] text-rose-700/80 dark:text-rose-300/80">
              {result.lifeThreatReasons.join("; ")}
            </p>
          </div>
        ) : null}

        {/* ── Population ─────────────────────────────────── */}
        <Section title="Patient">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age (years)">
              <Input
                inputMode="numeric"
                value={ageYears}
                onChange={(e) => setAgeYears(e.target.value)}
                className="font-mono"
              />
            </Field>
            <Field label="Pregnancy">
              <select
                value={pregnancy}
                onChange={(e) => setPregnancy(e.target.value as typeof pregnancy)}
                className="border-input bg-background rounded-md border px-3 py-2 text-[13px]"
              >
                <option value="not_pregnant">Not pregnant</option>
                <option value="pregnant">Pregnant</option>
                <option value="postpartum_6wk">≤6wk postpartum</option>
                <option value="unknown">Unknown</option>
              </select>
            </Field>
          </div>
          {pregnancy === "unknown" ? (
            <label className="mt-2 flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={reproFemale}
                onChange={(e) => setReproFemale(e.target.checked)}
                className="size-4 accent-teal-600"
              />
              Female of reproductive age (flags confirm-pregnancy)
            </label>
          ) : null}
        </Section>

        {/* ── Vitals ─────────────────────────────────────── */}
        <Section title="Vitals">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Vital
              label="Resp rate"
              v={vitals.respiratoryRate}
              set={(x) => setVitals({ ...vitals, respiratoryRate: x })}
            />
            <Vital label="SpO₂ %" v={vitals.spo2} set={(x) => setVitals({ ...vitals, spo2: x })} />
            <Field label="Air / O₂">
              <select
                value={vitals.oxygen}
                onChange={(e) =>
                  setVitals({ ...vitals, oxygen: e.target.value as "air" | "oxygen" })
                }
                className="border-input bg-background rounded-md border px-3 py-2 text-[13px]"
              >
                <option value="air">Air</option>
                <option value="oxygen">On O₂</option>
              </select>
            </Field>
            <Vital
              label="Systolic BP"
              v={vitals.systolicBp}
              set={(x) => setVitals({ ...vitals, systolicBp: x })}
            />
            <Vital
              label="Diastolic BP"
              v={vitals.diastolicBp}
              set={(x) => setVitals({ ...vitals, diastolicBp: x })}
            />
            <Vital label="Pulse" v={vitals.pulse} set={(x) => setVitals({ ...vitals, pulse: x })} />
            <Field label="Consciousness">
              <select
                value={vitals.consciousness}
                onChange={(e) => setVitals({ ...vitals, consciousness: e.target.value as Acvpu })}
                className="border-input bg-background rounded-md border px-3 py-2 text-[13px]"
              >
                <option value="A">Alert</option>
                <option value="C">New confusion</option>
                <option value="V">Voice</option>
                <option value="P">Pain</option>
                <option value="U">Unresponsive</option>
              </select>
            </Field>
            <Vital
              label="Temp °C"
              v={vitals.temperature}
              set={(x) => setVitals({ ...vitals, temperature: x })}
            />
            <Vital
              label="Glucose mmol/L"
              v={vitals.bloodGlucose}
              set={(x) => setVitals({ ...vitals, bloodGlucose: x })}
            />
          </div>
          {/* SpO₂ Scale 2 — clinician-enabled ONLY for confirmed
              hypercapnic/COPD targets (research doc §3). Never default. */}
          <label className="mt-1 flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={scale2}
              onChange={(e) => setScale2(e.target.checked)}
              className="size-4 accent-teal-600"
            />
            Use SpO₂ Scale 2 (confirmed hypercapnic / COPD target 88–92%)
          </label>
        </Section>

        {/* ── Red-flags ──────────────────────────────────── */}
        <Section title="Red-flags (discriminators)">
          <div className="flex flex-col gap-1.5">
            {scopedDiscriminators.map((d) => (
              <label key={d.code} className="flex items-start gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={discriminators.has(d.code)}
                  onChange={(e) => {
                    const next = new Set(discriminators);
                    if (e.target.checked) next.add(d.code);
                    else next.delete(d.code);
                    setDiscriminators(next);
                  }}
                  className="mt-0.5 size-4 accent-teal-600"
                />
                <span>
                  {d.label}
                  <span className="text-muted-foreground"> · min L{d.minAcuity}</span>
                </span>
              </label>
            ))}
          </div>
        </Section>

        {/* ── Live reasoning (transparency) ──────────────── */}
        <Section title="Why this level">
          <ul className="flex flex-col gap-1">
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
      </SheetBody>

      <SheetFooter className="flex-col items-stretch gap-3">
        {/* Override / confirm */}
        <div className="flex flex-col gap-1.5">
          <Label>Assign acuity</Label>
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
                    "flex-1 rounded-md px-2 py-1.5 text-[12px] font-semibold transition-colors",
                    selected
                      ? COLOUR_CLASS[t.colour]
                      : "border-border bg-card text-muted-foreground border",
                    blocked && "cursor-not-allowed opacity-40",
                  )}
                >
                  L{t.level}
                </button>
              );
            })}
          </div>
          {direction === "none" ? (
            <p className="text-muted-foreground text-[11px]">Confirming the computed level.</p>
          ) : direction === "up" ? (
            <p className="text-[11px] text-orange-700 dark:text-orange-300">
              Escalating above the computed level.
            </p>
          ) : (
            <p className="text-[11px] text-rose-700 dark:text-rose-300">
              Down-triage — a reason is required
              {downBlocked ? " (and your cadre cannot down-triage)" : ""}.
            </p>
          )}
        </div>

        {needsReason ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override_reason">Reason (audited)</Label>
            <textarea
              id="override_reason"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              rows={2}
              minLength={8}
              className="border-input bg-background rounded-md border p-2 text-[13px]"
              placeholder="Why is a lower acuity clinically appropriate?"
            />
          </div>
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
            {pending ? "Saving…" : `Assign L${effectiveAssigned}`}
          </Button>
        </form>
      </SheetFooter>
    </>
  );
}

function ruleToPop(ruleset: string): "adult" | "paediatric" | "obstetric" {
  if (ruleset === "paediatric_pews") return "paediatric";
  if (ruleset === "obstetric_meows") return "obstetric";
  return "adult";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
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

function Vital({ label, v, set }: { label: string; v: string; set: (x: string) => void }) {
  return (
    <Field label={label}>
      <Input
        inputMode="decimal"
        value={v}
        onChange={(e) => set(e.target.value)}
        className="font-mono"
      />
    </Field>
  );
}
