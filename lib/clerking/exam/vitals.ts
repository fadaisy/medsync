import type { ExamCatalogue } from "./catalogue";
import type { VitalValues } from "./context";
import type { ExamDraft, VitalsDraft } from "./payload";
import type { AdultVitals, News2Result } from "@/lib/triage/types";

import { scoreNews2 } from "@/lib/triage/scoring/news2";
import { toCanonical } from "@/lib/units";
import { NO_VITALS } from "./context";
import { acvpuOf, gcsTotal } from "./scores";

/**
 * Vital signs (PROMPT-CLERKING-EXAM-V2 §5.1, §7 vitals.ts, E6, E8): one-field BP, decimal commas,
 * plausibility with a confirm tap, mg/dL → mmol/L, BMI and waist-to-height, the draft set →
 * NEWS2 through the triage engine (never re-implemented), and the set → observation lines for
 * `recordObservations`. Pure.
 */

/** "36,8" and "36.8" are the same number; anything else is not a number. */
export function parseDecimal(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export type BpParse = { sbp: number; dbp: number } | { error: string } | null;

/** One field: "118/76" (spaces allowed). Systolic must exceed diastolic. */
export function parseBp(s: string | undefined): BpParse {
  if (!s?.trim()) return null;
  const m = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(s);
  if (!m) return { error: "Type BP as systolic/diastolic, for example 118/76" };
  const sbp = Number(m[1]);
  const dbp = Number(m[2]);
  if (sbp <= dbp) return { error: "Systolic must be higher than diastolic" };
  return { sbp, dbp };
}

type FieldKey =
  | "bp_systolic"
  | "bp_diastolic"
  | "pulse"
  | "rr"
  | "spo2"
  | "temp"
  | "glucose"
  | "weight"
  | "height"
  | "waist";
const FIELD: Record<FieldKey, { id: string; sub?: "systolic" | "diastolic" }> = {
  bp_systolic: { id: "vs.bp", sub: "systolic" },
  bp_diastolic: { id: "vs.bp", sub: "diastolic" },
  pulse: { id: "vs.pulse" },
  rr: { id: "vs.rr" },
  spo2: { id: "vs.spo2" },
  temp: { id: "vs.temp" },
  glucose: { id: "vs.glucose" },
  weight: { id: "vs.weight" },
  height: { id: "vs.height" },
  waist: { id: "vs.waist" },
};

/** The catalogue's plausible range for a field (`vs.bp` has one per part). */
export function plausibleRange(cat: ExamCatalogue, key: FieldKey): [number, number] | null {
  const f = cat.data.vital_signs.fields.find((x) => x.id === FIELD[key].id);
  const p = f?.plausible;
  if (!p) return null;
  if (Array.isArray(p)) return p;
  return FIELD[key].sub ? (p[FIELD[key].sub!] ?? null) : null;
}

export function isPlausible(cat: ExamCatalogue, key: FieldKey, v: number): boolean {
  const r = plausibleRange(cat, key);
  return !r || (v >= r[0] && v <= r[1]);
}

export function glucoseMmol(value: number, unit: VitalsDraft["glucoseUnit"]): number | null {
  if (!unit || unit === "mmol/L") return value;
  const r = toCanonical("obs.glucose", value, unit);
  return "value" in r ? Math.round(r.value * 10) / 10 : null;
}

export interface ParsedVitals {
  values: VitalValues;
  /** Fields typed but not numbers (or BP not "a/b"), with the message. */
  errors: Partial<Record<FieldKey | "bp", string>>;
  /** Fields outside the plausible range and not yet confirmed. */
  implausible: FieldKey[];
}

/** The "Now" column as numbers. An implausible value counts only once confirmed (E8). */
export function parseVitalsDraft(cat: ExamCatalogue, v: VitalsDraft | undefined): ParsedVitals {
  const values: VitalValues = { ...NO_VITALS };
  const errors: ParsedVitals["errors"] = {};
  const implausible: FieldKey[] = [];
  if (!v) return { values, errors, implausible };
  const confirmed = new Set(v.confirmed ?? []);
  const take = (key: FieldKey, n: number | null, raw: string | undefined): number | null => {
    if (raw?.trim() && n === null) {
      errors[key] = "Type a number";
      return null;
    }
    if (n === null) return null;
    if (!isPlausible(cat, key, n) && !confirmed.has(key)) {
      implausible.push(key);
      return null;
    }
    return n;
  };
  const bp = parseBp(v.bp);
  if (bp && "error" in bp) errors.bp = bp.error;
  else if (bp) {
    values.sbp = take("bp_systolic", bp.sbp, v.bp);
    values.dbp = take("bp_diastolic", bp.dbp, v.bp);
  }
  values.pulse = take("pulse", parseDecimal(v.pulse), v.pulse);
  values.rr = take("rr", parseDecimal(v.rr), v.rr);
  values.spo2 = take("spo2", parseDecimal(v.spo2), v.spo2);
  values.temp = take("temp", parseDecimal(v.temp), v.temp);
  // A meter's HI or LO (EC-6) is a reading, not a number: nothing is invented for it.
  const meter = /^\s*(hi|lo)\s*$/i.exec(v.glucose ?? "");
  if (meter) values.glucoseReads = meter[1]!.toUpperCase() as "HI" | "LO";
  else {
    const g = parseDecimal(v.glucose);
    values.glucose = take("glucose", g === null ? null : glucoseMmol(g, v.glucoseUnit), v.glucose);
  }
  if (values.glucose !== null || values.glucoseReads)
    values.glucoseContext = v.glucoseContext ?? null;
  values.weight = take("weight", parseDecimal(v.weight), v.weight);
  values.height = take("height", parseDecimal(v.height), v.height);
  values.waist = take("waist", parseDecimal(v.waist), v.waist);
  return { values, errors, implausible };
}

/** The draft wins where typed; the latest saved set fills the rest (what the note reads). */
export function mergeVitals(saved: VitalValues, draft: VitalValues): VitalValues {
  const out = { ...saved };
  for (const k of Object.keys(draft) as (keyof VitalValues)[])
    if (draft[k] !== null && draft[k] !== undefined) (out as Record<string, unknown>)[k] = draft[k];
  // A typed glucose brings its own context and HI/LO: the saved ones described another reading.
  if (draft.glucose !== null || draft.glucoseReads) {
    out.glucose = draft.glucose;
    out.glucoseReads = draft.glucoseReads ?? null;
    out.glucoseContext = draft.glucoseContext ?? null;
  }
  return out;
}

/** What stays in the "Now" column after a set is saved: a meter's HI or LO, which is not charted
 *  as a number (EC-6), so the note and the rules keep it at this encounter. */
export function draftAfterSave(v: VitalsDraft | undefined): VitalsDraft | undefined {
  if (!v || !/^\s*(hi|lo)\s*$/i.test(v.glucose ?? "")) return undefined;
  return { glucose: v.glucose, glucoseContext: v.glucoseContext };
}

/** Air or oxygen, from General (E3: NEWS2 never asks it separately). */
export function airOrOxygen(d: ExamDraft): "air" | "oxygen" | null {
  const c = d.entries["ex.general.oxygen"]?.choice;
  return c === "room_air" ? "air" : c === "supplemental_oxygen" ? "oxygen" : null;
}

/** Scale 2 only with a recorded clinician decision: the 88–92% target in the oxygen properties,
 *  or the decision recorded on the vitals card. */
export function scale2(d: ExamDraft): boolean {
  const target = d.entries["ex.general.oxygen"]?.attrs?.target;
  return target === "spo2_88_92pct" || !!d.vitalsDraft?.scale2;
}

/** The set NEWS2 reads: the vitals, ACVPU from consciousness and air or oxygen from General. */
export function adultVitals(values: VitalValues, d: ExamDraft): AdultVitals {
  return {
    respiratoryRate: values.rr,
    spo2: values.spo2,
    spo2Scale: scale2(d) ? "scale2" : "scale1",
    oxygen: airOrOxygen(d),
    systolicBp: values.sbp,
    pulse: values.pulse,
    consciousness: acvpuOf(d.blocks.consciousness),
    temperature: values.temp,
  };
}

export function news2Of(values: VitalValues, d: ExamDraft): News2Result {
  return scoreNews2(adultVitals(values, d));
}

/** NEWS2 response band, from the total and the single-parameter rule (RCP). */
export function news2Band(n: News2Result): string {
  if (n.total >= 7) return "Emergency response threshold";
  if (n.total >= 5) return "Urgent response threshold";
  if (n.hasSingleParameterThree) return "A single parameter scores 3";
  if (n.total >= 1) return "Low score: ward-based response";
  return "Low score";
}

const round1 = (n: number) => Math.round(n * 10) / 10;
export const bmiOf = (w: number | null, h: number | null) =>
  w && h ? round1(w / (h / 100) ** 2) : null;
export const whtrOf = (waist: number | null, h: number | null) =>
  waist && h ? Math.round((waist / h) * 100) / 100 : null;

/* ─── Save as a new set ───────────────────────────────────────────── */

/** One line for `recordObservations` (a subset of its ObservationInput). */
export interface VitalLine {
  conceptId: string;
  value: { type: "quantity"; value: number; unit: string } | { type: "coded"; code: string };
  context: Record<string, unknown>;
  fastingState?: "fasting" | "non_fasting" | "unknown";
  challenge?: "meal" | "ogtt_75g";
  challengeMinutes?: number;
  specimen?: string;
  pointOfCare?: boolean;
  plausibilityConfirmed?: boolean;
}

/** CFC `obs.avpu` answers; `new_confusion` is ACVPU C (CFC v1.3, 0083). Every line also carries
 *  `acvpu` in its context (how sets saved before 0083 recorded C). */
const AVPU_CODE: Record<string, string> = {
  A: "alert",
  C: "new_confusion",
  V: "voice",
  P: "pain",
  U: "unresponsive",
};
const CUFF: Record<string, string> = {
  standard_adult: "adult",
  large_adult: "large_adult",
  small_adult_or_child: "small_adult", // this catalogue is for 15 and over
};

export type SaveCheck = { ok: true; lines: VitalLine[] } | { ok: false; missing: string[] };

/**
 * The draft set as observation lines, or what is missing. Air or oxygen and consciousness must be
 * answered (E2, E6), so no set is saved incomplete for lack of them; glucose needs its context.
 */
export function saveLines(cat: ExamCatalogue, d: ExamDraft, readingSetId: string): SaveCheck {
  const v = d.vitalsDraft ?? {};
  const parsed = parseVitalsDraft(cat, v);
  const x = parsed.values;
  const missing: string[] = [];
  const oxygen = airOrOxygen(d);
  const acvpu = acvpuOf(d.blocks.consciousness);
  if (!oxygen) missing.push("air or oxygen (General, attachments)");
  if (!acvpu) missing.push("consciousness (General)");
  if ((x.glucose !== null || x.glucoseReads) && !v.glucoseContext)
    missing.push("the glucose context");
  if (parsed.implausible.length) missing.push(`a confirm tap for ${parsed.implausible.join(", ")}`);
  if (Object.keys(parsed.errors).length) missing.push("numbers in every typed field");
  const any = Object.values(x).some((n) => typeof n === "number");
  if (!any) missing.push("at least one value");
  if (missing.length) return { ok: false, missing };

  const confirmed = new Set(v.confirmed ?? []);
  const q = (
    conceptId: string,
    value: number,
    unit: string,
    context: Record<string, unknown> = {},
    key?: string,
  ): VitalLine => ({
    conceptId,
    value: { type: "quantity", value, unit },
    context: {
      readingSetId,
      acvpu,
      ...context,
      ...(key && confirmed.has(key) ? { plausibilityConfirmed: true } : {}),
    },
    ...(key && confirmed.has(key) ? { plausibilityConfirmed: true } : {}),
  });
  const lines: VitalLine[] = [];
  if (x.sbp !== null && x.dbp !== null) {
    const bp = {
      position: v.position === "lying" ? "supine" : (v.position ?? "sitting"),
      arm: v.arm ?? "right",
      cuffSize: CUFF[v.cuff ?? "standard_adult"],
      device: "unknown",
      setting: "clinic",
      readingIndex: 1,
    };
    lines.push(
      q("obs.bp_systolic", x.sbp, "mm[Hg]", bp, "bp_systolic"),
      q("obs.bp_diastolic", x.dbp, "mm[Hg]", bp, "bp_diastolic"),
    );
  }
  if (x.pulse !== null) {
    const apex = parseDecimal(v.apex);
    lines.push(
      q(
        "obs.heart_rate",
        x.pulse,
        "/min",
        { ...(v.rhythm ? { rhythm: v.rhythm } : {}), ...(apex !== null ? { apexRate: apex } : {}) },
        "pulse",
      ),
    );
  }
  if (x.rr !== null) lines.push(q("obs.resp_rate", x.rr, "/min", {}, "rr"));
  if (x.spo2 !== null) {
    const o = d.entries["ex.general.oxygen"];
    const flowKey = Object.keys(o?.attrs ?? {}).find((k) => k.startsWith("flow_"));
    lines.push(
      q(
        "obs.spo2",
        x.spo2,
        "%",
        {
          oxygenSupport: oxygen === "oxygen" ? "supplemental_oxygen" : "room_air",
          ...(typeof o?.attrs?.modality === "string" ? { oxygenDevice: o.attrs.modality } : {}),
          ...(flowKey ? { oxygenFlowLpm: o!.attrs![flowKey] } : {}),
          spo2Scale: scale2(d) ? "scale2" : "scale1",
        },
        "spo2",
      ),
    );
  }
  if (x.temp !== null)
    lines.push(q("obs.temperature", x.temp, "Cel", v.site ? { site: v.site } : {}, "temp"));
  if (x.glucose !== null) {
    const ctx = v.glucoseContext!;
    lines.push({
      ...q("obs.glucose", x.glucose, "mmol/L", { glucoseContext: ctx }, "glucose"),
      specimen: "capillary_whole_blood",
      pointOfCare: true,
      fastingState: ctx === "fasting" ? "fasting" : "non_fasting",
      ...(ctx === "two_hours_after_food"
        ? { challenge: "meal" as const, challengeMinutes: 120 }
        : ctx === "two_hours_after_glucose"
          ? { challenge: "ogtt_75g" as const, challengeMinutes: 120 }
          : {}),
    });
  }
  const how = (m: VitalsDraft["weightMethod"]) => (m === "stated" ? "reported" : (m ?? "measured"));
  if (x.weight !== null)
    lines.push(q("obs.weight", x.weight, "kg", { measurement: how(v.weightMethod) }, "weight"));
  if (x.height !== null)
    lines.push(q("obs.height", x.height, "cm", { measurement: how(v.heightMethod) }, "height"));
  if (x.waist !== null)
    lines.push(q("obs.waist", x.waist, "cm", { protocol: "who_midpoint" }, "waist"));
  const c = d.blocks.consciousness;
  if (AVPU_CODE[acvpu!])
    lines.push({
      conceptId: "obs.avpu",
      value: { type: "coded", code: AVPU_CODE[acvpu!]! },
      context: { readingSetId, acvpu, method: c?.method ?? "acvpu" },
    });
  const t = gcsTotal(c);
  if (t !== null) lines.push(q("obs.gcs", t, "{score}", { eye: c!.E, verbal: c!.V, motor: c!.M }));
  return { ok: true, lines };
}
