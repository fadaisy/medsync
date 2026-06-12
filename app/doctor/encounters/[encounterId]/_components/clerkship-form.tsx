"use client";

import type { SubmitClerkshipResult } from "../actions";
import type { RespExam } from "@/lib/clerkship/exam/respiratory";
import type { ExamObservation, RecordedVitals } from "@/lib/clerkship/exam/types";
import type { RosObservation, RosScope } from "@/lib/clerkship/ros";
import type { CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import type {
  ClerkAllergy,
  ClerkFamilyItem,
  ClerkIce,
  ClerkMedication,
  ClerkPmhItem,
  ClerkPshItem,
  Clerkship,
  ClerkSocial,
} from "@/lib/encounter/clerkship";
import type { ComponentType } from "react";
import { useState, useTransition } from "react";
import {
  ActivityIcon,
  BrainIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  ListChecksIcon,
  NotebookPenIcon,
  PlusIcon,
  RefreshCwIcon,
  StethoscopeIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renderRosNarrative } from "@/lib/clerkship/ros";
import { renderSymptomProse } from "@/lib/clerkship/symptom-engine";
import { ICD10_CODES, LOINC_CODES } from "@/lib/encounter/reference-codes";
import { submitClerkshipAction } from "../actions";
import { ExamSections } from "./exam-sections";
import { FamilySocialSections } from "./family-social-sections";
import { HistorySections } from "./history-sections";
import { ReasoningPanel } from "./reasoning-panel";
import { RespiratoryExam } from "./respiratory-exam";
import { RichTextEditor } from "./rich-text";
import { RosReview } from "./ros-review";
import { SymptomCapture } from "./symptom-capture";
import { VitalsPanel } from "./vitals-panel";

/**
 * Clerkship documentation entry — a tabbed, stepwise "window": each part of the
 * clerking is its own tab (Complaint → History → Examination → Assessment →
 * Plan), with Back / Next paging and a live saved/unsaved indicator. Free-text
 * fields use a Markdown rich-text editor. Structured-but-flexible — every field
 * optional; save a draft any time, finalise when complete. Decision-support: it
 * records what the clinician writes; the engine enforces cadre rules, append-only
 * versioning, and audit. No fabrication — blanks are dropped.
 */

const FIELD =
  "border-input bg-card text-foreground focus-visible:ring-ring/25 w-full rounded-lg border px-3 py-2 text-[13px] outline-none transition-colors focus-visible:border-teal-500 focus-visible:ring-2 placeholder:text-gray-400";

const TABS: { label: string; icon: ComponentType<{ className?: string }> }[] = [
  { label: "Complaint", icon: ActivityIcon },
  { label: "Review of Systems", icon: ListChecksIcon },
  { label: "Background", icon: NotebookPenIcon },
  { label: "Examination", icon: StethoscopeIcon },
  { label: "Assessment", icon: BrainIcon },
  { label: "Plan", icon: ClipboardCheckIcon },
];

type DxRow = { text: string; icd10: string; mustNotMiss: boolean };
type OrderRow = { kind: string; text: string; loinc: string; justification: string };

type FormState = {
  presentingComplaint: string;
  hpcItems: CapturedSymptom[];
  hpcNarrative: string;
  ros: RosObservation[];
  rosScope: RosScope;
  rosNarrative: string;
  pmhItems: ClerkPmhItem[];
  pmhScreen: Record<string, "yes" | "no" | "unsure">;
  pshItems: ClerkPshItem[];
  medications: ClerkMedication[];
  allergies: ClerkAllergy[];
  negatives: Record<string, boolean>;
  familyHistory: ClerkFamilyItem[];
  fhScreen: Record<string, "yes" | "no" | "unsure">;
  socialHx: ClerkSocial;
  ice: ClerkIce;
  examGeneral: string;
  examGeneralFindings: ExamObservation[];
  examVitals: RecordedVitals;
  examRespiratory: RespExam;
  examSystems: Record<"cardiovascular" | "respiratory" | "abdominal" | "neurological", string>;
  summary: string;
  differential: DxRow[];
  investigations: OrderRow[];
  managementPlan: string;
  disposition: string;
  safetyNetting: string;
};

// Pure: flat form state → the plain object the server re-validates (Zod safeParse).
// Module-level so it can seed the dirty-tracking baseline without an effect.
function buildClerkshipInput(f: FormState): unknown {
  return {
    presentingComplaint: f.hpcItems.length
      ? f.hpcItems.map((x) => x.symptomDisplay).join(", ")
      : f.presentingComplaint,
    hpcItems: f.hpcItems,
    hpcNarrative: f.hpcNarrative,
    ros: f.ros,
    rosScope: f.rosScope,
    rosNarrative: f.rosNarrative,
    pmhItems: f.pmhItems,
    pmhScreen: f.pmhScreen,
    pshItems: f.pshItems,
    medications: f.medications,
    negatives: f.negatives,
    allergies: f.allergies.map((a) => ({
      substance: a.substance,
      reaction: a.reaction || undefined,
      severity: a.severity || undefined,
    })),
    familyHistory: f.familyHistory,
    fhScreen: f.fhScreen,
    socialHx: f.socialHx,
    ice: f.ice,
    examGeneral: f.examGeneral,
    examGeneralFindings: f.examGeneralFindings,
    examVitals: f.examVitals,
    examRespiratory: f.examRespiratory,
    examSystems: f.examSystems,
    summary: f.summary,
    differential: f.differential.map((d) => ({
      text: d.text,
      icd10: d.icd10 || undefined,
      mustNotMiss: d.mustNotMiss,
    })),
    investigations: f.investigations.map((o) => ({
      kind: o.kind,
      text: o.text,
      loinc: o.loinc || undefined,
      justification: o.justification || undefined,
    })),
    managementPlan: f.managementPlan,
    disposition: f.disposition || undefined,
    safetyNetting: f.safetyNetting,
  };
}

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

  const [presentingComplaint] = useState(h?.presentingComplaint ?? "");
  const [hpcItems, setHpcItems] = useState<CapturedSymptom[]>(h?.hpcItems ?? []);
  const [hpcNarrative, setHpcNarrative] = useState(h?.hpcNarrative ?? "");
  const [ros, setRos] = useState<RosObservation[]>(h?.ros ?? []);
  const [rosScope, setRosScope] = useState<RosScope>(
    h?.rosScope ?? { mode: "complete", reviewedSystems: [] },
  );
  const [rosNarrative, setRosNarrative] = useState(h?.rosNarrative ?? "");
  const [pmhItems, setPmhItems] = useState<ClerkPmhItem[]>(h?.pmhItems ?? []);
  const [pmhScreen, setPmhScreen] = useState<Record<string, "yes" | "no" | "unsure">>(
    h?.pmhScreen ?? {},
  );
  const [pshItems, setPshItems] = useState<ClerkPshItem[]>(h?.pshItems ?? []);
  const [medications, setMedications] = useState<ClerkMedication[]>(h?.medications ?? []);
  const [allergies, setAllergies] = useState<ClerkAllergy[]>(h?.allergies ?? []);
  const [negatives, setNegatives] = useState<Record<string, boolean>>(h?.negatives ?? {});
  const [familyHistory, setFamilyHistory] = useState<ClerkFamilyItem[]>(h?.familyHistory ?? []);
  const [fhScreen, setFhScreen] = useState<Record<string, "yes" | "no" | "unsure">>(
    h?.fhScreen ?? {},
  );
  const [socialHx, setSocialHx] = useState<ClerkSocial>(h?.socialHx ?? {});
  const [ice, setIce] = useState<ClerkIce>(h?.ice ?? {});
  const [examGeneral, setExamGeneral] = useState(e?.general ?? "");
  const [examGeneralFindings, setExamGeneralFindings] = useState<ExamObservation[]>(
    e?.generalFindings ?? [],
  );
  const [examVitals, setExamVitals] = useState<RecordedVitals>(e?.vitals ?? {});
  const [examRespiratory, setExamRespiratory] = useState<RespExam>(e?.respiratory ?? {});
  const [reasoningOpen, setReasoningOpen] = useState(false);
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

  const [step, setStep] = useState(0);
  const [finalised, setFinalised] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SubmitClerkshipResult | null>(null);

  const state: FormState = {
    presentingComplaint,
    hpcItems,
    hpcNarrative,
    ros,
    rosScope,
    rosNarrative,
    pmhItems,
    pmhScreen,
    pshItems,
    medications,
    allergies,
    negatives,
    familyHistory,
    fhScreen,
    socialHx,
    ice,
    examGeneral,
    examGeneralFindings,
    examVitals,
    examRespiratory,
    examSystems,
    summary,
    differential,
    investigations,
    managementPlan,
    disposition,
    safetyNetting,
  };
  const buildInput = () => buildClerkshipInput(state);

  // Lazy-init baseline = the clean snapshot; the dirty indicator diffs against it.
  const [baseline, setBaseline] = useState(() => JSON.stringify(buildClerkshipInput(state)));
  const dirty = JSON.stringify(buildInput()) !== baseline;

  function save(finalise: boolean) {
    setResult(null);
    startTransition(async () => {
      const r = await submitClerkshipAction(encounterId, buildInput(), finalise);
      setResult(r);
      if (r.ok) {
        setBaseline(JSON.stringify(buildInput()));
        if (finalise) setFinalised(true);
      }
    });
  }

  const last = TABS.length - 1;

  return (
    <form onSubmit={(ev) => ev.preventDefault()}>
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

      <div>
        <div className="min-w-0">
          <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
            {/* Window header — breadcrumb + status */}
            <div className="border-border/60 flex items-center gap-3 border-b px-4 py-3 sm:px-5">
              <div className="flex items-center gap-1.5 text-[12px]">
                <span className="text-muted-foreground">Encounter</span>
                <span className="text-muted-foreground/50">/</span>
                <span className="text-foreground font-medium">Clerking</span>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase ${
                  finalised
                    ? "bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                }`}
              >
                {finalised ? "Finalised" : "Draft"}
              </span>
              <span className="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
                Step {step + 1} of {TABS.length}
              </span>
            </div>

            {/* Tab bar */}
            <div className="border-border/60 flex gap-1 overflow-x-auto border-b px-2 sm:px-3">
              {TABS.map((t, i) => {
                const active = i === step;
                return (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setStep(i)}
                    className={`-mb-px inline-flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                      active
                        ? "border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border-transparent"
                    }`}
                  >
                    <t.icon className="size-3.5" aria-hidden />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="min-h-[26rem] px-4 py-5 sm:px-6 sm:py-6">
              {step === 0 ? (
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <Label className="text-[12.5px] font-medium">Presenting complaint</Label>
                    <p className="text-muted-foreground -mt-1 text-[11px] leading-snug">
                      Click the field to choose a symptom, then open it to add the details.
                    </p>
                    <SymptomCapture value={hpcItems} onChange={setHpcItems} />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label className="text-[12.5px] font-medium">
                      History of presenting complaint
                    </Label>
                    {hpcItems.length > 0 ? (
                      <div className="rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-[0.1em] text-teal-700 uppercase dark:text-teal-400">
                          Auto-generated from the symptoms above
                        </span>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-teal-900/90 italic dark:text-teal-100/80">
                          {renderSymptomProse(hpcItems)}
                        </p>
                      </div>
                    ) : null}
                    <RichTextEditor
                      value={hpcNarrative}
                      onChange={setHpcNarrative}
                      placeholder={
                        hpcItems.length
                          ? "Add the narrative in your own words — onset, course, context, ICE… (this is added to the generated summary)"
                          : "Write the history of the presenting complaint…"
                      }
                      rows={6}
                    />
                    <p className="text-muted-foreground text-[11px]">
                      The teal summary is generated from the symptoms; your typed narrative is saved
                      with it.
                    </p>
                  </div>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="flex flex-col gap-5">
                  <RosReview
                    value={ros}
                    onChange={setRos}
                    scope={rosScope}
                    onScopeChange={setRosScope}
                    hpcItems={hpcItems}
                  />

                  <div className="flex flex-col gap-2">
                    <Label className="text-[12.5px] font-medium">Review of systems — summary</Label>
                    {ros.length > 0 ? (
                      <div className="rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-[0.1em] text-teal-700 uppercase dark:text-teal-400">
                          Auto-generated from the sweep above
                        </span>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-teal-900/90 italic dark:text-teal-100/80">
                          {renderRosNarrative(ros)}
                        </p>
                      </div>
                    ) : null}
                    <RichTextEditor
                      value={rosNarrative}
                      onChange={setRosNarrative}
                      placeholder={
                        ros.length
                          ? "Add anything in your own words — context, pertinent detail… (this is saved with the generated summary)"
                          : "Write the review of systems, or use the sweep above…"
                      }
                      rows={5}
                    />
                    <p className="text-muted-foreground text-[11px]">
                      The teal summary is generated from the sweep; your typed narrative is saved
                      with it.
                    </p>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="flex flex-col gap-5">
                  <HistorySections
                    encounterId={encounterId}
                    pmhItems={pmhItems}
                    setPmhItems={setPmhItems}
                    pmhScreen={pmhScreen}
                    setPmhScreen={setPmhScreen}
                    pshItems={pshItems}
                    setPshItems={setPshItems}
                    medications={medications}
                    setMedications={setMedications}
                    allergies={allergies}
                    setAllergies={setAllergies}
                    negatives={negatives}
                    setNegatives={setNegatives}
                  />
                  <FamilySocialSections
                    familyHistory={familyHistory}
                    setFamilyHistory={setFamilyHistory}
                    fhScreen={fhScreen}
                    setFhScreen={setFhScreen}
                    social={socialHx}
                    setSocial={setSocialHx}
                    ice={ice}
                    setIce={setIce}
                    negatives={negatives}
                    setNegatives={setNegatives}
                  />
                </div>
              ) : null}

              {step === 3 ? (
                <div className="flex flex-col gap-4">
                  <VitalsPanel
                    encounterId={encounterId}
                    value={examVitals}
                    onChange={setExamVitals}
                  />
                  <ExamSections value={examGeneralFindings} onChange={setExamGeneralFindings} />
                  <details className="group border-border/70 rounded-lg border">
                    <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[12px] font-medium select-none">
                      <ChevronRightIcon
                        className="size-3.5 transition-transform group-open:rotate-90"
                        aria-hidden
                      />
                      Respiratory examination
                      <span className="text-muted-foreground/70 ml-auto text-[10.5px] font-normal">
                        IPPA · by zone &amp; side · sign-cluster patterns
                      </span>
                    </summary>
                    <div className="px-1 pt-1 pb-2">
                      <RespiratoryExam value={examRespiratory} onChange={setExamRespiratory} />
                    </div>
                  </details>
                  <details className="group border-border/70 rounded-lg border">
                    <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[12px] font-medium select-none">
                      <ChevronRightIcon
                        className="size-3.5 transition-transform group-open:rotate-90"
                        aria-hidden
                      />
                      Notes &amp; other system exams
                      <span className="text-muted-foreground/70 ml-auto text-[10.5px] font-normal">
                        CVS / abdo / neuro — free text for now
                      </span>
                    </summary>
                    <div className="flex flex-col gap-4 px-3 pt-1 pb-3">
                      <Field label="Other general-exam notes">
                        <RichTextEditor
                          value={examGeneral}
                          onChange={setExamGeneral}
                          placeholder="Anything not captured above…"
                          rows={3}
                        />
                      </Field>
                      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                        {(
                          [
                            ["cardiovascular", "Cardiovascular"],
                            ["abdominal", "Abdominal"],
                            ["neurological", "Neurological"],
                          ] as const
                        ).map(([k, lbl]) => (
                          <Field key={k} label={lbl}>
                            <Input
                              value={examSystems[k]}
                              onChange={(ev) =>
                                setExamSystems({ ...examSystems, [k]: ev.target.value })
                              }
                            />
                          </Field>
                        ))}
                      </div>
                    </div>
                  </details>
                </div>
              ) : null}

              {step === 4 ? (
                <div className="flex flex-col gap-5">
                  <Field label="Summary / problem representation">
                    <RichTextEditor
                      value={summary}
                      onChange={setSummary}
                      placeholder="One-liner: age, salient features, working impression…"
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
                </div>
              ) : null}

              {step === 5 ? (
                <div className="flex flex-col gap-5">
                  <Field label="Investigations">
                    <RepeatList
                      rows={investigations}
                      onChange={setInvestigations}
                      blank={{ kind: "bloods", text: "", loinc: "", justification: "" }}
                      addLabel="Add investigation"
                      render={(row, set) => (
                        <>
                          <select
                            className={FIELD}
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
                  <Field label="Management plan">
                    <RichTextEditor
                      value={managementPlan}
                      onChange={setPlan}
                      placeholder="Immediate, ongoing, referrals, monitoring…"
                    />
                  </Field>
                  <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                    <Field label="Disposition">
                      <select
                        className={FIELD}
                        value={disposition}
                        onChange={(ev) => setDisposition(ev.target.value)}
                      >
                        <option value="">—</option>
                        {["admit", "discharge", "refer", "observe", "transfer", "deceased"].map(
                          (o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                    <Field label="Safety-netting">
                      <Input
                        value={safetyNetting}
                        onChange={(ev) => setSafetyNetting(ev.target.value)}
                        placeholder="What to watch for, when to return…"
                      />
                    </Field>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Footer — status + paging */}
            <div className="border-border/60 bg-muted/30 flex flex-wrap items-center gap-3 border-t px-4 py-3 sm:px-5">
              {result && !result.ok ? (
                <span className="text-destructive text-[12px]" role="alert">
                  {result.error}
                </span>
              ) : dirty ? (
                <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[12px]">
                  <RefreshCwIcon className="size-3.5" aria-hidden />
                  Unsaved changes
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-teal-700 dark:text-teal-400">
                  <CheckIcon className="size-3.5" aria-hidden />
                  All changes saved
                </span>
              )}

              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={step === 0}
                  onClick={() => setStep((n) => Math.max(0, n - 1))}
                >
                  <ChevronLeftIcon className="size-4" aria-hidden />
                  Back
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => save(false)}
                >
                  {pending ? "Saving…" : "Save draft"}
                </Button>
                {step < last ? (
                  <Button type="button" onClick={() => setStep((n) => Math.min(last, n + 1))}>
                    Next
                    <ChevronRightIcon className="size-4" aria-hidden />
                  </Button>
                ) : (
                  <Button type="button" disabled={pending} onClick={() => save(true)}>
                    <CheckIcon className="size-4" aria-hidden />
                    Finalise
                  </Button>
                )}
              </div>
            </div>
          </div>

          <p className="text-muted-foreground mt-2 px-1 text-[11px]">
            A correction is a new version — nothing is overwritten.
          </p>
        </div>
      </div>

      {/* Clinical reasoning — opens as a slide-over so the form keeps full width */}
      {!reasoningOpen ? (
        <button
          type="button"
          onClick={() => setReasoningOpen(true)}
          className="border-border bg-card text-foreground hover:bg-muted fixed right-5 bottom-5 z-40 inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[12.5px] font-medium shadow-lg transition-colors"
        >
          <BrainIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
          Clinical reasoning
        </button>
      ) : null}

      {reasoningOpen ? (
        <div className="bg-card border-border animate-in slide-in-from-right fixed top-0 right-0 bottom-0 z-50 w-[24rem] max-w-[92vw] border-l shadow-2xl duration-200">
          <ReasoningPanel
            pcCodes={hpcItems.map((x) => x.symptomCode)}
            hpcItems={hpcItems}
            ros={ros}
            pmhConditions={pmhItems.map((x) => x.display)}
            fhScreen={fhScreen}
            social={socialHx}
            examFindings={examGeneralFindings}
            respiratory={examRespiratory}
            atSynthesis={step >= 4}
            onClose={() => setReasoningOpen(false)}
          />
        </div>
      ) : null}
    </form>
  );
}

/* ── small presentational helpers ── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
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
