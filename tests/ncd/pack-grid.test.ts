/**
 * The acute escalation floor (D-DM-41), enforced against the shipped TypeScript engine:
 * 25,088 men (2 sites × 4 age bands × 8 diabetes profiles × 7 states × 7 glucose × 8 ketone values)
 * and 480 women (pregnancy and postpartum × 4 pressures × symptoms × protein × glucose).
 * Same table as the pack builder's k_grid.py. A cell below its floor, an ordinary well patient
 * with a same-day item, or a broken interrupt order fails CI.
 */
import type { PackInput, PackResult, PackValues } from "@/lib/ncd/pack/types";
import { describe, expect, it } from "vitest";

import { runDiabetesPack } from "@/lib/ncd/pack";

const PROFILES: Record<string, [PackValues, boolean]> = {
  noinfo: [{}, false],
  T2_metf: [
    { dm_status: "known", dm_type_recorded: "type_2", glucose_lowering_therapy: ["metformin"] },
    true,
  ],
  T2_SU: [
    {
      dm_status: "known",
      dm_type_recorded: "type_2",
      glucose_lowering_therapy: ["metformin", "gliclazide"],
    },
    true,
  ],
  T1_ins: [
    { dm_status: "known", dm_type_recorded: "type_1", glucose_lowering_therapy: ["insulin"] },
    true,
  ],
  SGLT2: [
    {
      dm_status: "known",
      dm_type_recorded: "type_2",
      glucose_lowering_therapy: ["metformin", "sglt2_inhibitor"],
    },
    true,
  ],
  blanklist: [{ dm_status: "known", dm_type_recorded: "type_2" }, true],
  ins_nostatus: [{ glucose_lowering_therapy: ["insulin"] }, true],
  T1_nostatus: [{ dm_type_recorded: "type_1" }, true],
};
const STATES: Record<string, PackValues> = {
  well: {},
  vomit: { vomiting: true },
  kussmaul: { deep_rapid_breathing: true },
  drowsy: { mental_status: "drowsy" },
  acetone: { acetone_breath: true },
  dehydrated: { dehydration: true },
  ill: { acute_illness_current: true },
};
const GLUCOSE: Record<string, PackValues> = {
  none: {},
  "3.5": { capillary_glucose: 3.5 },
  "7": { capillary_glucose: 7 },
  "15": { capillary_glucose: 15 },
  "28": { capillary_glucose: 28 },
  HI: { glucose_meter_extreme: "hi" },
  LO: { glucose_meter_extreme: "lo" },
};
const KETONES: Record<string, PackValues> = {
  none: {},
  u_neg: { urine_ketones: "neg" },
  u_trace: { urine_ketones: "trace" },
  "u_1+": { urine_ketones: "1plus" },
  "b0.3": { bohb: 0.3 },
  "b1.0": { bohb: 1 },
  "b2.0": { bohb: 2 },
  "b3.5": { bohb: 3.5 },
};
const BANDS: Record<string, number> = { adult: 45, child: 8, adolescent: 14, older_adult: 72 };
const INSULINISH = new Set(["T1_ins", "ins_nostatus", "T1_nostatus", "SGLT2"]);
const INSULIN_OR_SU_OR_UNKNOWN = new Set([
  "T2_SU",
  "T1_ins",
  "ins_nostatus",
  "T1_nostatus",
  "blanklist",
]);
const T1ISH = new Set(["T1_ins", "ins_nostatus", "T1_nostatus"]);
const HIGH = new Set(["15", "28", "HI"]);
const FULLY_RECORDED = new Set(["T2_metf", "T2_SU", "T1_ins", "SGLT2"]);
const MEASURE = new Set([
  "DM-ACU-ROUTE-20",
  "DM-ACU-ROUTE-32",
  "DM-ACU-ROUTE-15",
  "DM-ACU-ROUTE-28D",
  "DM-SUS-PAED-01",
]);
const RANK: Record<string, number> = { urgent: 1, same_day: 2, immediate: 3, folded: 3 };

function floor(band: string, prof: string, state: string, glu: string, ket: string): number {
  const dm = prof !== "noinfo",
    child = band === "child" || band === "adolescent";
  const st = (...s: string[]) => s.includes(state);
  if (
    glu === "HI" ||
    glu === "LO" ||
    (ket === "b3.5" && (dm || HIGH.has(glu))) ||
    (ket === "b2.0" && st("vomit") && (dm || HIGH.has(glu))) ||
    (st("kussmaul", "drowsy") &&
      (dm || HIGH.has(glu) || glu === "none" || (st("drowsy") && glu === "3.5"))) ||
    (st("acetone", "dehydrated") &&
      (HIGH.has(glu) ||
        ((INSULINISH.has(prof) || prof === "blanklist" || (child && dm)) && ket !== "b0.3"))) ||
    (glu === "3.5" && INSULIN_OR_SU_OR_UNKNOWN.has(prof)) ||
    (prof === "SGLT2" && st("vomit", "kussmaul", "dehydrated", "drowsy") && ket !== "b0.3") ||
    (child && dm && st("vomit", "ill") && glu === "none")
  )
    return 3;
  if (
    (st("vomit") && HIGH.has(glu) && ["none", "u_trace", "u_1+", "b1.0"].includes(ket)) ||
    (glu === "3.5" && dm) ||
    (dm && st("vomit") && ["u_trace", "u_1+", "b1.0"].includes(ket)) ||
    (ket === "b2.0" && (dm || HIGH.has(glu))) ||
    (T1ISH.has(prof) && st("vomit") && ket === "none") ||
    (glu === "28" && ket === "none") ||
    (dm && st("acetone", "dehydrated") && ket !== "b0.3") ||
    (child && dm && st("vomit", "ill")) ||
    (dm && st("ill") && glu === "none") ||
    (T1ISH.has(prof) && st("vomit", "ill")) ||
    (child && dm && st("acetone", "dehydrated") && ket === "b0.3")
  )
    return 2;
  return 0;
}

const PREG: Record<string, PackValues> = {
  pregnant: { pregnant: true, gestation_weeks: 30 },
  pp2: { pregnant: false, postpartum_weeks: 2 },
  unknown: {},
  notpreg_ppblank: { pregnant: false },
  notpreg_notpp: { pregnant: false, postpartum_weeks: 30 },
};
const BP: Record<string, PackValues> = {
  none: {},
  "118/76": { bp_systolic: 118, bp_diastolic: 76 },
  "145/95": { bp_systolic: 145, bp_diastolic: 95 },
  "165/112": { bp_systolic: 165, bp_diastolic: 112 },
};
const SYM: Record<string, PackValues> = {
  none: {},
  organ: { hypertensive_organ_damage: true },
  drowsy: { mental_status: "drowsy" },
  headache: { hypertensive_symptoms: true },
};
const PROTEIN: Record<string, PackValues> = {
  none: {},
  neg: { urine_protein_strip: "neg" },
  "1+": { urine_protein_strip: "1plus" },
};
const WGLU: Record<string, PackValues> = { none: {}, "6": { capillary_glucose: 6 } };
const POSSIBLE = new Set(["pregnant", "pp2", "unknown", "notpreg_ppblank"]);
const PREG_RULES = new Set([
  "DM-ACU-ROUTE-27",
  "DM-ACU-ROUTE-27B",
  "DM-ACU-ROUTE-27C",
  "DM-ACU-ROUTE-27D",
  "DM-ACU-ROUTE-28",
  "DM-ACU-ROUTE-28B",
  "DM-ACU-ROUTE-28C",
  "DM-ACU-ROUTE-28D",
]);

function womenFloor(preg: string, bp: string, sym: string, glu: string): number {
  const possible = POSSIBLE.has(preg);
  if (sym === "drowsy" && bp === "none" && (glu === "none" || possible)) return 3;
  if (possible && (bp === "none" || bp === "118/76") && (sym === "organ" || sym === "drowsy"))
    return 3;
  if (
    possible &&
    (bp === "165/112" || bp === "145/95") &&
    ["organ", "drowsy", "headache"].includes(sym)
  )
    return 3;
  if ((preg === "pregnant" || preg === "pp2") && bp === "165/112") return 3;
  if (possible && bp === "165/112") return 2;
  if ((preg === "pregnant" || preg === "pp2") && bp === "145/95") return 2;
  return 0;
}

const top = (r: PackResult) =>
  Math.max(0, ...Object.keys(r.fired).map((k) => RANK[r.urgency[k] ?? ""] ?? 0));
function orderFault(r: PackResult): string | null {
  const imm = Object.keys(r.fired).filter(
    (k) => r.urgency[k] === "immediate" || r.urgency[k] === "folded",
  );
  const head = r.interrupt;
  if (head && head in r.metViaUnknown && imm.some((k) => !(k in r.metViaUnknown)))
    return `question-only ${head} heads ${imm}`;
  if (head && MEASURE.has(head) && imm.some((k) => !MEASURE.has(k) && !(k in r.metViaUnknown)))
    return `request ${head} heads ${imm}`;
  return null;
}
const product = <T>(...xs: T[][]): T[][] =>
  xs.reduce<T[][]>((acc, x) => acc.flatMap((a) => x.map((y) => [...a, y])), [[]]);

describe("acute escalation floor (D-DM-41)", () => {
  it("men: none below the floor, no noise on an ordinary visit, interrupt order holds", () => {
    const silent: string[] = [],
      noisy: string[] = [],
      order: string[] = [];
    let n = 0;
    for (const [site, band, prof, state, glu, ket] of product(
      ["referral", "district"],
      Object.keys(BANDS),
      Object.keys(PROFILES),
      Object.keys(STATES),
      Object.keys(GLUCOSE),
      Object.keys(KETONES),
    )) {
      const [pv, est] = PROFILES[prof!]!;
      const r = runDiabetesPack({
        site: site as PackInput["site"],
        established: est,
        ageBand: band as PackInput["ageBand"],
        values: {
          sex: "male",
          age_years: BANDS[band!]!,
          ...pv,
          ...STATES[state!],
          ...GLUCOSE[glu!],
          ...KETONES[ket!],
        },
      });
      n++;
      const cell = `${site}.${band}.${prof}.${state}.glu=${glu}.ket=${ket}`;
      if (top(r) < floor(band!, prof!, state!, glu!, ket!)) silent.push(cell);
      if (
        FULLY_RECORDED.has(prof!) &&
        state === "well" &&
        ["none", "7", "15"].includes(glu!) &&
        ["none", "u_neg", "u_trace", "b0.3"].includes(ket!) &&
        top(r) >= 2
      )
        noisy.push(cell);
      const f = orderFault(r);
      if (f) order.push(`${cell}: ${f}`);
    }
    expect(n).toBe(25_088);
    expect({
      silent: silent.slice(0, 20),
      noisy: noisy.slice(0, 20),
      order: order.slice(0, 20),
    }).toEqual({ silent: [], noisy: [], order: [] });
  });

  it("women: pregnancy and postpartum pressure never below the floor; no pregnancy noise where it is excluded", () => {
    const silent: string[] = [],
      noisy: string[] = [],
      order: string[] = [];
    let n = 0;
    for (const [preg, bp, sym, prot, glu] of product(
      Object.keys(PREG),
      Object.keys(BP),
      Object.keys(SYM),
      Object.keys(PROTEIN),
      Object.keys(WGLU),
    )) {
      const r = runDiabetesPack({
        site: "referral",
        established: false,
        ageBand: "adult",
        values: {
          sex: "female",
          age_years: 30,
          ...PREG[preg!],
          ...BP[bp!],
          ...SYM[sym!],
          ...PROTEIN[prot!],
          ...WGLU[glu!],
        },
      });
      n++;
      const cell = `${preg}.bp=${bp}.${sym}.protein=${prot}.glu=${glu}`;
      if (top(r) < womenFloor(preg!, bp!, sym!, glu!)) silent.push(cell);
      if (
        (preg === "notpreg_notpp" || preg === "unknown") &&
        sym === "none" &&
        bp === "145/95" &&
        Object.keys(r.fired).some((k) => PREG_RULES.has(k))
      )
        noisy.push(cell);
      const f = orderFault(r);
      if (f) order.push(`${cell}: ${f}`);
    }
    expect(n).toBe(480);
    expect({ silent, noisy, order }).toEqual({ silent: [], noisy: [], order: [] });
  });
});
