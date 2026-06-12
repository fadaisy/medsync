import type { CapturedContext } from "./types";
import type { AbdoExam } from "@/lib/clerkship/exam/abdominal";
import type { CvsExam } from "@/lib/clerkship/exam/cardiovascular";
import type { EvfExam } from "@/lib/clerkship/exam/endo-vascular-foot";
import type { MskExam } from "@/lib/clerkship/exam/musculoskeletal";
import type { NeuroExam } from "@/lib/clerkship/exam/neurological";
import type { RespExam } from "@/lib/clerkship/exam/respiratory";
import type { ExamObservation } from "@/lib/clerkship/exam/types";
import type { RosObservation } from "@/lib/clerkship/ros";
import type { CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import type { ClerkSocial } from "@/lib/encounter/clerkship";

import { abdoReasoningTokens } from "@/lib/clerkship/exam/abdominal";
import { cvsReasoningTokens } from "@/lib/clerkship/exam/cardiovascular";
import { evfReasoningTokens } from "@/lib/clerkship/exam/endo-vascular-foot";
import { examReasoningTokens } from "@/lib/clerkship/exam/engine";
import { mskReasoningTokens } from "@/lib/clerkship/exam/musculoskeletal";
import { neuroReasoningTokens } from "@/lib/clerkship/exam/neurological";
import { respReasoningTokens } from "@/lib/clerkship/exam/respiratory";

/**
 * Build the reasoning engine's CapturedContext from the live clerkship state —
 * the ONE place this assembly lives (the reasoning rail AND the Assessment
 * synthesis both call it; no duplicate logic). Pure.
 */
export interface CapturedStateInput {
  hpcItems: CapturedSymptom[];
  ros: RosObservation[];
  pmhConditions: string[];
  fhScreen: Record<string, "yes" | "no" | "unsure">;
  social: ClerkSocial;
  examFindings: ExamObservation[];
  respiratory: RespExam;
  cardiovascular: CvsExam;
  abdominal: AbdoExam;
  neurological: NeuroExam;
  musculoskeletal: MskExam;
  endoVascularFoot: EvfExam;
}

function socialTokens(s: ClerkSocial | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  if (s.smokingStatus === "current" || s.smokingStatus === "ex") out.push("smoking", "smoker");
  if (s.alcoholStatus === "regular" || s.alcoholStatus === "ex") out.push("alcohol");
  if (s.drugUse === "current" || s.drugUse === "past") out.push("recreational drugs", "IVDU");
  if (s.occupation) out.push(s.occupation);
  if (s.exposures?.length) out.push(...s.exposures);
  return out;
}

export function buildCapturedContext(s: CapturedStateInput): CapturedContext {
  const features = s.hpcItems.flatMap((i) => [
    i.symptomDisplay,
    ...i.properties.flatMap((p) => [...(p.labels ?? []), p.text ?? ""]),
  ]);
  const fhYes = Object.entries(s.fhScreen)
    .filter(([, v]) => v === "yes")
    .map(([k]) => k.replace(/_/g, " "));
  const fhNo = Object.entries(s.fhScreen)
    .filter(([, v]) => v === "no")
    .map(([k]) => k.replace(/_/g, " "));
  const exam = examReasoningTokens(s.examFindings);
  const resp = respReasoningTokens(s.respiratory);
  const cvs = cvsReasoningTokens(s.cardiovascular);
  const abdo = abdoReasoningTokens(s.abdominal);
  const neuro = neuroReasoningTokens(s.neurological);
  const msk = mskReasoningTokens(s.musculoskeletal);
  const evf = evfReasoningTokens(s.endoVascularFoot);
  return {
    features,
    positives: [
      ...s.ros.filter((o) => o.status === "present").map((o) => o.symptomDisplay),
      ...fhYes,
      ...exam.positives,
      ...resp.positives,
      ...cvs.positives,
      ...abdo.positives,
      ...neuro.positives,
      ...msk.positives,
      ...evf.positives,
    ],
    negatives: [
      ...s.ros.filter((o) => o.status === "denies").map((o) => o.symptomDisplay),
      ...fhNo,
      ...exam.negatives,
    ],
    history: [...s.pmhConditions, ...fhYes, ...socialTokens(s.social)],
  };
}
