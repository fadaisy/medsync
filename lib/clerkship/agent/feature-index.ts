import type {
  AgentInput,
  EvidenceItem,
  FeatureIndex,
  ProvenanceFrom,
} from "@/lib/clerkship/agent/types";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";
import { bmi } from "@/lib/clerkship/exam/types";

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

  // Structured exam signs (percussion notes, pulse rhythm, organ palpability,
  // tone/reflexes/plantar, …) live in scalar/per-zone fields that are NOT in the
  // findings[] arrays — index them as semantic tokens so the agent can reason on
  // them (sign-incompatibilities / must-check dependencies, and richer dx matching).
  indexStructuredExam(input, idx);

  // Recorded vitals + anthropometry → threshold tokens (ADR 0078). Before this,
  // examVitals reached only vitalFlags, so a random glucose could not rank a new
  // diabetic and a BMI could not rank a wasting diagnosis.
  indexVitals(input, idx);

  return idx;
}

/* ── structured-exam → semantic tokens (see docs/clinical/agent token scheme) ── */

const strVals = (rec: unknown): string[] =>
  rec && typeof rec === "object"
    ? Object.values(rec as Record<string, unknown>).filter(
        (v): v is string => typeof v === "string",
      )
    : [];
const numVals = (rec: unknown): number[] =>
  rec && typeof rec === "object"
    ? Object.values(rec as Record<string, unknown>).filter(
        (v): v is number => typeof v === "number",
      )
    : [];
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function indexStructuredExam(input: AgentInput, idx: FeatureIndex) {
  const tok = (t: string) => add(idx, t, { label: t, from: "exam" });

  // Respiratory (per-zone)
  const resp = input.examRespiratory as Record<string, unknown>;
  const perc = strVals(resp.percussion);
  if (perc.includes("dull")) tok("dull percussion");
  if (perc.includes("stony_dull")) tok("stony dull percussion");
  if (perc.includes("hyper_resonant")) tok("hyper-resonant percussion");
  const bs = strVals(resp.breathSounds);
  if (bs.includes("bronchial")) tok("bronchial breath sounds");
  if (bs.includes("reduced")) tok("reduced breath sounds");
  if (bs.includes("absent")) tok("absent breath sounds");
  const vr = strVals(resp.vocalResonance);
  if (vr.includes("increased")) tok("increased vocal resonance");
  if (vr.includes("reduced")) tok("reduced vocal resonance");
  if (strVals(resp.expansion).includes("reduced")) tok("reduced expansion");
  if (resp.trachea === "deviated_right" || resp.trachea === "deviated_left")
    tok("deviated trachea");

  // Cardiovascular
  const cvs = input.examCardiovascular as Record<string, unknown>;
  if (cvs.pulseRhythm === "irregularly_irregular") tok("irregularly irregular pulse");
  if (cvs.pulseRhythm === "regularly_irregular") tok("regularly irregular pulse");
  if (cvs.pulseCharacter === "collapsing") tok("collapsing pulse");
  if (cvs.pulseCharacter === "slow_rising") tok("slow-rising pulse");
  if (cvs.jvp === "raised") tok("raised jvp");
  if (cvs.apexLocation === "displaced") tok("displaced apex");
  if (cvs.apexCharacter === "heaving") tok("heaving apex");
  if (cvs.apexCharacter === "tapping") tok("tapping apex");
  if (cvs.apexCharacter === "thrusting") tok("thrusting apex");
  if (cvs.s1 === "loud") tok("loud s1");
  if (cvs.s1 === "soft") tok("soft s1");
  const murmurs = asArr(cvs.murmurs);
  if (murmurs.length) {
    tok("cardiac murmur");
    const timings = murmurs.map((m) =>
      m && typeof m === "object" ? (m as Record<string, unknown>).timing : undefined,
    );
    if (
      timings.some((t) => t === "ejection_systolic" || t === "pansystolic" || t === "late_systolic")
    )
      tok("systolic murmur");
    if (timings.some((t) => t === "early_diastolic" || t === "mid_diastolic"))
      tok("diastolic murmur");
  }

  // Abdominal
  const abdo = input.examAbdominal as Record<string, unknown>;
  if (abdo.tenderness && typeof abdo.tenderness === "object" && Object.keys(abdo.tenderness).length)
    tok("abdominal tenderness");
  if (strVals(abdo.guarding).includes("involuntary")) tok("involuntary guarding");
  if (abdo.rigidity === "board_like") tok("board-like rigidity");
  if (abdo.rigidity === "localised") tok("localised rigidity");
  if (abdo.rebound === true) tok("rebound tenderness");
  const liver = abdo.liver as Record<string, unknown> | undefined;
  if (liver?.palpable === true) tok("hepatomegaly");
  const spleen = abdo.spleen as Record<string, unknown> | undefined;
  if (spleen?.palpable === true) tok("splenomegaly");
  if (abdo.shiftingDullness === true || abdo.fluidThrill === true) tok("ascites");
  if (abdo.bowelSounds === "absent") tok("absent bowel sounds");
  if (abdo.bowelSounds === "tinkling") tok("tinkling bowel sounds");
  if (abdo.aortaExpansile === true) tok("pulsatile mass");

  // Neurological
  const neuro = input.examNeurological as Record<string, unknown>;
  const tone = strVals(neuro.tone);
  if (tone.includes("spastic")) tok("spastic tone");
  if (tone.includes("flaccid")) tok("flaccid tone");
  if (tone.includes("rigid")) tok("rigid tone");
  if (numVals(neuro.power).some((v) => v < 5)) tok("focal limb weakness");
  const reflexes = strVals(neuro.reflexes);
  if (reflexes.includes("absent")) tok("absent reflexes");
  if (reflexes.includes("brisk") || reflexes.includes("clonus")) tok("brisk reflexes");
  if (strVals(neuro.plantar).includes("up")) tok("upgoing plantar");
  if (neuro.sensoryPattern === "sensory_level") tok("sensory level");
  if (neuro.wasting === true) tok("wasting");
  if (neuro.fasciculations === true) tok("fasciculations");
  if (asArr(neuro.meningism).length) tok("meningism");
  // facial weakness — a present cn_vii (VII — facial) finding with a UMN/LMN
  // forehead value (its value chips both contain "forehead").
  const neuroFindings = asArr(neuro.findings) as {
    code?: string;
    state?: string;
    values?: string[];
  }[];
  if (
    neuroFindings.some(
      (f) =>
        f?.code === "cn_vii" &&
        f?.state === "present" &&
        (f.values ?? []).some((v) => /forehead/i.test(String(v))),
    )
  )
    tok("facial weakness");

  // General — nodes → lymphadenopathy (clubbing / pallor / jaundice already index
  // via their finding value chips).
  const nodeCodes = new Set([
    "cervical_nodes",
    "supraclavicular_nodes",
    "axillary_nodes",
    "inguinal_nodes",
    "epitrochlear_nodes",
  ]);
  if (input.examGeneralFindings.some((f) => f.state === "present" && nodeCodes.has(f.code)))
    tok("lymphadenopathy");
}

/* ── recorded vitals + anthropometry → threshold tokens (ADR 0078) ──
 *
 * Every threshold here is a NAMED, cited cut-off, never an invented one, and a
 * token is emitted ONLY when the measurement was actually recorded — a missing
 * vital is never treated as normal, which is the same not-measured-is-not-normal
 * rule the rest of the clerkship follows. Tokens are one-directional facts
 * ("febrile 38 or above"), so a weight file opts in explicitly; nothing changes
 * for a complaint that does not reference them. */
function indexVitals(input: AgentInput, idx: FeatureIndex) {
  const v = input.examVitals;
  if (!v) return;
  const tok = (t: string) => add(idx, t, { label: t, from: "vitals" });

  // Glucose — WHO/ADA diagnostic threshold for diabetes, and the ADA level-1
  // hypoglycaemia alert value. WHO severe-malaria hypoglycaemia is < 2.2.
  if (v.glucose != null) {
    if (v.glucose >= 11.1) tok("random glucose over 11.1");
    if (v.glucose < 3.9) tok("glucose under 3.9");
    if (v.glucose < 2.2) tok("glucose under 2.2");
  }

  // Temperature — WHO fever definition (>= 38.0) and NEWS2 low-temperature band.
  if (v.tempC != null) {
    if (v.tempC >= 38) tok("febrile 38 or above");
    if (v.tempC < 36) tok("hypothermic under 36");
  }

  // Haemodynamics — NEWS2 / sepsis-screen cut-offs.
  if (v.sbp != null && v.sbp < 90) tok("systolic under 90");
  if (v.hr != null && v.hr > 100) tok("tachycardia over 100");
  if (v.hr != null && v.hr < 50) tok("bradycardia under 50");
  if (v.spo2 != null && v.spo2 < 92) tok("hypoxia under 92");

  // Anthropometry — WHO adult BMI cut-offs (underweight < 18.5; severe thinness
  // < 16) and the adult MUAC cut-off used by Ugandan TB/HIV nutrition programmes.
  const b = bmi(v);
  if (b != null) {
    if (b < 18.5) tok("bmi under 18.5");
    if (b < 16) tok("bmi under 16");
  }
  if (v.muacCm != null && v.muacCm < 23) tok("muac under 23");
}
