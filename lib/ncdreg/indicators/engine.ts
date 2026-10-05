import type { CareBand } from "../standard/calculations";
import type { ConditionModule } from "../standard/types";
import type { Dataset, DPerson, DVisit } from "./dataset";

import { careBand } from "../standard/calculations";
import { CLASSIFICATIONS } from "../standard/classifications";
import { medicineByCode } from "../standard/code-lists";
import {
  CORE_INDICATORS,
  HOSPITAL_INDICATORS,
  HOSPITAL_PARAMS,
  INDICATOR_DEFINITION_VERSION,
  WINDOWS,
} from "../standard/indicators";

/**
 * The indicator engine (§6, ADR 0213): pure functions over a facility dataset, parameterised by a
 * reporting month and an as-of date. No condition code appears here: the C- and H- definitions name
 * their modules in the standard (`indicators.ts`), and the G- family runs over the module records.
 * Every result carries its definition version and the person ids behind each count (drill-down, F2).
 */

/* ─── dates (ISO, calendar months) ─────────────────────────────────────── */

export const monthStart = (m: string) => `${m}-01`;
export function addMonths(m: string, n: number): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export function monthEnd(m: string): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
}
export const monthOf = (iso: string) => iso.slice(0, 7);
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const inRange = (d: string, a: string, b: string) => d >= a && d <= b;

/* ─── results ──────────────────────────────────────────────────────────── */

export type IndicatorResult = {
  code: string;
  condition?: string;
  version: string;
  num?: number;
  den?: number;
  /** Named counts that sum to `den` (distributions, outcome classes, cascades, cohorts). */
  parts?: Record<string, number>;
  /** Person ids behind each count: "num", "den", or a part name. Never stored in a snapshot. */
  ids: Record<string, string[]>;
  /** Rates per 1,000 (H08). */
  rates?: Record<string, number>;
};

export type IndicatorReport = {
  month: string;
  asOf: string;
  definitionVersion: string;
  results: Record<string, IndicatorResult>;
};

export type Filters = {
  condition?: string | null;
  sex?: "female" | "male" | null;
  ageBand?: "18_29" | "30_49" | "50_69" | "70_plus" | null;
  district?: string | null;
  careBand?: CareBand | null;
};

export type ComputeOptions = {
  month: string;
  /** Defaults to the month's last day; live views pass today. */
  asOf?: string;
  /** Data known up to this date (C15 looks past the month end for returns). Defaults to asOf. */
  dataCutoff?: string;
  catalogue: readonly ConditionModule[];
  /** Modules the G-family and the dashboard report on. */
  enabled: ReadonlySet<string>;
  filters?: Filters;
};

/* ─── per-person facts ─────────────────────────────────────────────────── */

const valid = (v: DVisit) => v.closed && !v.invalid;
const visitsIn = (p: DPerson, a: string, b: string) =>
  p.visits.filter((v) => valid(v) && inRange(v.date, a, b));
/** The latest by date; same-day ties go to the later-entered record, then the id, so input order never matters. */
const latest = <T extends { date: string; enteredDate?: string; id?: string }>(xs: readonly T[]) =>
  [...xs]
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.enteredDate ?? "").localeCompare(b.enteredDate ?? "") ||
        (a.id ?? "").localeCompare(b.id ?? ""),
    )
    .at(-1);
const firstRegistration = (p: DPerson, asOf: string) =>
  p.registrations
    .filter((r) => r.date <= asOf)
    .map((r) => r.date)
    .sort()[0] ?? null;
const died = (p: DPerson, asOf: string) =>
  p.events.some((e) => e.type === "death" && e.date <= asOf);

/** Transferred out with no later visit, or withdrawn, by `asOf` (C01 exclusion, from the event date onward). */
function leftCare(p: DPerson, asOf: string): boolean {
  if (p.events.some((e) => e.type === "withdrawal" && e.date <= asOf)) return true;
  const t = p.events
    .filter((e) => e.type === "transfer_out" && e.date <= asOf)
    .map((e) => e.date)
    .sort()
    .at(-1);
  return !!t && !p.visits.some((v) => valid(v) && v.date > t && v.date <= asOf);
}

export type Windows = { asOf: string; recentStart: string; yearStart: string; monthFirst: string };
export function windowsFor(month: string, asOf: string): Windows {
  return {
    asOf,
    recentStart: monthStart(addMonths(month, -(WINDOWS.recent_months - 1))),
    yearStart: monthStart(addMonths(month, -(WINDOWS.year_months - 1))),
    monthFirst: monthStart(month),
  };
}

export function underCare(p: DPerson, w: Windows): boolean {
  if (!firstRegistration(p, w.asOf)) return false;
  if (died(p, w.asOf) || leftCare(p, w.asOf)) return false;
  return visitsIn(p, w.yearStart, w.asOf).length > 0;
}

const ageAt = (p: DPerson, iso: string) => Number(iso.slice(0, 4)) - p.birthYear;
function ageBand(age: number): Filters["ageBand"] {
  return age < 30 ? "18_29" : age < 50 ? "30_49" : age < 70 ? "50_69" : "70_plus";
}

function latestHba1cIn(p: DPerson, a: string, b: string): number | null {
  const hs = p.visits
    .filter((v) => valid(v) && v.hba1c && inRange(v.hba1c.resultDate, a, b))
    .map((v) => ({ date: v.hba1c!.resultDate, pct: v.hba1c!.percent }));
  return latest(hs)?.pct ?? null;
}

/** The outcome class for one registration at the latest visit in the window (§6). */
export function outcomeClass(
  p: DPerson,
  reg: { id: string; condition: string },
  m: ConditionModule,
  w: Windows,
): string {
  const v = latest(visitsIn(p, w.recentStart, w.asOf));
  if (!v) return "no_visit";
  if (m.outcome_classification.kind === "clinician_recorded")
    return v.recordedControl[reg.id] ?? "not_recorded";
  const c = CLASSIFICATIONS[m.outcome_classification.classification];
  if (!c) throw new Error(`Unknown classification ${m.outcome_classification.classification}`);
  return c.classify({
    bp: v.bp,
    glucose: v.glucose,
    hba1cInWindow: latestHba1cIn(p, w.recentStart, w.asOf),
  });
}

export function outcomeClasses(m: ConditionModule): { classes: string[]; leading: string } {
  return m.outcome_classification.kind === "rule"
    ? { classes: [...m.outcome_classification.classes], leading: m.outcome_classification.in_range }
    : {
        classes: ["controlled", "partly_controlled", "not_controlled", "not_assessed"],
        leading: "controlled",
      };
}

export function personCareBand(p: DPerson, asOf: string): CareBand | null {
  const regs = p.registrations.filter((r) => r.date <= asOf).map((r) => r.condition);
  const revs = (c: string) => latest(p.reviews.filter((r) => r.component === c && r.date <= asOf));
  const k = revs("kidney");
  const e = revs("eyes");
  const f = revs("feet");
  return careBand({
    registrations: regs,
    knownCvd: p.knownCvd,
    eventTypes: p.events.filter((x) => x.date <= asOf).map((x) => x.type),
    latestKidney: k
      ? {
          egfr: (k.derived.egfr as number | undefined) ?? null,
          kdigoA: (k.derived.kdigoA as "A1" | "A2" | "A3" | undefined) ?? null,
        }
      : null,
    latestEyes: e
      ? {
          retinopathy_grade: (e.data.retinopathyGrade as string | undefined) ?? null,
          macular_oedema: (e.data.macularOedema as string | undefined) ?? null,
        }
      : null,
    latestFeet: f
      ? {
          risk: (f.derived.footRisk as number | undefined) ?? null,
          current_ulcer: !!f.data.currentUlcer,
          amputation: (f.data.amputation as string | undefined) ?? "none",
        }
      : null,
  });
}

/* ─── completeness (G1, H10) ───────────────────────────────────────────── */

export type CompletenessInput = {
  visit: Pick<
    DVisit,
    | "weightKg"
    | "bp"
    | "glucose"
    | "medicinesRecorded"
    | "missedDoses"
    | "medicinesObtained"
    | "nextAppointment"
    | "disposition"
    | "recordedControl"
    | "type"
  >;
  registrations: readonly { id: string; module: ConditionModule }[];
};
/** The every-visit core fields that apply to this visit, and which are missing. */
export function completeness({ visit: v, registrations }: CompletenessInput): {
  score: number;
  applicable: string[];
  missing: string[];
} {
  const fields: [string, boolean][] = [
    ["weight", v.weightKg != null],
    ["blood_pressure", v.bp != null],
    ["medicines", v.medicinesRecorded],
    ["missed_doses", v.missedDoses != null],
    ["medicines_obtained", v.medicinesObtained != null],
    ["next_appointment", v.nextAppointment != null || v.disposition != null],
  ];
  for (const { id, module: m } of registrations) {
    for (const f of m.visit_fields)
      if (f.requirement === "expected" && f.code === "glucose")
        fields.push([`glucose`, v.glucose != null]);
    if (
      m.outcome_classification.kind === "clinician_recorded" &&
      (v.type === "scheduled" || v.type === "unscheduled")
    )
      fields.push([`recorded_control:${m.code}`, v.recordedControl[id] != null]);
  }
  const uniq = new Map(fields);
  const applicable = [...uniq.keys()];
  const missing = applicable.filter((k) => !uniq.get(k));
  return {
    score: applicable.length
      ? Math.round((100 * (applicable.length - missing.length)) / applicable.length)
      : 100,
    applicable,
    missing,
  };
}

/* ─── the engine ───────────────────────────────────────────────────────── */

export function computeIndicators(ds: Dataset, o: ComputeOptions): IndicatorReport {
  const asOf = o.asOf ?? monthEnd(o.month);
  const cutoff = o.dataCutoff ?? asOf;
  const w = windowsFor(o.month, asOf);
  const mod = (code: string) => o.catalogue.find((m) => m.code === code);
  const f = o.filters ?? {};
  const persons = ds.persons.filter((p) => {
    if (f.sex && p.sex !== f.sex) return false;
    if (f.district && p.district !== f.district) return false;
    if (f.ageBand && ageBand(ageAt(p, asOf)) !== f.ageBand) return false;
    if (f.condition && !p.registrations.some((r) => r.condition === f.condition && r.date <= asOf))
      return false;
    if (f.careBand && personCareBand(p, asOf) !== f.careBand) return false;
    return true;
  });

  const results: Record<string, IndicatorResult> = {};
  const put = (r: Omit<IndicatorResult, "version">) => {
    const key = r.condition ? `${r.code}.${r.condition}` : r.code;
    results[key] = { version: INDICATOR_DEFINITION_VERSION, ...r };
  };
  const ids = (ps: readonly DPerson[]) => ps.map((p) => p.id);

  const registered = persons.filter((p) => firstRegistration(p, asOf) && !died(p, asOf));
  const care = persons.filter((p) => underCare(p, w));
  const careSet = new Set(care.map((p) => p.id));
  const regOf = (p: DPerson, c: string) =>
    p.registrations.find((r) => r.condition === c && r.date <= asOf);

  // C01–C03, C12
  put({ code: "C01", num: care.length, ids: { num: ids(care) } });
  put({ code: "C02", num: registered.length, ids: { num: ids(registered) } });
  const newRegs = persons.filter((p) => {
    const first = firstRegistration(p, asOf);
    return first != null && monthOf(first) === o.month;
  });
  put({ code: "C03", num: newRegs.length, ids: { num: ids(newRegs) } });
  const ltfu = registered.filter(
    (p) =>
      (firstRegistration(p, asOf) as string) < w.yearStart &&
      visitsIn(p, w.yearStart, asOf).length === 0,
  );
  put({
    code: "C12",
    num: ltfu.length,
    den: registered.length,
    ids: { num: ids(ltfu), den: ids(registered) },
  });

  // Outcome distributions for one condition: the C04–C11 slices and G04.
  const outcomeFor = (code: string) => {
    const m = mod(code);
    if (!m) return null;
    const { classes, leading } = outcomeClasses(m);
    const den = care.filter((p) => {
      const r = regOf(p, code);
      return r && r.date < w.recentStart;
    });
    const parts: Record<string, string[]> = Object.fromEntries(
      [...classes, "not_recorded", "no_visit"].map((c) => [c, []]),
    );
    for (const p of den) {
      const r = regOf(p, code)!;
      const cls = outcomeClass(p, r, m, w);
      (parts[cls] ??= []).push(p.id);
    }
    return { m, den, parts, leading, classes };
  };

  for (const def of CORE_INDICATORS.filter((d) => d.condition && d.classes)) {
    const out = outcomeFor(def.condition!);
    if (!out) continue;
    const num = def.classes!.flatMap((c) => out.parts[c] ?? []);
    put({ code: def.code, num: num.length, den: out.den.length, ids: { num, den: ids(out.den) } });
  }
  for (const code of [HOSPITAL_PARAMS.bp_module, HOSPITAL_PARAMS.glycaemic_module]) {
    const out = outcomeFor(code);
    if (out)
      put({
        code: "not_recorded",
        condition: code,
        num: out.parts.not_recorded!.length,
        den: out.den.length,
        ids: { num: out.parts.not_recorded!, den: ids(out.den) },
      });
  }

  // C13–C15: overdue on the 1st of the month, called, returned.
  const first = w.monthFirst;
  const prevMonth = addMonths(o.month, -1);
  const careOnFirst = new Set(
    persons
      .filter((p) => underCare(p, windowsFor(prevMonth, monthEnd(prevMonth))))
      .map((p) => p.id),
  );
  const overdueOn = (p: DPerson, d: string) => {
    const known = p.appointments.filter(
      (a) =>
        a.createdDate < d &&
        !(a.status === "cancelled" && a.reason !== "superseded" && a.updatedDate < d),
    );
    const cur = [...known]
      .sort(
        (a, b) =>
          a.createdDate.localeCompare(b.createdDate) ||
          a.date.localeCompare(b.date) ||
          a.id.localeCompare(b.id),
      )
      .at(-1);
    if (!cur || cur.date >= d) return false;
    return !p.visits.some((v) => valid(v) && v.date >= cur.date && v.date < d);
  };
  const c13den = persons.filter((p) => careOnFirst.has(p.id));
  const c13 = c13den.filter(
    (p) =>
      overdueOn(p, first) && p.hasValidPhone && !(p.recallRemovedAt && p.recallRemovedAt < first),
  );
  put({
    code: "C13",
    num: c13.length,
    den: c13den.length,
    ids: { num: ids(c13), den: ids(c13den) },
  });
  const end = monthEnd(o.month);
  const firstCall = (p: DPerson) =>
    p.calls
      .filter((c) => inRange(c.date, first, end))
      .map((c) => c.date)
      .sort()[0];
  const c14 = c13.filter((p) => firstCall(p));
  put({ code: "C14", num: c14.length, den: c13.length, ids: { num: ids(c14), den: ids(c13) } });
  const c15 = c14.filter((p) => {
    const c = firstCall(p)!;
    const until = [addDays(c, WINDOWS.returned_days), cutoff].sort()[0]!;
    return p.visits.some((v) => valid(v) && inRange(v.date, c, until));
  });
  put({ code: "C15", num: c15.length, den: c14.length, ids: { num: ids(c15), den: ids(c14) } });

  // C16: the four latest quarterly cohorts whose following quarter is complete, per rule module.
  const quarterOf = (iso: string) =>
    `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
  const quarterBounds = (q: string) => {
    const [y, n] = [Number(q.slice(0, 4)), Number(q.slice(6))];
    const sm = `${y}-${String((n - 1) * 3 + 1).padStart(2, "0")}`;
    return {
      start: monthStart(sm),
      end: monthEnd(addMonths(sm, 2)),
      next: quarterOf(monthStart(addMonths(sm, 3))),
    };
  };
  const lastCompleteQ = (() => {
    let q = quarterOf(asOf);
    if (quarterBounds(q).end > asOf) q = quarterOf(addDays(quarterBounds(q).start, -1));
    return q;
  })();
  const cohortQs: string[] = [];
  {
    // outcome quarter = last complete quarter; cohort = the quarter before it; four cohorts back.
    let outQ = lastCompleteQ;
    for (let i = 0; i < 4; i++) {
      const cohort = quarterOf(addDays(quarterBounds(outQ).start, -1));
      cohortQs.unshift(cohort);
      outQ = cohort;
    }
  }
  for (const m of o.catalogue.filter(
    (x) => x.outcome_classification.kind === "rule" && o.enabled.has(x.code),
  )) {
    const { leading } = outcomeClasses(m);
    const parts: Record<string, number> = {};
    const idmap: Record<string, string[]> = {};
    for (const q of cohortQs) {
      const qb = quarterBounds(q);
      const nb = quarterBounds(qb.next);
      const cohort = persons.filter((p) => {
        const r = regOf(p, m.code);
        return r && inRange(r.date, qb.start, qb.end);
      });
      const cw: Windows = {
        asOf: nb.end,
        recentStart: nb.start,
        yearStart: nb.start,
        monthFirst: nb.start,
      };
      const buckets: Record<string, string[]> = {
        [leading]: [],
        other: [],
        not_recorded: [],
        no_visit: [],
      };
      for (const p of cohort) {
        const cls = outcomeClass(p, regOf(p, m.code)!, m, cw);
        (cls === leading
          ? buckets[leading]
          : cls === "no_visit" || cls === "not_recorded"
            ? buckets[cls]
            : buckets.other)!.push(p.id);
      }
      for (const [k, v] of Object.entries(buckets)) {
        parts[`${q}:${k}`] = v.length;
        idmap[`${q}:${k}`] = v;
      }
      parts[`${q}:cohort`] = cohort.length;
      idmap[`${q}:cohort`] = ids(cohort);
    }
    put({ code: "C16", condition: m.code, parts, ids: idmap });
  }

  // G01–G06 for every enabled condition.
  for (const m of o.catalogue.filter((x) => o.enabled.has(x.code))) {
    const regd = persons.filter((p) => regOf(p, m.code) && !died(p, asOf));
    const g02 = regd.filter((p) => careSet.has(p.id));
    const g03 = persons.filter((p) => {
      const r = regOf(p, m.code);
      return r && monthOf(r.date) === o.month;
    });
    put({ code: "G01", condition: m.code, num: regd.length, ids: { num: ids(regd) } });
    put({ code: "G02", condition: m.code, num: g02.length, ids: { num: ids(g02) } });
    put({ code: "G03", condition: m.code, num: g03.length, ids: { num: ids(g03) } });
    const out = outcomeFor(m.code)!;
    put({
      code: "G04",
      condition: m.code,
      den: out.den.length,
      parts: Object.fromEntries(Object.entries(out.parts).map(([k, v]) => [k, v.length])),
      ids: { ...out.parts, den: ids(out.den) },
    });
    const g05 = regd.filter(
      (p) => regOf(p, m.code)!.date < w.yearStart && visitsIn(p, w.yearStart, asOf).length === 0,
    );
    put({
      code: "G05",
      condition: m.code,
      num: g05.length,
      den: regd.length,
      ids: { num: ids(g05), den: ids(regd) },
    });
    const recent = g02.filter((p) => visitsIn(p, w.recentStart, asOf).length > 0);
    const lead = g02.filter((p) => outcomeClass(p, regOf(p, m.code)!, m, w) === out.leading);
    put({
      code: "G06",
      condition: m.code,
      den: regd.length,
      parts: {
        registered: regd.length,
        under_care: g02.length,
        visit_3_months: recent.length,
        leading_class: lead.length,
      },
      ids: {
        registered: ids(regd),
        under_care: ids(g02),
        visit_3_months: ids(recent),
        leading_class: ids(lead),
        den: ids(regd),
      },
    });
  }

  // H01–H12
  const P = HOSPITAL_PARAMS;
  const dmCare = care.filter((p) => regOf(p, P.glycaemic_module));
  const h01 = dmCare.filter((p) =>
    p.visits.some((v) => valid(v) && v.hba1c && inRange(v.hba1c.resultDate, w.yearStart, asOf)),
  );
  put({
    code: "H01",
    num: h01.length,
    den: dmCare.length,
    ids: { num: ids(h01), den: ids(dmCare) },
  });
  const kidneyCare = care.filter((p) =>
    p.registrations.some(
      (r) =>
        r.date <= asOf && mod(r.condition)?.review_components.some((c) => c.component === "kidney"),
    ),
  );
  const kidneyIn = (p: DPerson) =>
    p.reviews.filter((r) => r.component === "kidney" && inRange(r.date, w.yearStart, asOf));
  const h02 = kidneyCare.filter((p) => {
    const ks = kidneyIn(p);
    return (
      ks.some((k) => k.data.creatinineUmol != null) && ks.some((k) => k.data.urineTest != null)
    );
  });
  put({
    code: "H02",
    num: h02.length,
    den: kidneyCare.length,
    ids: { num: ids(h02), den: ids(kidneyCare) },
  });
  const h03 = dmCare.filter((p) =>
    p.reviews.some(
      (r) =>
        r.component === "eyes" && r.data.examined === true && inRange(r.date, w.yearStart, asOf),
    ),
  );
  put({
    code: "H03",
    num: h03.length,
    den: dmCare.length,
    ids: { num: ids(h03), den: ids(dmCare) },
  });
  const h04 = dmCare.filter((p) =>
    p.reviews.some((r) => r.component === "feet" && inRange(r.date, w.yearStart, asOf)),
  );
  put({
    code: "H04",
    num: h04.length,
    den: dmCare.length,
    ids: { num: ids(h04), den: ids(dmCare) },
  });
  const h05den = dmCare.filter((p) => regOf(p, P.glycaemic_module)!.date < w.recentStart);
  const h05 = (s: number, d: number) =>
    h05den.filter((p) => {
      const v = latest(visitsIn(p, w.recentStart, asOf));
      return !!v?.bp && v.bp[0] < s && v.bp[1] < d;
    });
  const [t1, t2] = P.bp_thresholds_in_diabetes;
  const h05a = h05(t1[0], t1[1]);
  const h05b = h05(t2[0], t2[1]);
  put({
    code: "H05",
    den: h05den.length,
    parts: { [`below_${t1[0]}_${t1[1]}`]: h05a.length, [`below_${t2[0]}_${t2[1]}`]: h05b.length },
    ids: {
      den: ids(h05den),
      [`below_${t1[0]}_${t1[1]}`]: ids(h05a),
      [`below_${t2[0]}_${t2[1]}`]: ids(h05b),
    },
  });
  const h06den = dmCare.filter((p) => ageAt(p, asOf) >= P.statin_min_age);
  const h06 = h06den.filter((p) => {
    const v = latest(visitsIn(p, w.yearStart, asOf));
    return (
      !!v && v.medicines.some((m) => medicineByCode.get(m)?.atc.startsWith(P.statin_atc_prefix))
    );
  });
  put({
    code: "H06",
    num: h06.length,
    den: h06den.length,
    ids: { num: ids(h06), den: ids(h06den) },
  });
  const reviewed = persons.filter((p) => kidneyIn(p).length > 0);
  const gParts: Record<string, string[]> = { G1: [], G2: [], G3a: [], G3b: [], G4: [], G5: [] };
  const aParts: Record<string, string[]> = { A1: [], A2: [], A3: [] };
  for (const p of reviewed) {
    const ks = kidneyIn(p);
    const g = latest(ks.filter((k) => k.derived.kdigoG));
    const a = latest(ks.filter((k) => k.derived.kdigoA));
    if (g) gParts[g.derived.kdigoG as string]!.push(p.id);
    if (a) aParts[a.derived.kdigoA as string]!.push(p.id);
  }
  put({
    code: "H07",
    den: reviewed.length,
    parts: Object.fromEntries(
      [...Object.entries(gParts), ...Object.entries(aParts)].map(([k, v]) => [k, v.length]),
    ),
    ids: { ...gParts, ...aParts, den: ids(reviewed) },
  });
  const evParts: Record<string, string[]> = {};
  for (const p of persons)
    for (const e of p.events.filter((x) => inRange(x.date, w.yearStart, asOf))) {
      (evParts[e.type] ??= []).push(p.id);
      if (e.type === "admission" && e.admissionReason)
        (evParts[`admission:${e.admissionReason}`] ??= []).push(p.id);
    }
  put({
    code: "H08",
    den: care.length,
    parts: Object.fromEntries(Object.entries(evParts).map(([k, v]) => [k, v.length])),
    rates: Object.fromEntries(
      Object.entries(evParts).map(([k, v]) => [
        k,
        care.length ? Math.round((1000 * v.length) / care.length) : 0,
      ]),
    ),
    ids: { ...evParts, den: ids(care) },
  });
  const monthVisits = persons.flatMap((p) =>
    p.visits.filter((v) => valid(v) && monthOf(v.date) === o.month).map((v) => ({ p, v })),
  );
  const h09den = monthVisits.filter(
    ({ v }) => v.medicinesObtained && v.medicinesObtained !== "not_applicable",
  );
  const h09num = h09den.filter(
    ({ v }) => v.medicinesObtained === "partial" || v.medicinesObtained === "none",
  );
  const h09ids: Record<string, string[]> = {};
  for (const { p, v } of h09num) (h09ids[v.notObtainedReason ?? "unknown"] ??= []).push(p.id);
  const h09parts = Object.fromEntries(Object.entries(h09ids).map(([k, v]) => [k, v.length]));
  put({
    code: "H09",
    num: h09num.length,
    den: h09den.length,
    parts: h09parts,
    ids: { ...h09ids, num: h09num.map(({ p }) => p.id), den: h09den.map(({ p }) => p.id) },
  });
  const live = monthVisits.filter(({ v }) => !v.historical);
  const complete = live.filter(({ p, v }) => {
    const regs = p.registrations
      .filter((r) => r.date <= v.date)
      .map((r) => ({ id: r.id, module: mod(r.condition)! }))
      .filter((r) => r.module);
    return completeness({ visit: v, registrations: regs }).missing.length === 0;
  });
  put({
    code: "H10",
    num: complete.length,
    den: live.length,
    ids: { num: complete.map(({ p }) => p.id), den: live.map(({ p }) => p.id) },
  });
  const sameDay = live.filter(({ v }) => v.enteredDate === v.date);
  put({
    code: "H11",
    num: sameDay.length,
    den: live.length,
    ids: { num: sameDay.map(({ p }) => p.id), den: live.map(({ p }) => p.id) },
  });
  const bandDen = care.filter((p) => P.care_band_modules.some((c) => regOf(p, c)));
  const bands: Record<string, string[]> = {
    hypertension_only: [],
    diabetes_only: [],
    both_without_complications: [],
    either_with_complications: [],
  };
  for (const p of bandDen) {
    const b = personCareBand(p, asOf);
    if (b) bands[b]!.push(p.id);
  }
  put({
    code: "H12",
    den: bandDen.length,
    parts: Object.fromEntries(Object.entries(bands).map(([k, v]) => [k, v.length])),
    ids: { ...bands, den: ids(bandDen) },
  });

  return { month: o.month, asOf, definitionVersion: INDICATOR_DEFINITION_VERSION, results };
}

/** A report without the person ids, for a snapshot. */
export function withoutIds(r: IndicatorReport): IndicatorReport {
  return {
    ...r,
    results: Object.fromEntries(Object.entries(r.results).map(([k, v]) => [k, { ...v, ids: {} }])),
  };
}

export { HOSPITAL_INDICATORS };
