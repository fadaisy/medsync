/**
 * Endocrine · Peripheral Vascular · Diabetic-Foot Examination — domain module
 * (types + catalog + verified constants + cluster engines). The NCD-focused
 * exam pack: (A) thyroid status, (B) peripheral vascular (arterial + venous),
 * (C) the diabetic foot — MedSync's highest-yield prevention exam, which yields
 * a clinician-confirmed RISK CATEGORY that feeds the monitoring re-exam loop.
 * A system-specific exam layer (resp/CVS/abdo/neuro/MSK pattern; ADRs 0067–0071).
 *
 * The cluster engines are PURE + DECISION-SUPPORT — surface the pattern(s) the
 * recorded findings fit, MULTIPLE on ambiguity, must-not-miss flagged (thyroid
 * storm/myxoedema, acute limb ischaemia, diabetic-foot sepsis, acute Charcot,
 * critical ischaemia, osteomyelitis), and NEVER auto-diagnose. The foot risk
 * category is SUGGESTED, never auto-assigned — the clinician confirms it.
 *
 * VERIFIED CONSTANTS (web-checked at build, not from memory — CSO to re-confirm):
 *  - Diabetic-foot risk categories + screening intervals: IWGDF 2023
 *    (Bus et al., Diab Metab Res Rev 2024; iwgdfguidelines.org 2023 Prevention).
 *  - ABPI interpretation thresholds: NICE CG147 + Wounds UK (PAD <0.9;
 *    critical <0.5; calcified/falsely-high >1.4 — use toe-brachial index).
 * See ADR 0072. Reuses neuro sensory + CVS pulses concepts; vitals (glucose/HR).
 */

import type { ExamFinding, ExamObservation } from "@/lib/clerkship/exam/types";

export type Side = "right" | "left";

// ── A. Thyroid status ──────────────────────────────────────────────────────
export interface ThyroidExam {
  /** Functional lean from the bedside cluster. */
  status?: "euthyroid" | "hyperthyroid" | "hypothyroid";
  gland?: (
    | "diffuse goitre"
    | "solitary nodule"
    | "multinodular"
    | "tender"
    | "bruit"
    | "fixed / hard"
    | "cervical nodes"
    | "retrosternal"
  )[];
  eyeSigns?: ("exophthalmos" | "lid retraction" | "lid lag" | "ophthalmoplegia" | "chemosis")[];
}

export const THYROID_GLAND_OPTS = [
  "diffuse goitre",
  "solitary nodule",
  "multinodular",
  "tender",
  "bruit",
  "fixed / hard",
  "cervical nodes",
  "retrosternal",
] as const;
export const THYROID_EYE_OPTS = [
  "exophthalmos",
  "lid retraction",
  "lid lag",
  "ophthalmoplegia",
  "chemosis",
] as const;

// ── B. Peripheral vascular ─────────────────────────────────────────────────
export type PulseGrade = "present" | "reduced" | "absent";
export const NAMED_PULSES = [
  "radial",
  "brachial",
  "carotid",
  "femoral",
  "popliteal",
  "posterior tibial",
  "dorsalis pedis",
] as const;
export type NamedPulse = (typeof NAMED_PULSES)[number];

export interface VascularExam {
  arterialLook?: string[];
  /** Pulses by name → per-side grade. */
  pulses?: Partial<Record<NamedPulse, Partial<Record<Side, PulseGrade>>>>;
  bruits?: string[];
  buergers?: "positive" | "negative";
  /** ABPI value if measured (interpreted via cited thresholds). */
  abpi?: Partial<Record<Side, number>>;
  /** The 6 P's of acute limb ischaemia. */
  acuteIschaemia?: string[];
  restPain?: boolean;
  venousLook?: string[];
  dvtSigns?: boolean;
}

export const ARTERIAL_LOOK_OPTS = [
  "pallor",
  "trophic changes (hair loss / shiny skin)",
  "arterial ulcer (punched-out, tips/pressure)",
  "gangrene",
  "dependent rubor",
  "amputation / bypass scar",
] as const;
export const VENOUS_LOOK_OPTS = [
  "varicose veins",
  "venous ulcer (gaiter, sloping edge)",
  "haemosiderin / lipodermatosclerosis",
  "venous eczema",
  "oedema",
] as const;
export const SIX_PS = [
  "Pain",
  "Pallor",
  "Pulselessness",
  "Paraesthesia",
  "Paralysis",
  "Perishingly cold",
] as const;
export const ARTERIAL_BRUIT_OPTS = ["carotid", "abdominal aortic", "femoral", "renal"] as const;

/** ABPI interpretation — VERIFIED (NICE CG147 + Wounds UK). */
export type AbpiBand = "calcified" | "normal" | "pad" | "critical";
export function interpretAbpi(v: number | undefined): AbpiBand | null {
  if (v == null) return null;
  if (v > 1.4) return "calcified"; // falsely high (diabetes/CKD) → use toe-brachial index
  if (v < 0.5) return "critical"; // critical limb ischaemia
  if (v < 0.9) return "pad";
  return "normal"; // 0.9–1.4
}
export const ABPI_BAND_LABEL: Record<AbpiBand, string> = {
  calcified: "non-compressible / falsely high (>1.4) — use toe-brachial index",
  normal: "normal (0.9–1.4)",
  pad: "peripheral arterial disease (<0.9)",
  critical: "critical limb ischaemia (<0.5)",
};

// ── C. Diabetic foot ───────────────────────────────────────────────────────
export type FootSite = "hallux" | "1st_mth" | "3rd_mth" | "5th_mth" | "midfoot" | "heel";
export const FOOT_MONOFILAMENT_SITES: { site: FootSite; label: string }[] = [
  { site: "hallux", label: "Hallux" },
  { site: "1st_mth", label: "1st MTH" },
  { site: "3rd_mth", label: "3rd MTH" },
  { site: "5th_mth", label: "5th MTH" },
  { site: "midfoot", label: "Midfoot" },
  { site: "heel", label: "Heel" },
];

/** Per-foot diabetic-foot findings. */
export interface DiabeticFootSide {
  skin?: string[];
  deformity?: string[];
  /** 10g monofilament per site: true = felt, false = not felt. */
  monofilament?: Partial<Record<FootSite, boolean>>;
  vibration?: "felt" | "reduced" | "absent";
  pulsesPresent?: boolean;
  warmCharcot?: boolean;
  infection?: string[];
}

export const FOOT_SKIN_OPTS = [
  "callus",
  "neuropathic ulcer (painless, pressure point)",
  "ischaemic ulcer (painful, tips/margins)",
  "fissures",
  "interdigital maceration",
  "gangrene",
  "prior amputation",
] as const;
export const FOOT_DEFORMITY_OPTS = [
  "clawing / hammer toes",
  "prominent metatarsal heads",
  "hallux valgus",
  "Charcot (rocker-bottom)",
] as const;
export const FOOT_INFECTION_OPTS = [
  "erythema",
  "warmth",
  "swelling",
  "purulent discharge",
  "probe-to-bone (osteomyelitis)",
  "malodour",
] as const;

export interface DiabeticFootExam {
  right?: DiabeticFootSide;
  left?: DiabeticFootSide;
  /** History inputs that raise the IWGDF category. */
  priorUlcerOrAmputation?: boolean;
  endStageRenal?: boolean;
  systemicSepsis?: boolean;
  /** The clinician-CONFIRMED risk category (never auto-assigned). */
  confirmedRisk?: FootRiskKey;
}

export interface EvfExam {
  /** Non-structured three-state findings (peripheral thyroid / legs). */
  findings?: ExamObservation[];
  thyroid?: ThyroidExam;
  vascular?: VascularExam;
  foot?: DiabeticFootExam;
}

// ── Diabetic-foot risk categorisation — IWGDF 2023 (VERIFIED CITED CONSTANTS) ──
export type FootRiskKey = "very_low" | "low" | "moderate" | "high" | "active";
export interface FootRisk {
  key: FootRiskKey;
  label: string;
  /** IWGDF screening interval (expert-opinion-based per the guideline). */
  interval: string;
  criteria: string;
  urgent?: boolean;
}
export const FOOT_RISK: Record<FootRiskKey, FootRisk> = {
  very_low: {
    key: "very_low",
    label: "IWGDF 0 — Very low",
    interval: "screen once a year",
    criteria: "No loss of protective sensation (LOPS) and no PAD",
  },
  low: {
    key: "low",
    label: "IWGDF 1 — Low",
    interval: "screen every 6–12 months",
    criteria: "LOPS or PAD",
  },
  moderate: {
    key: "moderate",
    label: "IWGDF 2 — Moderate",
    interval: "screen every 3–6 months",
    criteria: "LOPS + PAD, or LOPS + deformity, or PAD + deformity",
  },
  high: {
    key: "high",
    label: "IWGDF 3 — High",
    interval: "screen every 1–3 months",
    criteria: "LOPS or PAD, plus prior foot ulcer, amputation, or end-stage renal disease",
  },
  active: {
    key: "active",
    label: "Active disease — urgent",
    interval: "urgent referral — not routine screening",
    criteria: "Active ulcer, infection, acute Charcot, critical ischaemia or gangrene",
    urgent: true,
  },
};
export const FOOT_RISK_SOURCE = "IWGDF 2023 (Bus et al., Diab Metab Res Rev 2024)";

const footSideHas = (
  s: DiabeticFootSide | undefined,
  list: "skin" | "deformity" | "infection",
  v: string,
) => !!s && (s[list] ?? []).includes(v);
/** LOPS = ≥1 monofilament site not-felt, or vibration absent (this foot). */
function footHasLops(s: DiabeticFootSide | undefined): boolean {
  if (!s) return false;
  if (s.vibration === "absent") return true;
  return Object.values(s.monofilament ?? {}).some((felt) => felt === false);
}
const footHasPad = (s: DiabeticFootSide | undefined) => !!s && s.pulsesPresent === false;
const footHasDeformity = (s: DiabeticFootSide | undefined) => !!s && (s.deformity ?? []).length > 0;
const footActive = (s: DiabeticFootSide | undefined) =>
  !!s &&
  ((s.skin ?? []).some((x) => x.includes("ulcer") || x === "gangrene") ||
    (s.infection ?? []).length > 0 ||
    !!s.warmCharcot);

/**
 * SUGGEST a foot risk category from the findings (IWGDF 2023). DECISION-SUPPORT
 * only — returns the suggestion + the reasons; the clinician confirms it. Returns
 * null when there's nothing to base a suggestion on.
 */
export function suggestFootRisk(
  c: DiabeticFootExam | undefined,
): { risk: FootRisk; reasons: string[] } | null {
  if (!c) return null;
  const feet = [c.right, c.left];
  const examined = feet.some(
    (s) =>
      s &&
      (s.monofilament ||
        s.vibration ||
        s.pulsesPresent !== undefined ||
        s.skin?.length ||
        s.deformity?.length ||
        s.infection?.length),
  );
  if (!examined && !c.priorUlcerOrAmputation && !c.endStageRenal) return null;

  const reasons: string[] = [];
  if (c.systemicSepsis || feet.some(footActive)) {
    if (c.systemicSepsis) reasons.push("systemic sepsis");
    if (feet.some((s) => footSideHas(s, "skin", "gangrene"))) reasons.push("gangrene");
    if (feet.some((s) => (s?.infection ?? []).length > 0)) reasons.push("active infection");
    if (feet.some((s) => (s?.skin ?? []).some((x) => x.includes("ulcer"))))
      reasons.push("active ulcer");
    if (feet.some((s) => s?.warmCharcot)) reasons.push("possible acute Charcot");
    return { risk: FOOT_RISK.active, reasons };
  }

  const lops = feet.some(footHasLops);
  const pad = feet.some(footHasPad);
  const deformity = feet.some(footHasDeformity);
  if (lops) reasons.push("loss of protective sensation");
  if (pad) reasons.push("PAD (absent foot pulses)");
  if (deformity) reasons.push("foot deformity");
  if (c.priorUlcerOrAmputation) reasons.push("prior ulcer / amputation");
  if (c.endStageRenal) reasons.push("end-stage renal disease");

  if ((lops || pad) && (c.priorUlcerOrAmputation || c.endStageRenal))
    return { risk: FOOT_RISK.high, reasons };
  const two = [lops, pad, deformity].filter(Boolean).length >= 2;
  if (two) return { risk: FOOT_RISK.moderate, reasons };
  if (lops || pad) return { risk: FOOT_RISK.low, reasons };
  return { risk: FOOT_RISK.very_low, reasons: reasons.length ? reasons : ["no LOPS, no PAD"] };
}

// ── Non-structured finding catalog (thyroid peripheral + legs) ──
export const EVF_GROUPS = [
  { key: "thyroid_peripheral", label: "Thyroid — peripheral" },
  { key: "thyroid_legs", label: "Thyroid — legs" },
] as const;

const f = (
  code: string,
  group: string,
  display: string,
  kind: "select" | "panel",
  options: string[],
  extra: Partial<ExamFinding> = {},
): ExamFinding => ({ code, group, display, kind, options, ...extra });

export const EVF_FINDINGS: ExamFinding[] = [
  f("thyroid_general", "thyroid_peripheral", "General / hands", "panel", [
    "anxious / restless",
    "slowed",
    "fine tremor",
    "warm sweaty palms",
    "dry cool skin",
    "thyroid acropachy",
  ]),
  f("thyroid_pulse_reflex", "thyroid_peripheral", "Pulse / reflexes", "panel", [
    "tachycardia / AF",
    "bradycardia",
    "brisk reflexes",
    "slow-relaxing reflexes",
  ]),
  f("thyroid_legs", "thyroid_legs", "Legs", "panel", [
    "pretibial myxoedema",
    "proximal myopathy",
    "ankle oedema",
  ]),
];

// ── Cluster engines (thyroid status + critical ischaemia) ──
export interface EvfPattern {
  key: string;
  label: string;
  signature: string;
  mustNotMiss?: boolean;
  emergency?: boolean;
}

export const EVF_PATTERNS: Record<string, EvfPattern> = {
  thyroid_storm: {
    key: "thyroid_storm",
    label: "Thyroid storm",
    signature:
      "Fever + tachyarrhythmia + agitation/delirium on a hyperthyroid background — EMERGENCY",
    mustNotMiss: true,
    emergency: true,
  },
  myxoedema_coma: {
    key: "myxoedema_coma",
    label: "Myxoedema coma",
    signature: "Hypothermia + reduced consciousness on a hypothyroid background — EMERGENCY",
    mustNotMiss: true,
    emergency: true,
  },
  compressive_goitre: {
    key: "compressive_goitre",
    label: "Compressive / retrosternal goitre",
    signature: "Goitre + stridor/dysphagia or retrosternal extension — airway risk; urgent imaging",
    mustNotMiss: true,
  },
  malignant_thyroid: {
    key: "malignant_thyroid",
    label: "Thyroid malignancy",
    signature: "Fixed hard nodule + cervical lymph nodes — urgent USS + cytology referral",
    mustNotMiss: true,
  },
  hyperthyroid: {
    key: "hyperthyroid",
    label: "Hyperthyroidism",
    signature:
      "Tremor + warm sweaty + tachycardia/AF + weight loss + heat intolerance + brisk reflexes ± Graves' signs",
  },
  hypothyroid: {
    key: "hypothyroid",
    label: "Hypothyroidism",
    signature:
      "Slowed + dry/cool + bradycardia + weight gain + cold intolerance + slow-relaxing reflexes",
  },
  acute_limb_ischaemia: {
    key: "acute_limb_ischaemia",
    label: "Acute limb ischaemia (6 P's)",
    signature:
      "Pain · Pallor · Pulselessness · Paraesthesia · Paralysis · Perishingly cold — EMERGENCY, time-critical surgical",
    mustNotMiss: true,
    emergency: true,
  },
  critical_ischaemia: {
    key: "critical_ischaemia",
    label: "Chronic critical limb ischaemia",
    signature:
      "Rest pain (night, relieved hanging foot) + ulcers/gangrene + absent pulses + low ABPI",
    mustNotMiss: true,
  },
  diabetic_foot_sepsis: {
    key: "diabetic_foot_sepsis",
    label: "Diabetic-foot sepsis",
    signature:
      "Cellulitis/abscess/wet gangrene + systemic features — limb- and life-threatening EMERGENCY",
    mustNotMiss: true,
    emergency: true,
  },
  acute_charcot: {
    key: "acute_charcot",
    label: "Acute Charcot foot",
    signature:
      "Warm, swollen foot with intact skin — easily mistaken for infection; offload + urgent referral",
    mustNotMiss: true,
  },
  osteomyelitis: {
    key: "osteomyelitis",
    label: "Osteomyelitis",
    signature: "Ulcer that probes to bone — image + bone sampling; prolonged antibiotics",
    mustNotMiss: true,
  },
  neuropathic_foot: {
    key: "neuropathic_foot",
    label: "Neuropathic foot",
    signature:
      "Warm, dry, palpable pulses, loss of monofilament/vibration, callus + painless ulcer at pressure points",
  },
  ischaemic_foot: {
    key: "ischaemic_foot",
    label: "Ischaemic / neuro-ischaemic foot",
    signature: "Cool, pulseless, dependent rubor, painful ulcer at tips/margins, low ABPI",
  },
  arterial_ulcer: {
    key: "arterial_ulcer",
    label: "Arterial ulcer",
    signature:
      "Punched-out, painful, at tips/pressure points, absent pulses — vs venous (gaiter, sloping, pulses present)",
  },
  venous_ulcer: {
    key: "venous_ulcer",
    label: "Venous ulcer",
    signature:
      "Gaiter area, shallow sloping edge, exudative, haemosiderin/lipodermatosclerosis — pulses present",
  },
};

const hasFinding = (c: EvfExam, code: string, value: string) =>
  (c.findings ?? []).some(
    (o) => o.code === code && o.state === "present" && (o.values ?? []).includes(value),
  );

export function matchEvfPatterns(c: EvfExam): EvfPattern[] {
  const out: EvfPattern[] = [];
  const add = (k: keyof typeof EVF_PATTERNS) => {
    const p = EVF_PATTERNS[k];
    if (p && !out.some((x) => x.key === k)) out.push(p);
  };

  // ── Thyroid ──
  const t = c.thyroid;
  const hyperSigns =
    hasFinding(c, "thyroid_general", "fine tremor") ||
    hasFinding(c, "thyroid_general", "warm sweaty palms") ||
    hasFinding(c, "thyroid_pulse_reflex", "tachycardia / AF") ||
    hasFinding(c, "thyroid_pulse_reflex", "brisk reflexes") ||
    (t?.eyeSigns ?? []).length > 0;
  const hypoSigns =
    hasFinding(c, "thyroid_general", "slowed") ||
    hasFinding(c, "thyroid_general", "dry cool skin") ||
    hasFinding(c, "thyroid_pulse_reflex", "bradycardia") ||
    hasFinding(c, "thyroid_pulse_reflex", "slow-relaxing reflexes");
  if (t?.status === "hyperthyroid" || hyperSigns) add("hyperthyroid");
  if (t?.status === "hypothyroid" || hypoSigns) add("hypothyroid");
  if ((t?.gland ?? []).includes("fixed / hard") && (t?.gland ?? []).includes("cervical nodes"))
    add("malignant_thyroid");
  if ((t?.gland ?? []).includes("retrosternal")) add("compressive_goitre");

  // ── Vascular ──
  const v = c.vascular;
  if ((v?.acuteIschaemia ?? []).length >= 2) add("acute_limb_ischaemia");
  const abpiBands = Object.values(v?.abpi ?? {}).map(interpretAbpi);
  if (v?.restPain || abpiBands.includes("critical")) add("critical_ischaemia");
  if ((v?.venousLook ?? []).includes("venous ulcer (gaiter, sloping edge)")) add("venous_ulcer");
  if ((v?.arterialLook ?? []).includes("arterial ulcer (punched-out, tips/pressure)"))
    add("arterial_ulcer");

  // ── Diabetic foot ──
  const fft = c.foot;
  const feet = [fft?.right, fft?.left];
  if (fft?.systemicSepsis && feet.some((s) => (s?.infection ?? []).length > 0))
    add("diabetic_foot_sepsis");
  else if (feet.some((s) => (s?.infection ?? []).length > 0)) add("diabetic_foot_sepsis");
  if (feet.some((s) => s?.warmCharcot)) add("acute_charcot");
  if (feet.some((s) => (s?.infection ?? []).includes("probe-to-bone (osteomyelitis)")))
    add("osteomyelitis");
  const neuropathic = feet.some(
    (s) =>
      footHasLops(s) &&
      s?.pulsesPresent !== false &&
      (s?.skin ?? []).some((x) => x === "callus" || x.includes("neuropathic")),
  );
  const ischaemicFoot = feet.some(
    (s) =>
      footHasPad(s) && (s?.skin ?? []).some((x) => x.includes("ischaemic") || x === "gangrene"),
  );
  if (neuropathic) add("neuropathic_foot");
  if (ischaemicFoot) add("ischaemic_foot");

  return out.sort((a, b) => Number(!!b.mustNotMiss) - Number(!!a.mustNotMiss));
}

// ── Prose + reasoning tokens ──
const pulseSummary = (v: VascularExam | undefined): string | null => {
  const abn: string[] = [];
  for (const p of NAMED_PULSES) {
    const rec = v?.pulses?.[p];
    if (!rec) continue;
    for (const side of ["right", "left"] as Side[]) {
      const g = rec[side];
      if (g && g !== "present") abn.push(`${side === "right" ? "R" : "L"} ${p} ${g}`);
    }
  }
  return abn.length ? `Pulses: ${abn.join(", ")}.` : null;
};

export function renderEvfProse(c: EvfExam): string {
  const parts: string[] = [];
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

  const t = c.thyroid;
  if (t) {
    const bits = [
      t.status && t.status !== "euthyroid" ? t.status : null,
      t.gland?.length ? `gland — ${t.gland.join(", ")}` : null,
      t.eyeSigns?.length ? `eyes — ${t.eyeSigns.join(", ")}` : null,
    ].filter(Boolean);
    if (bits.length) parts.push(`Thyroid: ${bits.join("; ")}.`);
  }

  const v = c.vascular;
  if (v) {
    if (v.arterialLook?.length) parts.push(`Arterial: ${v.arterialLook.join(", ")}.`);
    const ps = pulseSummary(v);
    if (ps) parts.push(ps);
    for (const side of ["right", "left"] as Side[]) {
      const band = interpretAbpi(v.abpi?.[side]);
      if (band) parts.push(`ABPI ${side} ${v.abpi?.[side]} — ${ABPI_BAND_LABEL[band]}.`);
    }
    if (v.buergers === "positive") parts.push("Buerger's positive.");
    if (v.acuteIschaemia?.length) parts.push(`Acute ischaemia: ${v.acuteIschaemia.join(", ")}.`);
    if (v.venousLook?.length) parts.push(`Venous: ${v.venousLook.join(", ")}.`);
    if (v.dvtSigns) parts.push("Unilateral calf swelling/tenderness (DVT — see oedema pathway).");
  }

  const fft = c.foot;
  if (fft) {
    for (const side of ["right", "left"] as Side[]) {
      const s = fft[side];
      if (!s) continue;
      const notFelt = Object.values(s.monofilament ?? {}).filter((felt) => felt === false).length;
      const total = Object.keys(s.monofilament ?? {}).length;
      const bits = [
        s.skin?.length ? s.skin.join(", ") : null,
        s.deformity?.length ? s.deformity.join(", ") : null,
        total ? `monofilament ${total - notFelt}/${total} felt` : null,
        s.vibration && s.vibration !== "felt" ? `vibration ${s.vibration}` : null,
        s.pulsesPresent === false
          ? "foot pulses absent"
          : s.pulsesPresent
            ? "foot pulses present"
            : null,
        s.warmCharcot ? "warm swollen (?Charcot)" : null,
        s.infection?.length ? `infection — ${s.infection.join(", ")}` : null,
      ].filter(Boolean);
      if (bits.length) parts.push(`Foot ${side === "right" ? "R" : "L"}: ${bits.join("; ")}.`);
    }
    const suggestion = suggestFootRisk(fft);
    if (fft.confirmedRisk) {
      const r = FOOT_RISK[fft.confirmedRisk];
      parts.push(`Diabetic-foot risk (confirmed): ${r.label} — ${r.interval}.`);
    } else if (suggestion) {
      parts.push(
        `Diabetic-foot risk (suggested, confirm): ${suggestion.risk.label} — ${suggestion.risk.interval}.`,
      );
    }
  }

  const patterns = matchEvfPatterns(c);
  if (patterns.length)
    parts.push(`Pattern(s) to consider: ${patterns.map((p) => p.label).join(" / ")}.`);
  return parts.length ? `Endocrine / vascular / foot: ${parts.join(" ")}` : "";
}

export function evfReasoningTokens(c: EvfExam): { positives: string[]; negatives: string[] } {
  const positives: string[] = [];
  for (const o of c.findings ?? [])
    if (o.state === "present") positives.push(o.display, ...(o.values ?? []));
  if (c.thyroid?.status && c.thyroid.status !== "euthyroid") positives.push(c.thyroid.status);
  if (c.vascular?.dvtSigns) positives.push("leg swelling", "calf swelling");
  if ((c.vascular?.acuteIschaemia ?? []).length) positives.push("acute limb ischaemia");
  for (const p of matchEvfPatterns(c)) positives.push(p.label);
  return { positives: Array.from(new Set(positives)), negatives: [] };
}
