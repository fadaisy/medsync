import type { History, SymptomEntry } from "../answers";
import type { Catalogue } from "../catalogue";
import type { Linked } from "../linkage";
import type { ExamCatalogue } from "./catalogue";
import type { ExamDraft } from "./payload";
import type { News2Result } from "@/lib/triage/types";

import { inPregnancyAgeRange } from "@/lib/emr/reference/pregnancy";
import { pastDetail } from "../answers";
import { rosAnswer } from "../linkage";
import { entryOf, readAttr } from "./answers";
import { acvpuOf, amts, gcsP, gcsTotal, mrcNumber, orientation } from "./scores";

/**
 * What the examination engines read, and the condition language of the catalogue
 * (`flag_rule_language`): examination atoms (finding, item/attribute, classifier, score, grid,
 * vital, panel, derived, orientation, acvpu_not) and history atoms (symptom, red flag, past
 * condition, patient, setting, medicine group), and the diagnosis catalogue's atoms (family
 * condition, medicine, social, NEWS2 total, vital part; MS-EMR-DX-CAT-001). Pure. An atom this
 * engine does not know never fires; "not asked" is never "no".
 *
 * Three-valued (MS-NCD-DM-PACK-001 EC-1, P0-18): an atom is true, false or unknown (null). The
 * atoms added for the diabetes pack (result, pregnancy, past_detail, the ketone panel, a glucose
 * context, a setting list) are unknown while the record cannot answer them, and so is an atom this
 * engine does not know. Unknown never fires, and `not` of unknown is unknown, so a `not` around a
 * fact nobody recorded never fires either. The older atoms keep their two-valued meaning.
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
  /** A meter reading above or below its range (EC-6): HI satisfies every "at or above" glucose
   *  atom and LO every "below" one; no number is invented for either (`glucose` stays null). */
  glucoseReads?: "HI" | "LO" | null;
  /** The glucose's context as the vital stores it (random, fasting, two_hours_after_food,
   *  two_hours_after_glucose); null when unknown (EC-3). */
  glucoseContext?: string | null;
  weight: number | null;
  height: number | null;
  waist: number | null;
}

/** The vitals that are numbers. */
export type NumericVital = Exclude<keyof VitalValues, "glucoseReads" | "glucoseContext">;

export const NO_VITALS: VitalValues = {
  sbp: null,
  dbp: null,
  pulse: null,
  rr: null,
  spo2: null,
  temp: null,
  glucose: null,
  glucoseReads: null,
  glucoseContext: null,
  weight: null,
  height: null,
  waist: null,
};

export interface ExamContext {
  cat: ExamCatalogue;
  /** The history catalogue (symptom red flags), for history atoms. */
  history: { cat: Catalogue; answers: History; linked: ReadonlyMap<string, Linked> };
  exam: ExamDraft;
  patient: {
    ageYears: number | null;
    sex: "female" | "male" | null;
    pregnant: boolean | null;
    /** When the open pregnancy episode began (ISO), for results bounded to it (EC-5). */
    pregnancySince?: string | null;
  };
  /** `encounterType`: the encounter's type (opd, emergency, inpatient…), for `setting` lists. */
  settings: { outbreakMode: boolean; encounterType?: string | null };
  medicines: readonly { name: string; drugClass?: string | null; adherence?: string | null }[];
  vitals: VitalValues;
  /** NEWS2 of the latest saved set, for suggestion rules that read it, and its time ("23:00"). */
  news2Latest: News2Result | null;
  latestSetTime?: string | null;
  /** Classifier results by id, filled by the classifier pass (flags read them). */
  results?: ReadonlyMap<string, { result: string | null }>;
  /** The diagnosis catalogue's REF-DX values, signed ones only (a withheld value reads as
   *  missing, so nothing that reads it fires; SI10). */
  dxRefs?: { refValue(id: string): unknown };
  /** Laboratory and point-of-care results from the record (EC-1). Absent: not loaded, so every
   *  `result` atom is unknown. */
  facts?: readonly ResultFact[];
  /** The note's time (ISO), for a result's age. */
  now?: string;
}

/** The results the `result` atom can read (EC-1; CFC concepts, Phase 0 Q8). */
export const RESULT_CONCEPTS = [
  "obs.glucose",
  "obs.hba1c",
  "obs.uacr",
  "derived.egfr",
  "obs.bicarbonate",
  "obs.ph",
  "derived.osmolality_effective",
] as const;

/** One observation fact as the `result` atom reads it (the CFC fact model's own qualifiers). */
export interface ResultFact {
  concept: string;
  /** The canonical value; for a dipstick, its grade (negative 0, trace 0.5, 1+ 1 …). */
  value: number;
  /** A dipstick's coded answer as charted ("negative", "trace", "plus1" …). */
  code?: string;
  comparator?: "<" | "<=" | ">" | ">=";
  /** Effective time (ISO). */
  at: string;
  trust: 1 | 2 | 3 | 4;
  fastingState?: "fasting" | "non_fasting" | "unknown";
  challenge?: { type: string; minutes: number };
  specimen?: string;
  pointOfCare?: boolean;
  certification?: string;
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

/** A reference value by id: the examination catalogue, then the diagnosis catalogue (REF-DX),
 *  then the history catalogue (REF-FLAG). */
function refAny(x: ExamContext, id: string): unknown {
  if (id.startsWith("REF-DX-")) return x.dxRefs?.refValue(id);
  if (id.startsWith("REF-FLAG-")) return x.history.cat.refValue(id);
  // A path ("REF-EX-PEF-BANDS.life_threatening_lt") reads one limb of an object value.
  return id.includes(".") ? (x.cat.refNumber(id) ?? undefined) : x.cat.refValue(id);
}

function ref(x: ExamContext, id: unknown): number | null {
  const v = refAny(x, String(id));
  return typeof v === "number" ? v : null;
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
  const all = c.all_cells as Cond | undefined;
  if (all) {
    // Every recorded cell matches, and at least one is recorded (areflexia).
    const cellsOf = list.flatMap((cell) => [cell.R, cell.L].filter((v) => v !== undefined));
    return cellsOf.length > 0 && cellsOf.every((v) => cellMatches(grid, v, all, x));
  }
  const any = c.any_cell as Cond | undefined;
  if (!any) return false;
  return list.some((cell) =>
    (["R", "L"] as const).some((side) => {
      const v = cell[side];
      return v !== undefined && cellMatches(grid, v, any, x);
    }),
  );
}

function cellMatches(grid: string, v: unknown, m: Cond, x: ExamContext): boolean {
  if ("equals" in m)
    return String(v).toLowerCase() === String(m.equals).toLowerCase().replace(/ /g, "_");
  return compare(cellNumber(grid, v), m, x);
}

/** A quick pick (history catalogue `medicines.quick_picks`) against the recorded medicines.
 *  "not_taking" needs "takes none, including herbal": a list without the medicine is not asked. */
function medicineAtom(x: ExamContext, id: string, answer: unknown, adherence?: unknown): boolean {
  const matched = medicinesMatching(x, id, adherence);
  if (Array.isArray(adherence)) return matched.length > 0;
  const taking = matched.length > 0;
  if (answer === "taking") return taking;
  if (answer === "not_taking")
    return !taking && x.history.answers.past.medicinesNone === true && x.medicines.length === 0;
  return false;
}

/** The recorded medicines a quick pick matches, with one of the adherence answers when given. */
export function medicinesMatching(
  x: ExamContext,
  id: string,
  adherence?: unknown,
): ExamContext["medicines"] {
  const picks = x.history.cat.data.medicines.quick_picks as readonly {
    id: string;
    label: string;
  }[];
  const pick = picks.find((p) => p.id === id);
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/\([^)]*\)/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const want = [words(pick?.label ?? ""), words(id.replace(/_/g, " "))].filter(Boolean);
  const matches = (m: { name: string }) => {
    const n = words(m.name);
    return want.some((w) => n === w || n.startsWith(`${w} `) || n.includes(` ${w}`));
  };
  // `adherence_any` (EC-7): the medicine is recorded with one of these adherence answers.
  return x.medicines.filter(
    (m) => matches(m) && (!Array.isArray(adherence) || adherence.includes(m.adherence ?? "")),
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

function panelAtom(c: Cond, x: ExamContext): Tri {
  const p = x.exam.panels ?? {};
  if (c.panel === "vs.ketones") {
    // EC-7: {panel, recorded} and {panel, field, gte_ref | lt_ref | any_of}; a field not recorded
    // is unknown.
    const k: NonNullable<typeof p.ketones> = p.ketones ?? {};
    if ("recorded" in c) return (k.blood !== undefined || k.urine !== undefined) === c.recorded;
    const v = c.field === "blood" ? k.blood : c.field === "urine" ? k.urine : undefined;
    if (v === undefined) return null;
    if ("any_of" in c) return (c.any_of as string[]).includes(String(v));
    if (typeof v !== "number") return null;
    const key = ["gte_ref", "gt_ref", "lt_ref", "lte_ref"].find((n) => n in c);
    if (!key || ref(x, c[key]) === null) return null;
    return compare(v, c, x);
  }
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

/** Pregnancy as the `pregnancy` atom reads it (EC-5, P0-02): "unknown" when she could be pregnant
 *  and nobody recorded the answer (a woman, or a sex not recorded, inside REF-PREG-AGE or of
 *  unknown age). */
export function pregnancyState(x: ExamContext): "current" | "not_pregnant" | "unknown" {
  if (x.patient.pregnant === true) return "current";
  if (x.patient.pregnant === false || x.patient.sex === "male") return "not_pregnant";
  if (inPregnancyAgeRange(x.patient.ageYears) === false) return "not_pregnant";
  return "unknown";
}

/** The pack's qualifier placeholders, mapped once to the fact model (Phase 0, Q10). */
const CHALLENGE: Record<string, { type: string; minutes: number }> = {
  ogtt_75g_1h: { type: "ogtt_75g", minutes: 60 },
  ogtt_75g_2h: { type: "ogtt_75g", minutes: 120 },
};

function qualifiersMatch(f: ResultFact, q: Record<string, unknown>): boolean {
  return Object.entries(q).every(([k, want]) => {
    if (k === "challenge") {
      const w = CHALLENGE[String(want)];
      return !!w && f.challenge?.type === w.type && f.challenge.minutes === w.minutes;
    }
    return (f as unknown as Record<string, unknown>)[k] === want;
  });
}

const CERTIFIED = new Set(["ngsp", "ifcc", "ngsp_and_ifcc"]);

/** HbA1c is unknown for diagnosis unless a certified laboratory measured it and no blocking caveat
 *  the record can show holds (EC-1): pregnancy not ruled out, HIV or antiretrovirals, sickle cell
 *  disease, a transfusion in the last 3 months. ponytail: the caveats the record cannot show yet
 *  (haemolysis, recent malaria, iron or B12 deficiency, a low eGFR) stay with the clinician; the
 *  profile's note names them. */
function hba1cUsable(f: ResultFact, x: ExamContext): boolean {
  if (!CERTIFIED.has(f.certification ?? "") || f.pointOfCare) return false;
  if (pregnancyState(x) !== "not_pregnant") return false;
  const past = x.history.answers.past;
  if (past.conditions.hiv?.answer === "yes") return false;
  if (past.conditions.sickle_cell_disease?.answer === "yes") return false;
  if (medicineAtom(x, "antiretrovirals", "taking")) return false;
  const t = past.transfusions;
  return !(Array.isArray(t) && t.some((r) => r.when === "last_3_months"));
}

const DAY = 86_400_000;

/** `{result, qualifiers?, gte_ref | gt_ref | lt_ref | lte_ref (both: a band), max_age_ref?,
 *  min_trust?}` (EC-1): the newest matching fact at or before the note, inside the age and trust
 *  bounds; none is unknown, never false. */
function resultAtom(c: Cond, x: ExamContext): Tri {
  if (!x.facts) return null;
  const now = x.now ? Date.parse(x.now) : NaN;
  let maxAge = Infinity;
  if ("max_age_ref" in c) {
    const d = ref(x, c.max_age_ref);
    if (d === null || Number.isNaN(now)) return null; // an unsigned window keeps the rule dark
    maxAge = d * DAY;
  }
  const minTrust = Number(c.min_trust ?? 1);
  const q = (c.qualifiers ?? {}) as Record<string, unknown>;
  const facts = x.facts.filter((f) => {
    if (f.concept !== c.result || f.trust < minTrust || !qualifiersMatch(f, q)) return false;
    const t = Date.parse(f.at);
    return Number.isNaN(now) || (t <= now && now - t <= maxAge);
  });
  const f = facts.sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  if (!f) return null;
  if (f.concept === "obs.hba1c" && !hba1cUsable(f, x)) return null;
  // A value with a comparator ("> 33.3") is a bound: decide only what the bound decides.
  const lo = !f.comparator || f.comparator.startsWith(">") ? f.value : -Infinity;
  const hi = !f.comparator || f.comparator.startsWith("<") ? f.value : Infinity;
  let out: Tri = true;
  const limit = (k: string, test: (lo: number, hi: number, r: number) => Tri) => {
    if (!(k in c) || out === false) return;
    const r = ref(x, c[k]);
    const v = r === null ? null : test(lo, hi, r);
    out = v === false ? false : v === null ? null : out;
  };
  limit("gte_ref", (l, h, r) => (l >= r ? true : h < r ? false : null));
  limit("gt_ref", (l, h, r) => (l > r ? true : h <= r ? false : null));
  limit("lt_ref", (l, h, r) => (h < r ? true : l >= r ? false : null));
  limit("lte_ref", (l, h, r) => (h <= r ? true : l > r ? false : null));
  return out;
}

/** The glucose vital against a limit, reading HI and LO (EC-6). */
function glucoseCompare(c: Cond, x: ExamContext): boolean {
  const reads = x.vitals.glucoseReads;
  if (reads === "HI") return "gte_ref" in c || "gt_ref" in c || "gte" in c;
  if (reads === "LO") return "lt_ref" in c || "lte_ref" in c;
  return compare(x.vitals.glucose, c, x);
}

/** Flags and suggestions read derived facts too (IWGDF LOPS and PAD); set by classifiers. */
export type DerivedReader = (id: string, side?: string) => boolean;

/** True, false, or null for unknown. */
export type Tri = boolean | null;

/** Does the condition hold? Unknown does not (it never fires a rule). */
export function evalCond(c: Cond, x: ExamContext, derived?: DerivedReader): boolean {
  return evalTri(c, x, derived) === true;
}

/** Kleene logic: `all` is false on any false, `any` true on any true, `not` keeps unknown. */
export function evalTri(c: Cond, x: ExamContext, derived?: DerivedReader): Tri {
  if ("all" in c || "any" in c) {
    const all = "all" in c;
    let unknown = false;
    for (const y of (all ? c.all : c.any) as Cond[]) {
      const v = evalTri(y, x, derived);
      if (v === !all) return !all;
      if (v === null) unknown = true;
    }
    return unknown ? null : all;
  }
  if ("not" in c) {
    const v = evalTri(c.not as Cond, x, derived);
    return v === null ? null : !v;
  }
  return atom(c, x, derived);
}

function atom(c: Cond, x: ExamContext, derived?: DerivedReader): Tri {
  if ("always" in c) return c.always === true;

  // Diabetes pack atoms (EC-1, EC-2, EC-5)
  if ("result" in c) return resultAtom(c, x);
  if ("pregnancy" in c) {
    const s = pregnancyState(x);
    if (c.pregnancy === "unknown") return s === "unknown";
    return s === "unknown" ? null : s === c.pregnancy;
  }
  if ("past_detail" in c) return pastDetail(x.history.answers, c);

  // History atoms
  if ("symptom" in c) {
    const sym = String(c.symptom);
    if ("red_flag" in c) {
      const e = symptomEntry(x, sym);
      // No `answer`: the red flag answered yes (the diagnosis catalogue's shorthand).
      return !!e && e.flags[String(c.red_flag)] === (c.answer ?? "yes");
    }
    if ("any_red_flag" in c) return redFlagsYes(x, sym, String(c.any_red_flag)).length > 0;
    return symptomAnswer(x, sym) === c.answer;
  }
  if ("past_condition" in c)
    return x.history.answers.past.conditions[String(c.past_condition)]?.answer === c.answer;
  if ("family_condition" in c)
    return x.history.answers.family[String(c.family_condition)]?.answer === c.answer;
  if ("medicine" in c) return medicineAtom(x, String(c.medicine), c.answer, c.adherence_any);
  if ("social" in c) {
    const v = (x.history.answers.social as Record<string, unknown>)[String(c.social)];
    if (v === undefined) return false;
    return (c.any_of as string[]).some((o) => has(v, o));
  }
  if ("news2_total" in c) {
    const n = x.news2Latest;
    const limit = ref(x, c.ref);
    if (!n || limit === null) return false;
    return c.news2_total === "gte_ref" && n.total >= limit;
  }
  if ("patient" in c) {
    if (c.patient === "age_gte" || c.patient === "age_lt") {
      const n = "value_ref" in c ? ref(x, c.value_ref) : Number(c.value);
      if (n === null || x.patient.ageYears === null) return false;
      return c.patient === "age_gte" ? x.patient.ageYears >= n : x.patient.ageYears < n;
    }
    if (c.patient === "sex") return x.patient.sex === c.equals;
    return false;
  }
  if ("setting" in c) {
    // A list names care settings (EC-7): unknown while the encounter's type is not known.
    if (Array.isArray(c.setting)) {
      const t = x.settings.encounterType;
      return t ? c.setting.includes(t) : null;
    }
    return c.setting === "outbreak_mode" && x.settings.outbreakMode === (c.equals ?? true);
  }
  if ("medicine_group" in c) {
    const g = x.cat.data.medicine_groups?.[String(c.medicine_group)];
    if (!g) return false;
    return x.medicines.some((m) => {
      const n = m.name.toLowerCase();
      // A group can exclude forms by word (systemic steroids: no cream, inhaler or eye drop).
      if (g.exclude_words?.some((w) => n.split(/[^a-z0-9]+/).includes(w))) return false;
      return m.drugClass === g.drug_class || g.name_stems.some((s) => n.includes(s));
    });
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
  if ("item" in c && "recorded" in c)
    return !!entryOf(x.cat, x.exam, String(c.item)) === c.recorded;
  if ("item" in c && "any_of" in c) {
    // The item's own answer: a choice item's option.
    const e = entryOf(x.cat, x.exam, String(c.item));
    return !!e?.choice && (c.any_of as string[]).includes(e.choice);
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
    if (c.vital === "vs.bp" && (c.part === "systolic" || c.part === "diastolic")) {
      // One limb of a BP reference: a number, or the object's systolic_gte / diastolic_gte.
      const v = c.part === "systolic" ? x.vitals.sbp : x.vitals.dbp;
      const key = "gte_ref" in c ? "gte_ref" : "lt_ref" in c ? "lt_ref" : null;
      if (!key) return compare(v, c, x);
      const r = refAny(x, String(c[key]));
      const n =
        typeof r === "number"
          ? r
          : r && typeof r === "object"
            ? (r as Record<string, number>)[`${c.part}_gte`]
            : undefined;
      if (v === null || typeof n !== "number") return false;
      return key === "gte_ref" ? v >= n : v < n;
    }
    if (c.vital === "vs.bp" && "gte_ref" in c) {
      // A BP reference holds both limits: systolic or diastolic at or above (NICE NG136).
      const lim = refAny(x, String(c.gte_ref)) as
        | { systolic_gte?: number; diastolic_gte?: number }
        | undefined;
      const { sbp, dbp } = x.vitals;
      return (
        (sbp !== null && lim?.systolic_gte !== undefined && sbp >= lim.systolic_gte) ||
        (dbp !== null && lim?.diastolic_gte !== undefined && dbp >= lim.diastolic_gte)
      );
    }
    if (c.vital === "vs.glucose") {
      // A context (EC-3): unknown without a reading or its context, false for another context.
      if ("context" in c) {
        const v = x.vitals;
        if ((v.glucose === null && !v.glucoseReads) || !v.glucoseContext) return null;
        if (v.glucoseContext !== c.context) return false;
      }
      return glucoseCompare(c, x);
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
  return null; // an atom this engine does not know: unknown, so never fires (P0-18)
}
