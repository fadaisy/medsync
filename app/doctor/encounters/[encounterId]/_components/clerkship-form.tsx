"use client";

import type { SubmitClerkshipResult } from "../actions";
import type { CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import type { Clerkship } from "@/lib/encounter/clerkship";
import { useState, useTransition } from "react";
import { PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ICD10_CODES, LOINC_CODES } from "@/lib/encounter/reference-codes";
import { submitClerkshipAction } from "../actions";
import { SymptomCapture } from "./symptom-capture";

/**
 * Clerkship documentation entry (v1: essential structured sections). Structured-
 * but-flexible — every field optional; save a draft any time, finalise when
 * complete. Decision-support: it records what the clinician writes; the engine
 * enforces cadre rules (a junior's diagnosis stays "working" until co-signed),
 * append-only versioning, and audit. No fabrication — blanks are dropped.
 */

const TEXTAREA =
  "border-input bg-card text-foreground w-full rounded-sm border px-2.5 py-2 text-[13px] outline-none transition-all duration-150 focus-visible:border-teal-500 focus-visible:shadow-[0_0_0_2px_rgba(20,184,166,0.15)] placeholder:text-gray-400";
const SELECT = TEXTAREA;

type AllergyRow = { substance: string; reaction: string; severity: string };
type DxRow = { text: string; icd10: string; mustNotMiss: boolean };
type OrderRow = { kind: string; text: string; loinc: string; justification: string };

export function ClerkshipForm({
  encounterId,
  initial,
}: {
  encounterId: string;
  initial: Clerkship | null;
}) {
  const h = initial?.history;
  const e = initial?.examination;
  const s = initial?.synthesis;

  const [presentingComplaint, setPC] = useState(h?.presentingComplaint ?? "");
  const [hpcItems, setHpcItems] = useState<CapturedSymptom[]>(h?.hpcItems ?? []);
  const [hpc, setHpc] = useState(h?.hpc ?? "");
  const [soc, setSoc] = useState({
    site: h?.socrates?.site ?? "",
    onset: h?.socrates?.onset ?? "",
    character: h?.socrates?.character ?? "",
    radiation: h?.socrates?.radiation ?? "",
    associated: h?.socrates?.associated ?? "",
    timing: h?.socrates?.timing ?? "",
    exacerbating: h?.socrates?.exacerbating ?? "",
    severity: h?.socrates?.severity ?? "",
  });
  const [pmh, setPmh] = useState(h?.pmh ?? "");
  const [drugHistory, setDrugHistory] = useState(h?.drugHistory ?? "");
  const [allergies, setAllergies] = useState<AllergyRow[]>(
    (h?.allergies ?? []).map((a) => ({
      substance: a.substance,
      reaction: a.reaction ?? "",
      severity: a.severity ?? "",
    })),
  );
  const [social, setSocial] = useState({
    occupation: h?.social?.occupation ?? "",
    smokingPackYears: h?.social?.smokingPackYears?.toString() ?? "",
    alcoholUnitsPerWeek: h?.social?.alcoholUnitsPerWeek?.toString() ?? "",
    recreationalDrugs: h?.social?.recreationalDrugs ?? "",
  });
  const [examGeneral, setExamGeneral] = useState(e?.general ?? "");
  const [examSystems, setExamSystems] = useState({
    cardiovascular: e?.systems?.cardiovascular ?? "",
    respiratory: e?.systems?.respiratory ?? "",
    abdominal: e?.systems?.abdominal ?? "",
    neurological: e?.systems?.neurological ?? "",
  });
  const [summary, setSummary] = useState(s?.summary ?? "");
  const [differential, setDifferential] = useState<DxRow[]>(
    (s?.differential ?? []).map((d) => ({
      text: d.text,
      icd10: d.icd10 ?? "",
      mustNotMiss: d.mustNotMiss ?? false,
    })),
  );
  const [investigations, setInvestigations] = useState<OrderRow[]>(
    (s?.investigations ?? []).map((o) => ({
      kind: o.kind,
      text: o.text,
      loinc: o.loinc ?? "",
      justification: o.justification ?? "",
    })),
  );
  const [managementPlan, setPlan] = useState(s?.managementPlan ?? "");
  const [disposition, setDisposition] = useState(s?.disposition ?? "");
  const [safetyNetting, setSafetyNetting] = useState(s?.safetyNetting ?? "");

  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SubmitClerkshipResult | null>(null);

  // Returns a plain object; the server action re-validates it with the Zod
  // schema (safeParse), so the client doesn't need the strict enum types.
  function buildInput(): unknown {
    const num = (v: string) => {
      const n = Number(v);
      return v.trim() !== "" && Number.isFinite(n) ? n : undefined;
    };
    return {
      presentingComplaint,
      hpcItems,
      hpc,
      socrates: soc,
      pmh,
      drugHistory,
      allergies: allergies.map((a) => ({
        substance: a.substance,
        reaction: a.reaction || undefined,
        severity: a.severity || undefined,
      })),
      social: {
        occupation: social.occupation,
        smokingPackYears: num(social.smokingPackYears),
        alcoholUnitsPerWeek: num(social.alcoholUnitsPerWeek),
        recreationalDrugs: social.recreationalDrugs,
      },
      examGeneral,
      examSystems,
      summary,
      differential: differential.map((d) => ({
        text: d.text,
        icd10: d.icd10 || undefined,
        mustNotMiss: d.mustNotMiss,
      })),
      investigations: investigations.map((o) => ({
        kind: o.kind,
        text: o.text,
        loinc: o.loinc || undefined,
        justification: o.justification || undefined,
      })),
      managementPlan,
      disposition: disposition || undefined,
      safetyNetting,
    };
  }

  function save(finalise: boolean) {
    setResult(null);
    startTransition(async () => {
      setResult(await submitClerkshipAction(encounterId, buildInput(), finalise));
    });
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={(ev) => ev.preventDefault()}>
      <datalist id="icd10-codes">
        {ICD10_CODES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.display}
          </option>
        ))}
      </datalist>
      <datalist id="loinc-codes">
        {LOINC_CODES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.display}
          </option>
        ))}
      </datalist>

      {/* History */}
      <Section title="History">
        <Field label="Presenting complaint">
          <Input value={presentingComplaint} onChange={(ev) => setPC(ev.target.value)} />
        </Field>
        <Field label="History of presenting complaint — tap to capture">
          <SymptomCapture value={hpcItems} onChange={setHpcItems} />
        </Field>
        {hpcItems.length === 0 ? (
          <Field label="Or write it (narrative — used only if no symptoms tapped)">
            <textarea
              className={TEXTAREA}
              rows={3}
              value={hpc}
              onChange={(ev) => setHpc(ev.target.value)}
            />
          </Field>
        ) : null}
        <Field label="SOCRATES">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["site", "Site"],
                ["onset", "Onset"],
                ["character", "Character"],
                ["radiation", "Radiation"],
                ["associated", "Associated"],
                ["timing", "Timing"],
                ["exacerbating", "Exac./reliev."],
                ["severity", "Severity"],
              ] as const
            ).map(([k, lbl]) => (
              <Input
                key={k}
                placeholder={lbl}
                value={soc[k]}
                onChange={(ev) => setSoc({ ...soc, [k]: ev.target.value })}
              />
            ))}
          </div>
        </Field>
        <Field label="Past medical & surgical history">
          <textarea
            className={TEXTAREA}
            rows={2}
            value={pmh}
            onChange={(ev) => setPmh(ev.target.value)}
          />
        </Field>
        <Field label="Drug history">
          <textarea
            className={TEXTAREA}
            rows={2}
            value={drugHistory}
            onChange={(ev) => setDrugHistory(ev.target.value)}
          />
        </Field>
        <Field label="Allergies">
          <RepeatList
            rows={allergies}
            onChange={setAllergies}
            blank={{ substance: "", reaction: "", severity: "" }}
            addLabel="Add allergy"
            render={(row, set) => (
              <>
                <Input
                  placeholder="Substance"
                  value={row.substance}
                  onChange={(ev) => set({ ...row, substance: ev.target.value })}
                />
                <Input
                  placeholder="Reaction"
                  value={row.reaction}
                  onChange={(ev) => set({ ...row, reaction: ev.target.value })}
                />
                <select
                  className={SELECT}
                  value={row.severity}
                  onChange={(ev) => set({ ...row, severity: ev.target.value })}
                >
                  <option value="">Severity…</option>
                  {["mild", "moderate", "severe", "anaphylaxis", "unknown"].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </>
            )}
          />
        </Field>
        <Field label="Social">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Input
              placeholder="Occupation"
              value={social.occupation}
              onChange={(ev) => setSocial({ ...social, occupation: ev.target.value })}
            />
            <Input
              type="number"
              placeholder="Smoking (pack-yrs)"
              value={social.smokingPackYears}
              onChange={(ev) => setSocial({ ...social, smokingPackYears: ev.target.value })}
            />
            <Input
              type="number"
              placeholder="Alcohol (units/wk)"
              value={social.alcoholUnitsPerWeek}
              onChange={(ev) => setSocial({ ...social, alcoholUnitsPerWeek: ev.target.value })}
            />
            <Input
              placeholder="Recreational drugs"
              value={social.recreationalDrugs}
              onChange={(ev) => setSocial({ ...social, recreationalDrugs: ev.target.value })}
            />
          </div>
        </Field>
      </Section>

      {/* Examination */}
      <Section title="Examination">
        <Field label="General">
          <textarea
            className={TEXTAREA}
            rows={2}
            value={examGeneral}
            onChange={(ev) => setExamGeneral(ev.target.value)}
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["cardiovascular", "Cardiovascular"],
              ["respiratory", "Respiratory"],
              ["abdominal", "Abdominal"],
              ["neurological", "Neurological"],
            ] as const
          ).map(([k, lbl]) => (
            <Field key={k} label={lbl}>
              <Input
                value={examSystems[k]}
                onChange={(ev) => setExamSystems({ ...examSystems, [k]: ev.target.value })}
              />
            </Field>
          ))}
        </div>
      </Section>

      {/* Synthesis */}
      <Section title="Assessment & plan">
        <Field label="Summary / problem representation">
          <textarea
            className={TEXTAREA}
            rows={2}
            value={summary}
            onChange={(ev) => setSummary(ev.target.value)}
          />
        </Field>
        <Field label="Differential (mark must-not-miss)">
          <RepeatList
            rows={differential}
            onChange={setDifferential}
            blank={{ text: "", icd10: "", mustNotMiss: false }}
            addLabel="Add diagnosis"
            render={(row, set) => (
              <>
                <Input
                  placeholder="Diagnosis"
                  value={row.text}
                  onChange={(ev) => set({ ...row, text: ev.target.value })}
                />
                <Input
                  list="icd10-codes"
                  placeholder="ICD-10"
                  value={row.icd10}
                  onChange={(ev) => set({ ...row, icd10: ev.target.value })}
                />
                <label className="text-muted-foreground inline-flex items-center gap-1.5 text-[11.5px]">
                  <input
                    type="checkbox"
                    checked={row.mustNotMiss}
                    onChange={(ev) => set({ ...row, mustNotMiss: ev.target.checked })}
                  />
                  must-not-miss
                </label>
              </>
            )}
          />
        </Field>
        <Field label="Investigations">
          <RepeatList
            rows={investigations}
            onChange={setInvestigations}
            blank={{ kind: "bloods", text: "", loinc: "", justification: "" }}
            addLabel="Add investigation"
            render={(row, set) => (
              <>
                <select
                  className={SELECT}
                  value={row.kind}
                  onChange={(ev) => set({ ...row, kind: ev.target.value })}
                >
                  {["bloods", "imaging", "bedside", "special", "other"].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Test"
                  value={row.text}
                  onChange={(ev) => set({ ...row, text: ev.target.value })}
                />
                <Input
                  list="loinc-codes"
                  placeholder="LOINC"
                  value={row.loinc}
                  onChange={(ev) => set({ ...row, loinc: ev.target.value })}
                />
                <Input
                  placeholder="Justification"
                  value={row.justification}
                  onChange={(ev) => set({ ...row, justification: ev.target.value })}
                />
              </>
            )}
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Management plan">
            <textarea
              className={TEXTAREA}
              rows={2}
              value={managementPlan}
              onChange={(ev) => setPlan(ev.target.value)}
            />
          </Field>
          <Field label="Disposition">
            <select
              className={SELECT}
              value={disposition}
              onChange={(ev) => setDisposition(ev.target.value)}
            >
              <option value="">—</option>
              {["admit", "discharge", "refer", "observe", "transfer", "deceased"].map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Safety-netting">
          <Input value={safetyNetting} onChange={(ev) => setSafetyNetting(ev.target.value)} />
        </Field>
      </Section>

      {result && !result.ok ? (
        <p className="text-destructive text-[12.5px]" role="alert">
          {result.error}
        </p>
      ) : null}
      {result && result.ok ? (
        <p className="text-[12.5px] text-teal-700 dark:text-teal-400" role="status">
          Saved.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => save(false)}>
          {pending ? "Saving…" : "Save draft"}
        </Button>
        <Button type="button" disabled={pending} onClick={() => save(true)}>
          Finalise
        </Button>
        <span className="text-muted-foreground text-[11px]">
          A correction is a new version — nothing is overwritten.
        </span>
      </div>
    </form>
  );
}

/* ── small presentational helpers ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
      <h3 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11.5px]">{label}</Label>
      {children}
    </div>
  );
}

function RepeatList<T>({
  rows,
  onChange,
  blank,
  addLabel,
  render,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  blank: T;
  addLabel: string;
  render: (row: T, set: (next: T) => void) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          {render(row, (next) => onChange(rows.map((r, j) => (j === i ? next : r))))}
          <button
            type="button"
            aria-label="Remove"
            className="text-muted-foreground hover:text-destructive transition-colors"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <XIcon className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-[11.5px] transition-colors"
        onClick={() => onChange([...rows, { ...blank }])}
      >
        <PlusIcon className="size-3" aria-hidden />
        {addLabel}
      </button>
    </div>
  );
}
