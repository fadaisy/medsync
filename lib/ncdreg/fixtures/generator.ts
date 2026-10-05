/**
 * The seeded generator of synthetic patients (§6, §10.4): 18 months of plausible visits, reviews,
 * events and recall calls, emitted in the shape of the catalogue's `scenario_patients`, so the demo
 * loader writes them through the normal command path. Same seed, day 0 and size → identical output.
 *
 * Calibration (§10.4) moves only the probabilities in PARAMS; never an indicator, a target or a
 * tolerance. Every person is synthetic and carries a DEMO-1xxxx number.
 */
import type { ScenarioPatient, ScenarioVisit } from "../demo/catalogue";

import { egfr } from "../standard/calculations";

/** mulberry32: small, fast, deterministic. */
export function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
    real: (lo: number, hi: number) => lo + next() * (hi - lo),
    weighted: <K extends string>(w: Readonly<Record<K, number>>): K => {
      const total = Object.values<number>(w).reduce((a, b) => a + b, 0);
      let r = next() * total;
      for (const [k, v] of Object.entries<number>(w)) if ((r -= v) < 0) return k as K;
      return Object.keys(w).at(-1) as K;
    },
  };
}
export type Rng = ReturnType<typeof prng>;

/** The tunable probabilities. Round log in docs/ncd/DEMO-DATA.md. */
export const PARAMS = {
  /** Share of generated persons first registered before the 18-month history window. */
  registeredBeforeHistory: 0.42,
  /** Probability of attending each scheduled appointment on time (within a few days). */
  attendOnTime: 0.78,
  /** After a missed appointment: probability the person comes back at all (else drops out). */
  returnsAfterMiss: 0.8,
  /** Share of persons who stop attending before the last 12 months (lost to follow-up). */
  lostBeforeYear: 0.075,
  /** Probability per missed appointment that the registry officer calls. */
  calledWhenOverdue: 0.55,
  /** Probability a called patient returns within 15 days of the call. */
  returnsWithin15AfterCall: 0.6,
  /** Annual death hazard. */
  deathPerYear: 0.024,
  /** Death hazard applied over the history (18 months, but tuned to the 12-month rate). */
  deathSpan: 1.1,
  /** Event hazard multipliers: complications cluster on persons with a reduced eGFR. */
  complicatedEventFactor: 2.5,
  otherEventFactor: 0.45,
  /** Control in the first 120 days after registration, relative to the month's rate. */
  newRegistrantControl: 0.95,
  /** Annual event hazards per person. */
  events: {
    admission: 0.055,
    foot_ulcer_new: 0.06,
    stroke: 0.013,
    dialysis_start: 0.016,
    amputation_minor: 0.012,
  },
  /** Share of persons with each review in the last 12 months (kidney among all, eyes/feet among glucose-module persons). */
  kidneyReview: 0.44,
  eyesReview: 0.22,
  feetReview: 0.47,
  hba1cTested: 0.36,
  statin: 0.58,
  knownCvd: 0.012,
  retinopathy: 0.12,
  /** Per-visit probability, among visited, of the leading class: month index 0 = 11 months before day 0's month. */
  bpInRange: [0.47, 0.49, 0.5, 0.52, 0.54, 0.56, 0.57, 0.59, 0.61, 0.62, 0.63, 0.64],
  /** Glycaemic classes among visits with fasting glucose (or HbA1c). */
  glucoseClasses: { in_range: 0.29, moderately_raised: 0.43, very_raised: 0.28 },
  /** KDIGO G among reviewed. */
  kidneyG: { G1: 0.29, G2: 0.41, G3a: 0.16, G3b: 0.08, G4: 0.04, G5: 0.02 },
  medicinesNotFull: 0.12,
  /** Stable patients on long refill intervals (no visit in 3 months, yet not overdue). */
  longInterval: 0.15,
} as const;

type GenOptions = {
  seed: number;
  day0: string;
  /** Target count of registered persons not recorded as died, scenario patients included. */
  size: number;
  /** Persons already present (scenario patients), counted toward `size`. */
  existing?: number;
  /** Catalogue `generator` block. */
  spec: {
    registered_by_condition: Record<string, number>;
    other_modules: Record<string, number>;
    name_pools: { given_female: string[]; given_male: string[]; family: string[] };
    sex_female_percent: number;
    age_bands_percent: Record<string, number>;
    visit_interval_days: { typical: number; min: number; max: number };
    share_with_no_phone_percent: number;
    glucose_type_mix_percent: Record<string, number>;
  };
  /** The two full module codes, from the standard (the generator names no condition itself). */
  bpModule: string;
  glucoseModule: string;
  /** Names the generator must never reproduce (scenario patients' full names). */
  reservedNames?: ReadonlySet<string>;
  reservedPhones?: ReadonlySet<string>;
};

const HISTORY = -548; // 18 months

function bpReading(rng: Rng, inRange: boolean): [number, number][] {
  const s = inRange ? rng.int(112, 136) : rng.int(142, 176);
  const d = inRange ? rng.int(68, 86) : rng.int(86, 104);
  return [
    [s + 2, d + 2],
    [s - 2, d - 2],
  ];
}

function glucoseValue(rng: Rng, cls: string): number {
  const v =
    cls === "in_range"
      ? rng.real(4.6, 6.9)
      : cls === "moderately_raised"
        ? rng.real(7.0, 11.0)
        : rng.real(11.1, 17.5);
  return Math.round(v * 10) / 10;
}

function creatinineFor(target: string, age: number, sex: "female" | "male", rng: Rng): number {
  const bounds: Record<string, [number, number]> = {
    G1: [90, 115],
    G2: [60, 89],
    G3a: [45, 59],
    G3b: [30, 44],
    G4: [15, 29],
    G5: [8, 14],
  };
  const [lo, hi] = bounds[target]!;
  const want = rng.int(lo, hi);
  let a = 15;
  let b = 2500;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (egfr(m, age, sex) > want) a = m;
    else b = m;
  }
  const c = Math.round(b);
  return egfr(c, age, sex) >= lo && egfr(c, age, sex) <= hi ? c : Math.round(a);
}

export function generatePatients(o: GenOptions): ScenarioPatient[] {
  const rng = prng(o.seed);
  const s = o.spec;
  const year0 = Number(o.day0.slice(0, 4));
  const monthIndex = (day: number) => {
    // 0 = 11 months before day 0's month … 11 = the month before day 0's month (the last complete month).
    const d = new Date(`${o.day0}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + day);
    const m0 = new Date(`${o.day0}T00:00:00Z`);
    const diff =
      (m0.getUTCFullYear() - d.getUTCFullYear()) * 12 + (m0.getUTCMonth() - d.getUTCMonth());
    return Math.max(0, Math.min(11, 12 - diff));
  };
  const total = Object.values(s.registered_by_condition).reduce((a, b) => a + b, 0);
  const both = s.registered_by_condition.both_of_the_above ?? 0;
  const bpOnly = (s.registered_by_condition[o.bpModule] ?? 0) - both;
  const gluOnly = (s.registered_by_condition[o.glucoseModule] ?? 0) - both;
  void total;
  // Persons who die are additional to `size` (catalogue note): top up for the expected deaths.
  const n = Math.max(
    0,
    Math.round((o.size - (o.existing ?? 0)) / (1 - PARAMS.deathPerYear * PARAMS.deathSpan)),
  );
  const complicated = new Set<string>();
  const usedNames = new Set(o.reservedNames ?? []);
  const usedPhones = new Set(o.reservedPhones ?? []);
  const out: ScenarioPatient[] = [];

  // Extra core-module registrations go to persons who already hold a full one (catalogue note).
  const extra: string[] = Object.entries(s.other_modules).flatMap(([code, k]) =>
    Array<string>(Math.max(0, k - 1)).fill(code),
  );

  for (let i = 0; i < n; i++) {
    const female = rng.chance(s.sex_female_percent / 100);
    const band = rng.weighted(s.age_bands_percent as Record<string, number>);
    const age =
      band === "18_29"
        ? rng.int(20, 29)
        : band === "30_49"
          ? rng.int(30, 49)
          : band === "50_69"
            ? rng.int(50, 69)
            : rng.int(70, 88);
    let given = "";
    let family = "";
    // Prefer an unused pair; once one sex's pairs run out (about 1,000 patients), accept a repeat.
    // The cap only changes the draw once the pool is exhausted, so smaller cohorts are unchanged.
    let tries = 0;
    do {
      given = rng.pick(female ? s.name_pools.given_female : s.name_pools.given_male);
      family = rng.pick(s.name_pools.family);
    } while (usedNames.has(`${given} ${family}`) && ++tries < 200);
    usedNames.add(`${given} ${family}`);
    let phone: string | null = null;
    if (!rng.chance(s.share_with_no_phone_percent / 100)) {
      let phoneTries = 0;
      do phone = `0700 00${rng.int(1, 9)} ${String(rng.int(0, 999)).padStart(3, "0")}`;
      while (usedPhones.has(phone) && ++phoneTries < 200);
      usedPhones.add(phone);
    }
    const kind = rng.weighted({ bp: bpOnly, glu: gluOnly, both });
    const conds =
      kind === "bp"
        ? [o.bpModule]
        : kind === "glu"
          ? [o.glucoseModule]
          : [o.bpModule, o.glucoseModule];
    const hasGlu = conds.includes(o.glucoseModule);
    // Registration day: older registrants before the history window, the rest spread evenly across it.
    const adultFrom = -(age - 18) * 365 + 400; // registered as an adult, with a margin for the estimated birth year
    const regDay = Math.max(
      adultFrom,
      rng.chance(PARAMS.registeredBeforeHistory)
        ? rng.int(-2400, HISTORY - 1)
        : rng.int(HISTORY, -1),
    );
    const registrations: ScenarioPatient["registrations"] = conds.map((c) => ({
      condition: c,
      subtype: c === o.glucoseModule ? (rng.chance(0.05) ? "type_1" : "type_2") : "primary",
      diagnosed_years_before_day_0: Math.min(
        age - 18,
        Math.max(0, Math.round(-regDay / 365) + rng.int(0, 6)),
      ),
      basis_of_diagnosis: c === o.glucoseModule ? "fasting_glucose" : "repeated_office_bp",
      registered_day: regDay,
      where_first_diagnosed: "this_facility" as const,
      referral_source: "outpatients" as const,
    }));
    const kidneyG = rng.chance(PARAMS.kidneyReview) ? rng.weighted(PARAMS.kidneyG) : null;
    const isComplicated = kidneyG != null && kidneyG !== "G1" && kidneyG !== "G2";
    const lostDay = rng.chance(PARAMS.lostBeforeYear) ? rng.int(HISTORY + 30, -380) : null;
    const deathDay = rng.chance(PARAMS.deathPerYear * PARAMS.deathSpan)
      ? rng.int(Math.max(regDay, HISTORY) + 30, -2)
      : null;
    const meds = [
      ...(conds.includes(o.bpModule)
        ? [rng.pick(["amlodipine", "losartan", "enalapril", "hydrochlorothiazide"])]
        : []),
      ...(hasGlu
        ? registrations.find((r) => r.condition === o.glucoseModule)!.subtype === "type_1"
          ? ["soluble insulin", "isophane insulin"]
          : ["metformin"]
        : []),
      ...(rng.chance(PARAMS.statin) ? ["atorvastatin"] : []),
    ];
    const visits: ScenarioVisit[] = [];
    const calls: { day: number; outcome: string; new_appointment_day?: number }[] = [];
    const long = rng.chance(PARAMS.longInterval);
    const interval = () => {
      if (long) return rng.int(95, 120);
      const v = Math.round(s.visit_interval_days.typical + (rng.next() - 0.5) * 40);
      return Math.max(s.visit_interval_days.min, Math.min(s.visit_interval_days.max, v));
    };
    let t = regDay >= HISTORY ? regDay : HISTORY + rng.int(0, 60);
    const hba1cDay = hasGlu && rng.chance(PARAMS.hba1cTested) ? rng.int(-360, -5) : null;
    while (t < 0) {
      if (deathDay != null && t >= deathDay) break;
      if (lostDay != null && t >= lostDay) break;
      const next = t + interval();
      const m = monthIndex(t);
      const v: ScenarioVisit = {
        day: t,
        type: "scheduled",
        weight_kg: Math.round(rng.real(55, 95) * 10) / 10,
        medicines: meds,
        missed_doses: rng.chance(0.25) ? "1_to_2_days" : "none",
        medicines_obtained: rng.chance(PARAMS.medicinesNotFull) ? "partial" : "full",
        next_appointment_day: next,
      };
      if (v.medicines_obtained === "partial")
        v.medicines_not_obtained_reason = rng.chance(0.55) ? "stock_out" : "cost";
      if (conds.includes(o.bpModule) || rng.chance(0.9))
        v.bp = bpReading(
          rng,
          rng.chance(PARAMS.bpInRange[m]! * (t - regDay < 120 ? PARAMS.newRegistrantControl : 1)),
        );
      if (hasGlu) {
        v.hypoglycaemia = "none";
        const cls = rng.weighted(PARAMS.glucoseClasses);
        const type = rng.weighted(
          s.glucose_type_mix_percent as Record<"fasting" | "random" | "post_meal", number>,
        );
        v.glucose = { value: glucoseValue(rng, cls), type, method: "capillary" };
        if (hba1cDay != null && t >= hba1cDay && !visits.some((x) => x.hba1c)) {
          const h =
            cls === "in_range"
              ? rng.real(5.6, 6.9)
              : cls === "moderately_raised"
                ? rng.real(7.0, 8.9)
                : rng.real(9.0, 12.5);
          v.hba1c = { value_percent: Math.round(h * 10) / 10, result_day: t };
        }
      }
      visits.push(v);
      if (next >= 0) break;
      if (rng.chance(PARAMS.attendOnTime)) {
        t = next + rng.int(0, 3);
        continue;
      }
      // Missed: perhaps a call, perhaps a return, perhaps gone.
      const callDay = next + rng.int(3, 25);
      const called = callDay < 0 && rng.chance(PARAMS.calledWhenOverdue);
      if (called) {
        const back = rng.chance(PARAMS.returnsWithin15AfterCall);
        if (back) {
          const ret = callDay + rng.int(1, 14);
          calls.push({ day: callDay, outcome: "will_return", new_appointment_day: ret });
          t = ret;
          continue;
        }
        calls.push({ day: callDay, outcome: rng.pick(["no_answer", "call_later", "no_answer"]) });
      }
      if (!rng.chance(PARAMS.returnsAfterMiss)) break;
      t = Math.max(next + rng.int(30, 140), called ? callDay + 16 : 0 - 10_000);
    }
    const events: ScenarioPatient["events"] = [];
    const span = Math.max(1, -Math.max(regDay, HISTORY)) / 365;
    for (const [type, h0] of Object.entries(PARAMS.events)) {
      const h =
        type === "admission"
          ? h0
          : h0 * (isComplicated ? PARAMS.complicatedEventFactor : PARAMS.otherEventFactor);
      if ((type === "foot_ulcer_new" || type === "amputation_minor") && !hasGlu) continue;
      if (rng.chance(h * span)) {
        const day = rng.int(Math.max(regDay, HISTORY), deathDay ?? -1);
        events.push({
          type,
          day,
          reporting_unit: type === "dialysis_start" ? "dialysis_unit" : "medical_ward",
          ...(type === "admission"
            ? {
                main_reason: hasGlu
                  ? rng.pick(["severe_hypoglycaemia", "diabetic_ketoacidosis", "foot_sepsis"])
                  : rng.pick(["hypertensive_emergency", "stroke", "heart_failure"]),
              }
            : {}),
        });
      }
    }
    if (deathDay != null)
      events.push({
        type: "death",
        day: deathDay,
        reporting_unit: "medical_ward",
        place: "this_facility",
        information_source: "ward",
      });
    // Reviews in the last 12 months, dated on a visit day where possible.
    const recentVisitDay = () => {
      const r = visits.filter((v) => v.day >= -360).map((v) => v.day);
      return r.length ? rng.pick(r) : null;
    };
    const reviews: ScenarioPatient["reviews"] = [];
    const sex = female ? "female" : "male";
    if (kidneyG) {
      const d = recentVisitDay();
      if (d != null) {
        const g = kidneyG;
        const acr = rng.chance(0.5);
        reviews.push({
          component: "kidney",
          day: d,
          creatinine_umol_l: creatinineFor(g, age - Math.round(-d / 365), sex, rng),
          urine_test: acr ? "acr" : "dipstick",
          ...(acr
            ? { acr_mg_mmol: Math.round(rng.real(0.5, g >= "G3" ? 40 : 2.9) * 10) / 10 }
            : { dipstick: "negative" }),
        });
      }
    }
    if (hasGlu && rng.chance(PARAMS.eyesReview)) {
      const d = recentVisitDay();
      if (d != null)
        reviews.push({
          component: "eyes",
          day: d,
          examined: true,
          method: "dilated_fundoscopy",
          retinopathy_grade: rng.chance(
            isComplicated ? PARAMS.retinopathy * 3 : PARAMS.retinopathy * 0.15,
          )
            ? "mild_npdr"
            : "no_apparent_retinopathy",
          macular_oedema: "absent",
          referred: false,
        });
    }
    if (hasGlu && rng.chance(PARAMS.feetReview)) {
      const d = recentVisitDay();
      if (d != null)
        reviews.push({
          component: "feet",
          day: d,
          loss_of_protective_sensation: false,
          absent_pulses: false,
          deformity: false,
          current_ulcer: false,
          previous_ulcer: false,
          amputation: "none",
        });
    }
    const p: ScenarioPatient = {
      key: `G${String(i + 1).padStart(5, "0")}`,
      registry_number: `DEMO-${10000 + i}`,
      is_synthetic: true,
      given_name: given,
      family_name: family,
      sex,
      age_years_at_day_0: age,
      date_of_birth_estimated: true,
      phone_1: phone,
      sms_allowed: phone != null,
      calls_allowed: phone != null,
      residence: { district: rng.pick(["Kampala", "Wakiso", "Mukono"]) },
      privacy_notice: { version: "0.1-draft" },
      registrations,
      baseline: {
        height_cm: rng.int(150, 185),
        tobacco: rng.pick(["never", "never", "never", "former", "current"] as const),
        alcohol: rng.pick(["none", "none", "occasional", "regular"] as const),
        known_cardiovascular_disease: rng.chance(PARAMS.knownCvd) ? ["stroke"] : [],
      },
      visits,
      reviews,
      events: events.filter((e) => e.day >= Math.max(regDay, HISTORY)),
      recall: calls.length
        ? { missed_appointment_day: calls[0]!.day, days_overdue_at_day_0: 0, calls }
        : undefined,
    };
    if (isComplicated) complicated.add(p.key);
    out.push(p);
  }
  // Core-module registrations: added on a registration day within each chosen person's history.
  const alive = out.filter((p) => !p.events.some((e) => e.type === "death"));
  // Core-module registrations (themselves complications) go first to persons already complicated.
  const pref = alive.filter((p) => complicated.has(p.key));
  const pool = pref.length >= extra.length ? pref : alive;
  for (const code of extra) {
    const p = pool[Math.floor(rng.next() * pool.length)]!;
    if (p.registrations.some((r) => r.condition === code)) continue;
    const day = Math.max(p.registrations[0]!.registered_day, HISTORY);
    p.registrations.push({
      condition: code,
      subtype: "unknown",
      diagnosed_years_before_day_0: 1,
      basis_of_diagnosis: "unknown",
      registered_day: day,
      where_first_diagnosed: "this_facility",
      referral_source: "outpatients",
    });
    for (const v of p.visits)
      if (v.day >= day && (v.type === "scheduled" || v.type === "unscheduled"))
        v.recorded_control = {
          ...(v.recorded_control ?? {}),
          [code]: rng.weighted({
            controlled: 4,
            partly_controlled: 3,
            not_controlled: 2,
            not_assessed: 1,
          }),
        };
  }
  void year0;
  return out;
}
