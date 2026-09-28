import type { Scenario } from "./exam-fixtures";
import type { ExamContext, VitalValues } from "@/lib/clerking/exam/context";
import type { RecordedDx } from "@/lib/clerking/impression/board";
import type { Cond } from "@/lib/clerking/impression/catalogue";

import BASE_TERMS from "@/data/emr/diagnosis-terms.v1.json";
import ADD_TERMS from "@/docs/emr/clerking-v2/summary-impression/diagnosis-terms.v1.1-addendum.json";
import { readAttr } from "@/lib/clerking/exam/answers";
import { evaluateExamFlags } from "@/lib/clerking/exam/flags";
import { buildBoard, EMPTY_IMPRESSION } from "@/lib/clerking/impression/board";
import { dxLive } from "@/lib/clerking/impression/catalogue";
import { CLINICAL_VIEWER } from "@/lib/clerking/impression/facts";
import { DX_CATALOGUE, dxTermUuid } from "@/lib/clerking/impression/load";
import { scoreNews2 } from "@/lib/triage/scoring/news2";
import { ALL_SIGNED, complain, ecat, gcs, positive, scenario, solve, tick } from "./exam-fixtures";
import { cat } from "./fixtures";

/**
 * Summary and Impression fixtures (PROMPT-CLERKING-SUMMARY-IMPRESSION §7): a solver for the
 * diagnosis catalogue's atoms (extending the examination solver), the context builder, and the
 * prompt's six patients. Synthetic data only; no real patients.
 */

export const dx = DX_CATALOGUE;
export const LIVE = dxLive({
  profiles: "all",
  rules: "all",
  referenceEntries: "all",
  namedScales: "all",
  withheld: [],
});
export const IN = { live: LIVE, viewer: CLINICAL_VIEWER };

/** The encounter as the engines read it: the examination context, its classifier results and
 *  the signed REF-DX values. */
export function ctx(s: Scenario): ExamContext {
  const x0: ExamContext = {
    cat: ecat,
    history: {
      cat,
      answers: s.history,
      linked: new Map(),
    },
    exam: s.exam,
    patient: s.patient,
    settings: s.settings,
    medicines: s.medicines,
    vitals: s.vitals,
    news2Latest: s.news2Latest,
    latestSetTime: "23:00",
    dxRefs: { refValue: (id) => dx.refValue(id) },
  };
  const { results } = evaluateExamFlags(x0, { ...ALL_SIGNED, withheld: [] });
  const forced = FORCED.get(s);
  if (!forced) return { ...x0, results };
  const all = new Map(results as ReadonlyMap<string, unknown>);
  for (const [id, r] of Object.entries(forced))
    all.set(id, { id, status: "result", result: r, text: r });
  return { ...x0, results: all as ExamContext["results"] };
}

const dxRef = (id: unknown) => dx.refValue(String(id));
const VITAL: Record<string, keyof VitalValues> = {
  "vs.glucose": "glucose",
  "vs.spo2": "spo2",
  "vs.rr": "rr",
  "vs.pulse": "pulse",
  "vs.temp": "temp",
};

/** A NEWS2 set that scores high (total 13 or more). */
export const SICK_NEWS2 = () =>
  scoreNews2({
    respiratoryRate: 30,
    spo2: 88,
    spo2Scale: "scale1",
    oxygen: "air",
    systolicBp: 85,
    pulse: 135,
    consciousness: "V",
    temperature: 34,
  });

/** Classifier results set directly by the atom solver (the classifiers' own computations are
 *  covered by the examination tests; here only the diagnosis atom over a result is under test). */
const FORCED = new WeakMap<Scenario, Record<string, string>>();
export function force(s: Scenario, classifier: string, result: string) {
  FORCED.set(s, { ...(FORCED.get(s) ?? {}), [classifier]: result });
}

/** Make one diagnosis-catalogue atom true; null hands the atom to the examination solver. */
function makeTrueDx(c: Cond, s: Scenario): boolean | null {
  if ("classifier" in c) {
    force(s, String(c.classifier), (c.any_of as string[])[0]!);
    return true;
  }
  if ("grid" in c && "all_cells" in c) {
    const key = c.grid === "reflex" ? "reflexes" : (c.grid as "power" | "pulses");
    const v = (c.all_cells as { equals: unknown }).equals;
    s.exam = { ...s.exam, blocks: { ...s.exam.blocks, [key]: { Knee: { R: v, L: v } } } };
    return true;
  }
  if ("patient" in c && c.patient === "age_lt") {
    s.patient.ageYears = Number(ecat.refNumber(String(c.value_ref))) - 1;
    return true;
  }
  if ("family_condition" in c) {
    s.history.family[String(c.family_condition)] = { answer: c.answer as "yes" | "no" };
    return true;
  }
  if ("medicine" in c) {
    if (c.answer === "not_taking") s.history.past.medicinesNone = true;
    else {
      const p = (cat.data.medicines.quick_picks as { id: string; label: string }[]).find(
        (q) => q.id === c.medicine,
      )!;
      s.medicines.push({ name: p.label });
    }
    return true;
  }
  if ("social" in c) {
    const o = (c.any_of as string[])[0]!;
    (s.history.social as Record<string, unknown>)[String(c.social)] =
      c.social === "substances" ? [o] : o;
    return true;
  }
  if ("news2_total" in c) {
    s.news2Latest = SICK_NEWS2();
    return true;
  }
  if ("item" in c && !("attribute" in c) && "any_of" in c) {
    const item = ecat.item(String(c.item))!;
    const o = (c.any_of as string[])[0]!;
    const opt =
      item.response.type === "choice" ? item.response.options.find((x) => x.id === o) : null;
    s.exam = {
      ...s.exam,
      entries: {
        ...s.exam.entries,
        [item.id]: { state: opt?.expected ? "negative" : "positive", choice: o },
      },
    };
    return true;
  }
  if (
    "patient" in c &&
    c.patient === "age_gte" &&
    String(c.value_ref ?? "").startsWith("REF-FLAG-")
  ) {
    s.patient.ageYears = Number(cat.refValue(String(c.value_ref)));
    return true;
  }
  if ("vital" in c && (String(c.gte_ref ?? c.lt_ref ?? "").startsWith("REF-DX-") || "part" in c)) {
    const key = "gte_ref" in c ? "gte_ref" : "lt_ref";
    const r = String(c[key]);
    const val = r.startsWith("REF-DX-") ? dxRef(r) : ecat.refValue(r);
    const v = s.vitals;
    if (c.vital === "vs.bp") {
      const lim = val as number | Record<string, number>;
      const part = (c.part as string | undefined) ?? "systolic";
      const n = typeof lim === "number" ? lim : lim[`${part}_gte`]!;
      const t = key === "gte_ref" ? n : n - 5;
      if (part === "systolic") {
        v.sbp = t;
        v.dbp = v.dbp ?? 70;
      } else {
        v.dbp = t;
        v.sbp = v.sbp ?? Math.max(t + 30, 120);
      }
      return true;
    }
    const n = val as number;
    const k = VITAL[String(c.vital)]!;
    v[k] = key === "gte_ref" ? n : n - (k === "pulse" || k === "rr" || k === "spo2" ? 1 : 0.5);
    return true;
  }
  return null;
}

/** Build a scenario where `c` is true (all: every child; any: the first). Returns the atoms no
 *  solver could build. `skip` leaves the n-th atom out (a near miss). */
export function solveDx(
  c: Cond,
  s: Scenario,
  opts: { skip?: number; branch?: number } = {},
): string[] {
  let n = 0;
  const unknown: string[] = [];
  const walk = (x: Cond, want: boolean, top = false): void => {
    if ("all" in x) return (x.all as Cond[]).forEach((y) => walk(y, want));
    if ("any" in x) {
      const list = x.any as Cond[];
      return want
        ? walk(list[top && opts.branch !== undefined ? opts.branch : 0]!, true)
        : undefined;
    }
    if ("not" in x) return walk(x.not as Cond, !want);
    if (!want) return;
    if (opts.skip === n++) return;
    const done = makeTrueDx(x, s);
    if (done === null) {
      unknown.push(...solve(x, s));
      if ("item" in x && "attribute" in x) ensureAttr(s, x);
    }
  };
  walk(c, true, true);
  return unknown;
}

/** The examination solver cannot always reach an attribute behind a read-only mirror (a nutrition
 *  sign mirrored from the limbs); write the value directly when it did not land. */
function ensureAttr(s: Scenario, c: Cond) {
  const item = String(c.item);
  const attr = String(c.attribute);
  const o =
    (c.includes_any as string[] | undefined)?.[0] ??
    (c.any_of as string[] | undefined)?.[0] ??
    c.equals;
  if (typeof o !== "string") return;
  const cur = readAttr(ecat, s.exam, item, attr);
  if (Array.isArray(cur) ? cur.includes(o) : cur === o) return;
  const a = ecat.attribute(item, attr)!;
  const e = s.exam.entries[item];
  s.exam = {
    ...s.exam,
    entries: {
      ...s.exam.entries,
      [item]: {
        ...e,
        state: "positive",
        attrs: { ...(e?.attrs ?? {}), [attr]: a.kind === "many" ? [o] : o },
      },
    },
  };
}

/* ─── The board ────────────────────────────────────────────────── */

let seq = 0;
const uuid = () => {
  seq++;
  const h = seq.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${h}`;
};

// Display names come from REF-DX-TERMS and the addendum (the catalogue holds none).
const TERMS_DISPLAY = new Map<string, string>(
  [...BASE_TERMS.terms, ...ADD_TERMS.terms].map((t) => [t.id, t.display]),
);
export const displayOf = (id: string) => TERMS_DISPLAY.get(id) ?? id;

export function recorded(
  dxId: string | null,
  o: Partial<RecordedDx> & { slot?: "leading" | "differential" | "also"; typed?: boolean } = {},
): RecordedDx {
  const slot = o.slot ?? "differential";
  const p = dxId ? dx.profile(dxId) : undefined;
  return {
    logicalId: uuid(),
    versionId: uuid(),
    termId: dxId ? dxTermUuid(dxId) : null,
    dxId,
    display: dxId ? displayOf(dxId) : (o.display ?? "Typed diagnosis"),
    code: null,
    typed: !dxId,
    rank: slot === "leading" ? "primary" : "secondary",
    verification: slot === "differential" ? "differential" : "provisional",
    restrictedClass: p?.restricted_class ?? null,
    restricted: !!p?.restricted_class,
    onProblemList: false,
    cosignPending: false,
    ...o,
  };
}

export const board = (
  diagnoses: RecordedDx[],
  draft = EMPTY_IMPRESSION,
  viewer = CLINICAL_VIEWER,
) => buildBoard({ diagnoses, draft, dx, live: LIVE, viewer, deferred: null });

/* ─── The six patients (§7 fixtures) ─────────────────────────────── */

export const CEPH_ALLERGY = {
  status: "listed" as const,
  confirmedThisVisit: false,
  items: [{ name: "Cephalosporins", coded: false, reactions: [] as string[] }],
};
export const NOT_RECORDED = {
  status: "not_recorded" as const,
  confirmedThisVisit: false,
  items: [],
};

/** 1. Patient Three-3, hypothermia (the prototype's case). The examination catalogue has no
 *  "dry mucous membranes" finding, so that sign is not recorded here. */
export function hypothermia(): Scenario {
  const s = scenario({ patient: { ageYears: 76, sex: "male", pregnant: null } });
  s.history.past.conditions.diabetes = { answer: "yes" };
  s.history.complaints.push(
    {
      key: "c1",
      symptom: "sym.cold_intolerance",
      duration: { value: 3, unit: "days" },
      props: { course: "worse" },
      flags: {},
    },
    {
      key: "c2",
      symptom: "sym.fatigue",
      duration: { value: 3, unit: "days" },
      props: {},
      flags: {},
    },
    {
      key: "c3",
      symptom: "sym.loss_of_appetite",
      duration: { value: 2, unit: "days" },
      props: {},
      flags: {},
    },
  );
  Object.assign(s.vitals, {
    temp: 32.5,
    pulse: 54,
    sbp: 110,
    dbp: 73,
    rr: 12,
    spo2: 95,
    glucose: 5.8,
  });
  s.news2Latest = scoreNews2({
    respiratoryRate: 12,
    spo2: 95,
    spo2Scale: "scale1",
    oxygen: "air",
    systolicBp: 110,
    pulse: 54,
    consciousness: "A",
    temperature: 32.5,
  });
  s.exam = {
    ...s.exam,
    blocks: { ...s.exam.blocks, consciousness: { method: "acvpu", acvpu: "A" } },
  };
  tick(s, "ex.skin.temperature", "found", "cool_peripheries");
  positive(s, "ex.cardiovascular.capillary_refill", { time: 3 });
  return s;
}

/** 2. Chest pain: 58, male, exertional chest pain with sweating, BP 150/95, pulse 104. */
export function chestPain(): Scenario {
  const s = scenario({ patient: { ageYears: 58, sex: "male", pregnant: null } });
  const flags = cat.symptom("sym.chest_pain")!.red_flags;
  const pick = (re: RegExp) => flags.find((f) => re.test(f.id))?.id;
  const f: Record<string, "yes"> = {};
  for (const id of [pick(/exert/), pick(/sweat/)]) if (id) f[id] = "yes";
  s.history.complaints.push({
    key: "c1",
    symptom: "sym.chest_pain",
    duration: { value: 2, unit: "hours" },
    props: {},
    flags: f,
  });
  Object.assign(s.vitals, { sbp: 150, dbp: 95, pulse: 104 });
  return s;
}

/** 3. Fever with neck stiffness: 34, female, HIV on antiretrovirals, GCS 14. */
export function feverNeck(): Scenario {
  const s = scenario({ patient: { ageYears: 34, sex: "female", pregnant: null } });
  s.history.past.conditions.hiv = { answer: "yes" };
  s.medicines.push({ name: "Antiretrovirals" });
  s.history.complaints.push(
    { key: "c1", symptom: "sym.fever", duration: { value: 2, unit: "days" }, props: {}, flags: {} },
    {
      key: "c2",
      symptom: "sym.headache",
      duration: { value: 2, unit: "days" },
      props: {},
      flags: {},
    },
  );
  positive(s, "ex.nervous.neck_stiffness");
  gcs(s, 4, 4, 6);
  Object.assign(s.vitals, { temp: 38.9 });
  return s;
}

/** 4. Jaundice with fever: fever, jaundice, RUQ tenderness, pulse 118. */
export function jaundiceFever(): Scenario {
  const s = scenario({ patient: { ageYears: 45, sex: "male", pregnant: null } });
  complain(s, "sym.jaundice");
  complain(s, "sym.fever");
  positive(s, "ex.general.jaundice");
  positive(s, "ex.abdomen.tenderness", { where: ["ruq"] });
  Object.assign(s.vitals, { pulse: 118, temp: 38.6 });
  return s;
}

/** 5. Empty: nothing recorded yet. */
export const empty = () => scenario({ patient: { ageYears: 50, sex: "female", pregnant: null } });
