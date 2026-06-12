/**
 * Abdominal Examination — domain module (types + catalog + structured organs/
 * masses + constellation engine). A system-specific exam layer onto the general
 * exam, following the respiratory/CVS pattern (ADRs 0067/0068). Full IPPA by
 * REGION (9-region model) with structured organ + mass characterisation and the
 * PR-as-completion honesty control (examined / not-examined / declined — never
 * silently dropped). The constellation → pattern matcher is PURE + DECISION-
 * SUPPORT: surfaces the pattern(s) a recorded constellation fits — MULTIPLE on
 * ambiguity, must-not-miss flagged (peritonitis / ruptured AAA / perforation /
 * obstruction / ectopic-check / GI-bleed shock) — and NEVER auto-diagnoses.
 * Uganda differentials woven through (massive splenomegaly: malaria/HMS,
 * schistosomiasis, sickle; HCC; TB peritonitis). CSO-signed catalog; Hutchison
 * Ch 14. See ADR 0069.
 */

import type { ExamFinding, ExamObservation } from "@/lib/clerkship/exam/types";

// ── The 9 regions ──
export type AbdoRegion =
  | "ruq"
  | "epigastric"
  | "luq"
  | "r_flank"
  | "umbilical"
  | "l_flank"
  | "rif"
  | "suprapubic"
  | "lif";

export const ABDO_REGIONS: { region: AbdoRegion; label: string; short: string }[] = [
  { region: "ruq", label: "Right upper quadrant", short: "RUQ" },
  { region: "epigastric", label: "Epigastric", short: "Epi" },
  { region: "luq", label: "Left upper quadrant", short: "LUQ" },
  { region: "r_flank", label: "Right flank", short: "R fl" },
  { region: "umbilical", label: "Umbilical", short: "Umb" },
  { region: "l_flank", label: "Left flank", short: "L fl" },
  { region: "rif", label: "Right iliac fossa", short: "RIF" },
  { region: "suprapubic", label: "Suprapubic", short: "SP" },
  { region: "lif", label: "Left iliac fossa", short: "LIF" },
];

export type AbdoTenderness = "tender" | "deep";
export type AbdoGuarding = "voluntary" | "involuntary";

/** A structured abdominal mass (tap-characterised; no free text). */
export interface AbdoMass {
  id: string;
  region?: AbdoRegion;
  size?: "<2 cm" | "2–5 cm" | ">5 cm";
  surface?: "smooth" | "irregular" | "nodular";
  edge?: "well-defined" | "diffuse";
  consistency?: "soft" | "firm" | "hard";
  mobility?: "mobile" | "fixed" | "moves with respiration";
  /** Expansile pulsatility = AAA until proven otherwise. */
  pulsatileExpansile?: boolean;
  tender?: boolean;
}

/** Structured organ characterisation (the heart of the abdominal exam). */
export interface AbdoLiver {
  palpable?: boolean;
  /** Extent below the costal margin. */
  span?: "2 cm" | "4 cm" | "6 cm" | ">8 cm";
  edge?: "smooth" | "irregular" | "nodular" | "hard";
  surface?: "smooth" | "craggy";
  tender?: boolean;
  pulsatile?: boolean;
}
export interface AbdoSpleen {
  palpable?: boolean;
  extent?: "2 cm" | "4 cm" | "8 cm" | "massive (to RIF)";
  notch?: boolean;
  cantGetAbove?: boolean;
}

export type PrState = "examined" | "not_examined" | "declined";
export const PR_FINDING_OPTS = [
  "fresh blood",
  "melaena",
  "mass",
  "haemorrhoids",
  "enlarged prostate",
  "hard / craggy prostate",
  "reduced tone",
  "impacted faeces",
] as const;

/** The captured abdominal exam (section_data; no migration). */
export interface AbdoExam {
  /** Non-regional IPPA findings (peripheral / inspection / signs / completion). */
  findings?: ExamObservation[];
  tenderness?: Partial<Record<AbdoRegion, AbdoTenderness>>;
  guarding?: Partial<Record<AbdoRegion, AbdoGuarding>>;
  rigidity?: "none" | "localised" | "board_like";
  rebound?: boolean;
  percussionTenderness?: boolean;
  masses?: AbdoMass[];
  liver?: AbdoLiver;
  spleen?: AbdoSpleen;
  kidneys?: { leftBallotable?: boolean; rightBallotable?: boolean };
  aortaExpansile?: boolean;
  bladderPalpable?: boolean;
  /** Percussion: loss of liver dullness → free gas (perforation). */
  liverDullnessLost?: boolean;
  shiftingDullness?: boolean;
  fluidThrill?: boolean;
  bowelSounds?: "normal" | "tinkling" | "absent";
  bruits?: string[];
  succussionSplash?: boolean;
  /** PR — part of completion; omission recorded honestly. */
  pr?: { state: PrState; findings?: string[] };
}

// ── Tap value-sets for the UI ──
export const LIVER_SPAN_OPTS = ["2 cm", "4 cm", "6 cm", ">8 cm"] as const;
export const LIVER_EDGE_OPTS = ["smooth", "irregular", "nodular", "hard"] as const;
export const SPLEEN_EXTENT_OPTS = ["2 cm", "4 cm", "8 cm", "massive (to RIF)"] as const;
export const BRUIT_OPTS = ["aortic", "renal", "hepatic"] as const;
export const MASS_SIZE_OPTS = ["<2 cm", "2–5 cm", ">5 cm"] as const;
export const MASS_SURFACE_OPTS = ["smooth", "irregular", "nodular"] as const;
export const MASS_EDGE_OPTS = ["well-defined", "diffuse"] as const;
export const MASS_CONSISTENCY_OPTS = ["soft", "firm", "hard"] as const;
export const MASS_MOBILITY_OPTS = ["mobile", "fixed", "moves with respiration"] as const;

// ── Non-regional finding catalog (peripheral overlap with the general exam is
// NOT duplicated — jaundice/pallor/clubbing/nodes/oedema live there) ──
export const ABDO_GROUPS = [
  { key: "abdo_peripheral", label: "Peripheral / stigmata" },
  { key: "abdo_inspection", label: "Inspection" },
  { key: "abdo_signs", label: "Named signs" },
  { key: "abdo_completion", label: "Completion" },
] as const;

const f = (
  code: string,
  group: string,
  display: string,
  kind: "select" | "panel",
  options: string[],
  extra: Partial<ExamFinding> = {},
): ExamFinding => ({ code, group, display, kind, options, ...extra });

export const ABDO_FINDINGS: ExamFinding[] = [
  // ── §1 peripheral / GI stigmata ──
  f("abdo_endofbed", "abdo_peripheral", "End of bed", "select", [
    "comfortable",
    "lying still (peritonitis)",
    "restless (colic)",
    "unwell",
  ]),
  f("liver_stigmata", "abdo_peripheral", "Hands — liver stigmata", "panel", [
    "palmar erythema",
    "Dupuytren's contracture",
    "leuconychia",
    "asterixis (flap)",
    "koilonychia",
  ]),
  f("upper_body_stigmata", "abdo_peripheral", "Arms / upper body", "panel", [
    "spider naevi (>5)",
    "bruising",
    "scratch marks",
    "gynaecomastia",
    "loss of body hair",
    "caput medusae",
  ]),
  f("gi_mouth", "abdo_peripheral", "Mouth (GI)", "panel", [
    "angular stomatitis",
    "glossitis",
    "aphthous ulcers",
    "perioral pigmentation",
    "fetor hepaticus",
  ]),
  f("virchows_node", "abdo_peripheral", "Virchow's node (Troisier's)", "panel", [], {
    mustNotMiss: true,
  }),
  // ── §2 inspection ──
  f("contour", "abdo_inspection", "Contour", "select", ["flat", "distended", "scaphoid"]),
  f("distension_cause", "abdo_inspection", "If distended — 5 F's", "panel", [
    "fat",
    "fluid (ascites)",
    "flatus (obstruction)",
    "faeces",
    "fetus",
    "mass / organomegaly",
  ]),
  f("visible_abnormality", "abdo_inspection", "Visible abnormalities", "panel", [
    "visible mass",
    "visible peristalsis",
    "visible pulsation",
  ]),
  f("abdo_scars", "abdo_inspection", "Scars", "panel", [
    "midline laparotomy",
    "Kocher's",
    "gridiron / Lanz",
    "Pfannenstiel",
    "loin",
    "transplant (RIF)",
    "stoma / drain site",
  ]),
  f("stoma", "abdo_inspection", "Stoma", "panel", ["colostomy", "ileostomy", "urostomy"]),
  f(
    "abdo_skin",
    "abdo_inspection",
    "Skin / wall",
    "panel",
    [
      "striae",
      "dilated veins",
      "Grey Turner's (flank bruising)",
      "Cullen's (periumbilical bruising)",
      "everted umbilicus",
    ],
    { mustNotMiss: true },
  ),
  f("hernias", "abdo_inspection", "Hernias (on cough)", "panel", [
    "incisional",
    "umbilical",
    "inguinal",
    "femoral",
    "epigastric",
  ]),
  f("resp_movement", "abdo_inspection", "Moves with respiration", "select", [
    "moves",
    "rigid / still",
  ]),
  // ── §3d named signs ──
  f("murphys", "abdo_signs", "Murphy's sign", "panel", [], { mustNotMiss: true }),
  f("courvoisier", "abdo_signs", "Courvoisier's (palpable non-tender GB + jaundice)", "panel", [], {
    mustNotMiss: true,
  }),
  f("rovsings", "abdo_signs", "Rovsing's sign", "panel", []),
  f("psoas_obturator", "abdo_signs", "Psoas / obturator sign", "panel", ["psoas", "obturator"]),
  // ── §6 completion ──
  f("genitalia_hernial", "abdo_completion", "External genitalia / hernial orifices", "panel", []),
  f("succussion_ref", "abdo_completion", "Observation charts reviewed", "panel", []),
];

// ── Constellation → pattern (decision-support reference; CSO-signed) ──
export interface AbdoPattern {
  key: string;
  label: string;
  signature: string;
  mustNotMiss?: boolean;
  emergency?: boolean;
}

export const ABDO_PATTERNS: Record<string, AbdoPattern> = {
  peritonitis: {
    key: "peritonitis",
    label: "Peritonitis (surgical abdomen)",
    signature:
      "Board-like rigidity · rebound/percussion tenderness · involuntary guarding · absent bowel sounds · lying still — EMERGENCY; senior + surgical review",
    mustNotMiss: true,
    emergency: true,
  },
  ruptured_aaa: {
    key: "ruptured_aaa",
    label: "AAA (expansile pulsatile mass)",
    signature:
      "Expansile pulsatile mass ± back pain/shock — EMERGENCY; do not deeply palpate again",
    mustNotMiss: true,
    emergency: true,
  },
  perforation: {
    key: "perforation",
    label: "Perforation (free gas)",
    signature: "Loss of liver dullness · peritonism — EMERGENCY; erect CXR",
    mustNotMiss: true,
    emergency: true,
  },
  obstruction: {
    key: "obstruction",
    label: "Bowel obstruction",
    signature: "Distension · tinkling bowel sounds · visible peristalsis ± empty rectum",
    mustNotMiss: true,
  },
  ascites: {
    key: "ascites",
    label: "Ascites",
    signature:
      "Shifting dullness ± fluid thrill · distension · everted umbilicus — causes: CLD/portal HTN, malignancy, TB peritonitis, schistosomiasis",
  },
  portal_htn: {
    key: "portal_htn",
    label: "Portal hypertension",
    signature: "Splenomegaly · ascites · caput medusae — consider cirrhosis / schistosomiasis",
  },
  cld: {
    key: "cld",
    label: "Chronic liver disease",
    signature:
      "≥2 stigmata (palmar erythema / spider naevi / leuconychia / gynaecomastia / Dupuytren's) ± jaundice/ascites/flap",
  },
  hepatomegaly_malig: {
    key: "hepatomegaly_malig",
    label: "Hepatomegaly — craggy/nodular",
    signature:
      "Craggy or nodular/hard liver — malignancy/cirrhosis; consider HCC (hep B), amoebic abscess",
    mustNotMiss: true,
  },
  hepatomegaly_congestive: {
    key: "hepatomegaly_congestive",
    label: "Hepatomegaly — smooth, tender",
    signature: "Smooth tender liver — congestion (heart failure) / hepatitis",
  },
  splenomegaly_massive: {
    key: "splenomegaly_massive",
    label: "Massive splenomegaly",
    signature:
      "Spleen to RIF — malaria/HMS · schistosomiasis · sickle-cell · CML · lymphoma · myelofibrosis",
  },
  ectopic_check: {
    key: "ectopic_check",
    label: "Lower-abdominal tenderness — β-hCG check",
    signature:
      "Reproductive-age woman with lower-abdominal signs → β-hCG before anything else (ectopic)",
    mustNotMiss: true,
  },
  gi_bleed: {
    key: "gi_bleed",
    label: "GI bleeding (PR blood/melaena)",
    signature: "Melaena / fresh blood PR — check HR/BP for shock; resuscitate before scoping",
    mustNotMiss: true,
  },
};

// ── Pure constellation engine ──
const hasValue = (c: AbdoExam, code: string, value?: string) => {
  const o = (c.findings ?? []).find((x) => x.code === code);
  if (!o || o.state !== "present") return false;
  return value ? (o.values ?? []).includes(value) : true;
};

const CLD_STIGMATA = new Set([
  "palmar erythema",
  "Dupuytren's contracture",
  "leuconychia",
  "spider naevi (>5)",
  "gynaecomastia",
  "loss of body hair",
]);

/**
 * Match the recorded constellation to the pattern(s) it fits. MULTIPLE on
 * ambiguity (broadening), must-not-miss/emergency ranked first, empty when
 * nothing recorded (NEVER auto-diagnoses).
 */
export function matchAbdoPatterns(c: AbdoExam): AbdoPattern[] {
  const out: AbdoPattern[] = [];
  const add = (k: keyof typeof ABDO_PATTERNS) => {
    const p = ABDO_PATTERNS[k];
    if (p && !out.some((x) => x.key === k)) out.push(p);
  };

  const involuntaryGuarding = Object.values(c.guarding ?? {}).includes("involuntary");
  const peritonism = !!c.rebound || !!c.percussionTenderness;

  // EMERGENCIES first
  if (c.rigidity === "board_like" || (involuntaryGuarding && peritonism)) add("peritonitis");
  if (c.aortaExpansile || (c.masses ?? []).some((m) => m.pulsatileExpansile)) add("ruptured_aaa");
  if (c.liverDullnessLost) add("perforation");

  // Obstruction
  if (
    c.bowelSounds === "tinkling" &&
    (hasValue(c, "contour", "distended") ||
      hasValue(c, "visible_abnormality", "visible peristalsis"))
  )
    add("obstruction");

  // Ascites + portal hypertension + CLD
  const ascites = !!c.shiftingDullness || !!c.fluidThrill;
  if (ascites) add("ascites");
  if (c.spleen?.palpable && (ascites || hasValue(c, "upper_body_stigmata", "caput medusae")))
    add("portal_htn");
  const stigmataCount = (c.findings ?? [])
    .filter((o) => o.state === "present")
    .flatMap((o) => o.values ?? [])
    .filter((v) => CLD_STIGMATA.has(v)).length;
  if (stigmataCount >= 2) add("cld");

  // Organomegaly characterisation
  if (c.liver?.palpable) {
    if (c.liver.surface === "craggy" || c.liver.edge === "nodular" || c.liver.edge === "hard")
      add("hepatomegaly_malig");
    else if (c.liver.tender && (c.liver.surface === "smooth" || c.liver.edge === "smooth"))
      add("hepatomegaly_congestive");
  }
  if (c.spleen?.extent === "massive (to RIF)") add("splenomegaly_massive");

  // Safety prompts (decision-support, not diagnoses)
  const lowerAbdo = (["rif", "suprapubic", "lif"] as AbdoRegion[]).some((r) => c.tenderness?.[r]);
  if (lowerAbdo) add("ectopic_check");
  const prBleed = (c.pr?.findings ?? []).some((x) => x === "melaena" || x === "fresh blood");
  if (prBleed) add("gi_bleed");

  return out.sort((a, b) => Number(!!b.mustNotMiss) - Number(!!a.mustNotMiss));
}

const REGION_LABEL: Record<AbdoRegion, string> = Object.fromEntries(
  ABDO_REGIONS.map((r) => [r.region, r.short]),
) as Record<AbdoRegion, string>;

/** Readable abdominal prose — regions, organs, percussion, PR honesty, patterns. */
export function renderAbdoProse(c: AbdoExam): string {
  const parts: string[] = [];
  const present = (c.findings ?? []).filter((o) => o.state === "present");
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

  const tender = Object.entries(c.tenderness ?? {});
  if (tender.length)
    parts.push(
      `Tender ${tender
        .map(([r, t]) => `${REGION_LABEL[r as AbdoRegion]}${t === "deep" ? " (deep)" : ""}`)
        .join(", ")}.`,
    );
  const guard = Object.entries(c.guarding ?? {});
  if (guard.length)
    parts.push(
      `Guarding ${guard.map(([r, g]) => `${REGION_LABEL[r as AbdoRegion]} (${g})`).join(", ")}.`,
    );
  if (c.rigidity && c.rigidity !== "none")
    parts.push(c.rigidity === "board_like" ? "Board-like rigidity." : "Localised rigidity.");
  if (c.rebound) parts.push("Rebound tenderness.");
  if (c.percussionTenderness) parts.push("Percussion tenderness.");

  if (c.liver?.palpable) {
    const bits = [
      c.liver.span ? `${c.liver.span} below the costal margin` : undefined,
      c.liver.edge ? `${c.liver.edge} edge` : undefined,
      c.liver.surface === "craggy" ? "craggy surface" : undefined,
      c.liver.tender ? "tender" : undefined,
      c.liver.pulsatile ? "pulsatile" : undefined,
    ].filter(Boolean);
    parts.push(`Liver palpable${bits.length ? ` (${bits.join(", ")})` : ""}.`);
  }
  if (c.spleen?.palpable)
    parts.push(
      `Spleen palpable${c.spleen.extent ? ` (${c.spleen.extent}${c.spleen.notch ? ", notch felt" : ""})` : ""}.`,
    );
  if (c.kidneys?.leftBallotable || c.kidneys?.rightBallotable) {
    const sides = [c.kidneys.rightBallotable ? "right" : "", c.kidneys.leftBallotable ? "left" : ""]
      .filter(Boolean)
      .join(" + ");
    parts.push(`Ballotable ${sides} kidney.`);
  }
  if (c.aortaExpansile) parts.push("Expansile pulsatile aorta.");
  if (c.bladderPalpable) parts.push("Bladder palpable (retention).");
  for (const m of c.masses ?? []) {
    const bits = [
      m.region ? REGION_LABEL[m.region] : undefined,
      m.size,
      m.surface,
      m.consistency,
      m.mobility,
      m.pulsatileExpansile ? "expansile pulsatile" : undefined,
      m.tender ? "tender" : undefined,
    ].filter(Boolean);
    parts.push(`Mass: ${bits.join(", ")}.`);
  }

  if (c.liverDullnessLost) parts.push("Loss of liver dullness.");
  if (c.shiftingDullness) parts.push("Shifting dullness.");
  if (c.fluidThrill) parts.push("Fluid thrill.");
  if (c.bowelSounds && c.bowelSounds !== "normal")
    parts.push(c.bowelSounds === "tinkling" ? "Tinkling bowel sounds." : "Absent bowel sounds.");
  if (c.bowelSounds === "normal") parts.push("Bowel sounds normal.");
  if (c.bruits?.length) parts.push(`Bruits: ${c.bruits.join(", ")}.`);
  if (c.succussionSplash) parts.push("Succussion splash.");

  // PR — stated honestly whenever the exam has content
  if (c.pr?.state === "examined")
    parts.push(`PR: ${c.pr.findings?.length ? c.pr.findings.join(", ") : "no abnormality"}.`);
  else if (c.pr?.state === "declined") parts.push("PR: offered, declined.");
  else if (parts.length) parts.push("PR: not examined.");

  const patterns = matchAbdoPatterns(c);
  if (patterns.length)
    parts.push(`Pattern(s) to consider: ${patterns.map((p) => p.label).join(" / ")}.`);
  return parts.length ? `Abdominal examination: ${parts.join(" ")}` : "";
}

/** Abdominal findings + constellation → reasoning tokens (feed the differential). */
export function abdoReasoningTokens(c: AbdoExam): { positives: string[]; negatives: string[] } {
  const positives: string[] = [];
  for (const o of c.findings ?? [])
    if (o.state === "present") positives.push(o.display, ...(o.values ?? []));
  if (Object.keys(c.tenderness ?? {}).length) positives.push("abdominal tenderness");
  if (c.rigidity === "board_like" || c.rebound) positives.push("peritonism");
  if (c.liver?.palpable) positives.push("hepatomegaly");
  if (c.spleen?.palpable) positives.push("splenomegaly");
  if (c.aortaExpansile) positives.push("pulsatile mass");
  if (c.shiftingDullness || c.fluidThrill) positives.push("ascites", "abdominal distension");
  for (const x of c.pr?.findings ?? []) positives.push(x);
  for (const p of matchAbdoPatterns(c)) positives.push(p.label);
  return { positives: Array.from(new Set(positives)), negatives: [] };
}

/** "Normal abdominal exam" fast path — examined-normal everywhere; PR stays
 * honestly NOT-examined (the fast path must never claim an unperformed PR). */
export function normalAbdoExam(): AbdoExam {
  return {
    findings: ABDO_FINDINGS.filter((x) => x.kind === "panel").map((x) => ({
      code: x.code,
      group: x.group,
      display: x.display,
      state: "absent" as const,
    })),
    tenderness: {},
    guarding: {},
    rigidity: "none",
    rebound: false,
    percussionTenderness: false,
    liver: { palpable: false },
    spleen: { palpable: false },
    kidneys: { leftBallotable: false, rightBallotable: false },
    aortaExpansile: false,
    bladderPalpable: false,
    liverDullnessLost: false,
    shiftingDullness: false,
    fluidThrill: false,
    bowelSounds: "normal",
    pr: { state: "not_examined" },
  };
}
