import type { RuleModule } from "./index";
import type { SignedCopy } from "@/content/signed-copy";
import type { Built, Kit } from "@/lib/protocols/engine/kit";
import type { Btn, ChartVersion, Interp, Step } from "@/lib/protocols/engine/types";
import { z } from "zod";

import { fill } from "@/content/protocol-charts";
import { CHART_TIME_ZONE } from "@/lib/emr/charts/fluids";
import { QuickRules, supplyOf } from "@/lib/protocols/quick";

/**
 * Magnesium sulphate, Pritchard (pregnant women 12 to 55), FEATURES.md §2.5: the prototype's
 * `PC.mgso4` on the generic kit. Every number is the version's `seed` (0285); the words are
 * MGSO4_COPY (draft). Blocking rule held here and so in the server action (P6): a maintenance dose
 * is offered only when it is due and every check passes on the charted values (breathing, knee
 * reflexes, urine over the last hours); breathing under the toxic value fails the breathing check.
 */

/** The words, in the prototype's wording. No number lives here: every `{n}` comes from the seed. */
export const MGSO4_COPY = {
  status: "draft",
  signedBy: null,
  signedOn: null,
  short: "Magnesium",
  seedMissing: "This magnesium version has no numbers, so it cannot chart.",
  ph1: "Confirm and load",
  ph2: "Maintenance",
  ph3: "Stop",
  win: "{a} to {b}",
  winEnd: "{h} hours after delivery or the last fit",
  // Confirm
  a1: "Confirm",
  a1Sub:
    "Severe pre-eclampsia: BP {ss}/{sd} or more, or {s}/{d} with a severe feature. Eclampsia: a fit.",
  sbp: "Systolic BP",
  dbp: "Diastolic BP",
  featHead: "Severe features",
  featOpts: [
    "Fit (eclampsia)",
    "Severe headache",
    "Blurred vision",
    "Upper belly pain",
    "Protein 2+ or more",
    "Little urine",
    "Breathless (lung oedema)",
    "Low platelets",
  ],
  fitOpt: "Fit (eclampsia)",
  cBp: "BP {s}/{d} or more",
  cSev: "Severe BP ({s}/{d}) or a severe feature, or a fit",
  noValue: "no value",
  fitW: "fit",
  sevBpW: "severe BP",
  nonePicked: "none picked",
  eclampsia: "Eclampsia",
  severePe: "Severe pre-eclampsia",
  giveNow: "{what}: give magnesium now.",
  notConfirmed: "Not confirmed yet.",
  notConfirmedBrief: "Not confirmed",
  // Loading
  a2: "Loading dose",
  a2Sub:
    "{iv} g IV over {a} to {b} minutes: {ml} ml of 50% with {w} ml water for injection. AND {im} g deep IM: {each} g ({eachMl} ml of 50%) in each buttock, with {lido} ml of 2% lidocaine in each syringe.",
  ivItem: "{g} g IV over {a} to {b} minutes",
  ivItemSub: "Slowly; she may feel warm",
  imItem: "{g} g IM, {each} g each buttock",
  imItemSub: "Deep IM with lidocaine",
  givenAt: "Given {t}",
  notYet: "Not yet",
  ivBtn: "IV loading given",
  imBtn: "IM loading given",
  fitItem: "If she fits again",
  fitItemSub: "{g} g IV over {min} minutes ({ml} ml of 50% diluted)",
  fitN: "{n} extra doses",
  fit1: "1 extra dose",
  none: "None",
  fitBtn: "She fitted: {g} g given",
  loadedBrief: "Loaded {t}",
  notLoaded: "Not loaded",
  // BP
  a3: "Lower the BP",
  a3Sub:
    "Treat if {s}/{d} or more. Aim for {s1} to {s2} / {d1} to {d2}. Labetalol IV or nifedipine by mouth; hydralazine IV if those are not available.",
  bpNow: "BP now",
  noReading: "No reading",
  openHtn: "Open the labetalol chart",
  rxOther: "Prescribe nifedipine or hydralazine",
  bpBtn: "BP treated",
  bpTreat: "BP {s}/{d}: treat now, as well as the magnesium.",
  bpOk: "Under {s}/{d} now. Recheck hourly.",
  treatBrief: " · treat",
  noBp: "No BP",
  // Tests and delivery
  a4: "Tests and the delivery plan",
  a4Sub:
    "Delivery is the cure. After a fit, deliver within {fit} hours; in severe pre-eclampsia within {other} hours.",
  inv: [
    ["fbc", "Full blood count and platelets"],
    ["lft", "Liver function"],
    ["ue", "Creatinine and urea"],
    ["up", "Urine protein"],
    ["coag", "Clotting", true],
    ["fhr", "Fetal heart and well-being"],
  ],
  cath: "Urinary catheter",
  cathSub: "For hourly urine output",
  cathIn: "In {t}",
  cathBtn: "Catheter in",
  planHead: "Delivery plan",
  planWithin: "Deliver within {h} hours",
  planObs: "Plan with the obstetrician",
  noPlan: "No plan yet",
  // Maintenance
  b1: "Maintenance: {g} g IM every {h} hours",
  b1Sub:
    "{g} g ({ml} ml of 50%) deep IM, alternate buttocks, every {h} hours until {stop} hours after the delivery or the last fit. Give each dose only if every check passes.",
  chkRr: "Breathing {n} or more a minute",
  chkReflex: "Knee reflexes present",
  chkUo: "Urine {n} ml or more in the last {h} hours",
  present: "Present",
  absent: "Absent",
  notChecked: "not checked",
  uoV: "{n} ml",
  uoCharted: " ({n} h charted)",
  dosesGiven: "Doses given",
  noneYet: "None yet",
  nextDose: "Next dose",
  afterLoading: "After the loading dose",
  overdue: " · overdue",
  finished: "Course finished",
  doseBtn: "Dose {n} given",
  withhold: "A check has failed: withhold this dose and call the doctor.",
  checksHourly: "Checks hourly; the dose is due at {t}.",
  finishedLine: "Course finished.",
  startsAfter: "Starts {h} hours after the loading dose.",
  dosesBrief: "{n} doses",
  dose1Brief: "1 dose",
  nextBrief: " · next {t}",
  // Toxicity
  b2: "Toxicity",
  b2Sub: "Too much magnesium: reflexes go first, then breathing slows, then the heart stops.",
  toxRr: "Breathing under {n} a minute",
  toxRrSub:
    "Stop magnesium. Calcium gluconate {g} g (10%) IV over {min} minutes. Ventilate if needed.",
  nowV: "Now: {v}",
  no: "No",
  caBtn: "Calcium gluconate given",
  toxReflex: "Knee reflexes absent",
  toxReflexSub: "Withhold the next dose",
  toxUo: "Urine under {n} ml in {h} hours",
  toxUoSub: "Withhold; review fluids and the kidneys",
  toxBrief: "Breathing {v}: toxic",
  noSigns: "No signs",
  // Delivery and fits
  b3: "Delivery and fits",
  b3Sub: "The {h}-hour clock restarts at the delivery and at each fit.",
  delivered: "Delivered",
  fitsAfter: "Fits after loading",
  stopAt: "Stop magnesium at",
  stopAtNot: "{h} hours after delivery or the last fit",
  delivBtn: "Baby delivered",
  delivBrief: "Delivered {t}",
  notDelivered: "Not delivered",
  // Stop
  e1: "Stop the magnesium",
  e1Sub: "{h} hours after the delivery or the last fit, whichever is later.",
  cOver: "{h} hours since delivery or the last fit",
  until: "until {t}",
  notLoadedW: "not loaded",
  notYetW: "not yet",
  postpartum: "Keep the BP under {s}/{d} after delivery, and check it every {h} hours.",
  untilBrief: "Until {t}",
  notStarted: "Not started",
  // Nurse card
  rnTitle: "Before each dose",
  rnNote: "",
  check: "Check",
  allPass: "Every check passes.",
  recordChecks: "Record breathing, reflexes and urine on the monitoring chart.",
  // Flow
  fConfirm: "Fit, or severe pre-eclampsia?",
  yes: "Yes",
  fNow: "Magnesium now",
  fNot: "Not this chart",
  fLoad: "{iv} g IV + {im} g IM",
  fBp: "BP {s}/{d} or more?",
  fBpYes: "Labetalol or nifedipine",
  fBpNo: "Recheck hourly",
  fTests: "Tests and delivery plan",
  fChecks: "Breathing {rr}+, reflexes, urine {uo} ml/{h} h?",
  fAllPass: "All pass",
  fEvery: "{g} g IM every {h} h ↺",
  fAnyFails: "Any fails",
  fWithhold: "Withhold, call the doctor",
  fTox: "Breathing under {n}?",
  fToxYes: "Stop; calcium gluconate {g} g",
  fContinue: "Continue",
  fReset: "Delivery and fits reset the clock",
  fStop: "Stop {h} h after delivery or the last fit",
  // Tasks
  tIv: "Give magnesium sulphate {g} g IV over {a} to {b} minutes",
  tIvSub: "{ml} ml of 50% + {w} ml water for injection",
  tIm: "Give magnesium sulphate {each} g deep IM in each buttock",
  tImSub: "{ml} ml of 50% + {lido} ml 2% lidocaine, each side",
  tDose: "Give magnesium {g} g IM (dose {n})",
  tDoseFail: "Magnesium dose due: a check has failed, call the doctor",
  tDoseSub: "Checks: breathing {rr}, reflexes {ref}, urine {uo} ml in {h} h",
  tTox: "Breathing under {n}: stop magnesium, give calcium gluconate {g} g IV",
  tToxSub: "Call the doctor",
  tCath: "Insert a urinary catheter",
  tCathSub: "For hourly urine",
  // Grid, form, panels
  gRr: "Breathing, /min",
  gReflex: "Knee reflexes",
  gUo: "Urine, ml/h",
  gSbp: "Systolic",
  gDbp: "Diastolic",
  fmRr: "Breathing",
  fmReflex: "Knee reflexes",
  fmUo: "Urine",
  toxic: "Toxic",
  withholdW: "Withhold",
  ok: "Normal",
  low: "Low",
  treat: "Treat",
  raised: "Raised",
  recWhat: "breathing, reflexes, urine, BP",
  recHint: "Every hour: breathing, knee reflexes, urine and BP. These decide the next dose.",
  pRr: "Breathing rate",
  thrWithhold: "Under {n}: withhold",
  thrToxic: "Under {n}: toxic",
  pUo: "Urine",
  thrUo: "Under {n} ml/hour",
  pSbp: "Systolic BP",
  thrTreat: "{n}: treat",
  thrAim: "{n}: aim",
  // Stats, aims
  sLoaded: "Loaded",
  sLoadedS: "{iv} g IV + {im} g IM",
  sDoses: "Doses",
  sNext: "Next {t}",
  sChecks: "Checks",
  pass: "Pass",
  fail: "Fail",
  sChecksS: "Breathing, reflexes, urine",
  sBp: "BP",
  sBpS: "Treat at {s}/{d}",
  sStop: "Stop at",
  aim1: "Loaded within {t}",
  aim2: "Every dose checked first",
  aim3: "BP under {s}/{d}",
  // Pharmacy
  medsNote: "The supply comes from the protocol version's lines.",
  phMg: "Magnesium",
  phLoaded: "Loaded at {t}. ",
  phDoses: "{n} maintenance doses given{next}.",
  phNext: "; next at {t}",
  phAntidote: "Antidote",
  phAntidoteV: "Calcium gluconate {g} g at the bedside the whole time.",
  log: {
    ld1: "Loading IV given",
    ld2: "Loading IM given",
    deliv: "Baby delivered",
    ca: "Calcium gluconate given",
    cath: "Catheter in",
    bp: "BP treated",
    fit: "Fitted again: IV dose given",
    mg: "Magnesium maintenance dose given",
  },
} as const satisfies SignedCopy & Record<string, unknown>;
const W = MGSO4_COPY;

const num = z.number().finite();
const Phase = z.object({ id: z.string(), from: num, to: num.nullable() });
const Pair = z.tuple([num, num]);
export const Mgso4Seed = z.object({
  phases: z.array(Phase).length(3),
  confirm: z.object({ sbpFrom: num, dbpFrom: num, severeSbpFrom: num, severeDbpFrom: num }),
  ml50PerG: num,
  loading: z.object({
    ivG: num,
    ivMinutesFrom: num,
    ivMinutesTo: num,
    ivMl50: num,
    ivWaterMl: num,
    imG: num,
    imEachG: num,
    lidocaineMl: num,
  }),
  refit: z.object({ ivG: num, minutes: num }),
  bp: z.object({ treatSbpFrom: num, treatDbpFrom: num, aimSbp: Pair, aimDbp: Pair }),
  delivery: z.object({ afterFitH: num, otherwiseH: num }),
  maintenance: z.object({ g: num, everyH: num, earlyMinutes: num }),
  checks: z.object({ rrFrom: num, urineMlFrom: num, urineHours: num }),
  toxicity: z.object({ rrUnder: num, calciumG: num, calciumMinutes: num }),
  stopAfterH: num,
  urineLowMlH: num,
  postpartum: z.object({ sbpUnder: num, dbpUnder: num, everyH: num }),
  refs: z.record(z.string(), z.unknown()),
});
export type Mgso4Seed = z.infer<typeof Mgso4Seed>;

const mgso4: RuleModule = {
  id: "mgso4",
  short: () => W.short,
  check: (v: ChartVersion) =>
    (v.rules as { module?: string | null } | null)?.module === "mgso4" &&
    Mgso4Seed.safeParse(v.seed).success &&
    QuickRules.safeParse(v.rules).success
      ? null
      : W.seedMissing,
  build: (K) => buildMgso4(K),
};
export default mgso4;

const HOUR = 3600000;
const flag = (lvl: Interp["lvl"], word: string): Interp => ({ lvl, word, text: "", ref: "" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: CHART_TIME_ZONE });

export function buildMgso4(K: Kit): Built {
  const S = Mgso4Seed.parse(K.version.seed);
  const rules = QuickRules.parse(K.version.rules);
  const { v, T, c, facts: p, now, hNow, hh, L, A, btn, st, mark, give, fld, it, row, crit } = K;
  const { val, latest, lastObs, many, gv, lbl, obs } = K;
  const CF = S.confirm;
  const LD = S.loading;
  const BP = S.bp;
  const MT = S.maintenance;
  const CK = S.checks;
  const TX = S.toxicity;
  const ml = (g: number) => g * S.ml50PerG;
  const hhd = (ms: number) => `${dayFmt.format(ms)} ${hh(ms)}`;

  // ─── Confirm and load ───
  const sbp0 = val("sbp");
  const dbp0 = val("dbp");
  const fe = many("feat");
  const fits = gv("fit");
  const fit = fe.includes(W.fitOpt) || fits.length > 0;
  const sevBP =
    (sbp0 !== null && sbp0 >= CF.severeSbpFrom) || (dbp0 !== null && dbp0 >= CF.severeDbpFrom);
  const anyBP = (sbp0 !== null && sbp0 >= CF.sbpFrom) || (dbp0 !== null && dbp0 >= CF.dbpFrom);
  const confirmed = fit || (anyBP && (sevBP || fe.length > 0));
  const what = fit ? W.eclampsia : W.severePe;
  const a1 = A(
    {
      n: 1,
      title: W.a1,
      sub: fill(W.a1Sub, {
        ss: CF.severeSbpFrom,
        sd: CF.severeDbpFrom,
        s: CF.sbpFrom,
        d: CF.dbpFrom,
      }),
      fields: [fld("sbp", W.sbp, "mmHg"), fld("dbp", W.dbp, "mmHg")],
      chipHead: W.featHead,
      chips: K.pickN("feat", W.featOpts),
      chipWho: "dr",
      crit: [
        crit(
          fill(W.cBp, { s: CF.sbpFrom, d: CF.dbpFrom }),
          sbp0 !== null ? `${sbp0}/${dbp0 ?? "?"}` : W.noValue,
          anyBP,
          sbp0 !== null,
        ),
        crit(
          fill(W.cSev, { s: CF.severeSbpFrom, d: CF.severeDbpFrom }),
          fit ? W.fitW : sevBP ? W.sevBpW : fe.join(", ") || W.nonePicked,
          fit || sevBP || fe.length > 0,
          sbp0 !== null || fe.length > 0,
        ),
      ],
      lines: [confirmed ? L(fill(W.giveNow, { what }), "ok") : L(W.notConfirmed, "warn")],
    },
    st(confirmed, false),
  );
  a1.brief = confirmed ? what : W.notConfirmedBrief;

  const fitBtn = btn(fill(W.fitBtn, { g: S.refit.ivG }), give("fit"), "rn");
  const a2 = A(
    {
      n: 2,
      title: W.a2,
      sub: fill(W.a2Sub, {
        iv: LD.ivG,
        a: LD.ivMinutesFrom,
        b: LD.ivMinutesTo,
        ml: LD.ivMl50,
        w: LD.ivWaterMl,
        im: LD.imG,
        each: LD.imEachG,
        eachMl: ml(LD.imEachG),
        lido: LD.lidocaineMl,
      }),
      items: [
        it(
          fill(W.ivItem, { g: LD.ivG, a: LD.ivMinutesFrom, b: LD.ivMinutesTo }),
          W.ivItemSub,
          T.ld1 ? fill(W.givenAt, { t: hh(T.ld1) }) : W.notYet,
          T.ld1 ? "done" : confirmed ? "alert" : "todo",
          T.ld1 ? [] : [btn(W.ivBtn, mark("ld1"), "rn", "main")],
        ),
        it(
          fill(W.imItem, { g: LD.imG, each: LD.imEachG }),
          W.imItemSub,
          T.ld2 ? fill(W.givenAt, { t: hh(T.ld2) }) : W.notYet,
          T.ld2 ? "done" : confirmed ? "alert" : "todo",
          T.ld2 ? [] : [btn(W.imBtn, mark("ld2"), "rn", "main")],
        ),
        it(
          W.fitItem,
          fill(W.fitItemSub, { g: S.refit.ivG, min: S.refit.minutes, ml: ml(S.refit.ivG) }),
          fits.length ? (fits.length === 1 ? W.fit1 : fill(W.fitN, { n: fits.length })) : W.none,
          fits.length ? "done" : "na",
          [fitBtn],
        ),
      ],
      btns: K.ivBtn(),
      lines: [K.ivLine()],
    },
    st(!!T.ld1 && !!T.ld2, confirmed && (!T.ld1 || !T.ld2)),
  );
  a2.brief = T.ld1 && T.ld2 ? fill(W.loadedBrief, { t: hh(Math.max(T.ld1, T.ld2)) }) : W.notLoaded;

  const sbL = latest("sbp");
  const dbL = latest("dbp");
  const bpHigh =
    (sbL !== null && sbL >= BP.treatSbpFrom) || (dbL !== null && dbL >= BP.treatDbpFrom);
  const a3 = A(
    {
      n: 3,
      title: W.a3,
      sub: fill(W.a3Sub, {
        s: BP.treatSbpFrom,
        d: BP.treatDbpFrom,
        s1: BP.aimSbp[0],
        s2: BP.aimSbp[1],
        d1: BP.aimDbp[0],
        d2: BP.aimDbp[1],
      }),
      rows: [
        row(
          W.bpNow,
          sbL !== null ? `${sbL}/${dbL ?? "?"}` : W.noReading,
          bpHigh ? "warn" : undefined,
        ),
      ],
      btns: [
        btn(W.openHtn, { t: "proto", id: "htn" }, "dr", bpHigh ? "main" : undefined),
        btn(W.rxOther, { t: "rx" }, "dr", "link"),
        ...(bpHigh && !T.bp ? [btn(W.bpBtn, mark("bp"), "dr")] : []),
      ],
      lines: [
        bpHigh
          ? L(fill(W.bpTreat, { s: sbL ?? "?", d: dbL ?? "?" }), T.bp ? "warn" : "alert")
          : L(fill(W.bpOk, { s: BP.treatSbpFrom, d: BP.treatDbpFrom }), "ok"),
      ],
    },
    st(!bpHigh || !!T.bp, bpHigh && !T.bp),
  );
  a3.brief = sbL !== null ? `${sbL}/${dbL ?? "?"}${bpHigh ? W.treatBrief : ""}` : W.noBp;

  const INV = W.inv as readonly (readonly [string, string, boolean?])[];
  const plans = [
    fill(W.planWithin, { h: S.delivery.afterFitH }),
    fill(W.planWithin, { h: S.delivery.otherwiseH }),
    W.planObs,
  ];
  const a4 = A(
    {
      n: 4,
      title: W.a4,
      sub: fill(W.a4Sub, { fit: S.delivery.afterFitH, other: S.delivery.otherwiseH }),
      items: [
        ...K.invItems(INV),
        it(
          W.cath,
          W.cathSub,
          T.cath ? fill(W.cathIn, { t: hh(T.cath) }) : W.notYet,
          T.cath ? "done" : "todo",
          T.cath ? [] : [btn(W.cathBtn, mark("cath"), "rn", "main")],
        ),
      ],
      chipHead: W.planHead,
      chips: K.pick1("plan", plans),
      chipWho: "dr",
    },
    st(K.invDone(INV) && !!T.cath && !!v.plan, false),
  );
  a4.brief = v.plan || W.noPlan;

  // ─── Maintenance ───
  const load = T.ld2 || T.ld1 || null;
  const lastFit = fits.length ? fits[fits.length - 1]! : 0;
  const endAt = Math.max(load ?? 0, T.deliv ?? 0, lastFit) + S.stopAfterH * HOUR;
  const doses = gv("mg");
  const every = MT.everyH * HOUR;
  const nextDue = load ? (doses.length ? doses[doses.length - 1]! : load) + every : null;
  const rrL = latest("rr");
  const refL = lastObs("reflex");
  const reflexOk = !!refL && parseFloat(refL.values.reflex!) >= 1;
  const last4 = obs.filter(
    (o) => o.at > now - CK.urineHours * HOUR && o.values.uo !== undefined && o.values.uo !== "",
  );
  const u4 = last4.reduce((a, o) => a + (parseFloat(o.values.uo!) || 0), 0);
  const uoSlots = Math.round((CK.urineHours * 60) / K.slotMin);
  const chk = [
    {
      t: fill(W.chkRr, { n: CK.rrFrom }),
      ok: rrL !== null && rrL >= CK.rrFrom,
      v: rrL !== null ? String(rrL) : W.noValue,
    },
    { t: W.chkReflex, ok: reflexOk, v: refL ? (reflexOk ? W.present : W.absent) : W.notChecked },
    {
      t: fill(W.chkUo, { n: CK.urineMlFrom, h: CK.urineHours }),
      ok: u4 >= CK.urineMlFrom,
      v:
        fill(W.uoV, { n: u4 }) +
        (last4.length < uoSlots ? fill(W.uoCharted, { n: last4.length }) : ""),
    },
  ];
  const allOk = chk.every((x) => x.ok);
  const tox = rrL !== null && rrL < TX.rrUnder;
  const active = !!load && now < endAt;
  const dueNow = active && nextDue !== null && now >= nextDue - MT.earlyMinutes * 60000;
  const late = active && nextDue !== null && now > nextDue + MT.earlyMinutes * 60000;
  // P6: the dose is offered only when due and every check passes.
  const doseBtn = btn(fill(W.doseBtn, { n: doses.length + 1 }), give("mg"), "rn", "main");
  const b1 = A(
    {
      n: 1,
      title: fill(W.b1, { g: MT.g, h: MT.everyH }),
      sub: fill(W.b1Sub, { g: MT.g, ml: ml(MT.g), h: MT.everyH, stop: S.stopAfterH }),
      crit: chk.map((x) => crit(x.t, x.v, x.ok, true)),
      rows: [
        row(W.dosesGiven, doses.length ? doses.map(hh).join(" · ") : W.noneYet),
        row(
          W.nextDose,
          !load
            ? W.afterLoading
            : active
              ? hh(nextDue!) + (now > nextDue! ? W.overdue : "")
              : W.finished,
        ),
      ],
      btns: dueNow && allOk ? [doseBtn] : [],
      lines: [
        dueNow && !allOk
          ? L(W.withhold, "alert")
          : active
            ? L(fill(W.checksHourly, { t: hh(nextDue!) }))
            : L(load ? W.finishedLine : fill(W.startsAfter, { h: MT.everyH })),
      ],
    },
    st(!!load && !dueNow, (dueNow && !allOk) || late),
  );
  b1.brief =
    (doses.length === 1 ? W.dose1Brief : fill(W.dosesBrief, { n: doses.length })) +
    (active && nextDue ? fill(W.nextBrief, { t: hh(nextDue) }) : "");

  const uoLow = u4 < CK.urineMlFrom && last4.length >= uoSlots;
  const b2 = A(
    {
      n: 2,
      title: W.b2,
      sub: W.b2Sub,
      items: [
        it(
          fill(W.toxRr, { n: TX.rrUnder }),
          fill(W.toxRrSub, { g: TX.calciumG, min: TX.calciumMinutes }),
          tox ? fill(W.nowV, { v: rrL! }) : W.no,
          tox ? "alert" : "na",
          tox && !T.ca ? [btn(W.caBtn, mark("ca"), "rn", "main")] : [],
        ),
        it(
          W.toxReflex,
          W.toxReflexSub,
          refL && !reflexOk ? W.absent : W.no,
          refL && !reflexOk ? "alert" : "na",
        ),
        it(
          fill(W.toxUo, { n: CK.urineMlFrom, h: CK.urineHours }),
          W.toxUoSub,
          uoLow ? fill(W.uoV, { n: u4 }) : W.no,
          uoLow ? "alert" : "na",
        ),
      ],
    },
    st(!tox, tox && !T.ca),
  );
  b2.brief = tox ? fill(W.toxBrief, { v: rrL! }) : W.noSigns;

  const b3 = A(
    {
      n: 3,
      title: W.b3,
      sub: fill(W.b3Sub, { h: S.stopAfterH }),
      rows: [
        row(W.delivered, T.deliv ? hh(T.deliv) : W.notYet),
        row(W.fitsAfter, fits.length ? fits.map(hh).join(" · ") : W.none),
        row(W.stopAt, load ? hhd(endAt) : fill(W.stopAtNot, { h: S.stopAfterH })),
      ],
      btns: [...(T.deliv ? [] : [btn(W.delivBtn, mark("deliv"), "dr", "main")]), fitBtn],
    },
    st(!!T.deliv, false),
  );
  b3.brief = T.deliv ? fill(W.delivBrief, { t: hh(T.deliv) }) : W.notDelivered;

  // ─── Stop ───
  const over = !!load && now >= endAt;
  const PP = S.postpartum;
  const e1 = A(
    {
      n: 1,
      title: W.e1,
      sub: fill(W.e1Sub, { h: S.stopAfterH }),
      crit: [
        crit(
          fill(W.cOver, { h: S.stopAfterH }),
          load ? fill(W.until, { t: hhd(endAt) }) : W.notLoadedW,
          over,
          !!load,
        ),
        crit(W.delivered, T.deliv ? hh(T.deliv) : W.notYetW, !!T.deliv, true),
      ],
      btns: over && T.deliv ? [K.endBtn(W.short)] : [],
      lines: [L(fill(W.postpartum, { s: PP.sbpUnder, d: PP.dbpUnder, h: PP.everyH }))],
    },
    st(over && !!T.deliv, false),
  );
  e1.brief = over ? W.finished : load ? fill(W.untilBrief, { t: hhd(endAt) }) : W.notStarted;

  const r1 = A(
    {
      n: 1,
      head: W.check,
      title: W.rnTitle,
      crit: chk.map((x) => crit(x.t, x.v, x.ok, true)),
      lines: [allOk ? L(W.allPass, "ok") : L(W.recordChecks, "warn")],
    },
    st(allOk, dueNow && !allOk),
  );

  // ─── Nurse tasks ───
  const tasks: [string, string, string, number, Btn[]][] = [];
  if (confirmed && !T.ld1)
    tasks.push([
      "ld1",
      fill(W.tIv, { g: LD.ivG, a: LD.ivMinutesFrom, b: LD.ivMinutesTo }),
      fill(W.tIvSub, { ml: LD.ivMl50, w: LD.ivWaterMl }),
      c.start,
      [btn(W.ivBtn, mark("ld1"), "rn", "main")],
    ]);
  if (confirmed && !T.ld2)
    tasks.push([
      "ld2",
      fill(W.tIm, { each: LD.imEachG }),
      fill(W.tImSub, { ml: ml(LD.imEachG), lido: LD.lidocaineMl }),
      c.start,
      [btn(W.imBtn, mark("ld2"), "rn", "main")],
    ]);
  if (active && nextDue !== null)
    tasks.push([
      `mg${doses.length}`,
      allOk ? fill(W.tDose, { g: MT.g, n: doses.length + 1 }) : W.tDoseFail,
      fill(W.tDoseSub, {
        rr: rrL ?? "?",
        ref: refL ? (reflexOk ? W.present : W.absent).toLowerCase() : "?",
        uo: u4,
        h: CK.urineHours,
      }),
      nextDue,
      allOk && dueNow ? [doseBtn] : [],
    ]);
  if (tox && !T.ca)
    tasks.push([
      "ca",
      fill(W.tTox, { n: TX.rrUnder, g: TX.calciumG }),
      W.tToxSub,
      now,
      [btn(W.caBtn, mark("ca"), "rn", "main")],
    ]);
  if (!T.cath)
    tasks.push([
      "cath",
      W.tCath,
      W.tCathSub,
      c.start,
      [btn(W.cathBtn, mark("cath"), "rn", "main")],
    ]);

  const PH = S.phases;
  const acts: Step[][] = [[a1, a2, a3, a4], [b1, b2, b3], [e1]];
  const titles = [W.ph1, W.ph2, W.ph3];
  const supply = supplyOf(rules, {
    ageYears: p.ageYears,
    sex: p.sex,
    weightKg: p.weightKg,
    pregnant: p.pregnant,
  });

  return {
    phases: PH.map((ph, i) => ({
      ...ph,
      title: titles[i]!,
      win:
        ph.to === null
          ? fill(W.winEnd, { h: S.stopAfterH })
          : fill(W.win, { a: lbl(ph.from), b: lbl(ph.to) }),
      acts: acts[i]!,
    })),
    rn: { title: W.rnTitle, note: W.rnNote, acts: [r1] },
    flow: (F) => [
      F.P(PH[0]!.id),
      F.D("load1", W.fConfirm, [
        F.Br(W.yes, W.fNow, confirmed ? true : null),
        F.Br(W.no, W.fNot, sbp0 !== null && fe.length && !confirmed ? true : null),
      ]),
      F.N("load2", fill(W.fLoad, { iv: LD.ivG, im: LD.imG })),
      F.D("load3", fill(W.fBp, { s: BP.treatSbpFrom, d: BP.treatDbpFrom }), [
        F.Br(W.yes, W.fBpYes, sbL !== null ? bpHigh : null),
        F.Br(W.no, W.fBpNo, sbL !== null ? !bpHigh : null),
      ]),
      F.N("load4", W.fTests),
      F.P(PH[1]!.id),
      F.D("keep1", fill(W.fChecks, { rr: CK.rrFrom, uo: CK.urineMlFrom, h: CK.urineHours }), [
        F.Br(W.fAllPass, fill(W.fEvery, { g: MT.g, h: MT.everyH }), load ? allOk : null),
        F.Br(W.fAnyFails, W.fWithhold, load ? !allOk : null),
      ]),
      F.D("keep2", fill(W.fTox, { n: TX.rrUnder }), [
        F.Br(W.yes, fill(W.fToxYes, { g: TX.calciumG }), rrL !== null ? tox : null),
        F.Br(W.no, W.fContinue, rrL !== null ? !tox : null),
      ]),
      F.N("keep3", W.fReset),
      F.P(PH[2]!.id),
      F.N("end1", fill(W.fStop, { h: S.stopAfterH })),
    ],
    tasks: (add) => tasks.forEach(([key, title, sub, at, b]) => add(key, title, sub, at, b)),
    rows: [
      ["rr", W.gRr],
      ["reflex", W.gReflex],
      ["uo", W.gUo],
      ["sbp", W.gSbp],
      ["dbp", W.gDbp],
    ],
    cellFlag: (key, x) => {
      const n = parseFloat(x);
      if (Number.isNaN(n)) return null;
      if (key === "rr")
        return n < TX.rrUnder
          ? flag("crit", W.toxic)
          : n < CK.rrFrom
            ? flag("abn", W.withholdW)
            : flag("ok", W.ok);
      if (key === "reflex") return n >= 1 ? flag("ok", W.present) : flag("crit", W.absent);
      if (key === "uo") return n < S.urineLowMlH ? flag("abn", W.low) : null;
      if (key === "sbp")
        return n >= CF.severeSbpFrom
          ? flag("crit", W.treat)
          : n >= CF.sbpFrom
            ? flag("abn", W.raised)
            : K.interp(key, x);
      if (key === "dbp")
        return n >= CF.severeDbpFrom
          ? flag("crit", W.treat)
          : n >= CF.dbpFrom
            ? flag("abn", W.raised)
            : K.interp(key, x);
      return K.interp(key, x);
    },
    dueAt: (key) => ["rr", "reflex", "uo"].includes(key),
    form: [
      { key: "rr", label: W.fmRr, unit: "/min", dflt: "" },
      { key: "reflex", label: W.fmReflex, unit: "1/0", dflt: "" },
      { key: "uo", label: W.fmUo, unit: "ml", dflt: "" },
      { key: "sbp", label: W.gSbp, unit: "mmHg", dflt: "" },
      { key: "dbp", label: W.gDbp, unit: "mmHg", dflt: "" },
    ],
    formReq: ["rr", "reflex", "uo", "sbp"],
    labKeys: [],
    recWhat: () => W.recWhat,
    recHint: () => W.recHint,
    panels: [
      {
        key: "rr",
        name: W.pRr,
        unit: "/min",
        min: 6,
        max: 30,
        ticks: [10, 20, 30],
        thr: [
          [CK.rrFrom, fill(W.thrWithhold, { n: CK.rrFrom }), "amb"],
          [TX.rrUnder, fill(W.thrToxic, { n: TX.rrUnder }), "amb"],
        ],
        bad: (x) => x < TX.rrUnder,
      },
      {
        key: "uo",
        name: W.pUo,
        unit: "ml/hour",
        min: 0,
        max: 150,
        ticks: [0, 50, 100, 150],
        thr: [[S.urineLowMlH, fill(W.thrUo, { n: S.urineLowMlH }), "amb"]],
        bad: (x) => x < S.urineLowMlH,
      },
      {
        key: "sbp",
        name: W.pSbp,
        unit: "mmHg",
        min: 100,
        max: 200,
        ticks: [120, 160, 200],
        thr: [
          [BP.treatSbpFrom, fill(W.thrTreat, { n: BP.treatSbpFrom }), "amb"],
          [BP.aimSbp[1], fill(W.thrAim, { n: BP.aimSbp[1] }), "grn"],
        ],
        bad: (x) => x >= BP.treatSbpFrom,
      },
    ],
    stats: [
      {
        k: W.sLoaded,
        v: load ? hh(load) : W.notYet,
        s: fill(W.sLoadedS, { iv: LD.ivG, im: LD.imG }),
        ...(load ? {} : { cls: "warn" as const }),
      },
      {
        k: W.sDoses,
        v: String(doses.length),
        s: active && nextDue ? fill(W.sNext, { t: hh(nextDue) }) : "",
      },
      {
        k: W.sChecks,
        v: allOk ? W.pass : W.fail,
        s: W.sChecksS,
        cls: allOk ? ("ok" as const) : ("warn" as const),
      },
      {
        k: W.sBp,
        v: sbL !== null ? `${sbL}/${dbL ?? "?"}` : "—",
        s: fill(W.sBpS, { s: BP.treatSbpFrom, d: BP.treatDbpFrom }),
        ...(bpHigh ? { cls: "warn" as const } : {}),
      },
      {
        k: W.sStop,
        v: load ? hhd(endAt) : "—",
        s: T.deliv ? fill(W.delivBrief, { t: hh(T.deliv) }) : W.notDelivered,
      },
    ],
    aims: [
      {
        word: fill(W.aim1, { t: lbl(PH[0]!.to ?? 1) }),
        ok: !!(T.ld1 && T.ld2),
        known: hNow >= (PH[0]!.to ?? 1) || !!T.ld1,
      },
      { word: W.aim2, ok: allOk, known: !!load },
      {
        word: fill(W.aim3, { s: BP.treatSbpFrom, d: BP.treatDbpFrom }),
        ok: sbL !== null && !bpHigh,
        known: sbL !== null,
      },
    ],
    meds: supply.map((s) => ({ drug: s.drug, qty: s.qty ?? 0, why: s.doseText })),
    medsNote: W.medsNote,
    phRows: [
      row(
        W.phMg,
        (load ? fill(W.phLoaded, { t: hh(load) }) : "") +
          fill(W.phDoses, {
            n: doses.length,
            next: active && nextDue ? fill(W.phNext, { t: hh(nextDue) }) : "",
          }),
      ),
      row(W.phAntidote, fill(W.phAntidoteV, { g: TX.calciumG })),
    ],
    logWords: W.log,
  };
}
