/**
 * Clerkship agent — engine types. Pure, client-safe (NO server-only import).
 * Decision-support only: insights are emitted from PRESENT findings, never from
 * not-asked / not-examined, and every insight carries a cited sourceRef.
 * See docs/design/clerkship-agent-gate-a.md.
 */
import type { AbdoExam } from "@/lib/clerkship/exam/abdominal";
import type { BpStandard } from "@/lib/clerkship/exam/bp";
import type { CvsExam } from "@/lib/clerkship/exam/cardiovascular";
import type { EvfExam } from "@/lib/clerkship/exam/endo-vascular-foot";
import type { MskExam } from "@/lib/clerkship/exam/musculoskeletal";
import type { NeuroExam } from "@/lib/clerkship/exam/neurological";
import type { RespExam } from "@/lib/clerkship/exam/respiratory";
import type { ExamObservation, RecordedVitals } from "@/lib/clerkship/exam/types";
import type { RosObservation } from "@/lib/clerkship/ros";
import type { CapturedSymptom } from "@/lib/clerkship/symptom-engine";

export type ClerkArea =
  | "complaint"
  | "ros"
  | "background"
  | "vitals"
  | "general"
  | "cardiovascular"
  | "respiratory"
  | "abdominal"
  | "neurological"
  | "musculoskeletal"
  | "endovascular"
  | "assessment";

export type InsightKind =
  | "association"
  | "expected-sign"
  | "must-check"
  | "incompatible"
  | "combination"
  | "vital-flag"
  | "diagnosis";

export type Severity = "info" | "amber" | "red";
export type ProvenanceFrom = "hpc" | "ros" | "exam" | "vitals" | "background";

export interface EvidenceItem {
  label: string;
  from: ProvenanceFrom;
  code?: string;
}
export interface ExpectItem {
  label: string;
  area: ClerkArea;
  code?: string;
  why?: string;
}
export interface ExcludeItem {
  label: string;
  area: ClerkArea;
  code: string;
  reason: string;
}
export interface SourceRef {
  pack: string;
  entryId: string;
  citation: string;
}

export interface Insight {
  id: string;
  kind: InsightKind;
  severity: Severity;
  target: { area: ClerkArea; field?: string };
  message: string;
  evidence: EvidenceItem[];
  expects?: ExpectItem[];
  excludes?: ExcludeItem[];
  suggests?: { dx: string; icd10?: string; mustNotMiss?: boolean };
  discriminators?: ExpectItem[];
  /** Diagnosis ranking score (higher = better supported). Diagnosis insights only. */
  score?: number;
  sourceRef: SourceRef;
}

export interface AgentReport {
  insights: Insight[];
}

export interface AgentConfig {
  enabled: boolean;
  activePacks: {
    maps: boolean;
    vitalsEscalation: boolean;
    incompatibilities: boolean;
    dependencies: boolean;
  };
}

/** Engine input — the subset of the clerkship form state the agent consumes. */
export interface AgentInput {
  hpcItems: CapturedSymptom[];
  ros: RosObservation[];
  pmhItems: { code?: string; display?: string }[];
  pmhScreen: Record<string, "yes" | "no" | "unsure">;
  examVitals: RecordedVitals;
  bpStandard: BpStandard;
  examGeneralFindings: ExamObservation[];
  examRespiratory: RespExam;
  examCardiovascular: CvsExam;
  examAbdominal: AbdoExam;
  examNeurological: NeuroExam;
  examMusculoskeletal: MskExam;
  examEndoVascularFoot: EvfExam;
}

/** A normalized index of present/denied features for matching. */
export interface FeatureIndex {
  /** normalized display tokens that are PRESENT (lowercased, guillemets stripped). */
  presentDisplays: Set<string>;
  /** normalized display tokens explicitly DENIED / absent. */
  deniedDisplays: Set<string>;
  /** symptom codes of the presenting complaint(s). */
  complaintCodes: Set<string>;
  /** provenance for a present display token (best-effort, first writer wins). */
  provenance: Map<string, EvidenceItem>;
}

/* ── Pack rule types (the cited JSON, adapted) ───────────────────────────── */

export interface MapDifferential {
  dx: string;
  likelihood: string; // "must_not_miss" | "likely" | "less_likely" | ...
  ruleIn: string[];
  ruleOut: string[];
  supportingSymptoms: { system: string; symptom: string }[];
  refutingSymptoms: { system: string; symptom: string }[];
  riskFactors: string[];
}
export interface MapExamTarget {
  area: string;
  sign: string;
  discriminates: string;
}
export interface MapCombination {
  features: string[];
  suggests: string;
  action?: string;
  mustNotMiss?: boolean;
}
export interface ReasoningMap {
  code: string;
  display: string;
  triggerCodes: string[];
  associated: string[];
  redFlags: string[];
  examTargets: MapExamTarget[];
  differential: MapDifferential[];
  combinations?: MapCombination[];
}

export interface IncompatibilityRule {
  id: string;
  when: { area: ClerkArea; sign: string; zone?: string };
  implausible: { area: ClerkArea; sign: string; zone?: string }[];
  reason: string;
  citation: string;
}
export interface DependencyRule {
  id: string;
  when: { area: ClerkArea; sign: string };
  mustCheck: { area: ClerkArea; sign: string; why: string }[];
  citation: string;
}
export interface VitalsEscalationRule {
  id: string;
  vital: string; // "bp" | "spo2" | "rr" | "hr" | "temp" | "glucose" | "gcs"
  trigger: {
    metric: string;
    comparator: ">=" | "<=" | "<" | ">";
    systolic?: number;
    diastolic?: number;
    value?: number;
  };
  baseTier: { label: string; severity: Severity; ddx: string[]; action: string };
  escalation: {
    /**
     * Accompanying clinical features that escalate the base tier. `feature` is the
     * cited human-readable prose; `match` are the catalog DISPLAY tokens (normalized
     * + matched against the feature index) that make it fire. No `match` → the
     * prose itself is matched (rare). Unmappable features carry `match: []` — shown
     * for context but never auto-fire (honest: no fabricated match).
     */
    anyOf: { feature: string; match?: string[] }[];
    tier: { label: string; severity: Severity; ddx: string[]; action: string };
  };
  citation: string;
}

export interface AgentPacks {
  maps: ReasoningMap[];
  incompatibilities: IncompatibilityRule[];
  dependencies: DependencyRule[];
  vitalsEscalation: VitalsEscalationRule[];
}
