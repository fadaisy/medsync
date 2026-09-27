import type { History, SymptomEntry } from "../answers";
import type { Catalogue } from "../catalogue";
import type { Linked } from "../linkage";
import type { ExamCatalogue } from "./catalogue";
import type { ExamDraft } from "./payload";
import type { News2Result } from "@/lib/triage/types";

import { rosAnswer } from "../linkage";
import { entryOf, readAttr } from "./answers";
import { acvpuOf, amts, gcsP, gcsTotal, mrcNumber, orientation } from "./scores";

/**
 * What the examination engines read, and the condition language of the catalogue
 * (`flag_rule_language`): examination atoms (finding, item/attribute, classifier, score, grid,
 * vital, panel, derived, orientation, acvpu_not) and history atoms (symptom, red flag, past
 * condition, patient, setting, medicine group). Pure. An atom this engine does not know never
 * fires; "not asked" is never "no".
 */

/** One vital-sign set as numbers: the draft ("Now") where typed, else the latest saved set. */
export interface VitalValues {
  sbp: number | null;
  dbp: number | null;
  pulse: number | null;
  rr: number | null;
  spo2: number | null;
  temp: number | null;
  /** mmol/L. */
  glucose: number | null;
  weight: number | null;
  height: number | null;
  waist: number | null;
}

export const NO_VITALS: VitalValues = {
  sbp: null,
  dbp: null,
  pulse: null,
  rr: null,
  spo2: null,
  temp: null,
  glucose: null,
  weight: null,
  height: null,
  waist: null,
};

export interface ExamContext {
  cat: ExamCatalogue;
  /** The history catalogue (symptom red flags), for history atoms. */
  history: { cat: Catalogue; answers: History; linked: ReadonlyMap<string, Linked> };
  exam: ExamDraft;
  patient: { ageYears: number | null; sex: "female" | "male" | null; pregnant: boolean | null };
  settings: { outbreakMode: boolean };
  medicines: readonly { name: string; drugClass?: string | null }[];
  vitals: VitalValues;
  /** NEWS2 of the latest saved set, for suggestion rules that read it, and its time ("23:00"). */
  news2Latest: News2Result | null;
  latestSetTime?: string | null;
  /** Classifier results by id, filled by the classifier pass (flags read them). */
  results?: ReadonlyMap<string, { result: string | null }>;
}

type Cond = Record<string, unknown>;

/* ─── History ─────────────────────────────────────────────────────── */

/** The symptom's entry when it is present in the history: a complaint, or a "yes" review answer. */
export function symptomEntry(x: ExamContext, symptom: string): SymptomEntry | null {
  const h = x.history.answers;
  const c = h.complaints.find((e) => e.symptom === symptom);
  if (c) return c;
  if (rosAnswer(h, x.history.linked, symptom) === "yes")
    return h.rosDetail[symptom] ?? { props: {}, flags: {} };
  return null;
}

export function symptomAnswer(x: ExamContext, symptom: string): "yes" | "no" | undefined {
  const h = x.history.answers;
  if (h.complaints.some((e) => e.symptom === symptom)) return "yes";
  return rosAnswer(h, x.history.linked, symptom);
}

/** The danger red flags answered yes for a symptom, as labels ("pain at night, weight loss"). */
export function redFlagsYes(x: ExamContext, symptom: string, kind = "danger"): string[] {
  const e = symptomEntry(x, symptom);
  const s = x.history.cat.symptom(symptom);
  if (!e || !s) return [];
  return s.red_flags.filter((f) => f.kind === kind && e.flags[f.id] === "yes").map((f) => f.label);
}

/* ─── Examination ─────────────────────────────────────────────────── */

const has = (v: unknown, o: string) => (Array.isArray(v) ? v.includes(o) : v === o);

function ref(x: ExamContext, id: unknown): number | null {
  return x.cat.refNumber(String(id));
}

function compare(v: number | null, c: Cond, x: ExamContext): boolean {
  if (v === null) return false;
  if ("lt_ref" in c) return v < (ref(x, c.lt_ref) ?? -Infinity);
  if ("lte_ref" in c) return v <= (ref(x, c.lte_ref) ?? -Infinity);
  if ("gt_ref" in c) return v > (ref(x, c.gt_ref) ?? Infinity);
  if ("gte_ref" in c) return v >= (ref(x, c.gte_ref) ?? Infinity);
  if ("gte" in c) return v >= Number(c.gte);
  if ("equals" in c) return v === Number(c.equals);
  return false;
}

export const POWER_ARM = 5; // the first five MRC rows are the arm (shoulder to grip)

function gridRows(x: ExamContext, grid: string, rows: unknown): string[] | null {
  if (Array.isArray(rows)) return rows.map(String);
  if (grid === "power" && (rows === "arm" || rows === "leg")) {
    const all = x.cat.grids.power.map((r) => r.movement);
    return rows === "arm" ? all.slice(0, POWER_ARM) : all.slice(POWER_ARM);
  }
  return null;
}

function gridCells(x: ExamContext, grid: string): Record<string, { R?: unknown; L?: unknown }> {
  const b = x.exam.blocks;
  return (
    (grid === "power"
      ? b.power
      : grid === "reflex"
        ? b.reflexes
        : grid === "pulses"
          ? b.pulses
          : grid === "plantar"
            ? { plantars: b.plantars ?? {} }
            : undefined) ?? {}
  );
}

function cellNumber(grid: string, v: unknown): number | null {
  if (v === undefined) return null;
  if (grid === "power") return mrcNumber(v as never);
  return typeof v === "number" ? v : null;
}

function gridAtom(c: Cond, x: ExamContext): boolean {
  const grid = String(c.grid);
  const cells = gridCells(x, grid);
  const rows = gridRows(x, grid, c.rows) ?? Object.keys(cells);
  const list = rows.map((r) => cells[r] ?? {});
  if (c.asymmetric)
    return list.some(
      (cell) =>
        cell.R !== undefined &&
        cell.L !== undefined &&
        cellNumber(grid, cell.R) !== cellNumber(grid, cell.L),
    );
  const any = c.any_cell as Cond | undefined;
  if (!any) return false;
  return list.some((cell) =>
    (["R", "L"] as const).some((side) => {
      const v = cell[side];
      if (v === undefined) return false;
      if ("equals" in any)
        return String(v).toLowerCase() === String(any.equals).toLowerCase().replace(/ /g, "_");
      return compare(cellNumber(grid, v), any, x);
    }),
  );
}

/** The value a `vital` atom reads. */
function vitalValue(x: ExamContext, id: string): number | null {
  const v = x.vitals;
  const map: Record<string, number | null> = {
    "vs.bp": v.sbp,
    "vs.pulse": v.pulse,
    "vs.rr": v.rr,
    "vs.spo2": v.spo2,
    "vs.temp": v.temp,
    "vs.glucose": v.glucose,
    "vs.weight": v.weight,
    "vs.height": v.height,
    "vs.waist": v.waist,
  };
  return map[id] ?? null;
}

function panelAtom(c: Cond, x: ExamContext): boolean {
  const p = x.exam.panels ?? {};
  if (c.panel === "vs.both_arms" && "systolic_difference_gt_ref" in c) {
    const r = p.bothArms?.right?.sbp;
    const l = p.bothArms?.left?.sbp;
    const limit = ref(x, c.systolic_difference_gt_ref);
    return r !== undefined && l !== undefined && limit !== null && Math.abs(r - l) > limit;
  }
  return false;
}

export function pefPercent(x: ExamContext): number | null {
  const p = x.exam.panels?.peakFlow;
  if (!p?.best || !p.reference) return null;
  return Math.round((p.best / p.reference) * 100);
}

/** Flags and suggestions read derived facts too (IWGDF LOPS and PAD); set by classifiers. */
export type DerivedReader = (id: string, side?: string) => boolean;

export function evalCond(c: Cond, x: ExamContext, derived?: DerivedReader): boolean {
  if ("all" in c) return (c.all as Cond[]).every((y) => evalCond(y, x, derived));
  if ("any" in c) return (c.any as Cond[]).some((y) => evalCond(y, x, derived));
  if ("not" in c) return !evalCond(c.not as Cond, x, derived);
  if ("always" in c) return c.always === true;

  // History atoms
  if ("symptom" in c) {
    const sym = String(c.symptom);
    if ("red_flag" in c) {
      const e = symptomEntry(x, sym);
      return !!e && e.flags[String(c.red_flag)] === c.answer;
    }
    if ("any_red_flag" in c) return redFlagsYes(x, sym, String(c.any_red_flag)).length > 0;
    return symptomAnswer(x, sym) === c.answer;
  }
  if ("past_condition" in c)
    return x.history.answers.past.conditions[String(c.past_condition)]?.answer === c.answer;
  if ("patient" in c) {
    if (c.patient === "age_gte") {
      const n = "value_ref" in c ? ref(x, c.value_ref) : Number(c.value);
      return n !== null && x.patient.ageYears !== null && x.patient.ageYears >= n;
    }
    if (c.patient === "sex") return x.patient.sex === c.equals;
    return false;
  }
  if ("setting" in c)
    return c.setting === "outbreak_mode" && x.settings.outbreakMode === (c.equals ?? true);
  if ("medicine_group" in c) {
    const g = x.cat.data.medicine_groups?.[String(c.medicine_group)];
    if (!g) return false;
    return x.medicines.some(
      (m) =>
        m.drugClass === g.drug_class || g.name_stems.some((s) => m.name.toLowerCase().includes(s)),
    );
  }

  // Examination atoms
  if ("finding" in c) {
    const e = entryOf(x.cat, x.exam, String(c.finding));
    if (c.is === "positive") return e?.state === "positive";
    if (c.is === "negative") return e?.state === "negative";
    if (c.is === "recorded") return !!e;
    return false;
  }
  if ("item" in c && "attribute" in c) {
    // Own, shared and mirrored values alike (a mirrored option is true while its reader is unrecorded).
    const v = readAttr(x.cat, x.exam, String(c.item), String(c.attribute));
    if (v === undefined) return false;
    if ("equals" in c) return has(v, String(c.equals));
    if ("any_of" in c) return (c.any_of as string[]).some((o) => has(v, o));
    if ("includes_any" in c) return (c.includes_any as string[]).some((o) => has(v, o));
    if ("score_gte_ref" in c) {
      const n =
        typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/\D/g, "")) : NaN;
      return Number.isFinite(n) && n >= (ref(x, c.score_gte_ref) ?? Infinity);
    }
    return compare(typeof v === "number" ? v : null, c, x);
  }
  if ("classifier" in c) {
    const r = x.results?.get(String(c.classifier))?.result ?? null;
    return r !== null && (c.any_of as string[]).includes(r);
  }
  if ("score" in c) {
    const s = String(c.score);
    let v: number | null;
    if (s === "gcs_total") v = gcsTotal(x.exam.blocks.consciousness);
    else if (s === "gcs_p") v = gcsP(x.exam)?.value ?? null;
    else if (s === "amts") {
      const a = amts(x.exam);
      v = a?.complete ? a.score : null; // a partial AMTS never flags
    } else v = (x.results?.get(s) as { value?: number } | undefined)?.value ?? null;
    return compare(v, c, x);
  }
  if ("consciousness" in c)
    return c.consciousness === "known_baseline" && !!x.exam.blocks.consciousness?.baseline;
  if ("acvpu_not" in c) {
    const a = acvpuOf(x.exam.blocks.consciousness);
    return a !== null && a !== c.acvpu_not;
  }
  if ("orientation" in c)
    return (
      c.orientation === "not_fully_oriented" &&
      orientation(x.exam.blocks.consciousness).full === false
    );
  if ("grid" in c) return gridAtom(c, x);
  if ("vital" in c) {
    if ("systolic_lt_ref" in c) return compare(x.vitals.sbp, { lt_ref: c.systolic_lt_ref }, x);
    if (c.vital === "vs.bp" && "gte_ref" in c) {
      // A BP reference holds both limits: systolic or diastolic at or above (NICE NG136).
      const lim = x.cat.refValue(String(c.gte_ref)) as
        | { systolic_gte?: number; diastolic_gte?: number }
        | undefined;
      const { sbp, dbp } = x.vitals;
      return (
        (sbp !== null && lim?.systolic_gte !== undefined && sbp >= lim.systolic_gte) ||
        (dbp !== null && lim?.diastolic_gte !== undefined && dbp >= lim.diastolic_gte)
      );
    }
    return compare(vitalValue(x, String(c.vital)), c, x);
  }
  if ("panel" in c) return panelAtom(c, x);
  if ("pef_percent" in c) {
    const v = pefPercent(x);
    if (v === null) return false;
    if (c.pef_percent === "lt_ref") return v < (ref(x, c.ref) ?? -Infinity);
    if (c.pef_percent === "lte_ref") return v <= (ref(x, c.ref) ?? -Infinity);
    if (c.pef_percent === "between") {
      const [lo, hi] = (c.refs as string[]).map((r) => ref(x, r));
      return lo != null && hi != null && v >= lo && v <= hi;
    }
    return false;
  }
  if ("derived" in c)
    return !!derived?.(String(c.derived), typeof c.side === "string" ? c.side : undefined);
  if ("news2_parameter_score_gte_ref" in c) {
    const n = x.news2Latest;
    const limit =
      x.cat.refNumber(String(c.news2_parameter_score_gte_ref)) ??
      x.history.cat.refValue(String(c.news2_parameter_score_gte_ref));
    if (!n || typeof limit !== "number") return false;
    return n.parameters.some(
      (p) =>
        p.present &&
        p.parameter !== "supplemental_oxygen" &&
        (!c.parameter || p.parameter === c.parameter) &&
        p.points >= limit,
    );
  }
  return false;
}
