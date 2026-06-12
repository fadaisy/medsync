/**
 * Cardiovascular Examination — domain module (types + catalog + structured murmur
 * + valve-lesion cluster engine). A system-specific exam layer onto the general
 * exam, following the respiratory pattern (ADR 0067). I-P-A order (NB no cardiac
 * percussion). Murmurs are characterised STRUCTURALLY (timing/location/radiation/
 * intensity/pitch/manoeuvre — tap, not free text). The sign-cluster → lesion
 * matcher is PURE + DECISION-SUPPORT: surfaces the lesion(s) a cluster fits —
 * MULTIPLE on ambiguity, must-not-miss flagged — and NEVER auto-diagnoses.
 * Uganda rheumatic valve disease woven in. CSO-signed; Hutchison Ch 13. ADR 0068.
 */

import type { ExamFinding, ExamObservation } from "@/lib/clerkship/exam/types";

export type PulseRhythm = "regular" | "irregularly_irregular" | "regularly_irregular";
export type PulseCharacter =
  | "normal"
  | "collapsing"
  | "slow_rising"
  | "bisferiens"
  | "thready"
  | "bounding"
  | "alternans"
  | "paradoxus";
export type ApexCharacter = "normal" | "heaving" | "thrusting" | "tapping" | "double_impulse";
export type HeartSound = "normal" | "loud" | "soft" | "split" | "fixed_split";

export type MurmurTiming =
  | "ejection_systolic"
  | "pansystolic"
  | "late_systolic"
  | "early_diastolic"
  | "mid_diastolic"
  | "continuous";
export type MurmurArea = "aortic" | "pulmonary" | "tricuspid" | "mitral" | "left_sternal_edge";
export type MurmurRadiation = "carotids" | "axilla" | "back" | "none";
export type MurmurManoeuvre =
  | "louder_expiration"
  | "louder_inspiration"
  | "louder_sitting_forward"
  | "louder_left_lateral"
  | "softer_valsalva";

/** A structured murmur (tap-characterised; no free text). */
export interface Murmur {
  id: string;
  timing?: MurmurTiming;
  location?: MurmurArea;
  radiation?: MurmurRadiation;
  /** Intensity grade 1–6. */
  intensity?: number;
  pitch?: "high" | "low" | "rumbling" | "blowing";
  manoeuvre?: MurmurManoeuvre;
}

/** The captured cardiovascular exam (section_data; no migration). */
export interface CvsExam {
  /** Non-zonal I-P-A findings (peripheral / inspection / palpation / completion). */
  findings?: ExamObservation[];
  pulseRhythm?: PulseRhythm;
  pulseCharacter?: PulseCharacter;
  pulseVolume?: "low" | "normal" | "high";
  jvp?: "not_raised" | "raised";
  apexLocation?: "undisplaced" | "displaced";
  apexCharacter?: ApexCharacter;
  s1?: HeartSound;
  s2?: HeartSound;
  /** Added heart sounds (S3 / S4 / opening snap / ejection click …). */
  addedSounds?: string[];
  murmurs?: Murmur[];
}

// ── Tap value-sets (for the UI) ──
export const PULSE_RHYTHM_OPTS = [
  "regular",
  "irregularly_irregular",
  "regularly_irregular",
] as const;
export const PULSE_CHAR_OPTS: { value: PulseCharacter; label: string; abnormal: boolean }[] = [
  { value: "normal", label: "Normal", abnormal: false },
  { value: "collapsing", label: "Collapsing", abnormal: true },
  { value: "slow_rising", label: "Slow-rising", abnormal: true },
  { value: "bisferiens", label: "Bisferiens", abnormal: true },
  { value: "thready", label: "Thready", abnormal: true },
  { value: "bounding", label: "Bounding", abnormal: true },
  { value: "alternans", label: "Alternans", abnormal: true },
  { value: "paradoxus", label: "Paradoxus", abnormal: true },
];
export const APEX_CHAR_OPTS: { value: ApexCharacter; label: string; abnormal: boolean }[] = [
  { value: "normal", label: "Normal", abnormal: false },
  { value: "heaving", label: "Heaving (pressure)", abnormal: true },
  { value: "thrusting", label: "Thrusting (volume)", abnormal: true },
  { value: "tapping", label: "Tapping (palpable S1)", abnormal: true },
  { value: "double_impulse", label: "Double impulse", abnormal: true },
];
export const HEART_SOUND_OPTS: HeartSound[] = ["normal", "loud", "soft", "split", "fixed_split"];
export const CVS_ADDED_OPTS = [
  "S3",
  "S4",
  "opening snap",
  "ejection click",
  "mid-systolic click",
  "pericardial rub",
  "prosthetic sounds",
] as const;

export const MURMUR_TIMING_OPTS: { value: MurmurTiming; label: string }[] = [
  { value: "ejection_systolic", label: "Ejection systolic" },
  { value: "pansystolic", label: "Pansystolic" },
  { value: "late_systolic", label: "Late systolic" },
  { value: "early_diastolic", label: "Early diastolic" },
  { value: "mid_diastolic", label: "Mid-diastolic" },
  { value: "continuous", label: "Continuous" },
];
export const MURMUR_AREA_OPTS: { value: MurmurArea; label: string }[] = [
  { value: "aortic", label: "Aortic" },
  { value: "pulmonary", label: "Pulmonary" },
  { value: "tricuspid", label: "Tricuspid" },
  { value: "mitral", label: "Mitral (apex)" },
  { value: "left_sternal_edge", label: "Left sternal edge" },
];
export const MURMUR_RADIATION_OPTS: { value: MurmurRadiation; label: string }[] = [
  { value: "carotids", label: "Carotids" },
  { value: "axilla", label: "Axilla" },
  { value: "back", label: "Back" },
  { value: "none", label: "None" },
];
export const MURMUR_PITCH_OPTS = ["high", "low", "rumbling", "blowing"] as const;
export const MURMUR_MANOEUVRE_OPTS: { value: MurmurManoeuvre; label: string }[] = [
  { value: "louder_expiration", label: "↑ expiration" },
  { value: "louder_inspiration", label: "↑ inspiration" },
  { value: "louder_sitting_forward", label: "↑ sitting forward" },
  { value: "louder_left_lateral", label: "↑ left lateral" },
  { value: "softer_valsalva", label: "↓ Valsalva" },
];

// ── Non-zonal I-P-A finding catalog (peripheral overlap with general/resp reused) ──
export const CVS_GROUPS = [
  { key: "cvs_peripheral", label: "Peripheral / general" },
  { key: "cvs_inspection", label: "Inspection" },
  { key: "cvs_palpation", label: "Palpation" },
  { key: "cvs_completion", label: "Completion" },
] as const;

const f = (
  code: string,
  group: string,
  display: string,
  kind: "select" | "panel",
  options: string[],
  extra: Partial<ExamFinding> = {},
): ExamFinding => ({ code, group, display, kind, options, ...extra });

export const CVS_FINDINGS: ExamFinding[] = [
  // peripheral (CVS-specific; clubbing/cyanosis/oedema reused from the general exam)
  f(
    "cvs_distress",
    "cvs_peripheral",
    "Breathless / distress",
    "select",
    ["none", "mild", "moderate", "severe"],
    { mustNotMiss: true },
  ),
  f("malar_flush", "cvs_peripheral", "Malar flush", "panel", [], { ugandaFlag: "rheumatic" }),
  f(
    "ie_signs",
    "cvs_peripheral",
    "Endocarditis stigmata",
    "panel",
    ["splinter haemorrhages", "Janeway lesions", "Osler's nodes", "petechiae"],
    { mustNotMiss: true },
  ),
  f("radio_radial_delay", "cvs_peripheral", "Radio-radial delay", "panel", [], {
    mustNotMiss: true,
  }),
  f("radio_femoral_delay", "cvs_peripheral", "Radio-femoral delay", "panel", [], {
    mustNotMiss: true,
  }),
  f("carotid", "cvs_peripheral", "Carotids", "panel", ["bruit", "slow upstroke"]),
  f("jvp_waveform", "cvs_peripheral", "JVP waveform", "panel", [
    "large a wave",
    "cannon a wave",
    "large v wave",
    "absent",
  ]),
  // inspection
  f("cvs_scars", "cvs_inspection", "Scars / devices", "panel", [
    "sternotomy",
    "thoracotomy",
    "pacemaker / ICD box",
  ]),
  f("visible_pulsations", "cvs_inspection", "Visible pulsations", "panel", [
    "apical",
    "parasternal",
    "epigastric",
  ]),
  // palpation
  f("parasternal_heave", "cvs_palpation", "Parasternal heave", "panel", [], { mustNotMiss: true }),
  f(
    "thrills",
    "cvs_palpation",
    "Thrills",
    "panel",
    ["aortic", "pulmonary", "mitral", "tricuspid"],
    { mustNotMiss: true },
  ),
  // completion
  f("lung_bases", "cvs_completion", "Lung bases", "panel", ["bibasal crackles"]),
  f("cvs_oedema", "cvs_completion", "Oedema", "panel", ["ankle", "sacral"]),
  f("hepatomegaly", "cvs_completion", "Hepatomegaly / pulsatile liver", "panel", []),
  f("peripheral_pulses", "cvs_completion", "Peripheral pulses", "select", [
    "present",
    "reduced",
    "absent",
  ]),
  f("fundoscopy", "cvs_completion", "Fundoscopy", "panel", ["Roth spots"]),
  f("urine_dip", "cvs_completion", "Urine dip", "panel", ["haematuria"], { ugandaFlag: "ie" }),
];

// ── Sign-cluster → lesion (decision-support reference; CSO-signed) ──
export interface CvsPattern {
  key: string;
  label: string;
  signature: string;
  mustNotMiss?: boolean;
  emergency?: boolean;
}

export const CVS_PATTERNS: Record<string, CvsPattern> = {
  aortic_stenosis: {
    key: "aortic_stenosis",
    label: "Aortic stenosis",
    signature:
      "Ejection systolic at aortic area radiating to carotids · slow-rising pulse · soft S2 · heaving apex",
    mustNotMiss: true,
  },
  aortic_regurgitation: {
    key: "aortic_regurgitation",
    label: "Aortic regurgitation",
    signature:
      "Early diastolic at LSE (↑ sitting forward) · collapsing pulse · wide pulse pressure · displaced apex",
    mustNotMiss: true,
  },
  mitral_stenosis: {
    key: "mitral_stenosis",
    label: "Mitral stenosis",
    signature:
      "Mid-diastolic rumble at apex (↑ left lateral) · tapping apex · loud S1 · opening snap (rheumatic)",
  },
  mitral_regurgitation: {
    key: "mitral_regurgitation",
    label: "Mitral regurgitation",
    signature: "Pansystolic at apex radiating to axilla · soft S1 · thrusting/displaced apex · S3",
  },
  heart_failure: {
    key: "heart_failure",
    label: "Heart failure",
    signature: "Raised JVP · displaced apex · S3 · bibasal crackles · peripheral oedema",
    mustNotMiss: true,
  },
  infective_endocarditis: {
    key: "infective_endocarditis",
    label: "Infective endocarditis",
    signature: "New murmur + fever + peripheral stigmata (splinters/Janeway/Osler/Roth/haematuria)",
    mustNotMiss: true,
  },
  tamponade: {
    key: "tamponade",
    label: "Cardiac tamponade",
    signature: "Raised JVP · muffled heart sounds · pulsus paradoxus · hypotension — EMERGENCY",
    mustNotMiss: true,
    emergency: true,
  },
};

// ── Pure cluster engine ──
const present = (c: CvsExam, code: string) =>
  (c.findings ?? []).some((o) => o.code === code && o.state === "present");

/**
 * Match the recorded cluster to the valve-lesion / HF / IE / tamponade pattern(s)
 * it fits. MULTIPLE on ambiguity (broadening), must-not-miss/emergency surfaced,
 * empty when nothing recorded (NEVER auto-diagnoses). The murmur + pulse character
 * + apex are the key discriminators.
 */
export function matchCvsPatterns(c: CvsExam): CvsPattern[] {
  const murmurs = c.murmurs ?? [];
  const has = (timing: MurmurTiming, loc?: MurmurArea) =>
    murmurs.some((m) => m.timing === timing && (!loc || m.location === loc));
  const radiates = (r: MurmurRadiation) => murmurs.some((m) => m.radiation === r);
  const added = new Set(c.addedSounds ?? []);
  const out: CvsPattern[] = [];
  const add = (k: keyof typeof CVS_PATTERNS) => {
    const p = CVS_PATTERNS[k];
    if (p && !out.some((x) => x.key === k)) out.push(p);
  };

  // EMERGENCY: tamponade
  if (c.jvp === "raised" && c.s1 === "soft" && c.s2 === "soft" && c.pulseCharacter === "paradoxus")
    add("tamponade");

  // Aortic stenosis
  if (
    has("ejection_systolic", "aortic") &&
    (radiates("carotids") || c.pulseCharacter === "slow_rising" || c.s2 === "soft")
  )
    add("aortic_stenosis");
  // Aortic regurgitation
  if (has("early_diastolic") && (c.pulseCharacter === "collapsing" || c.pulseVolume === "high"))
    add("aortic_regurgitation");
  // Mitral stenosis (rheumatic)
  if (has("mid_diastolic", "mitral") || added.has("opening snap") || c.apexCharacter === "tapping")
    add("mitral_stenosis");
  // Mitral regurgitation
  if (
    has("pansystolic", "mitral") ||
    (murmurs.some((m) => m.timing === "pansystolic") && radiates("axilla"))
  )
    add("mitral_regurgitation");
  // Heart failure
  if (
    (c.jvp === "raised" || c.apexLocation === "displaced") &&
    (added.has("S3") || present(c, "lung_bases") || present(c, "cvs_oedema"))
  )
    add("heart_failure");
  // Infective endocarditis — new murmur + peripheral stigmata (fever from vitals/general)
  if (
    murmurs.length &&
    (present(c, "ie_signs") || present(c, "fundoscopy") || present(c, "urine_dip"))
  )
    add("infective_endocarditis");

  // AMBIGUITY broadening: an ejection-systolic murmur with no discriminators could
  // be AS or (flow/MR); a lone pansystolic could be MR or TR/VSD — surface both.
  if (has("ejection_systolic") && !radiates("carotids") && !c.pulseCharacter && c.s2 !== "soft") {
    add("aortic_stenosis");
    add("mitral_regurgitation");
  }

  return out.sort((a, b) => Number(!!b.mustNotMiss) - Number(!!a.mustNotMiss));
}

const TIMING_LABEL: Record<MurmurTiming, string> = Object.fromEntries(
  MURMUR_TIMING_OPTS.map((o) => [o.value, o.label]),
) as Record<MurmurTiming, string>;
const AREA_LABEL: Record<MurmurArea, string> = Object.fromEntries(
  MURMUR_AREA_OPTS.map((o) => [o.value, o.label]),
) as Record<MurmurArea, string>;

/** A single murmur as a readable phrase. */
export function describeMurmur(m: Murmur): string {
  const bits: string[] = [];
  if (m.intensity) bits.push(`grade ${m.intensity}/6`);
  if (m.timing) bits.push(TIMING_LABEL[m.timing].toLowerCase());
  if (m.location) bits.push(`at ${AREA_LABEL[m.location].toLowerCase()}`);
  if (m.radiation && m.radiation !== "none") bits.push(`radiating to ${m.radiation}`);
  return bits.join(" ") || "murmur";
}

/** Readable CVS prose (structured findings + murmurs + patterns). */
export function renderCvsProse(c: CvsExam): string {
  const parts: string[] = [];
  const present2 = (c.findings ?? []).filter((o) => o.state === "present");
  if (present2.length)
    parts.push(
      present2
        .map((o) =>
          o.values?.length
            ? `${o.display.toLowerCase()} (${o.values.join(", ")})`
            : o.display.toLowerCase(),
        )
        .join(", ") + ".",
    );
  if (c.pulseCharacter && c.pulseCharacter !== "normal")
    parts.push(`${c.pulseCharacter.replace("_", "-")} pulse.`);
  if (c.pulseRhythm && c.pulseRhythm !== "regular")
    parts.push(`${c.pulseRhythm.replace(/_/g, " ")} rhythm.`);
  if (c.jvp === "raised") parts.push("JVP raised.");
  if (c.apexLocation === "displaced" || (c.apexCharacter && c.apexCharacter !== "normal"))
    parts.push(
      `Apex ${c.apexLocation === "displaced" ? "displaced" : ""}${c.apexCharacter && c.apexCharacter !== "normal" ? ` ${c.apexCharacter.replace("_", " ")}` : ""}.`.replace(
        "  ",
        " ",
      ),
    );
  for (const m of c.murmurs ?? []) parts.push(`Murmur: ${describeMurmur(m)}.`);
  const patterns = matchCvsPatterns(c);
  if (patterns.length)
    parts.push(`Lesion(s) to consider: ${patterns.map((p) => p.label).join(" / ")}.`);
  return parts.length ? `Cardiovascular examination: ${parts.join(" ")}` : "";
}

/** CVS findings + murmurs + matched lesions → reasoning tokens (feed the differential). */
export function cvsReasoningTokens(c: CvsExam): { positives: string[]; negatives: string[] } {
  const positives: string[] = [];
  for (const o of c.findings ?? [])
    if (o.state === "present") positives.push(o.display, ...(o.values ?? []));
  for (const m of c.murmurs ?? []) positives.push("murmur", describeMurmur(m));
  if (c.jvp === "raised") positives.push("raised JVP");
  if (c.pulseCharacter && c.pulseCharacter !== "normal")
    positives.push(`${c.pulseCharacter} pulse`);
  for (const p of matchCvsPatterns(c)) positives.push(p.label);
  return { positives: Array.from(new Set(positives)), negatives: [] };
}

/** "Normal CVS exam" fast path. */
export function normalCvsExam(): CvsExam {
  return {
    findings: CVS_FINDINGS.filter((x) => x.kind === "panel").map((x) => ({
      code: x.code,
      group: x.group,
      display: x.display,
      state: "absent" as const,
    })),
    pulseRhythm: "regular",
    pulseCharacter: "normal",
    pulseVolume: "normal",
    jvp: "not_raised",
    apexLocation: "undisplaced",
    apexCharacter: "normal",
    s1: "normal",
    s2: "normal",
  };
}
