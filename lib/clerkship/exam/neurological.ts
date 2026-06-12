/**
 * Neurological Examination — domain module (types + catalog + structured grading
 * + localisation engine). The largest system-specific exam layer onto the general
 * exam (resp/CVS/abdo pattern; ADRs 0067–0069). Tap-first, structured grading
 * (GCS E/V/M · MRC power 0–5 · reflex grades · tone · plantar), motor/sensory/
 * reflexes by limb & side. The sign-cluster → LOCALISATION matcher is PURE +
 * DECISION-SUPPORT: UMN vs LMN and where in the neuraxis — surfaces the
 * localisation(s) a cluster fits, MULTIPLE on ambiguity, must-not-miss flagged
 * (acute stroke / raised ICP / cord compression / cauda equina / meningism /
 * GCS ≤8) — and NEVER auto-diagnoses. Consistent with the resus Disability step
 * + the confusion/focal_weakness reasoning maps ("Don't Ever Forget Glucose").
 * Uganda differentials woven in (HIV CNS infections, cerebral malaria, TB
 * meningitis, Pott's, neuropathy). CSO-signed catalog; Hutchison Ch 16. ADR 0070.
 */

import type { ExamFinding, ExamObservation } from "@/lib/clerkship/exam/types";

import { gcsTotal } from "@/lib/clerkship/exam/types";

export type NeuroLimb = "r_arm" | "l_arm" | "r_leg" | "l_leg";
export type NeuroSide = "right" | "left";
export type Tone = "normal" | "spastic" | "rigid" | "flaccid";
export type ReflexGrade = "absent" | "reduced" | "normal" | "brisk" | "clonus";
export type Plantar = "down" | "up" | "equivocal";
export type PowerPattern = "pyramidal" | "proximal" | "distal" | "global" | "focal";
export type SensoryPattern =
  | "normal"
  | "dermatomal"
  | "single_nerve"
  | "glove_and_stocking"
  | "sensory_level"
  | "hemisensory"
  | "dissociated";
export type GaitType =
  | "normal"
  | "hemiplegic"
  | "spastic"
  | "parkinsonian"
  | "ataxic"
  | "high_stepping"
  | "waddling"
  | "antalgic"
  | "apraxic";

export const NEURO_LIMBS: { limb: NeuroLimb; label: string; short: string; side: NeuroSide }[] = [
  { limb: "r_arm", label: "Right arm", short: "R arm", side: "right" },
  { limb: "l_arm", label: "Left arm", short: "L arm", side: "left" },
  { limb: "r_leg", label: "Right leg", short: "R leg", side: "right" },
  { limb: "l_leg", label: "Left leg", short: "L leg", side: "left" },
];

export const TONE_OPTS: { value: Tone; label: string; abnormal: boolean }[] = [
  { value: "normal", label: "Normal", abnormal: false },
  { value: "spastic", label: "Spastic (UMN)", abnormal: true },
  { value: "rigid", label: "Rigid / cogwheel", abnormal: true },
  { value: "flaccid", label: "Flaccid (LMN)", abnormal: true },
];
export const REFLEX_OPTS: { value: ReflexGrade; label: string; abnormal: boolean }[] = [
  { value: "absent", label: "Absent", abnormal: true },
  { value: "reduced", label: "Reduced", abnormal: true },
  { value: "normal", label: "Normal", abnormal: false },
  { value: "brisk", label: "Brisk", abnormal: true },
  { value: "clonus", label: "Clonus", abnormal: true },
];
export const POWER_PATTERN_OPTS: { value: PowerPattern; label: string }[] = [
  { value: "pyramidal", label: "Pyramidal (UMN)" },
  { value: "proximal", label: "Proximal (myopathy)" },
  { value: "distal", label: "Distal (neuropathy)" },
  { value: "global", label: "Global" },
  { value: "focal", label: "Focal" },
];
export const SENSORY_PATTERN_OPTS: { value: SensoryPattern; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "dermatomal", label: "Dermatomal (root)" },
  { value: "single_nerve", label: "Single nerve" },
  { value: "glove_and_stocking", label: "Glove & stocking" },
  { value: "sensory_level", label: "Sensory level (cord)" },
  { value: "hemisensory", label: "Hemisensory (cortical)" },
  { value: "dissociated", label: "Dissociated" },
];
export const GAIT_OPTS: { value: GaitType; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "hemiplegic", label: "Hemiplegic (circumduction)" },
  { value: "spastic", label: "Spastic / scissoring" },
  { value: "parkinsonian", label: "Parkinsonian (shuffling)" },
  { value: "ataxic", label: "Ataxic (broad-based)" },
  { value: "high_stepping", label: "High-stepping (foot drop)" },
  { value: "waddling", label: "Waddling (proximal)" },
  { value: "antalgic", label: "Antalgic" },
  { value: "apraxic", label: "Apraxic (frontal/NPH)" },
];
export const DANISH_OPTS = [
  "dysdiadochokinesia",
  "ataxia",
  "nystagmus",
  "intention tremor",
  "scanning speech",
  "heel-shin impaired",
] as const;
export const MENINGISM_OPTS = ["neck stiffness", "Kernig's sign", "Brudzinski's sign"] as const;
export const CAUDA_OPTS = [
  "saddle anaesthesia",
  "reduced anal tone",
  "bilateral leg signs",
  "urinary retention / incontinence",
] as const;

/** The captured neuro exam (section_data; no migration). */
export interface NeuroExam {
  /** Non-graded three-state findings (higher function / cranial nerves / special). */
  findings?: ExamObservation[];
  /** GCS by component (reuses gcsTotal). */
  gcsE?: number;
  gcsV?: number;
  gcsM?: number;
  wasting?: boolean;
  fasciculations?: boolean;
  tone?: Partial<Record<NeuroLimb, Tone>>;
  power?: Partial<Record<NeuroLimb, number>>;
  powerPattern?: PowerPattern;
  reflexes?: Partial<Record<NeuroLimb, ReflexGrade>>;
  plantar?: Partial<Record<NeuroSide, Plantar>>;
  sensoryPattern?: SensoryPattern;
  romberg?: "positive" | "negative";
  gait?: GaitType;
  cerebellarSigns?: string[];
  meningism?: string[];
  caudaEquina?: string[];
}

// ── Non-graded finding catalog (consciousness/pupils overlap reused from general) ──
export const NEURO_GROUPS = [
  { key: "neuro_higher", label: "Higher function & speech" },
  { key: "neuro_cn", label: "Cranial nerves" },
  { key: "neuro_special", label: "Special signs" },
] as const;

const f = (
  code: string,
  group: string,
  display: string,
  kind: "select" | "panel",
  options: string[],
  extra: Partial<ExamFinding> = {},
): ExamFinding => ({ code, group, display, kind, options, ...extra });

export const NEURO_FINDINGS: ExamFinding[] = [
  // ── §1 higher function ──
  f("orientation", "neuro_higher", "Orientation", "select", ["oriented", "disoriented"]),
  f("cognition", "neuro_higher", "Cognition", "panel", [
    "attention impaired",
    "short-term memory impaired",
    "frontal-lobe signs",
  ]),
  f("speech", "neuro_higher", "Speech & language", "panel", [
    "expressive dysphasia (Broca)",
    "receptive dysphasia (Wernicke)",
    "global dysphasia",
    "dysarthria",
    "dysphonia",
  ]),
  f("higher_cortical", "neuro_higher", "Higher cortical", "panel", [
    "neglect",
    "dyspraxia",
    "agnosia",
    "Gerstmann's",
  ]),
  // ── §2 cranial nerves ──
  f(
    "cn_fundi",
    "neuro_cn",
    "II — fundoscopy",
    "panel",
    ["papilloedema", "optic atrophy", "hypertensive changes"],
    { mustNotMiss: true },
  ),
  f("cn_fields", "neuro_cn", "II — visual fields / acuity", "panel", [
    "field defect",
    "reduced acuity",
    "RAPD",
  ]),
  f("cn_eyes", "neuro_cn", "III/IV/VI — eye movements", "panel", [
    "diplopia",
    "nystagmus",
    "ptosis",
    "III palsy (down-and-out)",
    "Horner's",
  ]),
  f("cn_v", "neuro_cn", "V — trigeminal", "panel", [
    "facial sensory loss",
    "weak muscles of mastication",
    "absent corneal reflex",
  ]),
  f("cn_vii", "neuro_cn", "VII — facial", "select", [
    "normal",
    "UMN (forehead spared)",
    "LMN (forehead involved / Bell's)",
  ]),
  f("cn_viii", "neuro_cn", "VIII — hearing", "panel", [
    "reduced hearing",
    "conductive (Rinne/Weber)",
    "sensorineural (Rinne/Weber)",
  ]),
  f("cn_ixx", "neuro_cn", "IX/X — palate / swallow", "panel", [
    "uvula deviation",
    "absent gag",
    "impaired swallow",
    "bulbar speech",
  ]),
  f("cn_xi", "neuro_cn", "XI — accessory", "panel", ["weak SCM / trapezius"]),
  f("cn_xii", "neuro_cn", "XII — tongue", "panel", ["wasting", "fasciculation", "deviation"]),
  // ── §3 motor inspection extras handled as structured fields; coordination here ──
  f("coordination", "neuro_special", "Coordination", "panel", [
    "finger-nose past-pointing",
    "dysdiadochokinesia",
    "heel-shin impaired",
    "intention tremor",
  ]),
  f("involuntary", "neuro_special", "Involuntary movements", "panel", [
    "resting tremor",
    "chorea",
    "myoclonus",
    "fasciculations",
  ]),
  f("fatigable", "neuro_special", "Fatigable weakness (myasthenia)", "panel", [], {
    mustNotMiss: true,
  }),
];

// ── Sign-cluster → localisation (decision-support reference; CSO-signed) ──
export interface NeuroPattern {
  key: string;
  label: string;
  signature: string;
  mustNotMiss?: boolean;
  emergency?: boolean;
}

export const NEURO_PATTERNS: Record<string, NeuroPattern> = {
  reduced_gcs: {
    key: "reduced_gcs",
    label: "GCS ≤8 — secure the airway",
    signature: "GCS ≤8 → airway emergency (resus Disability → back to A) + check glucose",
    mustNotMiss: true,
    emergency: true,
  },
  raised_icp: {
    key: "raised_icp",
    label: "Raised intracranial pressure",
    signature: "Papilloedema + reduced GCS (± Cushing's response) — urgent imaging; do not LP",
    mustNotMiss: true,
    emergency: true,
  },
  cord_compression: {
    key: "cord_compression",
    label: "Spinal cord compression",
    signature:
      "Sensory level + bilateral signs + UMN below the level + bladder/bowel — EMERGENCY (Uganda: Pott's/TB spine, malignancy, trauma)",
    mustNotMiss: true,
    emergency: true,
  },
  cauda_equina: {
    key: "cauda_equina",
    label: "Cauda equina syndrome",
    signature:
      "Saddle anaesthesia + reduced anal tone + bilateral leg signs + bladder — EMERGENCY; urgent MRI",
    mustNotMiss: true,
    emergency: true,
  },
  meningism: {
    key: "meningism",
    label: "Meningism (meningitis / SAH)",
    signature:
      "Neck stiffness / Kernig's / Brudzinski's — do not delay; consider meningitis or SAH",
    mustNotMiss: true,
  },
  stroke: {
    key: "stroke",
    label: "Acute stroke (UMN, cortical)",
    signature:
      "UMN signs + face/arm/leg one side ± dysphasia/neglect, sudden — TIME-CRITICAL: onset time, FAST, glucose, CT head",
    mustNotMiss: true,
  },
  umn: {
    key: "umn",
    label: "Upper motor neurone lesion",
    signature:
      "Spastic tone · hyperreflexia · upgoing plantar · clonus · pyramidal weakness; no wasting",
  },
  lmn: {
    key: "lmn",
    label: "Lower motor neurone lesion",
    signature:
      "Flaccid tone · hypo/areflexia · downgoing/absent plantar · wasting · fasciculations",
  },
  cerebellar: {
    key: "cerebellar",
    label: "Cerebellar lesion",
    signature:
      "DANISH (ipsilateral) — ataxia, intention tremor, nystagmus, dysdiadochokinesis, scanning speech",
  },
  parkinsonism: {
    key: "parkinsonism",
    label: "Parkinsonism (extrapyramidal)",
    signature: "Cogwheel rigidity + bradykinesia + resting tremor + postural instability",
  },
  peripheral_neuropathy: {
    key: "peripheral_neuropathy",
    label: "Peripheral neuropathy",
    signature:
      "Glove-and-stocking sensory loss + distal weakness + areflexia (LMN) — Uganda: diabetic/HIV/nutritional/alcohol/leprosy",
  },
  myopathy: {
    key: "myopathy",
    label: "Myopathy",
    signature: "Proximal weakness + preserved reflexes + waddling gait + no sensory loss",
  },
  myasthenia: {
    key: "myasthenia",
    label: "Neuromuscular junction (myasthenia)",
    signature: "Fatigable weakness + ptosis + normal sensation and reflexes",
  },
  radiculopathy: {
    key: "radiculopathy",
    label: "Radiculopathy (nerve root)",
    signature: "Dermatomal sensory loss + myotomal weakness + reflex loss for that root",
  },
  mononeuropathy: {
    key: "mononeuropathy",
    label: "Mononeuropathy",
    signature: "Single-nerve distribution (e.g. median/CTS, ulnar, common peroneal → foot drop)",
  },
};

// ── Pure localisation engine ──
const present = (c: NeuroExam, code: string, value?: string) => {
  const o = (c.findings ?? []).find((x) => x.code === code);
  if (!o || o.state !== "present") return false;
  return value ? (o.values ?? []).includes(value) : true;
};
const selectIs = (c: NeuroExam, code: string, value: string) =>
  (c.findings ?? []).some(
    (o) => o.code === code && o.state === "present" && (o.values ?? [])[0] === value,
  );

const vals = <T>(rec: Partial<Record<NeuroLimb, T>> | undefined) => Object.values(rec ?? {});

/**
 * Match the recorded cluster to the localisation(s) it fits. UMN vs LMN + where
 * in the neuraxis. MULTIPLE on ambiguity (broadening), must-not-miss/emergency
 * ranked first, empty when nothing recorded (NEVER auto-diagnoses).
 */
export function matchNeuroPatterns(c: NeuroExam): NeuroPattern[] {
  const out: NeuroPattern[] = [];
  const add = (k: keyof typeof NEURO_PATTERNS) => {
    const p = NEURO_PATTERNS[k];
    if (p && !out.some((x) => x.key === k)) out.push(p);
  };

  const gcs = gcsTotal(c);
  const tones = vals(c.tone);
  const reflexes = vals(c.reflexes);
  const plantars = Object.values(c.plantar ?? {});
  const anySpastic = tones.includes("spastic");
  const anyFlaccid = tones.includes("flaccid");
  const anyBrisk = reflexes.includes("brisk") || reflexes.includes("clonus");
  const anyLowReflex = reflexes.includes("absent") || reflexes.includes("reduced");
  const upgoing = plantars.includes("up");
  const weak = (limb: NeuroLimb) => (c.power?.[limb] ?? 5) < 5;

  // EMERGENCIES / must-not-miss first
  if (gcs != null && gcs <= 8) add("reduced_gcs");
  if (present(c, "cn_fundi", "papilloedema") && gcs != null && gcs < 15) add("raised_icp");
  if (c.caudaEquina?.length) add("cauda_equina");
  if (
    c.sensoryPattern === "sensory_level" ||
    (weak("r_leg") &&
      weak("l_leg") &&
      (c.caudaEquina?.includes("urinary retention / incontinence") ?? false))
  )
    add("cord_compression");
  if (c.meningism?.length) add("meningism");

  // UMN / LMN
  const umn = anySpastic && (anyBrisk || upgoing);
  const lmn =
    anyFlaccid &&
    anyLowReflex &&
    (!!c.wasting || !!c.fasciculations || present(c, "involuntary", "fasciculations"));
  if (umn) add("umn");
  if (lmn) add("lmn");

  // Cortical stroke — UMN + one-sided face/arm/leg ± cortical sign
  const rightWeak = weak("r_arm") && weak("r_leg");
  const leftWeak = weak("l_arm") && weak("l_leg");
  const cortical =
    present(c, "speech") ||
    present(c, "higher_cortical", "neglect") ||
    selectIs(c, "cn_vii", "UMN (forehead spared)");
  if (umn && (rightWeak || leftWeak)) add("stroke");
  else if (umn && cortical) add("stroke");

  // Cerebellar
  if (
    (c.cerebellarSigns?.length ?? 0) >= 2 ||
    c.gait === "ataxic" ||
    present(c, "coordination", "intention tremor")
  )
    add("cerebellar");

  // Parkinsonism
  if (
    tones.includes("rigid") &&
    (c.gait === "parkinsonian" || present(c, "involuntary", "resting tremor"))
  )
    add("parkinsonism");

  // Peripheral neuropathy
  if (c.sensoryPattern === "glove_and_stocking" && (c.powerPattern === "distal" || anyLowReflex))
    add("peripheral_neuropathy");

  // Myopathy
  if (
    c.powerPattern === "proximal" &&
    c.gait === "waddling" &&
    c.sensoryPattern !== "glove_and_stocking"
  )
    add("myopathy");

  // NMJ / myasthenia
  if (
    present(c, "fatigable") ||
    (present(c, "cn_eyes", "ptosis") &&
      c.sensoryPattern === "normal" &&
      reflexes.every((r) => r === "normal"))
  )
    if (present(c, "fatigable")) add("myasthenia");

  // Radiculopathy / mononeuropathy
  if (c.sensoryPattern === "dermatomal") add("radiculopathy");
  if (c.sensoryPattern === "single_nerve") add("mononeuropathy");

  return out.sort((a, b) => Number(!!b.mustNotMiss) - Number(!!a.mustNotMiss));
}

const LIMB_SHORT: Record<NeuroLimb, string> = Object.fromEntries(
  NEURO_LIMBS.map((l) => [l.limb, l.short]),
) as Record<NeuroLimb, string>;

/** Readable neuro prose — GCS, structured grades by limb, localisation. */
export function renderNeuroProse(c: NeuroExam): string {
  const parts: string[] = [];
  const gcs = gcsTotal(c);
  if (gcs != null) parts.push(`GCS ${gcs}/15.`);

  const present2 = (c.findings ?? []).filter((o) => o.state === "present");
  if (present2.length)
    parts.push(
      present2
        .map((o) =>
          o.values?.length
            ? `${o.display.toLowerCase()} — ${o.values.join(", ")}`
            : o.display.toLowerCase(),
        )
        .join("; ") + ".",
    );

  if (c.wasting) parts.push("Wasting.");
  if (c.fasciculations) parts.push("Fasciculations.");
  const tone = Object.entries(c.tone ?? {}).filter(([, v]) => v && v !== "normal");
  if (tone.length)
    parts.push(`Tone: ${tone.map(([l, v]) => `${LIMB_SHORT[l as NeuroLimb]} ${v}`).join(", ")}.`);
  const power = Object.entries(c.power ?? {}).filter(([, v]) => v != null && v < 5);
  if (power.length)
    parts.push(
      `Power: ${power.map(([l, v]) => `${LIMB_SHORT[l as NeuroLimb]} ${v}/5`).join(", ")}${c.powerPattern ? ` (${c.powerPattern})` : ""}.`,
    );
  const refl = Object.entries(c.reflexes ?? {}).filter(([, v]) => v && v !== "normal");
  if (refl.length)
    parts.push(
      `Reflexes: ${refl.map(([l, v]) => `${LIMB_SHORT[l as NeuroLimb]} ${v}`).join(", ")}.`,
    );
  const plant = Object.entries(c.plantar ?? {}).filter(([, v]) => v && v !== "down");
  if (plant.length) parts.push(`Plantars: ${plant.map(([s, v]) => `${s} ${v}going`).join(", ")}.`);

  if (c.sensoryPattern && c.sensoryPattern !== "normal")
    parts.push(`Sensory: ${c.sensoryPattern.replace(/_/g, " ")} pattern.`);
  if (c.romberg === "positive") parts.push("Romberg positive (dorsal-column ataxia).");
  if (c.gait && c.gait !== "normal") parts.push(`Gait: ${c.gait.replace(/_/g, " ")}.`);
  if (c.cerebellarSigns?.length) parts.push(`Cerebellar: ${c.cerebellarSigns.join(", ")}.`);
  if (c.meningism?.length) parts.push(`Meningism: ${c.meningism.join(", ")}.`);
  if (c.caudaEquina?.length) parts.push(`Cauda equina screen: ${c.caudaEquina.join(", ")}.`);

  const patterns = matchNeuroPatterns(c);
  if (patterns.length)
    parts.push(`Localisation(s) to consider: ${patterns.map((p) => p.label).join(" / ")}.`);
  return parts.length ? `Neurological examination: ${parts.join(" ")}` : "";
}

/** Neuro findings + localisation → reasoning tokens (feed the differential). */
export function neuroReasoningTokens(c: NeuroExam): { positives: string[]; negatives: string[] } {
  const positives: string[] = [];
  for (const o of c.findings ?? [])
    if (o.state === "present") positives.push(o.display, ...(o.values ?? []));
  if (Object.values(c.power ?? {}).some((v) => v != null && v < 5))
    positives.push("weakness", "focal weakness");
  if (c.meningism?.length) positives.push("neck stiffness", "meningism");
  if (c.sensoryPattern && c.sensoryPattern !== "normal")
    positives.push(`${c.sensoryPattern.replace(/_/g, " ")} sensory loss`);
  for (const p of matchNeuroPatterns(c)) positives.push(p.label);
  return { positives: Array.from(new Set(positives)), negatives: [] };
}

/** "Normal neuro exam" fast path — examined-normal grades; GCS left to record. */
export function normalNeuroExam(): NeuroExam {
  const limbVal = <T>(v: T) =>
    Object.fromEntries(NEURO_LIMBS.map((l) => [l.limb, v])) as Record<NeuroLimb, T>;
  return {
    findings: NEURO_FINDINGS.filter((x) => x.kind === "panel").map((x) => ({
      code: x.code,
      group: x.group,
      display: x.display,
      state: "absent" as const,
    })),
    wasting: false,
    fasciculations: false,
    tone: limbVal<Tone>("normal"),
    power: limbVal<number>(5),
    reflexes: limbVal<ReflexGrade>("normal"),
    plantar: { right: "down", left: "down" },
    sensoryPattern: "normal",
    romberg: "negative",
    gait: "normal",
  };
}
