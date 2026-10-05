import type { Property } from "./catalogue";

/**
 * The draft answer model (payload v2, gate-a §4) and its pure updates. Options are stored as
 * catalogue ids, never labels (Law 3). "Not asked" is the absence of a key, so it can never be
 * written as a negative (Law 4). Linked answers are derived (linkage.ts), never stored.
 */

export type YesNo = "yes" | "no";
export type DurationUnit = "hours" | "days" | "weeks" | "months" | "years";
export type PropValue = string | string[] | number;

export interface SymptomEntry {
  duration?: { value: number; unit: DurationUnit };
  props: Record<string, PropValue>;
  flags: Record<string, YesNo>;
}

export interface Complaint extends SymptomEntry {
  key: string;
  /** null: typed free text, "Uncatalogued, no properties"; never drives flags or engines. */
  symptom: string | null;
  text?: string;
}

export interface History {
  complaints: Complaint[];
  story?: string;
  /** "<symptom id>:<also_ask id>" → answer. */
  alsoAsked: Record<string, YesNo>;
  /** Symptom id → answer. Absent = not asked. */
  ros: Record<string, YesNo>;
  rosDetail: Record<string, SymptomEntry>;
  past: {
    /** `onProblemList`: the clinician confirmed it on the problem list (D-CV-09; display only). */
    conditions: Record<
      string,
      {
        answer: YesNo;
        since?: string;
        onProblemList?: boolean;
        /** The catalogue's `condition_details` answers (EC-2), reported, never charted. An
         *  unanswered property is an absent key. */
        details?: Record<string, PropValue>;
      }
    >;
    /** A pick carries its MS-EMR-CLERK-OPS-001 id beside the label; typed words have none. */
    operations?: "none" | { text: string; code?: string; year?: number; where?: string }[];
    transfusions?: "none" | { when?: string; reaction?: string }[];
    /** "Still true today": the listed allergies were confirmed at this visit (note only). */
    allergiesConfirmed?: boolean;
    /** "Takes none, including herbal" (note only; shown only while no medicine is recorded). */
    medicinesNone?: boolean;
  };
  family: Record<string, { answer: YesNo; relations?: string[] }>;
  social: {
    tobacco?: string;
    perDay?: number;
    years?: number;
    otherForms?: string[];
    quitWhen?: string;
    alcohol?: string;
    drinks?: string[];
    /** CAGE (data/clerking/cage.v1.json), per question; a missing key was not asked. */
    cage?: Record<string, YesNo>;
    substances?: string[];
    living?: string;
    activity?: string;
    occupation?: string;
    /** The MS-EMR-CLERK-OCC-001 id while the words are that list item's label. */
    occupationCode?: string;
    travel?: string;
    travelDetail?: string;
    diet?: string;
  };
  /** Set once, by "Continue in the new format" (lib/clerking/convert). */
  converted?: Conversion;
}

/* ─── A v1 draft continued in the new format (legacy-conversion.v1.json) ─── */

/** What became of one v1 answer: the review list shows every line, once. */
export type ConversionResult =
  | "converted"
  | "choose"
  | "text"
  | "not_asked"
  | "left_out"
  | "wrong_sex"
  | "proposed"
  | "contradiction";

export interface ConversionLine {
  token: string;
  /** The v1 label as the draft held it. */
  label: string;
  answer: YesNo;
  from: "complaint" | "ros";
  result: ConversionResult;
  /** The symptom ids it became. */
  to?: string[];
  /** Needs the clinician's review (risk), and the conversion flag it raises until then. */
  review?: boolean;
  flag?: string;
  /** Property ids left unanswered that the review list prompts for. */
  ask?: string[];
}

/** A conversion the clinician finishes: counts as not asked until then (decision #6). */
export interface PendingChoice {
  id: string;
  token: string;
  label: string;
  answer: YesNo;
  from: "complaint" | "ros";
  /** symptom: pick targets; property: pick options of `symptom.property`; activity: social
   *  history activity; pregnancy / lnmp: recorded in the pregnancy record, then marked done. */
  kind: "symptom" | "property" | "activity" | "pregnancy" | "lnmp";
  options: string[];
  symptom?: string;
  property?: string;
  preset?: Record<string, PropValue>;
  /** "Keep as text" is offered. */
  text?: boolean;
  /** The text complaint that holds the place of a complaint until the pick. */
  complaintKey?: string;
  /** The option proposed for confirmation (never set without it). */
  propose?: string;
  /** A conversion flag raised while this is open. */
  flag?: string;
  restricted?: boolean;
}

export interface Conversion {
  /** The table and version used ("MS-EMR-CLERK-LEGACY-001 1.0.0"). */
  table: string;
  /** The clinician has been through the review list. */
  reviewed?: boolean;
  lines: ConversionLine[];
  pending: PendingChoice[];
  /** Carried as systems-review text from the previous format. */
  text: { label: string; answer: YesNo; restricted?: boolean }[];
}

export interface HistoryHeader {
  historian?: string;
  language?: string;
  interpreter?: string;
}

export const emptyHistory = (): History => ({
  complaints: [],
  alsoAsked: {},
  ros: {},
  rosDetail: {},
  past: { conditions: {} },
  family: {},
  social: {},
});

export const emptyEntry = (): SymptomEntry => ({ props: {}, flags: {} });

/* ─── One property, by kind ─────────────────────────────────────── */

export const COUNT_MAX = 999;

/** Tap an option (or set a number): one = toggle, many = toggle with exclusive options,
 *  count = clamped 0..999, scale = 0..10 and tap again clears. */
export function applyProp(entry: SymptomEntry, p: Property, value: string | number): SymptomEntry {
  const props = { ...entry.props };
  const cur = props[p.id];
  switch (p.kind) {
    case "one":
      if (cur === value) delete props[p.id];
      else props[p.id] = value;
      break;
    case "many": {
      const v = String(value);
      const list = Array.isArray(cur) ? cur : [];
      const exclusive = p.exclusive_options ?? [];
      let next: string[];
      if (list.includes(v)) next = list.filter((x) => x !== v);
      else if (exclusive.includes(v)) next = [v];
      else next = [...list.filter((x) => !exclusive.includes(x)), v];
      if (next.length) props[p.id] = next;
      else delete props[p.id];
      break;
    }
    case "count":
      props[p.id] = Math.min(COUNT_MAX, Math.max(0, Math.round(Number(value))));
      break;
    case "scale": {
      const n = Math.min(10, Math.max(0, Math.round(Number(value))));
      if (cur === n) delete props[p.id];
      else props[p.id] = n;
      break;
    }
    default:
      if (value === "" || value == null) delete props[p.id];
      else props[p.id] = value;
  }
  return { ...entry, props };
}

export function stepCount(entry: SymptomEntry, p: Property, delta: number): SymptomEntry {
  const cur = typeof entry.props[p.id] === "number" ? (entry.props[p.id] as number) : 0;
  return applyProp(entry, p, cur + delta);
}

/** Duration: value ≥ 1; choosing a unit with no value starts at 1. */
export function setDuration(
  entry: SymptomEntry,
  change: { delta?: number; unit?: DurationUnit },
): SymptomEntry {
  const cur = entry.duration;
  const unit = change.unit ?? cur?.unit ?? "days";
  const value = Math.min(COUNT_MAX, Math.max(1, (cur?.value ?? 0) + (change.delta ?? 0)));
  return { ...entry, duration: { value, unit } };
}

/** A red-flag yes/no; tapping the same answer again clears it back to not asked. */
export function setFlag(entry: SymptomEntry, id: string, answer: YesNo): SymptomEntry {
  const flags = { ...entry.flags };
  if (flags[id] === answer) delete flags[id];
  else flags[id] = answer;
  return { ...entry, flags };
}

/* ─── Complaints ────────────────────────────────────────────────── */

export function addComplaint(
  h: History,
  symptom: string | null,
  key: string,
  text?: string,
): History {
  if (symptom && h.complaints.some((c) => c.symptom === symptom)) return h;
  const c: Complaint = {
    key,
    symptom,
    ...emptyEntry(),
    ...(symptom ? {} : { text: text?.trim() }),
  };
  return { ...h, complaints: [...h.complaints, c] };
}

export function removeComplaint(h: History, key: string): History {
  return { ...h, complaints: h.complaints.filter((c) => c.key !== key) };
}

export function updateComplaint(
  h: History,
  key: string,
  fn: (e: SymptomEntry) => SymptomEntry,
): History {
  return {
    ...h,
    complaints: h.complaints.map((c) => (c.key === key ? { ...c, ...fn(c) } : c)),
  };
}

/* ─── Yes/no maps (review of systems, also asked, past, family) ─── */

export function toggleAnswer<T extends Record<string, YesNo>>(m: T, id: string, answer: YesNo): T {
  const next = { ...m } as Record<string, YesNo>;
  if (next[id] === answer) delete next[id];
  else next[id] = answer;
  return next as T;
}

/** A yes/no that carries detail (past conditions, family): tapping the same answer clears it; a new
 *  answer starts afresh, so "known for" or relatives never outlive the yes they described. */
export function toggleEntry<E extends { answer: YesNo }>(
  m: Readonly<Record<string, E>>,
  id: string,
  answer: YesNo,
): Record<string, E> {
  const next = { ...m };
  if (next[id]?.answer === answer) delete next[id];
  else next[id] = { answer } as E;
  return next;
}

/** A `past_detail` atom (EC-2): `{past_detail: condition, property, equals | any_of | includes_any}`.
 *  Three-valued: null while the condition or the property is unanswered (never "no"). */
export function pastDetail(h: History, c: Readonly<Record<string, unknown>>): boolean | null {
  const e = h.past.conditions[String(c.past_detail)];
  if (!e) return null;
  if (e.answer === "no") return false;
  const v = e.details?.[String(c.property)];
  if (v === undefined) return null;
  const has = (o: string) => (Array.isArray(v) ? v.includes(o) : v === o);
  if ("equals" in c) return has(String(c.equals));
  const list = (c.any_of ?? c.includes_any) as string[] | undefined;
  return list ? list.some(has) : null;
}

/** A many-chip list: toggle `id`; an exclusive id ("none") clears the rest and the rest clear it. */
export function toggleIn(
  list: readonly string[] | undefined,
  id: string,
  exclusive: readonly string[] = [],
): string[] | undefined {
  const cur = list ?? [];
  const next = cur.includes(id)
    ? cur.filter((x) => x !== id)
    : exclusive.includes(id)
      ? [id]
      : [...cur.filter((x) => !exclusive.includes(x)), id];
  return next.length ? next : undefined;
}

type Social = History["social"];
const SMOKED = new Set(["former", "current"]);

/** Tobacco status (tap again clears). Cigarettes, years and other forms belong to a smoker; "when
 *  they quit" to a former one, so they go when the status stops fitting (commit.ts reads them). */
export function setTobacco(s: Social, id: string): Social {
  const tobacco = s.tobacco === id ? undefined : id;
  const next: Social = { ...s, tobacco };
  if (!tobacco || !SMOKED.has(tobacco)) {
    delete next.perDay;
    delete next.years;
    delete next.otherForms;
  }
  if (tobacco !== "former") delete next.quitWhen;
  if (!tobacco) delete next.tobacco;
  return next;
}

/** Alcohol pattern (tap again clears); drink types only while they drink. */
export function setAlcohol(s: Social, id: string): Social {
  const alcohol = s.alcohol === id ? undefined : id;
  const next: Social = { ...s, alcohol };
  if (!alcohol || alcohol === "none") {
    delete next.drinks;
    delete next.cage;
  }
  if (!alcohol) delete next.alcohol;
  return next;
}

export function setRos(h: History, symptom: string, answer: YesNo): History {
  const ros = toggleAnswer(h.ros, symptom, answer);
  // A no (or a cleared answer) drops the details: they described a symptom that is not there.
  const rosDetail = { ...h.rosDetail };
  if (ros[symptom] !== "yes") delete rosDetail[symptom];
  return { ...h, ros, rosDetail };
}

/** "Nothing else": answers every still-unasked, non-linked item in the system as no (Law 4). */
export function nothingElse(
  h: History,
  items: readonly string[],
  linked: ReadonlySet<string>,
): History {
  const ros = { ...h.ros };
  for (const i of items) if (!linked.has(i) && !ros[i]) ros[i] = "no";
  return { ...h, ros };
}

export function updateRosDetail(
  h: History,
  symptom: string,
  fn: (e: SymptomEntry) => SymptomEntry,
): History {
  return {
    ...h,
    rosDetail: { ...h.rosDetail, [symptom]: fn(h.rosDetail[symptom] ?? emptyEntry()) },
  };
}

/* ─── Derivations ───────────────────────────────────────────────── */

const DAYS: Record<DurationUnit, number> = {
  hours: 1 / 24,
  days: 1,
  weeks: 7,
  months: 30,
  years: 365,
};

export const durationDays = (d: SymptomEntry["duration"]): number | null =>
  d ? d.value * DAYS[d.unit] : null;

/** "3 weeks", "1 day". */
export function durationText(d: SymptomEntry["duration"]): string {
  if (!d) return "";
  return `${d.value} ${d.value === 1 ? d.unit.replace(/s$/, "") : d.unit}`;
}

/** CAGE: one point per yes, out of the questions asked (a question not asked scores nothing). */
export function cageScore(
  cage: Record<string, YesNo> | undefined,
  items: readonly { id: string }[],
) {
  const asked = items.filter((q) => cage?.[q.id]).length;
  const yes = items.filter((q) => cage?.[q.id] === "yes").length;
  return { yes, asked, of: items.length };
}

/** Pack-years: cigarettes a day ÷ 20 × years, one decimal (derived, never typed). */
export function packYears(perDay?: number, years?: number): number | null {
  if (!perDay || !years) return null;
  return Math.round((perDay / 20) * years * 10) / 10;
}
