import type {
  AgentInput,
  EvidenceItem,
  FeatureIndex,
  ProvenanceFrom,
} from "@/lib/clerkship/agent/types";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";

function add(idx: FeatureIndex, raw: string, ev: EvidenceItem) {
  const t = normalizeFeature(raw);
  if (!t) return;
  idx.presentDisplays.add(t);
  if (!idx.provenance.has(t)) idx.provenance.set(t, ev);
}

export function buildFeatureIndex(input: AgentInput): FeatureIndex {
  const idx: FeatureIndex = {
    presentDisplays: new Set(),
    deniedDisplays: new Set(),
    complaintCodes: new Set(),
    provenance: new Map(),
  };

  // HPC — symptom display + every captured property label.
  for (const s of input.hpcItems) {
    if (s.symptomCode) idx.complaintCodes.add(s.symptomCode);
    const ev: EvidenceItem = { label: s.symptomDisplay, from: "hpc", code: s.symptomCode };
    add(idx, s.symptomDisplay, ev);
    for (const p of s.properties ?? []) {
      for (const lbl of p.labels ?? []) add(idx, lbl, { label: lbl, from: "hpc" });
    }
  }

  // ROS — present → present; denies → denied.
  for (const o of input.ros) {
    if (o.status === "present") {
      add(idx, o.symptomDisplay, { label: o.symptomDisplay, from: "ros", code: o.symptomCode });
      for (const p of o.properties ?? [])
        for (const lbl of p.labels ?? []) add(idx, lbl, { label: lbl, from: "ros" });
    } else if (o.status === "denies") {
      const t = normalizeFeature(o.symptomDisplay);
      if (t) idx.deniedDisplays.add(t);
    }
  }

  // Background — PMH free items + the chronic screen (yes only).
  for (const it of input.pmhItems) {
    if (it.display) add(idx, it.display, { label: it.display, from: "background", code: it.code });
  }
  for (const [key, val] of Object.entries(input.pmhScreen)) {
    if (val === "yes") add(idx, key, { label: key, from: "background", code: key });
  }

  // Exam — only PRESENT three-state findings + their value chips.
  const indexExam = (
    obs: { code: string; display: string; state: string; values?: string[] }[],
    from: ProvenanceFrom,
  ) => {
    for (const o of obs) {
      if (o.state !== "present") continue;
      add(idx, o.display, { label: o.display, from, code: o.code });
      for (const v of o.values ?? []) add(idx, v, { label: v, from });
    }
  };
  indexExam(input.examGeneralFindings, "exam");
  // Structured exams (resp/cvs/abdo/neuro/msk/evf) commonly carry a `findings: ExamObservation[]`.
  for (const exam of [
    input.examRespiratory,
    input.examCardiovascular,
    input.examAbdominal,
    input.examNeurological,
    input.examMusculoskeletal,
    input.examEndoVascularFoot,
  ] as {
    findings?: { code: string; display: string; state: string; values?: string[] }[];
  }[]) {
    if (exam?.findings) indexExam(exam.findings, "exam");
  }

  return idx;
}
