import type { ExamFinding } from "@/lib/clerkship/exam/types";

/**
 * General Examination finding catalog — CSO-signed code reference data, anchored
 * to Hutchison's Clinical Methods 24e Ch 2 (general examination + spot diagnosis).
 * Tap-first: "select" = graded single-pick; "panel" = three-state with a multi
 * value-set. Decision-support — what to look for; the clinician records the
 * actual findings. See ADR 0066 + clerkship-general-examination-catalog.md.
 */

export const EXAM_GROUPS = [
  { key: "inspection", label: "General inspection" },
  { key: "spot_diagnosis", label: "Spot diagnosis (patterns)" },
  { key: "hands", label: "Hands & upper limbs" },
  { key: "face_eyes_mouth", label: "Face, eyes, mouth" },
  { key: "neck", label: "Neck" },
  { key: "peripheral", label: "Lymphoreticular & peripheral" },
] as const;

const f = (
  code: string,
  group: string,
  display: string,
  kind: "select" | "panel",
  options: string[],
  extra: Partial<ExamFinding> = {},
): ExamFinding => ({ code, group, display, kind, options, ...extra });

export const EXAM_FINDINGS: ExamFinding[] = [
  // ── §1 General inspection ──
  f(
    "wellbeing",
    "inspection",
    "General wellbeing",
    "select",
    ["well", "unwell", "unwell + distressed", "peri-arrest"],
    { mustNotMiss: true },
  ),
  f("distress", "inspection", "Distress", "select", ["none", "mild", "moderate", "severe"]),
  f("in_pain", "inspection", "In pain", "panel", []),
  f("breathless_rest", "inspection", "Breathless at rest", "panel", []),
  f("habitus", "inspection", "Body habitus / nutrition", "select", [
    "cachectic",
    "thin",
    "normal",
    "overweight",
    "obese",
  ]),
  f("hydration", "inspection", "Hydration", "select", [
    "well-hydrated",
    "mild dehydration",
    "significant dehydration",
  ]),
  f("dehydration_signs", "inspection", "Dehydration signs", "panel", [
    "dry mucous membranes",
    "reduced skin turgor",
    "sunken eyes",
  ]),
  f(
    "consciousness",
    "inspection",
    "Consciousness",
    "select",
    ["alert", "drowsy", "confused", "responds to voice", "responds to pain", "unresponsive"],
    { mustNotMiss: true },
  ),
  f("position", "inspection", "Position / comfort", "select", [
    "sitting up",
    "tripod",
    "orthopnoeic",
    "lying flat",
    "restless",
    "still",
  ]),
  f("obvious_abnormalities", "inspection", "Obvious abnormalities", "panel", [
    "pallor",
    "jaundice",
    "central cyanosis",
    "peripheral cyanosis",
    "oedema",
    "rash",
    "visible scars",
    "obvious mass",
  ]),
  f("attachments", "inspection", "Attachments", "panel", [
    "oxygen",
    "IV line",
    "urinary catheter",
    "drains",
    "monitoring",
  ]),
  f("bedside_smell", "inspection", "Bedside smell", "panel", [
    "ketones",
    "fetor hepaticus",
    "melaena",
  ]),

  // ── §2 Spot diagnosis (patterns) — a positive prompts the focused exam ──
  f("p_cushingoid", "spot_diagnosis", "Cushingoid appearance", "panel", [], { pattern: true }),
  f("p_acromegalic", "spot_diagnosis", "Acromegalic features", "panel", [], { pattern: true }),
  f("p_graves", "spot_diagnosis", "Thyroid eye signs / goitre (Graves')", "panel", [], {
    pattern: true,
  }),
  f("p_hypothyroid", "spot_diagnosis", "Hypothyroid facies", "panel", [], { pattern: true }),
  f("p_parkinsonian", "spot_diagnosis", "Parkinsonian facies / posture", "panel", [], {
    pattern: true,
  }),
  f("p_facial_droop", "spot_diagnosis", "Facial droop (stroke)", "panel", [], {
    pattern: true,
    mustNotMiss: true,
  }),
  f("p_marfanoid", "spot_diagnosis", "Marfanoid habitus", "panel", [], { pattern: true }),
  f("p_marked_jaundice", "spot_diagnosis", "Marked jaundice", "panel", [], { pattern: true }),
  f("p_marked_pallor", "spot_diagnosis", "Marked pallor (anaemia)", "panel", [], { pattern: true }),
  f("p_central_cyanosis", "spot_diagnosis", "Central cyanosis", "panel", [], {
    pattern: true,
    mustNotMiss: true,
  }),

  // ── §3 Hands & upper limbs ──
  f("nails", "hands", "Nails", "panel", [
    "clubbing",
    "koilonychia",
    "leuconychia",
    "splinter haemorrhages",
    "nail-fold infarcts",
    "pitting / onycholysis",
  ]),
  f("palms", "hands", "Palms", "panel", [
    "palmar erythema",
    "pale palmar creases",
    "Dupuytren's contracture",
  ]),
  f("hand_lesions", "hands", "Skin & lesions", "panel", [
    "tar staining",
    "tendon xanthomata",
    "Janeway lesions",
    "Osler's nodes",
  ]),
  f("tremor", "hands", "Tremor", "select", ["none", "fine", "resting", "flapping / asterixis"]),
  f("perfusion", "hands", "Peripheral perfusion", "select", ["warm", "cool peripheries"]),
  f("cap_refill", "hands", "Capillary refill", "select", ["≤2 s", ">2 s"]),
  f("sweating", "hands", "Sweating", "panel", []),

  // ── §4 Face, eyes, mouth ──
  f("eyes", "face_eyes_mouth", "Eyes", "panel", [
    "conjunctival pallor",
    "scleral icterus",
    "Horner's",
    "xanthelasma",
    "corneal arcus",
    "Kayser–Fleischer ring",
    "Graves' eye signs",
  ]),
  f("face", "face_eyes_mouth", "Face", "panel", [
    "malar / butterfly rash",
    "cushingoid",
    "acromegalic",
    "facial droop",
    "parotid swelling",
  ]),
  f(
    "mouth",
    "face_eyes_mouth",
    "Mouth",
    "panel",
    [
      "central cyanosis (tongue)",
      "dry (dehydration)",
      "oral candidiasis",
      "ulcers",
      "poor dentition",
      "glossitis",
      "angular stomatitis",
    ],
    { ugandaFlag: "hiv" },
  ),

  // ── §5 Neck ──
  f("jvp", "neck", "JVP", "select", ["not raised", "raised"]),
  f("cervical_nodes", "neck", "Cervical nodes", "panel", [
    "enlarged",
    "tender",
    "firm-hard",
    "fixed",
    "matted",
    "<1 cm",
    "1–2 cm",
    ">2 cm",
  ]),
  f(
    "supraclavicular_nodes",
    "neck",
    "Supraclavicular nodes (Virchow's)",
    "panel",
    ["enlarged", "tender", "firm-hard", "fixed", "matted", "<1 cm", "1–2 cm", ">2 cm"],
    { mustNotMiss: true },
  ),
  f("thyroid", "neck", "Thyroid", "panel", ["diffuse goitre", "nodule", "bruit"]),
  f("carotid", "neck", "Carotid", "panel", ["bruit", "abnormal character"]),
  f("trachea", "neck", "Trachea", "select", ["central", "deviated"]),

  // ── §6 Lymphoreticular & peripheral ──
  f("axillary_nodes", "peripheral", "Axillary nodes", "panel", [
    "enlarged",
    "tender",
    "firm-hard",
    "fixed",
    "matted",
    "<1 cm",
    "1–2 cm",
    ">2 cm",
  ]),
  f("inguinal_nodes", "peripheral", "Inguinal nodes", "panel", [
    "enlarged",
    "tender",
    "firm-hard",
    "fixed",
    "matted",
    "<1 cm",
    "1–2 cm",
    ">2 cm",
  ]),
  f("epitrochlear_nodes", "peripheral", "Epitrochlear nodes", "panel", ["enlarged", "tender"]),
  f("hepatosplenomegaly", "peripheral", "Hepatosplenomegaly (flag)", "panel", [
    "hepatomegaly",
    "splenomegaly",
  ]),
  f("oedema", "peripheral", "Peripheral oedema", "select", ["none", "ankle", "to knee", "sacral"]),
  f("oedema_character", "peripheral", "Oedema character", "panel", [
    "pitting",
    "non-pitting",
    "unilateral",
    "bilateral",
  ]),
  f(
    "legs",
    "peripheral",
    "Legs",
    "panel",
    ["calf swelling / tenderness", "ulcers", "varicose veins"],
    { mustNotMiss: true },
  ),
  f("peripheral_pulses", "peripheral", "Peripheral pulses", "select", [
    "present",
    "reduced",
    "absent",
  ]),
  f(
    "skin_general",
    "peripheral",
    "Skin (general)",
    "panel",
    ["rash", "bruising", "non-blanching purpura", "pigmentation"],
    { mustNotMiss: true },
  ),
];

export const EXAM_FINDING_BY_CODE: Record<string, ExamFinding> = Object.fromEntries(
  EXAM_FINDINGS.map((x) => [x.code, x]),
);
