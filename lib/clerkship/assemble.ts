import type { BpStandard } from "@/lib/clerkship/exam/bp";
import type { RecordedVitals } from "@/lib/clerkship/exam/types";
import type { CapturedStateInput } from "@/lib/clerkship/reasoning/context";
import type { AbnormalItem } from "@/lib/clerkship/synthesis";

import { matchAbdoPatterns } from "@/lib/clerkship/exam/abdominal";
import { matchCvsPatterns } from "@/lib/clerkship/exam/cardiovascular";
import { matchEvfPatterns } from "@/lib/clerkship/exam/endo-vascular-foot";
import { matchMskPatterns } from "@/lib/clerkship/exam/musculoskeletal";
import { matchNeuroPatterns } from "@/lib/clerkship/exam/neurological";
import { matchRespPatterns } from "@/lib/clerkship/exam/respiratory";
import { assembleAbnormal, significantFindings } from "@/lib/clerkship/synthesis";

/**
 * The clerkship's vitals-up abnormal assembly — the SINGLE source used by both
 * the Assessment tab and the disposition cross-check. Pure: runs each system's
 * matchXPatterns cluster engine, collapses every system's significant findings
 * (the CSO eligibility rule) into the examination positives, and hands the lot
 * to `assembleAbnormal` (vitals → examination → ROS → background). Invents
 * nothing; not-examined never becomes normal.
 */
export function assembleClerkshipAbnormal(
  captured: CapturedStateInput,
  vitals: RecordedVitals,
  bpStandard: BpStandard,
): AbnormalItem[] {
  const pat = (ps: { label: string; mustNotMiss?: boolean; emergency?: boolean }[]) =>
    ps.map((p) => ({ label: p.label, mustNotMiss: p.mustNotMiss, emergency: p.emergency }));

  const exam = [
    {
      system: "Respiratory",
      positives: [],
      patterns: pat(matchRespPatterns(captured.respiratory)),
    },
    {
      system: "Cardiovascular",
      positives: [],
      patterns: pat(matchCvsPatterns(captured.cardiovascular)),
    },
    { system: "Abdominal", positives: [], patterns: pat(matchAbdoPatterns(captured.abdominal)) },
    {
      system: "Neurological",
      positives: [],
      patterns: pat(matchNeuroPatterns(captured.neurological)),
    },
    {
      system: "Musculoskeletal",
      positives: [],
      patterns: pat(matchMskPatterns(captured.musculoskeletal)),
    },
    {
      system: "Endo · vascular · foot",
      positives: [],
      patterns: pat(matchEvfPatterns(captured.endoVascularFoot)),
    },
  ];

  const examFindingsAll = [
    ...captured.examFindings,
    ...(captured.respiratory.findings ?? []),
    ...(captured.cardiovascular.findings ?? []),
    ...(captured.abdominal.findings ?? []),
    ...(captured.neurological.findings ?? []),
    ...(captured.musculoskeletal.findings ?? []),
    ...(captured.endoVascularFoot.findings ?? []),
  ];
  const examPositives = Array.from(new Set(significantFindings(examFindingsAll)));

  return assembleAbnormal({
    vitals,
    bpStandard,
    exam: [{ system: "Examination", positives: examPositives, patterns: [] }, ...exam],
    rosPositives: captured.ros
      .filter((o) => o.status === "present")
      .map((o) => ({ symptomDisplay: o.symptomDisplay, system: o.system })),
    background: captured.pmhConditions,
  });
}

/**
 * The must-not-miss / emergency EXAM patterns the cluster engines matched — the
 * red-flag input to the disposition cross-check. Derived from the same assembly
 * so the two surfaces can never disagree.
 */
export function examEmergencyLabels(items: AbnormalItem[]): string[] {
  return items
    .filter((i) => i.source === "examination" && (i.mustNotMiss || i.severity === "critical"))
    .map((i) => i.label);
}
