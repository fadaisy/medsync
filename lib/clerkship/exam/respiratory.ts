/**
 * Respiratory Examination — domain module (types + catalog + cluster engine).
 * The first system-specific exam layer onto the general examination (ADR 0066).
 * Tap-first IPPA + zonal capture (percussion / breath sounds / vocal resonance /
 * added sounds per zone & side). The sign-cluster → pattern matcher is PURE +
 * DECISION-SUPPORT: it surfaces the pattern(s) a recorded cluster fits — MULTIPLE
 * on ambiguity (broadening, anti-anchoring), must-not-miss flagged — and NEVER
 * auto-diagnoses. CSO-signed; Hutchison Ch 12. See ADR 0067.
 */

import type { ExamFinding, ExamObservation } from "@/lib/clerkship/exam/types";

// ── Zones (upper/mid/lower × L/R) ──
export type RespSide = "right" | "left";
export type RespZone =
  | "upper_right"
  | "upper_left"
  | "mid_right"
  | "mid_left"
  | "lower_right"
  | "lower_left";

export const RESP_ZONES: { zone: RespZone; level: string; side: RespSide; short: string }[] = [
  { zone: "upper_right", level: "Upper", side: "right", short: "U-R" },
  { zone: "upper_left", level: "Upper", side: "left", short: "U-L" },
  { zone: "mid_right", level: "Mid", side: "right", short: "M-R" },
  { zone: "mid_left", level: "Mid", side: "left", short: "M-L" },
  { zone: "lower_right", level: "Lower", side: "right", short: "L-R" },
  { zone: "lower_left", level: "Lower", side: "left", short: "L-L" },
];

export type PercussionNote = "resonant" | "dull" | "stony_dull" | "hyper_resonant";
export type BreathSound = "vesicular" | "bronchial" | "reduced" | "absent";
export type VocalResonance = "normal" | "increased" | "reduced";
export type AddedSound =
  | "wheeze_poly"
  | "wheeze_mono"
  | "crackles_fine"
  | "crackles_coarse"
  | "pleural_rub"
  | "stridor";

export const PERCUSSION_OPTS: { value: PercussionNote; label: string; abnormal: boolean }[] = [
  { value: "resonant", label: "Resonant", abnormal: false },
  { value: "dull", label: "Dull", abnormal: true },
  { value: "stony_dull", label: "Stony dull", abnormal: true },
  { value: "hyper_resonant", label: "Hyper-resonant", abnormal: true },
];
export const BREATH_OPTS: { value: BreathSound; label: string; abnormal: boolean }[] = [
  { value: "vesicular", label: "Vesicular", abnormal: false },
  { value: "bronchial", label: "Bronchial", abnormal: true },
  { value: "reduced", label: "Reduced", abnormal: true },
  { value: "absent", label: "Absent", abnormal: true },
];
export const VR_OPTS: { value: VocalResonance; label: string; abnormal: boolean }[] = [
  { value: "normal", label: "Normal", abnormal: false },
  { value: "increased", label: "Increased", abnormal: true },
  { value: "reduced", label: "Reduced", abnormal: true },
];
export const ADDED_OPTS: { value: AddedSound; label: string; emergency?: boolean }[] = [
  { value: "wheeze_poly", label: "Wheeze (polyphonic)" },
  { value: "wheeze_mono", label: "Wheeze (monophonic)" },
  { value: "crackles_fine", label: "Crackles (fine)" },
  { value: "crackles_coarse", label: "Crackles (coarse)" },
  { value: "pleural_rub", label: "Pleural rub" },
  { value: "stridor", label: "Stridor", emergency: true },
];

/** The captured respiratory exam (lives in section_data; no migration). */
export interface RespExam {
  /** Non-zonal IPPA findings (peripheral / inspection / palpation / completion). */
  findings?: ExamObservation[];
  trachea?: "central" | "deviated_right" | "deviated_left";
  expansion?: Partial<Record<RespSide, "normal" | "reduced">>;
  percussion?: Partial<Record<RespZone, PercussionNote>>;
  breathSounds?: Partial<Record<RespZone, BreathSound>>;
  vocalResonance?: Partial<Record<RespZone, VocalResonance>>;
  addedSounds?: Partial<Record<RespZone, AddedSound[]>>;
}

// ── Non-zonal IPPA finding catalog (reuses ExamFinding; peripheral overlap with
// the general exam — clubbing/cyanosis/lymph nodes/JVP captured THERE, not here) ──
export const RESP_GROUPS = [
  { key: "resp_peripheral", label: "Peripheral / general" },
  { key: "resp_inspection", label: "Inspection" },
  { key: "resp_palpation", label: "Palpation (non-zonal)" },
  { key: "resp_completion", label: "Completion" },
] as const;

const f = (
  code: string,
  group: string,
  display: string,
  kind: "select" | "panel",
  options: string[],
  extra: Partial<ExamFinding> = {},
): ExamFinding => ({ code, group, display, kind, options, ...extra });

export const RESP_FINDINGS: ExamFinding[] = [
  // peripheral (resp-specific; general signs reused from the general exam)
  f(
    "resp_distress",
    "resp_peripheral",
    "Respiratory distress",
    "select",
    ["none", "mild", "moderate", "severe"],
    { mustNotMiss: true },
  ),
  f("accessory_muscles", "resp_peripheral", "Accessory muscle use", "panel", []),
  f(
    "audible_noises",
    "resp_peripheral",
    "Audible noises",
    "panel",
    ["wheeze", "stridor", "grunting", "gurgling"],
    { mustNotMiss: true },
  ),
  f("pursed_lip", "resp_peripheral", "Pursed-lip breathing", "panel", []),
  f("rr_pattern", "resp_peripheral", "Breathing pattern", "select", [
    "normal",
    "tachypnoeic",
    "Cheyne–Stokes",
    "Kussmaul",
    "prolonged expiration",
  ]),
  // inspection
  f("chest_shape", "resp_inspection", "Chest shape", "select", [
    "normal",
    "barrel",
    "pectus carinatum",
    "pectus excavatum",
    "kyphoscoliosis",
  ]),
  f("chest_marks", "resp_inspection", "Scars / drains / marks", "panel", [
    "thoracotomy scar",
    "chest drain",
    "radiotherapy marks",
    "SVCO collateral veins",
  ]),
  f("chest_movement", "resp_inspection", "Chest movement", "select", [
    "symmetrical",
    "reduced left",
    "reduced right",
  ]),
  f("recession", "resp_inspection", "Intercostal recession", "panel", [], { mustNotMiss: true }),
  // palpation (non-zonal; expansion / trachea / fremitus are zonal/side)
  f("chest_tenderness", "resp_palpation", "Chest-wall tenderness", "panel", []),
  f("surgical_emphysema", "resp_palpation", "Surgical emphysema", "panel", [], {
    mustNotMiss: true,
  }),
  // completion
  f(
    "sputum_pot",
    "resp_completion",
    "Sputum pot",
    "panel",
    ["purulent", "blood-stained", "frothy", "rusty"],
    { ugandaFlag: "tb" },
  ),
  f("peak_flow", "resp_completion", "Peak flow reduced", "panel", []),
];

// ── Sign-cluster → pattern (decision-support reference; CSO-signed) ──
export interface RespPattern {
  key: string;
  label: string;
  /** The signs that, recorded together, fit this pattern (for transparency). */
  signature: string;
  mustNotMiss?: boolean;
  emergency?: boolean;
}

export const RESP_PATTERNS: Record<string, RespPattern> = {
  consolidation: {
    key: "consolidation",
    label: "Consolidation",
    signature: "Dull · bronchial breath sounds · increased VR · ± coarse crackles",
  },
  effusion: {
    key: "effusion",
    label: "Pleural effusion",
    signature: "Stony dull · reduced/absent sounds · reduced VR · trachea away if large",
    mustNotMiss: true,
  },
  pneumothorax: {
    key: "pneumothorax",
    label: "Pneumothorax",
    signature: "Hyper-resonant · reduced/absent sounds · reduced VR",
  },
  tension_pneumothorax: {
    key: "tension_pneumothorax",
    label: "Tension pneumothorax",
    signature: "Hyper-resonant · absent sounds · trachea deviated AWAY · unstable — EMERGENCY",
    mustNotMiss: true,
    emergency: true,
  },
  collapse: {
    key: "collapse",
    label: "Lobar collapse",
    signature: "Dull · reduced/absent sounds · reduced VR · trachea pulled TOWARDS",
  },
  fibrosis: {
    key: "fibrosis",
    label: "Pulmonary fibrosis",
    signature: "Fine end-inspiratory crackles · reduced expansion (often bibasal)",
  },
  copd: {
    key: "copd",
    label: "COPD / hyperinflation",
    signature: "Hyper-resonant · quiet breath sounds · wheeze (bilateral)",
  },
  stridor: {
    key: "stridor",
    label: "Upper-airway obstruction (stridor)",
    signature: "Stridor — UPPER-AIRWAY EMERGENCY",
    mustNotMiss: true,
    emergency: true,
  },
};

// ── Pure cluster engine ──
const collect = <T>(rec: Partial<Record<RespZone, T>> | undefined): Set<T> =>
  new Set(Object.values(rec ?? {}).filter(Boolean) as T[]);

const collectAdded = (rec: RespExam["addedSounds"]): Set<AddedSound> => {
  const s = new Set<AddedSound>();
  for (const arr of Object.values(rec ?? {})) for (const a of arr ?? []) s.add(a);
  return s;
};

/**
 * Match the recorded cluster to the pattern(s) it fits. MULTIPLE on ambiguity
 * (broadening), must-not-miss/emergency surfaced, empty when nothing recorded
 * (NEVER auto-diagnoses). The percussion note is the key discriminator.
 */
export function matchRespPatterns(r: RespExam): RespPattern[] {
  const perc = collect<PercussionNote>(r.percussion);
  const bs = collect<BreathSound>(r.breathSounds);
  const vr = collect<VocalResonance>(r.vocalResonance);
  const added = collectAdded(r.addedSounds);
  const trachDev = !!r.trachea && r.trachea !== "central";
  const reducedSounds = bs.has("reduced") || bs.has("absent");
  const out: RespPattern[] = [];
  const add = (k: keyof typeof RESP_PATTERNS) => {
    const p = RESP_PATTERNS[k];
    if (p && !out.some((x) => x.key === k)) out.push(p);
  };

  // EMERGENCIES first
  if (added.has("stridor")) add("stridor");
  if (perc.has("hyper_resonant") && reducedSounds && trachDev) add("tension_pneumothorax");

  // pleural effusion — stony dull is near-pathognomonic
  if (perc.has("stony_dull")) add("effusion");
  // pneumothorax (simple)
  if (perc.has("hyper_resonant") && reducedSounds) add("pneumothorax");
  // consolidation
  if (
    perc.has("dull") &&
    (bs.has("bronchial") || vr.has("increased") || added.has("crackles_coarse"))
  )
    add("consolidation");
  // lobar collapse
  if (perc.has("dull") && reducedSounds) add("collapse");
  // fibrosis
  if (added.has("crackles_fine")) add("fibrosis");
  // COPD / hyperinflation (bilateral airflow limitation)
  if (
    (perc.has("hyper_resonant") || perc.size === 0) &&
    (added.has("wheeze_poly") || added.has("wheeze_mono"))
  )
    add("copd");

  // AMBIGUITY broadening: dull + reduced/absent sounds with VR not tested → the
  // three "dull" patterns are indistinguishable; surface all (anti-anchoring).
  if (perc.has("dull") && reducedSounds && vr.size === 0) {
    add("consolidation");
    add("effusion");
    add("collapse");
  }

  // must-not-miss / emergency first, then stable order
  return out.sort((a, b) => Number(!!b.mustNotMiss) - Number(!!a.mustNotMiss));
}

const ZONE_LABEL: Record<RespZone, string> = Object.fromEntries(
  RESP_ZONES.map((z) => [z.zone, `${z.level.toLowerCase()} ${z.side}`]),
) as Record<RespZone, string>;

/** Readable respiratory prose (zonal abnormalities + non-zonal findings + patterns). */
export function renderRespProse(r: RespExam): string {
  const parts: string[] = [];
  const findings = (r.findings ?? []).filter((o) => o.state !== "not_examined");
  const present = findings.filter((o) => o.state === "present");
  if (present.length)
    parts.push(
      present
        .map((o) =>
          o.values?.length
            ? `${o.display.toLowerCase()} (${o.values.join(", ")})`
            : o.display.toLowerCase(),
        )
        .join(", ") + ".",
    );

  if (r.trachea && r.trachea !== "central") parts.push(`Trachea ${r.trachea.replace("_", " ")}.`);
  if (r.expansion?.left === "reduced" || r.expansion?.right === "reduced") {
    const sides = (["left", "right"] as RespSide[]).filter((s) => r.expansion?.[s] === "reduced");
    parts.push(`Reduced expansion ${sides.join(" + ")}.`);
  }

  const zonal = (
    label: string,
    rec: Partial<Record<RespZone, string>> | undefined,
    isNormal: (v: string) => boolean,
  ) => {
    const abn = Object.entries(rec ?? {}).filter(([, v]) => v && !isNormal(v));
    if (abn.length)
      parts.push(
        `${label}: ${abn.map(([z, v]) => `${ZONE_LABEL[z as RespZone]} ${String(v).replace("_", " ")}`).join(", ")}.`,
      );
  };
  zonal("Percussion", r.percussion, (v) => v === "resonant");
  zonal("Breath sounds", r.breathSounds, (v) => v === "vesicular");
  zonal("Vocal resonance", r.vocalResonance, (v) => v === "normal");
  const added = collectAdded(r.addedSounds);
  if (added.size)
    parts.push(`Added sounds: ${[...added].map((a) => a.replace("_", " ")).join(", ")}.`);

  const patterns = matchRespPatterns(r);
  if (patterns.length)
    parts.push(`Pattern(s) to consider: ${patterns.map((p) => p.label).join(" / ")}.`);
  return parts.length ? `Respiratory examination: ${parts.join(" ")}` : "";
}

/** Respiratory findings + matched patterns → reasoning tokens (feed the differential). */
export function respReasoningTokens(r: RespExam): { positives: string[]; negatives: string[] } {
  const positives: string[] = [];
  for (const o of r.findings ?? [])
    if (o.state === "present") positives.push(o.display, ...(o.values ?? []));
  for (const p of matchRespPatterns(r)) positives.push(p.label);
  if (collectAdded(r.addedSounds).size)
    for (const a of collectAdded(r.addedSounds)) positives.push(a.replace("_", " "));
  return { positives: Array.from(new Set(positives)), negatives: [] };
}

/** "Normal respiratory exam" fast path — all zones normal, non-zonal panels normal. */
export function normalRespExam(): RespExam {
  const zoneVal = <T>(v: T) =>
    Object.fromEntries(RESP_ZONES.map((z) => [z.zone, v])) as Record<RespZone, T>;
  return {
    findings: RESP_FINDINGS.filter((x) => x.kind === "panel").map((x) => ({
      code: x.code,
      group: x.group,
      display: x.display,
      state: "absent" as const,
    })),
    trachea: "central",
    expansion: { left: "normal", right: "normal" },
    percussion: zoneVal<PercussionNote>("resonant"),
    breathSounds: zoneVal<BreathSound>("vesicular"),
    vocalResonance: zoneVal<VocalResonance>("normal"),
  };
}
