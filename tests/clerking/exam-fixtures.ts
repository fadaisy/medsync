import type { Complaint, History } from "@/lib/clerking/answers";
import type {
  ExamContext,
  NumericVital,
  ResultFact,
  VitalValues,
} from "@/lib/clerking/exam/context";
import type { ExamDraft } from "@/lib/clerking/exam/payload";
import type { News2Result } from "@/lib/triage/types";

import { emptyHistory } from "@/lib/clerking/answers";
import { readAttr, setAttr } from "@/lib/clerking/exam/answers";
import { shownWhenParts } from "@/lib/clerking/exam/catalogue";
import { rosierSignId } from "@/lib/clerking/exam/classifiers";
import { NO_VITALS } from "@/lib/clerking/exam/context";
import { EXAM_CATALOGUE } from "@/lib/clerking/exam/load";
import { emptyExam } from "@/lib/clerking/exam/payload";
import { DX_CATALOGUE } from "@/lib/clerking/impression/load";
import { linkedAnswers } from "@/lib/clerking/linkage";
import { scoreNews2 } from "@/lib/triage/scoring/news2";
import { cat } from "./fixtures";

/**
 * Examination test fixtures (PROMPT-CLERKING-EXAM-V2 §7): a scenario builder, a solver that
 * builds a positive (and a near-miss negative) scenario for any catalogue condition, and the
 * prompt's seven patients. Synthetic data only.
 */

export const ecat = EXAM_CATALOGUE;
export const ALL_SIGNED = {
  flagRules: "all",
  referenceEntries: "all",
  classifiers: "all",
  withheld: [],
} as const;

export interface Scenario {
  exam: ExamDraft;
  history: History;
  patient: ExamContext["patient"];
  vitals: VitalValues;
  settings: { outbreakMode: boolean; encounterType?: string | null };
  medicines: { name: string; drugClass?: string | null; adherence?: string | null }[];
  news2Latest: News2Result | null;
  /** Results on the record (EC-1) and the note's time. */
  facts?: ResultFact[];
  now?: string;
}

/** The note's time in fixtures: results are dated before it. */
export const NOW = "2026-10-05T10:00:00.000Z";

export function scenario(p: Partial<Scenario> = {}): Scenario {
  return {
    exam: emptyExam(ecat.version),
    history: emptyHistory(),
    patient: { ageYears: 40, sex: "male", pregnant: null },
    vitals: { ...NO_VITALS },
    settings: { outbreakMode: false },
    medicines: [],
    news2Latest: null,
    ...p,
  };
}

export function toCtx(s: Scenario): ExamContext {
  return {
    cat: ecat,
    history: { cat, answers: s.history, linked: linkedAnswers(cat, s.history.complaints) },
    exam: s.exam,
    patient: s.patient,
    settings: s.settings,
    medicines: s.medicines,
    vitals: s.vitals,
    news2Latest: s.news2Latest,
    latestSetTime: "23:00",
    ...(s.facts ? { facts: s.facts, now: s.now ?? NOW } : {}),
  };
}

/* ─── Small writers ───────────────────────────────────────────────── */

export function complain(
  s: Scenario,
  symptom: string,
  flags: Record<string, "yes" | "no"> = {},
): void {
  const cur = s.history.complaints.find((c) => c.symptom === symptom);
  if (cur) Object.assign(cur.flags, flags);
  else
    s.history.complaints.push({
      key: symptom,
      symptom,
      props: {},
      flags: { ...flags },
    } as Complaint);
}

export function positive(
  s: Scenario,
  item: string,
  attrs: Record<string, string | string[] | number> = {},
): void {
  const cur = s.exam.entries[item];
  s.exam = {
    ...s.exam,
    entries: {
      ...s.exam.entries,
      [item]: {
        ...cur,
        state: cur?.choice ? cur.state : "positive",
        attrs: { ...(cur?.state !== "not_examined" ? cur?.attrs : {}), ...attrs },
      },
    },
  };
}

export function negative(s: Scenario, item: string): void {
  s.exam = { ...s.exam, entries: { ...s.exam.entries, [item]: { state: "negative" } } };
}

/** Put an option on an attribute through the answer model (mirrors, shared and choices). */
export function tick(s: Scenario, item: string, attribute: string, option: string): void {
  const it = ecat.item(item)!;
  const a = ecat.attribute(item, attribute)!;
  if (it.response.type === "choice" && !s.exam.entries[item]?.choice) {
    const owner = it.response.options.find((o) => o.attributes?.some((x) => x.id === attribute));
    s.exam = {
      ...s.exam,
      entries: {
        ...s.exam.entries,
        [item]: { state: owner?.expected ? "negative" : "positive", choice: owner!.id },
      },
    };
  }
  // Make the attribute visible first (its shown_when parents).
  for (const sw of a.shown_when ? shownWhenParts(a.shown_when) : [])
    if (!has(readAttr(ecat, s.exam, item, sw.attribute), sw.any_of[0]!))
      tick(s, item, sw.attribute, sw.any_of[0]!);
  // A read-only mirror (several owners) is set on its first owner.
  const edge = ecat.mirror({ item, attribute, option });
  if (edge?.readOnly) {
    const o = edge.to[0]!;
    return tick(s, o.item, o.attribute!, o.option!);
  }
  if (!has(readAttr(ecat, s.exam, item, attribute), option))
    s.exam = setAttr(ecat, s.exam, item, attribute, option);
}

const has = (v: unknown, o: string) => (Array.isArray(v) ? v.includes(o) : v === o);

export function setNumber(s: Scenario, item: string, attribute: string, n: number): void {
  const a = ecat.attribute(item, attribute)!;
  for (const sw of a.shown_when ? shownWhenParts(a.shown_when) : [])
    if (!has(readAttr(ecat, s.exam, item, sw.attribute), sw.any_of[0]!))
      tick(s, item, sw.attribute, sw.any_of[0]!);
  s.exam = setAttr(ecat, s.exam, item, attribute, n);
}

export function gcs(
  s: Scenario,
  E: number,
  V: number,
  M: number,
  extra: Partial<NonNullable<ExamDraft["blocks"]["consciousness"]>> = {},
): void {
  s.exam = {
    ...s.exam,
    blocks: { ...s.exam.blocks, consciousness: { method: "gcs", E, V, M, ...extra } },
  };
}

/* ─── Classifier results on demand ────────────────────────────────── */

const CLASSIFIER: Record<string, Record<string, (s: Scenario) => void>> = {
  dehydration_gtfcc: {
    severe: (s) => (
      complain(s, "sym.diarrhoea"),
      positive(s, "ex.general.hydration", { signs_present: ["lethargic_or_unconscious"] })
    ),
    some: (s) => (
      complain(s, "sym.diarrhoea"),
      positive(s, "ex.general.hydration", {
        signs_present: ["restless_or_irritable", "sunken_eyes"],
      })
    ),
    below_threshold: (s) => (
      complain(s, "sym.diarrhoea"),
      positive(s, "ex.general.hydration", { signs_present: ["sunken_eyes"] })
    ),
    none: (s) => (complain(s, "sym.diarrhoea"), negative(s, "ex.general.hydration")),
  },
  muac_uganda_imam: {
    sam: (s) => ((s.patient.ageYears = 30), positive(s, "ex.general.nutrition", { muac: 17.5 })),
    mam: (s) => ((s.patient.ageYears = 30), positive(s, "ex.general.nutrition", { muac: 20 })),
  },
  distress_severity: {
    severe: (s) => (
      positive(s, "ex.general.distress", { type: ["respiratory"] }),
      positive(s, "ex.respiratory.work_of_breathing", { signs: ["grunting"] })
    ),
  },
  acute_asthma_severity: {
    life_threatening: (s) => (
      positive(s, "ex.respiratory.wheeze"),
      confirmAsthma(s),
      (s.vitals.spo2 = 91)
    ),
    acute_severe: (s) => (
      positive(s, "ex.respiratory.wheeze"),
      confirmAsthma(s),
      (s.vitals.spo2 = 95),
      (s.vitals.rr = 26)
    ),
    moderate: (s) => (
      positive(s, "ex.respiratory.wheeze"),
      confirmAsthma(s),
      (s.vitals.spo2 = 95),
      peakFlow(s, 70)
    ),
  },
  crb65: {
    high: (s) => pneumonia(s, { rr: 32, sbp: 88, age: 70, disoriented: true }),
    intermediate: (s) => pneumonia(s, { rr: 20, sbp: 120, age: 70, disoriented: false }),
  },
  orthostatic_hypotension: {
    present: (s) =>
      (s.exam = {
        ...s.exam,
        panels: {
          ...s.exam.panels,
          postural: { lying: { sbp: 130, dbp: 80 }, standing_1min: { sbp: 105, dbp: 75 } },
        },
      }),
  },
  rosier: {
    likely: (s) => {
      complain(s, "sym.focal_weakness");
      positive(s, "ex.nervous.cn_vii", { type: "upper_motor_neuron", side: "right" });
      s.vitals.glucose = 6.2;
      s.exam = {
        ...s.exam,
        panels: {
          ...s.exam.panels,
          rosier: {
            syncope: "no",
            seizure: "no",
            newSigns: [rosierSignId("Asymmetric facial weakness")],
          },
        },
      };
    },
  },
  dfi_iwgdf_idsa: {
    "4": (s) => (
      positive(s, "ex.feet.ulcer", { infection_signs: ["local_warmth", "redness_0_5_to_under_2"] }),
      (s.vitals.temp = 38.6),
      (s.vitals.pulse = 104)
    ),
    "3": (s) =>
      positive(s, "ex.feet.ulcer", { infection_signs: ["local_warmth", "redness_2_cm_or_more"] }),
  },
  hypoglycaemia_level: {
    level_1: (s) => (s.vitals.glucose = 3.5),
    level_2: (s) => (s.vitals.glucose = 2.6),
  },
  // The diabetes pack's rule classifiers (EC-7): built from their own first matching rule.
  ketone_band: {
    high: (s) => ketones(s, { blood: refNum("REF-EX-KETONE-DKA")! }),
    moderate: (s) => ketones(s, { blood: refNum("REF-EX-KETONE-RISK")! }),
    raised: (s) => ketones(s, { blood: refNum("REF-EX-KETONE-RAISED")! }),
  },
  acuity_band: {
    worse_than_6_12: (s) => tick(s, "ex.eyes_ent_neck.visual_acuity", "right", "6_18"),
  },
  dr_review: {
    refer_within_1_month: (s) => tick(s, "ex.eyes_ent_neck.fundoscopy", "dr_grade", "pdr"),
    refer_within_3_months: (s) => tick(s, "ex.eyes_ent_neck.fundoscopy", "dr_grade", "severe_npdr"),
    refer_cannot_assess: (s) => tick(s, "ex.eyes_ent_neck.fundoscopy", "view", "inadequate"),
  },
};

export function ketones(s: Scenario, k: NonNullable<NonNullable<ExamDraft["panels"]>["ketones"]>) {
  s.exam = {
    ...s.exam,
    panels: { ...s.exam.panels, ketones: { ...s.exam.panels?.ketones, ...k } },
  };
}

function confirmAsthma(s: Scenario) {
  s.exam = { ...s.exam, panels: { ...s.exam.panels, asthmaConfirmed: true } };
}
function peakFlow(s: Scenario, pct: number) {
  s.exam = {
    ...s.exam,
    panels: {
      ...s.exam.panels,
      peakFlow: { best: pct * 5, reference: 500, referenceKind: "predicted" },
    },
  };
}
function pneumonia(s: Scenario, o: { rr: number; sbp: number; age: number; disoriented: boolean }) {
  complain(s, "sym.cough");
  complain(s, "sym.fever");
  positive(s, "ex.respiratory.crackles", { where: ["r_lower_back"] });
  s.vitals.rr = o.rr;
  s.vitals.sbp = o.sbp;
  s.vitals.dbp = o.sbp < 90 ? 58 : 80;
  s.patient.ageYears = o.age;
  if (o.disoriented)
    gcs(s, 4, 4, 6, { acvpu: "C", orientation: { time: "no", place: "yes", person: "yes" } });
  else gcs(s, 4, 5, 6);
}

/* ─── The solver ──────────────────────────────────────────────────── */

type Cond = Record<string, unknown>;
const refNum = (id: unknown) => {
  const r = String(id);
  if (!r.startsWith("REF-DX-")) return ecat.refNumber(r);
  const v = DX_CATALOGUE.refValue(r);
  return typeof v === "number" ? v : null;
};

/** Make one atom true. Returns false when the atom is not one the solver knows. */
function makeTrue(c: Cond, s: Scenario): boolean {
  if ("always" in c) return true;
  // The diabetes pack's atoms (EC-1, EC-2, EC-5, EC-7).
  if ("result" in c) {
    // The value inside every bound, dated a day before the note, at the atom's trust.
    const lo = refNum(c.gte_ref ?? c.gt_ref);
    const hi = refNum(c.lt_ref ?? c.lte_ref);
    const value =
      lo !== null && hi !== null ? (lo + hi) / 2 : lo !== null ? lo + 0.1 : (hi ?? 0) - 0.1;
    const q = (c.qualifiers ?? {}) as Record<string, string>;
    const challenge = q.challenge
      ? { type: "ogtt_75g", minutes: q.challenge === "ogtt_75g_1h" ? 60 : 120 }
      : undefined;
    s.facts = [
      ...(s.facts ?? []),
      {
        concept: String(c.result),
        value: Math.round(value * 100) / 100,
        at: "2026-10-04T10:00:00.000Z",
        trust: (Number(c.min_trust ?? 4) as 1 | 2 | 3 | 4) || 4,
        ...(q.fastingState ? { fastingState: q.fastingState as "fasting" } : {}),
        ...(challenge ? { challenge } : {}),
        ...(q.specimen ? { specimen: q.specimen } : {}),
        ...(c.result === "obs.hba1c" ? { certification: "ngsp", pointOfCare: false } : {}),
      },
    ];
    if (c.result === "obs.hba1c") s.patient.pregnant = s.patient.sex === "male" ? null : false;
    return true;
  }
  if ("pregnancy" in c) {
    s.patient.sex = c.pregnancy === "not_pregnant" ? s.patient.sex : "female";
    s.patient.pregnant =
      c.pregnancy === "current" ? true : c.pregnancy === "not_pregnant" ? false : null;
    if (c.pregnancy === "current") s.patient.pregnancySince = "2026-08-01T00:00:00.000Z";
    return true;
  }
  if ("past_detail" in c) {
    const id = String(c.past_detail);
    const p = cat.details(id)!.properties.find((q) => q.id === c.property)!;
    const o = String(
      c.equals ?? (c.any_of as string[] | undefined)?.[0] ?? (c.includes_any as string[])[0],
    );
    const cur = s.history.past.conditions[id];
    s.history.past.conditions[id] = {
      answer: "yes",
      details: { ...cur?.details, [p.id]: p.kind === "many" ? [o] : o },
    };
    return true;
  }
  if ("medicine" in c) {
    const p = (cat.data.medicines.quick_picks as { id: string; label: string }[]).find(
      (q) => q.id === c.medicine,
    )!;
    const adherence = (c.adherence_any as string[] | undefined)?.[0] ?? null;
    if (c.answer === "not_taking") s.history.past.medicinesNone = true;
    else s.medicines.push({ name: p.label, adherence });
    return true;
  }
  if ("panel" in c && c.panel === "vs.ketones") {
    if ("recorded" in c) return (ketones(s, { urine: "neg" }), true);
    if (c.field === "urine") return (ketones(s, { urine: (c.any_of as never[])[0] }), true);
    const n = "gte_ref" in c ? refNum(c.gte_ref)! : refNum(c.lt_ref)! - 0.1;
    return (ketones(s, { blood: Math.round(n * 10) / 10 }), true);
  }
  if ("item" in c && "recorded" in c) {
    const item = ecat.item(String(c.item))!;
    if (item.response.type === "measured") {
      const a = item.attributes![0]!;
      tick(s, item.id, a.id, a.options![0]!.id);
    } else negative(s, item.id);
    return true;
  }
  if ("setting" in c && Array.isArray(c.setting)) {
    s.settings.encounterType = String(c.setting[0]);
    return true;
  }
  if ("symptom" in c) {
    const sym = String(c.symptom);
    if (c.answer === "no") {
      s.history.ros[sym] = "no";
      return true;
    }
    if ("red_flag" in c) complain(s, sym, { [String(c.red_flag)]: "yes" });
    else if ("any_red_flag" in c) {
      const rf = cat.symptom(sym)!.red_flags.find((f) => f.kind === c.any_red_flag)!;
      complain(s, sym, { [rf.id]: "yes" });
    } else complain(s, sym);
    return true;
  }
  if ("past_condition" in c) {
    s.history.past.conditions[String(c.past_condition)] = { answer: c.answer as "yes" | "no" };
    return true;
  }
  if ("patient" in c) {
    if (c.patient === "age_gte")
      s.patient.ageYears = "value_ref" in c ? refNum(c.value_ref)! : Number(c.value);
    if (c.patient === "sex") s.patient.sex = c.equals as "male" | "female";
    return true;
  }
  if ("setting" in c) return (s.settings.outbreakMode = true);
  if ("medicine_group" in c) {
    s.medicines.push({
      name: ecat.data.medicine_groups![String(c.medicine_group)]!.name_stems[0]!,
    });
    return true;
  }
  if ("finding" in c) {
    const item = ecat.item(String(c.finding))!;
    const id = item.response.type === "link" ? item.response.owner : item.id;
    if (c.is === "negative" || c.is === "recorded") negative(s, id);
    else positive(s, id);
    return true;
  }
  if ("item" in c && "attribute" in c) {
    const item = String(c.item);
    const attr = String(c.attribute);
    const a = ecat.attribute(item, attr)!;
    const opt = String(
      c.equals ??
        (c.includes_any as string[] | undefined)?.[0] ??
        (c.any_of as string[] | undefined)?.[0] ??
        "",
    );
    if (opt) {
      tick(s, item, attr, opt);
      return true;
    }
    if ("score_gte_ref" in c) {
      tick(s, item, attr, String(refNum(c.score_gte_ref)));
      return true;
    }
    const n =
      "gt_ref" in c
        ? refNum(c.gt_ref)! + 1
        : "gte_ref" in c
          ? refNum(c.gte_ref)!
          : "lt_ref" in c
            ? refNum(c.lt_ref)! - 1
            : "lte_ref" in c
              ? refNum(c.lte_ref)!
              : null;
    if (n === null) return false;
    setNumber(s, item, attr, Math.min(a.max ?? Infinity, n));
    return true;
  }
  if ("classifier" in c) {
    const f = CLASSIFIER[String(c.classifier)]?.[(c.any_of as string[])[0]!];
    if (!f) return false;
    f(s);
    return true;
  }
  if ("score" in c) {
    if (c.score === "gcs_total") {
      const lim = refNum(c.lte_ref ?? c.lt_ref)!;
      const target = "lte_ref" in c ? lim : lim - 2;
      if (target <= 8) gcs(s, 2, 2, target - 4);
      else gcs(s, 3, 4, target - 7);
      return true;
    }
    if (c.score === "amts") {
      const n = refNum(c.lte_ref)!;
      s.exam = {
        ...s.exam,
        blocks: {
          ...s.exam.blocks,
          amts: Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [String(i + 1), i < n ? "correct" : "incorrect"]),
          ),
        },
      };
      return true;
    }
    return false;
  }
  if ("consciousness" in c) {
    const cur = s.exam.blocks.consciousness ?? { method: "gcs" as const };
    s.exam = { ...s.exam, blocks: { ...s.exam.blocks, consciousness: { ...cur, baseline: true } } };
    return true;
  }
  if ("acvpu_not" in c) {
    s.exam = {
      ...s.exam,
      blocks: { ...s.exam.blocks, consciousness: { method: "acvpu", acvpu: "V" } },
    };
    return true;
  }
  if ("orientation" in c) {
    gcs(s, 4, 4, 6, { acvpu: "C", orientation: { time: "no" } });
    return true;
  }
  if ("grid" in c) {
    const grid = String(c.grid);
    const rows = Array.isArray(c.rows)
      ? (c.rows as string[])
      : c.rows === "leg"
        ? ecat.grids.power.slice(5).map((r) => r.movement)
        : ecat.grids.power.slice(0, 5).map((r) => r.movement);
    const row = rows[0]!;
    const key = grid === "reflex" ? "reflexes" : (grid as "power" | "pulses");
    const any = c.any_cell as Cond | undefined;
    const cell = c.asymmetric
      ? { R: "5", L: "3" }
      : grid === "pulses"
        ? { R: String(any?.equals).toLowerCase() }
        : { R: String(refNum(any?.lte_ref) ?? 3) };
    s.exam = {
      ...s.exam,
      blocks: { ...s.exam.blocks, [key]: { ...(s.exam.blocks[key] ?? {}), [row]: cell } },
    };
    return true;
  }
  if ("vital" in c) {
    const v = s.vitals;
    if ("systolic_lt_ref" in c)
      return ((v.sbp = refNum(c.systolic_lt_ref)! - 1), (v.dbp = 50), true);
    if (c.vital === "vs.bp") return ((v.sbp = 190), (v.dbp = 100), true);
    const key = {
      "vs.glucose": "glucose",
      "vs.spo2": "spo2",
      "vs.rr": "rr",
      "vs.pulse": "pulse",
      "vs.temp": "temp",
    }[String(c.vital)] as NumericVital;
    v[key] =
      "gte_ref" in c
        ? refNum(c.gte_ref)!
        : "gt_ref" in c
          ? refNum(c.gt_ref)! + 0.1
          : refNum(c.lt_ref)! - 0.5;
    if ("context" in c) v.glucoseContext = String(c.context);
    return true;
  }
  if ("panel" in c) {
    const lim = refNum(c.systolic_difference_gt_ref)!;
    s.exam = {
      ...s.exam,
      panels: {
        ...s.exam.panels,
        bothArms: { right: { sbp: 150, dbp: 90 }, left: { sbp: 150 - lim - 5, dbp: 85 } },
      },
    };
    return true;
  }
  if ("derived" in c) {
    const side = c.side === "ulcer side" ? "left" : "left";
    if (c.side === "ulcer side") positive(s, "ex.feet.ulcer", { side });
    if (c.derived === "iwgdf_risk.lops")
      positive(s, "ex.feet.monofilament", { sites_not_felt_left: 2 });
    else
      s.exam = {
        ...s.exam,
        blocks: {
          ...s.exam.blocks,
          pulses: { ...(s.exam.blocks.pulses ?? {}), "Dorsalis pedis": { L: "absent" } },
        },
      };
    return true;
  }
  if ("news2_parameter_score_gte_ref" in c) {
    s.news2Latest = scoreNews2({
      respiratoryRate: 16,
      spo2: c.parameter === "spo2" ? 90 : 97,
      spo2Scale: "scale1",
      oxygen: "air",
      systolicBp: 120,
      pulse: 80,
      consciousness: "A",
      temperature: c.parameter === "spo2" ? 37 : 34.9,
    });
    return true;
  }
  return false;
}

/**
 * Build a scenario where `c` is true. `skip` omits the n-th atom the solver would set (a near miss
 * for the negative case). Returns the atoms the solver could not build.
 */
export function solve(c: Cond, s: Scenario, opts: { skip?: number } = {}): string[] {
  let n = 0;
  const unknown: string[] = [];
  const walk = (x: Cond, want: boolean): void => {
    if ("all" in x) return (x.all as Cond[]).forEach((y) => walk(y, want));
    if ("any" in x) return want ? walk((x.any as Cond[])[0]!, true) : undefined;
    if ("not" in x) return walk(x.not as Cond, !want);
    if (!want) return; // a fresh scenario leaves an atom false
    if (opts.skip === n++) return;
    if (!makeTrue(x, s)) unknown.push(JSON.stringify(x));
  };
  walk(c, true);
  return unknown;
}
