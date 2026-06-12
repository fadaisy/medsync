/**
 * Musculoskeletal (Locomotor) Examination — domain module (types + catalog +
 * pattern engine). The fifth system-specific exam layer onto the general exam
 * (resp/CVS/abdo/neuro pattern; ADRs 0067–0070). TWO-LEVEL: the GALS screen
 * (Gait/Arms/Legs/Spine + 3 screening questions — the rapid fast path) and
 * regional Look→Feel→Move cards by joint/region & side with structured ROM +
 * tap-to-cycle special tests. Carries the BACK-PAIN RED-FLAG screen (cauda
 * equina options REUSED from the neuro exam — consistent, never contradictory)
 * and the arthropathy pattern engine: distribution + character → inflammatory/
 * RA · OA · crystal/gout · SEPTIC · spondyloarthropathy · psoriatic · rheumatic
 * fever · sickle-cell — PURE + DECISION-SUPPORT, MULTIPLE on ambiguity,
 * must-not-miss flagged (septic arthritis / cauda equina / cord compression /
 * back red flags / compartment syndrome), NEVER auto-diagnoses. Consistent with
 * the joint_pain reasoning map. Uganda woven in (septic HIV/diabetes, rheumatic
 * fever, gout, Pott's, sickle-cell). CSO-signed catalog; Hutchison Ch 15 +
 * GALS (Doherty). See ADR 0071.
 */

import type { ExamFinding, ExamObservation } from "@/lib/clerkship/exam/types";

import { CAUDA_OPTS } from "@/lib/clerkship/exam/neurological";

export type MskRegion =
  | "hand_wrist"
  | "elbow"
  | "shoulder"
  | "spine"
  | "hip"
  | "knee"
  | "ankle_foot";
export type MskSide = "right" | "left" | "bilateral";
export type MskRom = "full" | "restricted" | "restricted_painful";
export type TestResult = "positive" | "negative";

export const MSK_REGIONS: { region: MskRegion; label: string }[] = [
  { region: "hand_wrist", label: "Hand / wrist" },
  { region: "elbow", label: "Elbow" },
  { region: "shoulder", label: "Shoulder" },
  { region: "spine", label: "Spine" },
  { region: "hip", label: "Hip" },
  { region: "knee", label: "Knee" },
  { region: "ankle_foot", label: "Ankle / foot" },
];

/** LOOK — generic inspection chips (every region). */
export const LOOK_OPTS = [
  "erythema",
  "soft-tissue swelling",
  "bony swelling",
  "effusion",
  "deformity",
  "muscle wasting",
  "scars",
  "psoriatic plaques",
] as const;

/** LOOK — region-specific extras. */
export const REGION_LOOK_EXTRAS: Record<MskRegion, string[]> = {
  hand_wrist: [
    "MCP/PIP swelling",
    "ulnar deviation",
    "swan-neck",
    "boutonnière",
    "Z-thumb",
    "Heberden's nodes (DIP)",
    "Bouchard's nodes (PIP)",
    "thumb-base squaring",
    "nail pitting / onycholysis",
    "thenar wasting",
    "dactylitis",
  ],
  elbow: ["rheumatoid nodules"],
  shoulder: ["winging"],
  spine: ["kyphosis", "scoliosis", "loss of lordosis", "step"],
  hip: ["leg-length discrepancy", "fixed flexion posture"],
  knee: ["valgus", "varus", "quadriceps wasting", "Baker's cyst"],
  ankle_foot: [
    "podagra (1st MTP)",
    "callus",
    "ulcer (diabetic)",
    "claw / hammer toes",
    "dactylitis",
  ],
};

/** FEEL — palpation chips. */
export const FEEL_OPTS = [
  "warmth",
  "joint-line tenderness",
  "entheseal tenderness",
  "effusion",
  "boggy synovial thickening",
  "crepitus",
  "bony tenderness",
  "pain out of proportion (compartment)",
] as const;

/** Region-specific special tests (tap-to-cycle: untested → positive → negative). */
export const REGION_SPECIAL_TESTS: Record<MskRegion, string[]> = {
  hand_wrist: ["Phalen's", "Tinel's", "Finkelstein's"],
  elbow: ["lateral epicondylitis (tennis)", "medial epicondylitis (golfer's)"],
  shoulder: ["painful arc 60–120°", "rotator-cuff weakness", "impingement test"],
  spine: ["Schober's restricted", "straight-leg raise", "femoral stretch", "sacroiliac tenderness"],
  hip: ["Thomas test (fixed flexion)", "Trendelenburg", "internal rotation lost"],
  knee: [
    "patellar tap (effusion)",
    "bulge / sweep (effusion)",
    "joint-line tenderness (meniscus)",
    "valgus / varus laxity",
    "anterior draw / Lachman",
    "McMurray's",
  ],
  ankle_foot: ["MTP squeeze tender", "Simmonds / Thompson (Achilles)"],
};

/** A regional Look-Feel-Move examination card. */
export interface MskRegional {
  id: string;
  region?: MskRegion;
  side?: MskSide;
  look?: string[];
  feel?: string[];
  rom?: MskRom;
  /** Special tests by name → result (untested tests simply absent). */
  specialTests?: Record<string, TestResult>;
}

/** GALS screen — 3 questions + the four domains. */
export interface GalsScreen {
  /** Pain or stiffness in muscles, joints or back? */
  qPainStiffness?: boolean;
  /** Can dress without difficulty? */
  qDress?: boolean;
  /** Can manage stairs without difficulty? */
  qStairs?: boolean;
  gait?: "normal" | "antalgic" | "abnormal";
  arms?: "normal" | "abnormal";
  legs?: "normal" | "abnormal";
  spine?: "normal" | "abnormal";
}

/** Back-pain red-flag option groups (cauda set REUSED from the neuro exam). */
export const BACK_FLAG_CAUDA = CAUDA_OPTS;
export const BACK_FLAG_CORD = [
  "sensory level",
  "progressive bilateral weakness",
  "UMN signs below a level",
] as const;
export const BACK_FLAG_MALIGNANCY = [
  "night pain",
  "weight loss",
  "age >50 or <20",
  "known cancer",
] as const;
export const BACK_FLAG_INFECTION = [
  "fever",
  "IVDU",
  "immunosuppression",
  "TB risk (Pott's)",
] as const;
export const BACK_FLAG_FRACTURE = ["significant trauma", "osteoporosis", "steroids"] as const;

/** The captured MSK exam (section_data; no migration). */
export interface MskExam {
  /** GALS detail + function three-state findings. */
  findings?: ExamObservation[];
  gals?: GalsScreen;
  regions?: MskRegional[];
  /** Arthropathy pattern characteriser (distribution + character). */
  distribution?: "monoarticular" | "oligoarticular" | "polyarticular";
  symmetry?: "symmetrical" | "asymmetrical";
  jointSize?: "small_joints" | "large_joints" | "mixed";
  morningStiffness?: "none" | "brief" | "over_30min";
  hotSwollenJoint?: boolean;
  cannotWeightBear?: boolean;
  worseWithUse?: boolean;
  migratory?: boolean;
  precedingSoreThroat?: boolean;
  backRedFlags?: string[];
}

// ── GALS-detail + function finding catalog ──
export const MSK_GROUPS = [
  { key: "gals_detail", label: "GALS detail" },
  { key: "msk_function", label: "Function & measure" },
] as const;

const f = (
  code: string,
  group: string,
  display: string,
  kind: "select" | "panel",
  options: string[],
  extra: Partial<ExamFinding> = {},
): ExamFinding => ({ code, group, display, kind, options, ...extra });

export const MSK_FINDINGS: ExamFinding[] = [
  f("gals_hands", "gals_detail", "Hands (GALS)", "panel", [
    "MCP/PIP squeeze tender",
    "deformity",
    "wasting",
    "weak grip",
    "impaired pinch",
  ]),
  f("gals_shoulders", "gals_detail", "Shoulders / elbows (GALS)", "panel", [
    "abduction restricted",
    "hands-behind-head restricted",
    "elbow extension restricted",
  ]),
  f("gals_knees", "gals_detail", "Knees (GALS)", "panel", ["effusion", "crepitus", "deformity"]),
  f("gals_hips", "gals_detail", "Hips (GALS)", "panel", ["internal rotation restricted / painful"]),
  f("gals_feet", "gals_detail", "Feet (GALS)", "panel", [
    "MTP squeeze tender",
    "deformity",
    "callus",
    "ulcer",
  ]),
  f("gals_spine", "gals_detail", "Spine (GALS)", "panel", [
    "cervical lateral flexion restricted",
    "thoracolumbar flexion restricted",
    "scoliosis",
    "kyphosis",
  ]),
  f("msk_function", "msk_function", "Function", "panel", [
    "dressing impaired",
    "stairs impaired",
    "walking impaired",
    "grip impaired",
  ]),
  f("enthesitis_sites", "msk_function", "Enthesitis / dactylitis", "panel", [
    "enthesitis",
    "dactylitis",
  ]),
  f("leg_length", "msk_function", "Leg length", "panel", [
    "true discrepancy",
    "apparent discrepancy",
  ]),
];

// ── Arthropathy / red-flag patterns (decision-support reference; CSO-signed) ──
export interface MskPattern {
  key: string;
  label: string;
  signature: string;
  mustNotMiss?: boolean;
  emergency?: boolean;
}

export const MSK_PATTERNS: Record<string, MskPattern> = {
  septic_arthritis: {
    key: "septic_arthritis",
    label: "Septic arthritis",
    signature:
      "Acute single HOT swollen joint ± fever ± cannot weight-bear — septic until proven otherwise: ASPIRATE, do not delay (Uganda: HIV/diabetes — low threshold)",
    mustNotMiss: true,
    emergency: true,
  },
  cauda_equina: {
    key: "cauda_equina",
    label: "Cauda equina syndrome",
    signature: "Saddle anaesthesia / anal tone / bilateral legs / bladder — EMERGENCY; urgent MRI",
    mustNotMiss: true,
    emergency: true,
  },
  cord_compression: {
    key: "cord_compression",
    label: "Cord compression",
    signature:
      "Sensory level / progressive bilateral weakness / UMN below — EMERGENCY (Uganda: Pott's / TB spine, malignancy)",
    mustNotMiss: true,
    emergency: true,
  },
  compartment_syndrome: {
    key: "compartment_syndrome",
    label: "Compartment syndrome",
    signature: "Pain out of proportion (post-trauma) — EMERGENCY; pressures/fasciotomy assessment",
    mustNotMiss: true,
    emergency: true,
  },
  back_red_flags: {
    key: "back_red_flags",
    label: "Back-pain red flags",
    signature:
      "Malignancy (night pain/weight loss/age/cancer) · infection (fever/IVDU/immunosuppression/TB) · fracture (trauma/osteoporosis/steroids) — investigate before calling it mechanical",
    mustNotMiss: true,
  },
  inflammatory_ra: {
    key: "inflammatory_ra",
    label: "Inflammatory arthritis (RA pattern)",
    signature:
      "Symmetrical small joints (MCP/PIP/wrist) + morning stiffness >30 min + synovitis/warmth; DIP-sparing",
  },
  osteoarthritis: {
    key: "osteoarthritis",
    label: "Osteoarthritis (mechanical)",
    signature:
      "Weight-bearing/DIP joints + worse with use + brief stiffness + bony swelling (Heberden's/Bouchard's) + crepitus",
  },
  gout: {
    key: "gout",
    label: "Crystal arthritis (gout / pseudogout)",
    signature:
      "Acute monoarticular + 1st MTP (podagra) + hot/red ± tophi — confirm by aspiration (exclude septic)",
  },
  spondyloarthropathy: {
    key: "spondyloarthropathy",
    label: "Spondyloarthropathy",
    signature:
      "Spinal/sacroiliac + enthesitis + dactylitis + asymmetrical large joints + reduced Schober's",
  },
  psoriatic: {
    key: "psoriatic",
    label: "Psoriatic arthritis",
    signature: "DIP involvement + dactylitis + nail pitting/onycholysis + psoriatic plaques",
  },
  rheumatic_fever: {
    key: "rheumatic_fever",
    label: "Rheumatic fever",
    signature:
      "Migratory large-joint arthritis + preceding sore throat — check for carditis (Uganda: → rheumatic heart disease)",
    mustNotMiss: true,
  },
  sickle_cell: {
    key: "sickle_cell",
    label: "Sickle-cell bone/joint disease",
    signature:
      "Dactylitis / bone crises / avascular necrosis (esp. hip) — Uganda; check sickle status",
  },
};

// ── Pure pattern engine ──
const cardHas = (c: MskExam, list: "look" | "feel", value: string) =>
  (c.regions ?? []).some((r) => (r[list] ?? []).includes(value));
const testPositive = (c: MskExam, name: string) =>
  (c.regions ?? []).some((r) => r.specialTests?.[name] === "positive");
const flagIn = (c: MskExam, set: readonly string[]) =>
  (c.backRedFlags ?? []).some((x) => (set as readonly string[]).includes(x));

/**
 * Match the recorded cluster to the arthropathy/red-flag pattern(s) it fits.
 * MULTIPLE on ambiguity (a hot 1st MTP fits gout AND stays septic-until-proven),
 * must-not-miss/emergency ranked first, empty when nothing recorded (NEVER
 * auto-diagnoses).
 */
export function matchMskPatterns(c: MskExam): MskPattern[] {
  const out: MskPattern[] = [];
  const add = (k: keyof typeof MSK_PATTERNS) => {
    const p = MSK_PATTERNS[k];
    if (p && !out.some((x) => x.key === k)) out.push(p);
  };

  const dactylitis =
    cardHas(c, "look", "dactylitis") ||
    (c.findings ?? []).some(
      (o) =>
        o.code === "enthesitis_sites" &&
        o.state === "present" &&
        (o.values ?? []).includes("dactylitis"),
    );
  const enthesitis =
    cardHas(c, "feel", "entheseal tenderness") ||
    (c.findings ?? []).some(
      (o) =>
        o.code === "enthesitis_sites" &&
        o.state === "present" &&
        (o.values ?? []).includes("enthesitis"),
    );
  const podagra = cardHas(c, "look", "podagra (1st MTP)");

  // EMERGENCIES / must-not-miss first
  if (c.hotSwollenJoint) add("septic_arthritis");
  if (flagIn(c, BACK_FLAG_CAUDA)) add("cauda_equina");
  if (flagIn(c, BACK_FLAG_CORD)) add("cord_compression");
  if (cardHas(c, "feel", "pain out of proportion (compartment)")) add("compartment_syndrome");
  if (
    flagIn(c, BACK_FLAG_MALIGNANCY) ||
    flagIn(c, BACK_FLAG_INFECTION) ||
    flagIn(c, BACK_FLAG_FRACTURE)
  )
    add("back_red_flags");
  if (c.migratory && c.precedingSoreThroat) add("rheumatic_fever");

  // Arthropathy patterns
  if (
    (c.jointSize === "small_joints" && c.morningStiffness === "over_30min") ||
    (c.symmetry === "symmetrical" && c.morningStiffness === "over_30min") ||
    (c.symmetry === "symmetrical" &&
      c.jointSize === "small_joints" &&
      cardHas(c, "feel", "boggy synovial thickening"))
  )
    add("inflammatory_ra");
  if (
    c.worseWithUse &&
    c.morningStiffness !== "over_30min" &&
    (cardHas(c, "look", "bony swelling") ||
      cardHas(c, "look", "Heberden's nodes (DIP)") ||
      cardHas(c, "look", "Bouchard's nodes (PIP)") ||
      cardHas(c, "feel", "crepitus"))
  )
    add("osteoarthritis");
  if (podagra || (c.hotSwollenJoint && c.distribution === "monoarticular")) add("gout");
  if (
    testPositive(c, "Schober's restricted") ||
    testPositive(c, "sacroiliac tenderness") ||
    enthesitis
  )
    add("spondyloarthropathy");
  if (dactylitis) {
    // dactylitis broadens: psoriatic AND sickle-cell (Uganda) both surfaced
    add("psoriatic");
    add("sickle_cell");
  }
  if (cardHas(c, "look", "nail pitting / onycholysis") || cardHas(c, "look", "psoriatic plaques"))
    add("psoriatic");

  return out.sort((a, b) => Number(!!b.mustNotMiss) - Number(!!a.mustNotMiss));
}

const REGION_LABEL: Record<MskRegion, string> = Object.fromEntries(
  MSK_REGIONS.map((r) => [r.region, r.label]),
) as Record<MskRegion, string>;

/** Readable MSK prose — GALS, regional cards, pattern characteriser, red flags. */
export function renderMskProse(c: MskExam): string {
  const parts: string[] = [];
  const g = c.gals;
  if (g && (g.gait || g.arms || g.legs || g.spine)) {
    const abn = [
      g.gait && g.gait !== "normal" ? `gait ${g.gait}` : null,
      g.arms === "abnormal" ? "arms abnormal" : null,
      g.legs === "abnormal" ? "legs abnormal" : null,
      g.spine === "abnormal" ? "spine abnormal" : null,
    ].filter(Boolean);
    parts.push(abn.length ? `GALS: ${abn.join(", ")}.` : "GALS screen normal.");
  }
  if (g?.qPainStiffness) parts.push("Reports pain/stiffness.");
  if (g?.qDress === false) parts.push("Difficulty dressing.");
  if (g?.qStairs === false) parts.push("Difficulty with stairs.");

  const present = (c.findings ?? []).filter((o) => o.state === "present");
  if (present.length)
    parts.push(
      present
        .map((o) =>
          o.values?.length
            ? `${o.display.toLowerCase()}: ${o.values.join(", ")}`
            : o.display.toLowerCase(),
        )
        .join("; ") + ".",
    );

  for (const r of c.regions ?? []) {
    if (!r.region) continue;
    const bits = [
      r.side,
      r.look?.length ? `look — ${r.look.join(", ")}` : null,
      r.feel?.length ? `feel — ${r.feel.join(", ")}` : null,
      r.rom && r.rom !== "full"
        ? `ROM ${r.rom.replace("_", " + ")}`
        : r.rom === "full"
          ? "full ROM"
          : null,
    ].filter(Boolean);
    const tests = Object.entries(r.specialTests ?? {});
    if (tests.length) bits.push(tests.map(([t, res]) => `${t} ${res}`).join(", "));
    parts.push(`${REGION_LABEL[r.region]}${bits.length ? ` (${bits.join("; ")})` : ""}.`);
  }

  const ch: string[] = [];
  if (c.distribution) ch.push(c.distribution);
  if (c.symmetry) ch.push(c.symmetry);
  if (c.jointSize) ch.push(c.jointSize.replace("_", " "));
  if (c.morningStiffness && c.morningStiffness !== "none")
    ch.push(c.morningStiffness === "over_30min" ? "morning stiffness >30 min" : "brief stiffness");
  if (c.hotSwollenJoint) ch.push("hot swollen joint");
  if (c.cannotWeightBear) ch.push("cannot weight-bear");
  if (c.worseWithUse) ch.push("worse with use");
  if (c.migratory) ch.push("migratory");
  if (ch.length) parts.push(`Pattern: ${ch.join(", ")}.`);

  if (c.backRedFlags?.length) parts.push(`Back-pain red flags: ${c.backRedFlags.join(", ")}.`);

  const patterns = matchMskPatterns(c);
  if (patterns.length)
    parts.push(`Pattern(s) to consider: ${patterns.map((p) => p.label).join(" / ")}.`);
  return parts.length ? `Musculoskeletal examination: ${parts.join(" ")}` : "";
}

/** MSK findings + pattern → reasoning tokens (feed the differential). */
export function mskReasoningTokens(c: MskExam): { positives: string[]; negatives: string[] } {
  const positives: string[] = [];
  for (const o of c.findings ?? [])
    if (o.state === "present") positives.push(o.display, ...(o.values ?? []));
  if (c.hotSwollenJoint) positives.push("single hot swollen joint", "joint swelling");
  if (c.morningStiffness === "over_30min") positives.push("morning stiffness over 30 min");
  if (c.migratory) positives.push("migratory joint pain");
  if (c.backRedFlags?.length) positives.push(...c.backRedFlags);
  for (const r of c.regions ?? []) positives.push(...(r.look ?? []), ...(r.feel ?? []));
  for (const p of matchMskPatterns(c)) positives.push(p.label);
  return { positives: Array.from(new Set(positives)), negatives: [] };
}

/** "Normal GALS / MSK exam" fast path — screen normal, questions favourable. */
export function normalMskExam(): MskExam {
  return {
    findings: MSK_FINDINGS.filter((x) => x.kind === "panel").map((x) => ({
      code: x.code,
      group: x.group,
      display: x.display,
      state: "absent" as const,
    })),
    gals: {
      qPainStiffness: false,
      qDress: true,
      qStairs: true,
      gait: "normal",
      arms: "normal",
      legs: "normal",
      spine: "normal",
    },
    regions: [],
    backRedFlags: [],
  };
}
