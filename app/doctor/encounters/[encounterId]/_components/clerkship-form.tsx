"use client";

import type { SubmitClerkshipResult } from "../actions";
import type { ExcludedDx } from "./assessment-synthesis";
import type { AbdoExam } from "@/lib/clerkship/exam/abdominal";
import type { BpStandard } from "@/lib/clerkship/exam/bp";
import type { CvsExam } from "@/lib/clerkship/exam/cardiovascular";
import type { EvfExam } from "@/lib/clerkship/exam/endo-vascular-foot";
import type { MskExam } from "@/lib/clerkship/exam/musculoskeletal";
import type { NeuroExam } from "@/lib/clerkship/exam/neurological";
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
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ActivityIcon,
  BrainIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  CopyIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  NotebookPenIcon,
  PlusIcon,
  RefreshCwIcon,
  StethoscopeIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assembleClerkshipAbnormal, examEmergencyLabels } from "@/lib/clerkship/assemble";
import { diagnosisByDisplay } from "@/lib/clerkship/diagnosis/catalog";
import { renderRosNarrative } from "@/lib/clerkship/ros";
import { renderSymptomProse } from "@/lib/clerkship/symptom-engine";
import { LOINC_CODES } from "@/lib/encounter/reference-codes";
import {
  clearClerkshipDraftAction,
  saveClerkshipDraftAction,
  submitClerkshipAction,
} from "../actions";
import { AbdominalExam } from "./abdominal-exam";
import { AssessmentSynthesis } from "./assessment-synthesis";
import { CardiovascularExam } from "./cardiovascular-exam";
import { CodeCombobox } from "./code-combobox";
import { DispositionCheck } from "./disposition-check";
import { EvfExamForm } from "./evf-exam";
import { ExamSections } from "./exam-sections";
import { FamilySocialSections } from "./family-social-sections";
import { HistorySections } from "./history-sections";
import { InvestigationSuggestions } from "./investigation-suggestions";
import { ManagementSuggestions } from "./management-suggestions";
import { MskExamForm } from "./msk-exam";
import { NeuroExamForm } from "./neuro-exam";
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
  examCardiovascular: CvsExam;
  examAbdominal: AbdoExam;
  examNeurological: NeuroExam;
  examMusculoskeletal: MskExam;
  examEndoVascularFoot: EvfExam;
  examSystems: Record<"cardiovascular" | "respiratory" | "abdominal" | "neurological", string>;
  summary: string;
  differential: DxRow[];
  /** Considered & excluded (anti-anchoring audit) — merged into differential on save. */
  excludedDx: ExcludedDx[];
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
    examCardiovascular: f.examCardiovascular,
    examAbdominal: f.examAbdominal,
    examNeurological: f.examNeurological,
    examMusculoskeletal: f.examMusculoskeletal,
    examEndoVascularFoot: f.examEndoVascularFoot,
    examSystems: f.examSystems,
    summary: f.summary,
    differential: [
      // The clinician's working set, then the considered-&-excluded audit trail.
      ...f.differential.map((d) => ({
        text: d.text,
        icd10: d.icd10 || undefined,
        mustNotMiss: d.mustNotMiss,
      })),
      ...f.excludedDx.map((d) => ({
        text: d.text,
        mustNotMiss: d.mustNotMiss,
        status: "excluded" as const,
      })),
    ],
    // The Assessment's problem-list proposer was removed (replaced by diagnostic
    // logic); the patient longitudinal problem_list is still fed from PMH at the
    // engine layer (deriveClinicalObjects), so no synthesis problems are sent here.
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
  draftsEnabled = false,
  recoveredDraftAt = null,
}: {
  encounterId: string;
  initial: Clerkship | null;
  /** W3: working-draft autosave is live (gated). */
  draftsEnabled?: boolean;
  /** ISO timestamp if this form was hydrated from a recovered unsaved draft. */
  recoveredDraftAt?: string | null;
}) {
  const router = useRouter();
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
  const [examCardiovascular, setExamCardiovascular] = useState<CvsExam>(e?.cardiovascular ?? {});
  const [examAbdominal, setExamAbdominal] = useState<AbdoExam>(e?.abdominal ?? {});
  const [examNeurological, setExamNeurological] = useState<NeuroExam>(e?.neurological ?? {});
  const [examMusculoskeletal, setExamMusculoskeletal] = useState<MskExam>(e?.musculoskeletal ?? {});
  const [examEndoVascularFoot, setExamEndoVascularFoot] = useState<EvfExam>(
    e?.endoVascularFoot ?? {},
  );
  const [examSystem, setExamSystem] = useState<
    | "general"
    | "cardiovascular"
    | "respiratory"
    | "abdominal"
    | "neurological"
    | "musculoskeletal"
    | "endovascular"
  >("general");
  // Legacy free-text per-system notes (all four systems now have structured
  // modules); kept read-only so any previously-saved text is preserved on re-save.
  const [examSystems] = useState({
    cardiovascular: e?.systems?.cardiovascular ?? "",
    respiratory: e?.systems?.respiratory ?? "",
    abdominal: e?.systems?.abdominal ?? "",
    neurological: e?.systems?.neurological ?? "",
  });
  const [summary, setSummary] = useState(s?.summary ?? "");
  // The editable differential = the clinician's working set. "Considered &
  // excluded" rows (anti-anchoring audit) live separately and re-merge on save.
  const [differential, setDifferential] = useState<DxRow[]>(
    (s?.differential ?? [])
      .filter((d) => d.status !== "excluded")
      .map((d) => ({
        text: d.text,
        icd10: d.icd10 ?? "",
        mustNotMiss: d.mustNotMiss ?? false,
      })),
  );
  const [excludedDx, setExcludedDx] = useState<ExcludedDx[]>(
    (s?.differential ?? [])
      .filter((d) => d.status === "excluded")
      .map((d) => ({ text: d.text, mustNotMiss: d.mustNotMiss ?? false })),
  );
  // The BP reference standard — shared by the vitals panel + the Assessment.
  const [bpStandard, setBpStandard] = useState<BpStandard>("who_esc");
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

  // The captured clinical state — the single object the Assessment synthesis and
  // the disposition cross-check both read (so they can never disagree).
  const capturedState = useMemo(
    () => ({
      hpcItems,
      ros,
      pmhConditions: pmhItems.map((p) => p.display),
      fhScreen,
      social: socialHx,
      examFindings: examGeneralFindings,
      respiratory: examRespiratory,
      cardiovascular: examCardiovascular,
      abdominal: examAbdominal,
      neurological: examNeurological,
      musculoskeletal: examMusculoskeletal,
      endoVascularFoot: examEndoVascularFoot,
    }),
    [
      hpcItems,
      ros,
      pmhItems,
      fhScreen,
      socialHx,
      examGeneralFindings,
      examRespiratory,
      examCardiovascular,
      examAbdominal,
      examNeurological,
      examMusculoskeletal,
      examEndoVascularFoot,
    ],
  );

  // Must-not-miss / emergency exam patterns — the red-flag input to the
  // disposition cross-check (derived from the same vitals-up assembly).
  const examEmergencies = useMemo(
    () => examEmergencyLabels(assembleClerkshipAbnormal(capturedState, examVitals, bpStandard)),
    [capturedState, examVitals, bpStandard],
  );

  // Jump-to-tab keyboard shortcuts (Alt+1…6) — fast tab switching on a busy ward.
  // Alt avoids clashing with text entry and the browser's Cmd/Ctrl+number.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= TABS.length) {
        e.preventDefault();
        setStep(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
    examCardiovascular,
    examAbdominal,
    examNeurological,
    examMusculoskeletal,
    examEndoVascularFoot,
    examSystems,
    summary,
    differential,
    excludedDx,
    investigations,
    managementPlan,
    disposition,
    safetyNetting,
  };
  const buildInput = () => buildClerkshipInput(state);

  // Lazy-init baseline = the clean snapshot; the dirty indicator diffs against it.
  const [baseline, setBaseline] = useState(() => JSON.stringify(buildClerkshipInput(state)));
  const snapshot = JSON.stringify(buildInput());
  const dirty = snapshot !== baseline;

  // W3 — debounced working-draft autosave (gated/dark behind draftsEnabled).
  // Persists the latest input to the mutable scratchpad ~2.5s after the last
  // change, so a crash / dropped connection / device switch doesn't lose work.
  // Separate from the append-only version history; cleared on an explicit save.
  useEffect(() => {
    if (!draftsEnabled || pending || snapshot === baseline) return;
    const t = setTimeout(() => {
      void saveClerkshipDraftAction(encounterId, JSON.parse(snapshot));
    }, 2500);
    return () => clearTimeout(t);
  }, [draftsEnabled, pending, snapshot, baseline, encounterId]);

  // Discard a recovered draft → drop it server-side and reload the saved version.
  function discardRecoveredDraft() {
    void clearClerkshipDraftAction(encounterId).then(() => router.refresh());
  }

  // No-lost-work guard (W3): warn before the tab is closed/reloaded/navigated
  // away while there are unsaved changes. Robust + PHI-safe (nothing persisted);
  // the browser shows its native "Leave site? changes may not be saved" prompt.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function save(finalise: boolean) {
    setResult(null);
    startTransition(async () => {
      const r = await submitClerkshipAction(encounterId, buildInput(), finalise);
      setResult(r);
      if (r.ok) {
        setBaseline(JSON.stringify(buildInput()));
        if (finalise) setFinalised(true);
        // The new version supersedes any working draft — drop it (gated no-op off).
        if (draftsEnabled) void clearClerkshipDraftAction(encounterId);
      }
    });
  }

  const last = TABS.length - 1;

  return (
    <form onSubmit={(ev) => ev.preventDefault()}>
      {/* On the Assessment step the reasoning rail is FUSED into the diagnosis
          surface (one "Form the diagnosis" component), so the rail is hidden and
          the form goes single-column full-width there; every other step keeps the
          docked live-reasoning rail. */}
      <div
        className={
          step === 4 ? "" : "xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-6"
        }
      >
        <div className="min-w-0">
          {recoveredDraftAt ? (
            <div className="scale-in mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
              <RefreshCwIcon className="size-3.5 shrink-0" aria-hidden />
              <span>
                Recovered unsaved changes from{" "}
                <span className="font-mono tabular-nums">
                  {recoveredDraftAt.slice(0, 16).replace("T", " ")}
                </span>{" "}
                — not yet saved. Save to keep them, or discard to return to the last saved version.
              </span>
              <button
                type="button"
                onClick={discardRecoveredDraft}
                className="tap ml-auto rounded-md border border-amber-400/60 px-2 py-1 text-[11px] font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40"
              >
                Discard
              </button>
            </div>
          ) : null}
          <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
            {/* Window header — breadcrumb + status */}
            <div className="border-border/60 flex items-center gap-3 border-b px-4 py-3 sm:px-5">
              <div className="flex items-center gap-1.5 text-[12px]">
                <span className="text-muted-foreground">Encounter</span>
                <span className="text-muted-foreground/50">/</span>
                <span className="text-foreground font-medium">Clerking</span>
              </div>
              <span
                key={finalised ? "finalised" : "draft"}
                className={`scale-in rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase ${
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
                    aria-current={active ? "step" : undefined}
                    aria-keyshortcuts={`Alt+${i + 1}`}
                    title={`${t.label} (Alt+${i + 1})`}
                    className={`tap relative -mb-px inline-flex items-center gap-1.5 rounded-t-md border-b-2 border-transparent px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-200 ${
                      active
                        ? "text-teal-700 dark:text-teal-300"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    }`}
                  >
                    <t.icon className="size-3.5" aria-hidden />
                    {t.label}
                    {active ? (
                      <span
                        aria-hidden
                        className="scale-in absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-teal-600 dark:bg-teal-400"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Body — keyed wrapper so each step composes in */}
            <div className="min-h-[26rem] px-4 py-5 sm:px-6 sm:py-6">
              <div key={step} className="reveal-up">
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
                        <div className="fade-in-slow rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
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
                        The teal summary is generated from the symptoms; your typed narrative is
                        saved with it.
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
                      <Label className="text-[12.5px] font-medium">
                        Review of systems — summary
                      </Label>
                      {ros.length > 0 ? (
                        <div className="fade-in-slow rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
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
                      bpStandard={bpStandard}
                      onBpStandardChange={setBpStandard}
                    />

                    {/* System switcher — each examination is its own card */}
                    <div className="border-border/70 bg-muted/30 flex flex-wrap gap-1 rounded-lg border p-1">
                      {(
                        [
                          ["general", "General", examGeneralFindings.length > 0],
                          [
                            "cardiovascular",
                            "Cardiovascular",
                            Object.keys(examCardiovascular).length > 0,
                          ],
                          ["respiratory", "Respiratory", Object.keys(examRespiratory).length > 0],
                          ["abdominal", "Abdomen", Object.keys(examAbdominal).length > 0],
                          ["neurological", "Neuro", Object.keys(examNeurological).length > 0],
                          ["musculoskeletal", "MSK", Object.keys(examMusculoskeletal).length > 0],
                          [
                            "endovascular",
                            "Endo / Vasc / Foot",
                            Object.keys(examEndoVascularFoot).length > 0,
                          ],
                        ] as const
                      ).map(([key, lbl, hasContent]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setExamSystem(key)}
                          aria-pressed={examSystem === key}
                          className={`tap inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-200 ${
                            examSystem === key
                              ? "bg-card text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {lbl}
                          {hasContent ? (
                            <span
                              aria-hidden
                              className="scale-in size-1.5 rounded-full bg-teal-500"
                              title="Has findings"
                            />
                          ) : null}
                        </button>
                      ))}
                    </div>

                    {/* Active system card — keyed so the chosen system slides in */}
                    <div
                      key={examSystem}
                      className="border-border bg-card reveal-up rounded-xl border p-4"
                    >
                      {examSystem === "general" ? (
                        <div className="flex flex-col gap-4">
                          <ExamSections
                            value={examGeneralFindings}
                            onChange={setExamGeneralFindings}
                          />
                          <Field label="Other general-exam notes">
                            <RichTextEditor
                              value={examGeneral}
                              onChange={setExamGeneral}
                              placeholder="Anything not captured above…"
                              rows={3}
                            />
                          </Field>
                        </div>
                      ) : null}
                      {examSystem === "cardiovascular" ? (
                        <CardiovascularExam
                          value={examCardiovascular}
                          onChange={setExamCardiovascular}
                        />
                      ) : null}
                      {examSystem === "respiratory" ? (
                        <RespiratoryExam value={examRespiratory} onChange={setExamRespiratory} />
                      ) : null}
                      {examSystem === "abdominal" ? (
                        <AbdominalExam value={examAbdominal} onChange={setExamAbdominal} />
                      ) : null}
                      {examSystem === "neurological" ? (
                        <NeuroExamForm value={examNeurological} onChange={setExamNeurological} />
                      ) : null}
                      {examSystem === "musculoskeletal" ? (
                        <MskExamForm
                          value={examMusculoskeletal}
                          onChange={setExamMusculoskeletal}
                        />
                      ) : null}
                      {examSystem === "endovascular" ? (
                        <EvfExamForm
                          value={examEndoVascularFoot}
                          onChange={setExamEndoVascularFoot}
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {step === 4 ? (
                  <div className="flex flex-col gap-5">
                    {/* The Assessment surface — clinical picture → diagnosis →
                        working diagnoses; assemble + propose, the clinician decides. */}
                    <AssessmentSynthesis
                      captured={capturedState}
                      pcCodes={hpcItems.map((x) => x.symptomCode)}
                      vitals={examVitals}
                      bpStandard={bpStandard}
                      differential={differential}
                      excluded={excludedDx}
                      summary={summary}
                      onSummaryChange={setSummary}
                      onAgree={(sdx) =>
                        setDifferential([
                          ...differential,
                          {
                            text: sdx.dx,
                            // Select carries the catalog's verified ICD-10 (or "" if pending).
                            icd10: diagnosisByDisplay(sdx.dx)?.icd10 ?? "",
                            mustNotMiss: sdx.likelihood === "must_not_miss",
                          },
                        ])
                      }
                      onExclude={(sdx) =>
                        setExcludedDx([
                          ...excludedDx,
                          { text: sdx.dx, mustNotMiss: sdx.likelihood === "must_not_miss" },
                        ])
                      }
                      onUnexclude={(text) =>
                        setExcludedDx(excludedDx.filter((d) => d.text !== text))
                      }
                      onDifferentialChange={setDifferential}
                      conditionCodes={Array.from(
                        new Set([
                          ...pmhItems.map((p) => p.code).filter(Boolean),
                          ...Object.entries(pmhScreen)
                            .filter(([, v]) => v === "yes")
                            .map(([k]) => k),
                        ]),
                      )}
                      onPickDiagnosis={(r) => {
                        // Catalog pick = the clinician's working diagnosis — same
                        // differential path as Select; skip if already present.
                        const key = r.display.trim().toLowerCase();
                        if (differential.some((d) => d.text.trim().toLowerCase() === key)) return;
                        setDifferential([
                          ...differential,
                          { text: r.display, icd10: r.icd10 ?? "", mustNotMiss: r.mustNotMiss },
                        ]);
                      }}
                      onCaptureSymptom={(obs) =>
                        // Reconciliation: tap a missing supporting symptom → record it
                        // present in the ROS (deduped; never overwrites an existing row).
                        setRos((prev) =>
                          prev.some((o) => o.symptomCode === obs.symptomCode)
                            ? prev
                            : [...prev, { ...obs, status: "present" as const }],
                        )
                      }
                    />
                  </div>
                ) : null}

                {step === 5 ? (
                  <div className="flex flex-col gap-5">
                    <InvestigationSuggestions
                      pcCodes={hpcItems.map((x) => x.symptomCode)}
                      existing={investigations.map((i) => i.text)}
                      onAccept={(row) => setInvestigations([...investigations, row])}
                    />
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
                            <CodeCombobox
                              options={LOINC_CODES}
                              placeholder="LOINC"
                              value={row.loinc}
                              onChange={(v) => set({ ...row, loinc: v })}
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
                    {/* Cited management pathways (gated dark until CSO sign-off). */}
                    <ManagementSuggestions
                      pcCodes={hpcItems.map((x) => x.symptomCode)}
                      onAppendPlan={(text) =>
                        setPlan((prev) => (prev.trim() ? `${prev.trim()}\n- ${text}` : `- ${text}`))
                      }
                      onAppendSafetyNet={(text) =>
                        setSafetyNetting((prev) => (prev.trim() ? `${prev.trim()}; ${text}` : text))
                      }
                    />
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
                    {/* Disposition cross-check — decision-support; reuses the signed
                        NEWS2 / GCS / BP thresholds + must-not-miss exam patterns. */}
                    <DispositionCheck
                      chosen={disposition}
                      vitals={examVitals}
                      bpStandard={bpStandard}
                      examEmergencies={examEmergencies}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {/* Footer — status + paging */}
            <div className="border-border/60 bg-muted/30 flex flex-wrap items-center gap-3 border-t px-4 py-3 sm:px-5">
              {pending ? (
                <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[12px]">
                  <LoaderCircleIcon className="size-3.5 motion-safe:animate-spin" aria-hidden />
                  Saving…
                </span>
              ) : result && !result.ok ? (
                <span className="text-destructive scale-in text-[12px]" role="alert">
                  {result.error}
                </span>
              ) : dirty ? (
                <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[12px]">
                  <RefreshCwIcon className="size-3.5" aria-hidden />
                  Unsaved changes
                </span>
              ) : (
                <span className="scale-in inline-flex items-center gap-1.5 text-[12px] text-teal-700 dark:text-teal-400">
                  <CheckIcon className="size-3.5" aria-hidden />
                  All changes saved
                </span>
              )}

              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="tap"
                  disabled={step === 0}
                  onClick={() => setStep((n) => Math.max(0, n - 1))}
                >
                  <ChevronLeftIcon className="size-4" aria-hidden />
                  Back
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="tap"
                  disabled={pending}
                  onClick={() => save(false)}
                >
                  {pending ? (
                    <>
                      <LoaderCircleIcon className="size-3.5 motion-safe:animate-spin" aria-hidden />
                      Saving…
                    </>
                  ) : (
                    "Save draft"
                  )}
                </Button>
                {step < last ? (
                  <Button
                    type="button"
                    className="tap"
                    onClick={() => setStep((n) => Math.min(last, n + 1))}
                  >
                    Next
                    <ChevronRightIcon className="size-4" aria-hidden />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="tap"
                    disabled={pending}
                    onClick={() => save(true)}
                  >
                    {pending ? (
                      <LoaderCircleIcon className="size-4 motion-safe:animate-spin" aria-hidden />
                    ) : (
                      <CheckIcon className="size-4" aria-hidden />
                    )}
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

        {/* Clinical reasoning — its own docked rail in the full-bleed workspace;
            stacks below the form on narrower screens. Live + non-blocking. On the
            Assessment step it's fused into the "Form the diagnosis" surface, so the
            rail is omitted there to avoid showing the differential twice. */}
        {step !== 4 ? (
          <aside className="border-border bg-card fade-in-slow mt-4 flex max-h-[70svh] flex-col overflow-hidden rounded-2xl border shadow-sm xl:sticky xl:top-17 xl:mt-0 xl:max-h-[calc(100svh-88px)]">
            <ReasoningPanel
              pcCodes={hpcItems.map((x) => x.symptomCode)}
              hpcItems={hpcItems}
              ros={ros}
              pmhConditions={pmhItems.map((x) => x.display)}
              fhScreen={fhScreen}
              social={socialHx}
              examFindings={examGeneralFindings}
              respiratory={examRespiratory}
              cardiovascular={examCardiovascular}
              abdominal={examAbdominal}
              neurological={examNeurological}
              musculoskeletal={examMusculoskeletal}
              endoVascularFoot={examEndoVascularFoot}
              atSynthesis={step >= 4}
            />
          </aside>
        ) : null}
      </div>
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
        <div key={i} className="scale-in flex flex-wrap items-center gap-2">
          {render(row, (next) => onChange(rows.map((r, j) => (j === i ? next : r))))}
          <button
            type="button"
            aria-label="Duplicate"
            title="Duplicate"
            className="tap text-muted-foreground hover:text-foreground rounded-md p-0.5 transition-colors"
            onClick={() =>
              onChange([...rows.slice(0, i + 1), { ...rows[i]! }, ...rows.slice(i + 1)])
            }
          >
            <CopyIcon className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Remove"
            className="tap text-muted-foreground hover:text-destructive rounded-md p-0.5 transition-colors"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <XIcon className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="tap text-muted-foreground hover:text-foreground hover:bg-muted/60 inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] transition-colors"
        onClick={() => onChange([...rows, { ...blank }])}
      >
        <PlusIcon className="size-3" aria-hidden />
        {addLabel}
      </button>
    </div>
  );
}
