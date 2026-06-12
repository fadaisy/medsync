/**
 * Clerkship engine — PURE + deterministic. The structured Hutchison clerking
 * (history → examination → synthesis) that is the encounter's clinical
 * documentation, plus the projections the engine needs: SOAP mapping and the
 * clerkship→objects derivation (the clerking populates the engine's allergies /
 * medications / diagnoses / problem-list / orders — no parallel store).
 *
 * Anchored to docs/clinical/clerkship-clinical-reference.md (Hutchison's
 * Clinical Methods 24th ed.). Decision-support + structured documentation, not
 * autonomous — it structures/prompts/records; the clinician examines + decides.
 * No auto-diagnosis. Structured BUT flexible — every field is optional; sections
 * may be skipped/deferred (emergency: focused history, resus first).
 */

import type { AbdoExam } from "@/lib/clerkship/exam/abdominal";
import type { CvsExam } from "@/lib/clerkship/exam/cardiovascular";
import type { MskExam } from "@/lib/clerkship/exam/musculoskeletal";
import type { NeuroExam } from "@/lib/clerkship/exam/neurological";
import type { RespExam } from "@/lib/clerkship/exam/respiratory";
import type { ExamObservation, RecordedVitals } from "@/lib/clerkship/exam/types";
import type { RosObservation, RosScope } from "@/lib/clerkship/ros";
import type { CapturedSymptom } from "@/lib/clerkship/symptom-engine";

// Mirrors the DB CHECK on patient_allergies (migration 0040 / prescribing.ts).
// `anaphylaxis` is the band the prescribing allergy guard cares about most — it
// MUST be representable from the clerkship or it can never be persisted.
export type Severity = "mild" | "moderate" | "severe" | "anaphylaxis" | "unknown";

export interface ClerkAllergy {
  substance: string;
  reaction?: string;
  severity?: Severity;
}
export interface ClerkMedication {
  name: string;
  dose?: string;
  route?: string;
  frequency?: string;
  /** Indication — links to a PMH condition code where known. */
  indication?: string;
  adherence?: "good" | "occasional_miss" | "frequent_miss" | "stopped";
  category?: "prescribed" | "otc" | "herbal" | "contraceptive";
  /** Ad-hoc (not from the shared drug pick-list). */
  adHoc?: boolean;
}

/** Tap-first PMH entry (condition pick-list + structured attributes). */
export interface ClerkPmhItem {
  code: string;
  display: string;
  year?: string;
  status?: "well_controlled" | "poorly_controlled" | "remission" | "resolved" | "newly_diagnosed";
  onTreatment?: boolean;
  complications?: string[];
  note?: string;
  adHoc?: boolean;
}

/** Tap-first Family-history entry (relative + condition, reusing the condition list). */
export interface ClerkFamilyItem {
  relative: "mother" | "father" | "sibling" | "child" | "grandparent" | "aunt_uncle" | "other";
  conditionCode?: string;
  conditionDisplay: string;
  ageOnset?: string;
  deceased?: boolean;
  causeOfDeath?: string;
  adHoc?: boolean;
}

/** Structured social / personal history (tap-first; pack-years auto-calc, CAGE). */
export interface ClerkSocial {
  smokingStatus?: "never" | "current" | "ex";
  cigsPerDay?: number;
  smokingYears?: number;
  quitYear?: string;
  alcoholStatus?: "never" | "occasional" | "regular" | "ex";
  alcoholUnitsPerWeek?: number;
  cage?: Cage;
  drugUse?: "never" | "past" | "current";
  drugDetail?: string;
  occupationCode?: string;
  occupation?: string;
  exposures?: string[];
  living?: "alone" | "with_family" | "with_spouse" | "institution";
  func?: "independent" | "some_help" | "dependent";
  mobility?: "independent" | "aid" | "wheelchair" | "bedbound";
  diet?: string;
  activity?: "sedentary" | "moderate" | "active";
  recentTravel?: string;
}

/** Ideas / Concerns / Expectations — the patient-centred layer (Hutchison). */
export interface ClerkIce {
  ideas?: string;
  concerns?: string;
  expectations?: string;
}

/** Tap-first PSH entry (operation pick-list + attributes). */
export interface ClerkPshItem {
  code: string;
  display: string;
  year?: string;
  indication?: string;
  anaesthetic?: "ga" | "spinal" | "local" | "unsure";
  anaestheticComplication?: boolean;
  complications?: string;
  note?: string;
  adHoc?: boolean;
}
export interface ClerkDifferential {
  text: string;
  icd10?: string;
  rank?: number;
  mustNotMiss?: boolean;
  status?: "working" | "final" | "excluded";
}
export interface ClerkProblem {
  item: string;
  icd10?: string;
  active?: boolean;
}
export interface ClerkOrder {
  kind: "bloods" | "imaging" | "bedside" | "special" | "other";
  text: string;
  loinc?: string;
  justification?: string;
}

/** SOCRATES — pain/symptom analysis (Hutchison Box 1.8). */
export interface Socrates {
  site?: string;
  onset?: string;
  character?: string;
  radiation?: string;
  associated?: string;
  timing?: string;
  exacerbating?: string;
  severity?: string;
}

/** CAGE — alcohol screen (each is a yes/no). */
export interface Cage {
  cutDown?: boolean;
  annoyed?: boolean;
  guilty?: boolean;
  eyeOpener?: boolean;
}

export interface ClerkHistory {
  identifying?: string;
  /** The single open-ended opening / reason for presentation. */
  opening?: string;
  presentingComplaint?: string;
  /** Full rendered HPC for display = auto-generated symptom prose + narrative. */
  hpc?: string;
  /** The clinician's own free-typed HPC narrative (Markdown), kept separate from
   * the auto-generated symptom prose so editing reloads without duplication. */
  hpcNarrative?: string;
  socrates?: Socrates;
  /**
   * Tap-first structured HPC (symptom-capture engine). Each item is a symptom +
   * its tapped property values; `hpc` carries the rendered prose. See
   * lib/clerkship/symptom-engine.ts. The clerking stays SOCRATES-compatible —
   * `socrates` remains for the free-form pain analysis.
   */
  hpcItems?: CapturedSymptom[];
  /** Review-of-Systems screen — three-state (present/denies) per screening symptom
   * across body systems; not-asked = absent. See lib/clerkship/ros.ts. */
  ros?: RosObservation[];
  /** ROS scope (complete/focused) — records truthful coverage; PC-owned systems
   * are HPC-covered. not-reviewed ≠ negative. */
  rosScope?: RosScope;
  /** Clinician's free-text ROS narrative — saved alongside the generated sweep summary. */
  rosNarrative?: string;
  /** Tap-first PMH (condition pick-list + attributes). Chronic/active → problem list. */
  pmhItems?: ClerkPmhItem[];
  /** Always-screen toggles (diabetes/HTN/TB/HIV/sickle/…) → yes/no/unsure. */
  pmhScreen?: Record<string, "yes" | "no" | "unsure">;
  /** Tap-first PSH (operation pick-list + attributes). */
  pshItems?: ClerkPshItem[];
  /** Explicit recorded negatives per section (nkda / no_meds / no_pmh / no_psh /
   * no_fh / non_smoker / …) — a recorded negative, not blank. */
  negatives?: Record<string, boolean>;
  /** Tap-first family history (relative + condition) + quick family screens. */
  familyHistory?: ClerkFamilyItem[];
  fhScreen?: Record<string, "yes" | "no" | "unsure">;
  /** Structured social / personal history (smoking pack-years, alcohol/CAGE, …). */
  socialHx?: ClerkSocial;
  /** Ideas / concerns / expectations. */
  ice?: ClerkIce;
  pmh?: string;
  /** Hutchison "retrospective history" prompt actioned. */
  retrospectiveChecked?: boolean;
  /** Uganda-relevant always-asks + classic chronic screen. */
  alwaysAsk?: Record<string, boolean | string>;
  drugHistory?: string;
  allergies?: ClerkAllergy[];
  medications?: ClerkMedication[];
  social?: {
    occupation?: string;
    smokingPackYears?: number;
    alcoholUnitsPerWeek?: number;
    cage?: Cage;
    recreationalDrugs?: string;
    functionContext?: string;
  };
  /** Review of systems — free text per system. */
  systematicEnquiry?: Record<string, string>;
}

export interface ClerkExamination {
  general?: string;
  consciousness?: string;
  peripheral?: string;
  /** Tap-first general examination — three-state findings (present/absent/
   * not-examined) + value-sets. See lib/clerkship/exam. */
  generalFindings?: ExamObservation[];
  /** A vital-signs set recorded at this exam (triage set is carried separately). */
  vitals?: RecordedVitals;
  /** Structured respiratory examination (tap-first IPPA + zonal). See lib/clerkship/exam/respiratory. */
  respiratory?: RespExam;
  /** Structured cardiovascular examination (tap-first I-P-A + structured murmurs). */
  cardiovascular?: CvsExam;
  /** Structured abdominal examination (tap-first full IPPA by region + organs + PR). */
  abdominal?: AbdoExam;
  /** Structured neurological examination (tap-first; structured grading + localisation). */
  neurological?: NeuroExam;
  /** Structured musculoskeletal examination (GALS + regional Look-Feel-Move). */
  musculoskeletal?: MskExam;
  /** Per-system exam (free text or IPPA), hypothesis-driven. */
  systems?: Record<string, string>;
}

export interface ClerkSynthesis {
  summary?: string;
  differential?: ClerkDifferential[];
  problems?: ClerkProblem[];
  investigations?: ClerkOrder[];
  managementPlan?: string;
  disposition?: "admit" | "discharge" | "refer" | "observe" | "transfer" | "deceased";
  safetyNetting?: string;
  consentNote?: string;
}

/** The full structured clerking — the `section_data` of a documentation version. */
export interface Clerkship {
  history?: ClerkHistory;
  examination?: ClerkExamination;
  synthesis?: ClerkSynthesis;
}

/* ─── Section model (drives the surface + completeness) ─────────────────── */
export type ClerkshipGroup = "history" | "examination" | "synthesis";
export interface ClerkshipSection {
  id: string;
  group: ClerkshipGroup;
  label: string;
  /** Hutchison reference anchor. */
  ref: string;
}

export const CLERKSHIP_SECTIONS: ClerkshipSection[] = [
  { id: "identifying", group: "history", label: "Identifying data + opening", ref: "Ch1 §1.1" },
  { id: "presentingComplaint", group: "history", label: "Presenting complaint", ref: "Ch1 §1.2" },
  {
    id: "hpc",
    group: "history",
    label: "History of presenting complaint (SOCRATES)",
    ref: "Ch1 §1.3",
  },
  { id: "pmh", group: "history", label: "Past medical & surgical history", ref: "Ch1 §1.4" },
  { id: "drugHistory", group: "history", label: "Drug history + allergies", ref: "Ch1 §1.5" },
  { id: "familyHistory", group: "history", label: "Family history", ref: "Ch1 §1.6" },
  { id: "social", group: "history", label: "Social & personal history (CAGE)", ref: "Ch1 §1.7" },
  { id: "systematicEnquiry", group: "history", label: "Systematic enquiry", ref: "Ch1 §1.8" },
  { id: "general", group: "examination", label: "General inspection", ref: "Ch2 §2.1" },
  { id: "peripheral", group: "examination", label: "Peripheral / general signs", ref: "Ch2 §2.2" },
  { id: "systems", group: "examination", label: "System examinations (IPPA)", ref: "Ch2/§3" },
  { id: "summary", group: "synthesis", label: "Summary / problem representation", ref: "Ch3 §3.1" },
  {
    id: "differential",
    group: "synthesis",
    label: "Differential (incl. must-not-miss)",
    ref: "Ch3 §3.2",
  },
  { id: "investigations", group: "synthesis", label: "Initial investigations", ref: "Ch3 §3.3" },
  {
    id: "managementPlan",
    group: "synthesis",
    label: "Management + disposition + safety-netting",
    ref: "Ch3 §3.4",
  },
];

/** Uganda-relevant always-ask items + the classic chronic screen (§1.4). */
export const ALWAYS_ASK_ITEMS = [
  { key: "hiv", label: "HIV status" },
  { key: "tb", label: "TB" },
  { key: "malaria", label: "Malaria" },
  { key: "sickleCell", label: "Sickle cell" },
  { key: "diabetes", label: "Diabetes" },
  { key: "hypertension", label: "Hypertension" },
  { key: "cardiacRespiratory", label: "Cardiac / respiratory disease" },
  { key: "strokeEpilepsy", label: "Stroke / epilepsy" },
  { key: "jaundiceHepatitis", label: "Jaundice / hepatitis" },
] as const;

/** Review-of-systems groups (§1.8). */
export const SYSTEMS_ENQUIRY = [
  "General",
  "Cardiovascular",
  "Respiratory",
  "Gastrointestinal",
  "Genitourinary",
  "Neurological",
  "Musculoskeletal",
  "Endocrine",
  "Skin",
] as const;

const UNIT_PER_WEEK_HARMFUL = 14; // a screening threshold to prompt CAGE (UK low-risk guideline)

/** CAGE positive-count (≥ 2 is clinically significant). */
export function cageScore(cage: Cage | undefined | null): number {
  if (!cage) return 0;
  return [cage.cutDown, cage.annoyed, cage.guilty, cage.eyeOpener].filter(Boolean).length;
}
export function cageSignificant(cage: Cage | undefined | null): boolean {
  return cageScore(cage) >= 2;
}
/** Whether the alcohol intake warrants the CAGE probe (decision-support prompt). */
export function alcoholExcessSuspected(unitsPerWeek: number | undefined | null): boolean {
  return unitsPerWeek != null && unitsPerWeek > UNIT_PER_WEEK_HARMFUL;
}

/* ─── SOAP mapping (interoperability) ──────────────────────────────────── */
export interface Soap {
  subjective: ClerkHistory | undefined;
  objective: { examination?: ClerkExamination; investigations?: ClerkOrder[] };
  assessment: { summary?: string; differential?: ClerkDifferential[] };
  plan: {
    investigations?: ClerkOrder[];
    managementPlan?: string;
    disposition?: string;
    safetyNetting?: string;
  };
}

export function clerkshipToSoap(c: Clerkship): Soap {
  return {
    subjective: c.history,
    objective: {
      examination: c.examination,
      investigations: c.synthesis?.investigations,
    },
    assessment: {
      summary: c.synthesis?.summary,
      differential: c.synthesis?.differential,
    },
    plan: {
      investigations: c.synthesis?.investigations,
      managementPlan: c.synthesis?.managementPlan,
      disposition: c.synthesis?.disposition,
      safetyNetting: c.synthesis?.safetyNetting,
    },
  };
}

/* ─── Clerkship → engine objects (reuse, no parallel store) ─────────────── */
export interface DerivedClinicalObjects {
  allergies: ClerkAllergy[];
  medications: ClerkMedication[];
  diagnoses: ClerkDifferential[];
  problems: ClerkProblem[];
  orders: ClerkOrder[];
  disposition: ClerkSynthesis["disposition"] | null;
}

/**
 * Derive the engine objects from a clerking — what the server persists into
 * patient_allergies / encounter_medications / encounter_diagnoses / problem_list
 * / encounter_orders + the encounter disposition. Pure: trims/filters empties;
 * never fabricates (an absent section yields an empty list, not a guess).
 */
export function deriveClinicalObjects(c: Clerkship): DerivedClinicalObjects {
  const allergies = (c.history?.allergies ?? []).filter((a) => a.substance?.trim());
  const medications = (c.history?.medications ?? []).filter((m) => m.name?.trim());
  const diagnoses = (c.synthesis?.differential ?? []).filter((d) => d.text?.trim());
  // PMH chronic/active conditions are part of the problem list (single source of
  // truth) — resolved ones are history only. Merge with the synthesis problems.
  const pmhProblems: ClerkProblem[] = (c.history?.pmhItems ?? [])
    .filter((p) => p.display?.trim() && p.status !== "resolved")
    .map((p) => ({ item: p.display, active: true }));
  const synthProblems = (c.synthesis?.problems ?? []).filter((p) => p.item?.trim());
  const seen = new Set<string>();
  const problems = [...pmhProblems, ...synthProblems].filter((p) => {
    const k = p.item.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const orders = (c.synthesis?.investigations ?? []).filter((o) => o.text?.trim());
  return {
    allergies,
    medications,
    diagnoses,
    problems,
    orders,
    disposition: c.synthesis?.disposition ?? null,
  };
}

/* ─── Completeness (honest empty states; never a blocking wizard) ──────── */
export interface SectionStatus {
  id: string;
  group: ClerkshipGroup;
  label: string;
  filled: boolean;
}

function historyFilled(h: ClerkHistory | undefined, id: string): boolean {
  if (!h) return false;
  switch (id) {
    case "identifying":
      return !!(h.identifying?.trim() || h.opening?.trim());
    case "presentingComplaint":
      return !!h.presentingComplaint?.trim();
    case "hpc":
      return !!(h.hpc?.trim() || (h.socrates && Object.values(h.socrates).some((v) => v?.trim())));
    case "pmh":
      return !!(
        h.pmh?.trim() ||
        h.retrospectiveChecked ||
        (h.alwaysAsk && Object.keys(h.alwaysAsk).length > 0)
      );
    case "drugHistory":
      return !!(
        h.drugHistory?.trim() ||
        (h.allergies?.length ?? 0) > 0 ||
        (h.medications?.length ?? 0) > 0
      );
    case "familyHistory":
      return (h.familyHistory?.length ?? 0) > 0 || !!(h.fhScreen && Object.keys(h.fhScreen).length);
    case "social":
      return !!(
        (h.socialHx && Object.values(h.socialHx).some((v) => v !== undefined)) ||
        (h.familyHistory?.length ?? 0) > 0 ||
        (h.fhScreen && Object.keys(h.fhScreen).length > 0) ||
        (h.social &&
          (h.social.occupation?.trim() ||
            h.social.smokingPackYears != null ||
            h.social.alcoholUnitsPerWeek != null ||
            h.social.functionContext?.trim()))
      );
    case "systematicEnquiry":
      return !!(h.systematicEnquiry && Object.values(h.systematicEnquiry).some((v) => v?.trim()));
    default:
      return false;
  }
}

function examFilled(e: ClerkExamination | undefined, id: string): boolean {
  if (!e) return false;
  if (id === "general") return !!(e.general?.trim() || e.consciousness?.trim());
  if (id === "peripheral") return !!e.peripheral?.trim();
  if (id === "systems") return !!(e.systems && Object.values(e.systems).some((v) => v?.trim()));
  return false;
}

function synthesisFilled(s: ClerkSynthesis | undefined, id: string): boolean {
  if (!s) return false;
  if (id === "summary") return !!s.summary?.trim();
  if (id === "differential") return (s.differential ?? []).some((d) => d.text?.trim());
  if (id === "investigations") return (s.investigations ?? []).some((o) => o.text?.trim());
  if (id === "managementPlan")
    return !!(s.managementPlan?.trim() || s.disposition || s.safetyNetting?.trim());
  return false;
}

export function clerkshipStatus(c: Clerkship): SectionStatus[] {
  return CLERKSHIP_SECTIONS.map((sec) => {
    const filled =
      sec.group === "history"
        ? historyFilled(c.history, sec.id)
        : sec.group === "examination"
          ? examFilled(c.examination, sec.id)
          : synthesisFilled(c.synthesis, sec.id);
    return { id: sec.id, group: sec.group, label: sec.label, filled };
  });
}

/** True when the clerking has any recorded content (an empty clerking persists
 *  nothing — honest empty state). */
export function clerkshipHasContent(c: Clerkship): boolean {
  return clerkshipStatus(c).some((s) => s.filled);
}

/* ─── Triage → clerkship seeding (continuation, not a blank restart) ────── */
/** The triage hand-off facts that seed a new clerking. The server maps the real
 *  triage row → this shape (decoupled so the mapper stays pure + testable). */
export interface TriageSeed {
  /** The patient's chief/presenting complaint from triage. */
  presentingComplaint?: string | null;
  /** Triage acuity band / level (e.g. "red"/"orange" or 1–5) — context only. */
  acuity?: string | null;
  /** Carried vitals snapshot (free-text summary or key=value pairs). */
  vitalsSummary?: string | null;
}

/**
 * Seed a clerking from the triage hand-off — so the clerking CONTINUES the
 * patient's journey rather than starting blank. Only seeds the opening + PC + an
 * acuity/vitals note into the HPC scaffold; it never fabricates history/exam.
 * The clinician edits/confirms everything (decision-support).
 */
export function seedClerkshipFromTriage(seed: TriageSeed): Clerkship {
  const history: ClerkHistory = {};
  if (seed.presentingComplaint?.trim()) {
    history.presentingComplaint = seed.presentingComplaint.trim();
  }
  const ctx: string[] = [];
  if (seed.acuity?.trim()) ctx.push(`Triage acuity: ${seed.acuity.trim()}`);
  if (seed.vitalsSummary?.trim())
    ctx.push(`Vitals carried from triage: ${seed.vitalsSummary.trim()}`);
  if (ctx.length > 0) history.opening = ctx.join(" · ");
  return Object.keys(history).length > 0 ? { history } : {};
}
