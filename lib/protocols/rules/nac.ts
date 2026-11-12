import type { RuleModule } from "./index";
import type { SignedCopy } from "@/content/signed-copy";
import type { Built, Kit } from "@/lib/protocols/engine/kit";
import type { ChartVersion, Interp, Step } from "@/lib/protocols/engine/types";
import { z } from "zod";

import { fill } from "@/content/protocol-charts";
import { QuickRules, supplyOf } from "@/lib/protocols/quick";

/**
 * Paracetamol overdose: acetylcysteine 21 h (any age), FEATURES.md §2.9: the prototype's `PC.nac` on
 * the generic kit. Every number is the version's `seed` (0286); the words are NAC_COPY (draft). The
 * treatment decision reads the level against the line, the timing and the liver tests; each bag is
 * offered to the nurse only once treatment is decided, in order, with a weight (capped, P7). The
 * bloods before bag 3 ends decide whether to continue.
 */

export const NAC_COPY = {
  status: "draft",
  signedBy: null,
  signedOn: null,
  short: "Paracetamol",
  seedMissing: "This paracetamol overdose version has no numbers, so it cannot chart.",
  ph1: "Assess",
  ph2: "Bags 1 and 2",
  ph3: "Bag 3",
  ph4: "End of treatment",
  win: "{a} to {b} h",
  winEnd: "At {a} to {b} h",
  // When, how much
  a1: "When, and how much",
  a1Sub: "The time of the overdose decides everything. {n} mg/kg or more can damage the liver.",
  ingH: "Hours since it was taken",
  amt: "Amount taken",
  howLabel: "How",
  stagSingle: "Single time",
  stagOver: "Over more than {h} hour",
  stagUnknown: "Time not known",
  rWeight: "Weight",
  weightIs: "{w} kg",
  weightCap: "{w} kg (doses use {cap} kg)",
  notRecorded: "Not recorded",
  weightWhy: "the acetylcysteine doses",
  rTaken: "Dose taken",
  mgkgIs: "{n} mg/kg",
  harmful: "{n} mg/kg: harmful range",
  needsAmt: "Needs the amount and the weight",
  rTakenAt: "Taken at",
  takenAt: "{t} ({h} h before the chart)",
  hAgo: "{h} h ago",
  timeNotSet: "Time not set",
  // Level and bloods
  a2: "Level and bloods",
  a2Sub:
    "Paracetamol level at {h} hours or later (earlier levels cannot be read). Also ALT, INR, creatinine, glucose and a venous gas.",
  para: "Paracetamol level",
  lvlH: "Level taken at",
  lvlHUnit: "h after",
  alt: "ALT",
  inr: "INR",
  creat: "Creatinine",
  cbg: "Glucose",
  ph: "Venous pH",
  rLine: "Treatment line at that time",
  lineIs: "{v} mg/L ({mg} at {h} h, halving every {e} h)",
  tooEarlyRow: "Under {h} hours: cannot be read",
  needsTime: "Needs the level time",
  rVs: "Level against the line",
  above: "{p} vs {l}: on or above the line",
  below: "{p} vs {l}: below the line",
  tooEarly: "Taken too early: repeat at {h} hours.",
  levelBrief: "Level {p}",
  lineBrief: " vs line {l}",
  noLevel: "No level yet",
  // Treat?
  a3: "Treat?",
  a3Sub:
    "Treat if: the level is on or above the line; the time is not known or it was taken over more than an hour; it is {late} hours or more since a harmful dose (start now, do not wait for the level); or the liver tests are already abnormal.",
  waiting: "Waiting for the {h}-hour level",
  needsDetails: "Needs the details above",
  thisPatient: "This patient",
  bTreat: "Treat",
  bTreatText: "Acetylcysteine, 3 bags over {h} hours.",
  bWait: "Wait for the level",
  bWaitText:
    "Under {late} hours and a single time: wait for the {h}-hour level, if it is back before {late} hours.",
  bNo: "No treatment",
  bNoText: "Level under the line and normal liver tests: medically fit.",
  reason: "Reason: {list}.",
  rAbove: "level above the line",
  rLate: "{h} hours or more since a harmful dose",
  rLiver: "abnormal liver tests",
  noNac: "No acetylcysteine needed. Mental health review before discharge.",
  mhAsked: "Mental health review asked",
  mhAsk: "Ask for a mental health review",
  treatBrief: "Treat",
  noBrief: "No treatment",
  waitBrief: "Wait for the level",
  notDecided: "Not decided",
  // Bags
  bag: "Bag {n}: {mgkg} mg/kg over {d}",
  bagSub: "Acetylcysteine in {ml} ml of 5% glucose (or 0.9% sodium chloride), over {d}.",
  rDose: "Dose",
  doseIs: "{mg} mg = {ml} ml of {c} mg/ml ({n} ampoules)",
  needsWeight: "Needs a weight",
  rRate: "Rate",
  rateIs: "{r} ml/hour",
  rDue: "Due",
  afterBag: "After bag {n}",
  bagStarted: "Bag {n} started",
  bagLine: "Started {t}, ends {e}.",
  startedBrief: "Started {t}",
  dueBrief: "Due {t}",
  later: "later",
  ifTreating: "If treating",
  // Reaction
  g4: "Reaction to the infusion",
  g4Sub:
    "Flushing, itch, rash, wheeze or low BP, usually in bag 1. It is not an allergy: pause, give an antihistamine (and salbutamol if wheezy), restart at the same or a slower rate once settled.",
  paused: "Reaction: paused",
  restart: "Restart the infusion",
  pausedAt: "Paused at {t}.",
  reactionAt: "Reaction at {t}; restarted {r}.",
  noneSoFar: "None so far.",
  pausedBrief: "Paused",
  settled: "Settled",
  none: "None",
  // End
  e1: "At the end of bag 3",
  e1Sub:
    "Before bag 3 ends: INR, ALT, creatinine, venous gas, glucose. Continue at the bag 3 rate if the INR is over {inr} or the ALT {alt} or more.",
  bBad: "INR over {inr} or ALT {alt} or more",
  bBadText: "Continue acetylcysteine at the bag 3 rate; repeat the bloods every {h} hours.",
  bFit: "Normal",
  bFitText: "Medically fit: mental health review, then discharge.",
  extBtn: "Continue acetylcysteine",
  kings: "pH under {ph}, INR over {inr} or creatinine over {cr}: talk to a liver unit now.",
  liverBtn: "Liver unit contacted",
  continueBrief: "Continue",
  fitBrief: "Fit",
  bloodsAt: "Bloods at {t}",
  afterBag3: "After bag 3",
  // Nurse
  rnHead: "Check",
  rnTitle: "The infusion",
  iRunning: "Running now",
  nothingRunning: "Nothing running",
  on: "On",
  off: "Off",
  iReaction: "Reaction",
  iReactionSub: "Flushing, itch, wheeze, low BP",
  // Flow
  fWhen: "When and how much",
  fLevel: "Level against the line",
  fTreat: "Treat?",
  yes: "Yes",
  no: "No",
  fYes: "Above the line, unknown time, late, or liver",
  fWait: "Wait",
  fWaitSub: "Under {late} h: {h}-hour level",
  fFit: "Medically fit",
  fBag: "Bag {n}: {mgkg} mg/kg over {d}",
  fReaction: "Reaction?",
  fPause: "Pause, antihistamine, restart",
  fContinue: "Continue",
  fEnd: "INR over {inr} or ALT {alt}+?",
  fExt: "Continue at bag 3 rate ↺",
  fMh: "Mental health review, discharge",
  // Tasks
  tBag: "Start bag {n}: acetylcysteine {mg} mg in {ml} ml",
  tBagSub: "Over {d} at {r} ml/hour",
  tBloods: "Bloods before bag 3 ends: INR, ALT, creatinine, gas, glucose",
  tBloodsSub: "Decide whether to continue",
  // Monitoring chart
  gRate: "Infusion, ml/h",
  gCbg: "Glucose, mmol/L",
  gReact: "Reaction",
  gAlt: "ALT",
  gInr: "INR",
  fmRate: "Infusion",
  fmCbg: "Glucose",
  fmReact: "Reaction",
  recWhat: "infusion, glucose",
  recBloods: ", ALT and INR",
  recHint: "The rate comes from the running bag.",
  recHintBloods: " Bloods due: ALT and INR.",
  pInr: "INR",
  thrInr: "Over {n}: continue",
  pAlt: "ALT",
  thrAlt: "{n} or more: continue",
  pCbg: "Glucose",
  thrCbg: "Under {n}",
  wYes: "Yes",
  wHigh: "High",
  wRaised: "Raised",
  wLow: "Low",
  // Stats, aims, pharmacy
  sTaken: "Taken",
  hBefore: "{h} h before",
  sLevel: "Level",
  lineS: "Line {l}",
  atOrLater: "At {h} h or later",
  sDecision: "Decision",
  wait: "Wait",
  sBag: "Bag",
  bagOf: "{n} of {of}",
  mlH: "{r} ml/h",
  sInrAlt: "INR / ALT",
  atEnd: "At the end of bag 3",
  aStart: "Started within {h} hours of the overdose",
  aNoGap: "3 bags without a gap",
  aInr: "INR {n} or less at the end",
  phNac: "Acetylcysteine",
  phTotal: "Total {mgkg} mg/kg = {mg} mg = {n} ampoules ({bags}).",
  phBagN: "bag {i}: {n}",
  phExt: " Continued past {h} h: about {n} more every {e} hours.",
  waitingWeight: "Waiting for a weight.",
  phBags: "Bags",
  phBagsIs: "5% glucose {list} ml, or 0.9% sodium chloride.",
  phNext: "Next",
  phNextBag: "Bag {n} at {t}.",
  phB3Ends: "Bag 3 ends at {t}.",
  phWaiting: "Waiting for the decision.",
  log: {
    b1: "Bag 1 started",
    b2: "Bag 2 started",
    b3: "Bag 3 started",
    react: "Reaction: infusion paused",
    restart: "Infusion restarted",
    ext: "Acetylcysteine continued",
    liver: "Liver unit contacted",
    mh: "Mental health review asked",
    stag: "How it was taken",
    ingH: "Hours since it was taken",
    amt: "Amount taken",
    para: "Paracetamol level",
    lvlH: "Level taken at",
  },
} as const satisfies SignedCopy & Record<string, unknown>;
const W = NAC_COPY;

const num = z.number().finite();
const Phase = z.object({ id: z.string(), from: num, to: num.nullable() });
export const NacSeed = z.object({
  phases: z.array(Phase).length(4),
  weightCapKg: num,
  harmMgKg: num,
  staggeredOverH: num,
  line: z.object({ mgL: num, atH: num, halveEveryH: num, toH: num }),
  lateFromH: num,
  abnormal: z.object({ altFrom: num, inrOver: num }),
  bags: z.array(z.object({ mgKg: num, ml: num, minutes: num })).length(3),
  mgPerMl: num,
  ampouleMg: num,
  startEarlyMinutes: num,
  end: z.object({ bloodsBeforeMinutes: num, inrOver: num, altFrom: num, repeatH: num }),
  liverUnit: z.object({ phUnder: num, inrOver: num, creatOver: num }),
  glucoseUnder: num,
  monitor: z.object({ vitalsMinutes: num }),
  refs: z.record(z.string(), z.unknown()),
});
export type NacSeed = z.infer<typeof NacSeed>;

const nac: RuleModule = {
  id: "nac",
  short: () => W.short,
  check: (v: ChartVersion) =>
    NacSeed.safeParse(v.seed).success && QuickRules.safeParse(v.rules).success
      ? null
      : W.seedMissing,
  build: (K) => buildNac(K),
};
export default nac;

const MS = 60000;
const HR = 3600000;
const r1 = (x: number) => Math.round(x * 10) / 10;
const big = (x: number) => x.toLocaleString("en-GB");

export function buildNac(K: Kit): Built {
  const S = NacSeed.parse(K.version.seed);
  const rules = QuickRules.parse(K.version.rules);
  const { v, T, c, facts: p, now, w, hh, L, A, btn, st, mark, fld, row, br, it } = K;
  const val = K.val;
  const Wc = Math.min(w, S.weightCapKg);

  // ─── When and how much ───
  const ingH = val("ingH");
  const amt = val("amt");
  const lvlH = val("lvlH");
  const para = val("para");
  const mgkg = amt !== null && Wc ? Math.round((amt * 1000) / Wc) : null;
  const STAG = [W.stagSingle, fill(W.stagOver, { h: S.staggeredOverH }), W.stagUnknown];
  const stag = v.stag ?? "";
  const LN = S.line;
  const lineAt = (t: number) =>
    t >= LN.atH && t <= LN.toH ? r1(LN.mgL * Math.pow(2, -(t - LN.atH) / LN.halveEveryH)) : null;
  const line = lvlH !== null ? lineAt(lvlH) : null;
  const alt = val("alt");
  const inr = val("inr");
  const liverBad =
    (alt !== null && alt >= S.abnormal.altFrom) || (inr !== null && inr > S.abnormal.inrOver);
  const above = para !== null && line !== null && para >= line;
  const unknownT = stag === STAG[1] || stag === STAG[2];
  const late = ingH !== null && ingH >= S.lateFromH && (mgkg === null || mgkg >= S.harmMgKg);
  const treat: boolean | null =
    above || unknownT || late || liverBad
      ? true
      : para !== null && line !== null && !above && !liverBad
        ? false
        : null;
  const wait = treat === null && ingH !== null && ingH < S.lateFromH && !unknownT;

  const a1 = A(
    {
      n: 1,
      title: W.a1,
      sub: fill(W.a1Sub, { n: S.harmMgKg }),
      fields: [fld("ingH", W.ingH, "h"), fld("amt", W.amt, "g"), ...K.wtBits(W.weightWhy).fields],
      segLabel: W.howLabel,
      segs: K.pick1("stag", STAG),
      segWho: "dr",
      rows: [
        row(
          W.rWeight,
          w
            ? w > S.weightCapKg
              ? fill(W.weightCap, { w, cap: S.weightCapKg })
              : fill(W.weightIs, { w })
            : W.notRecorded,
          w ? undefined : "warn",
        ),
        row(
          W.rTaken,
          mgkg !== null ? fill(mgkg >= S.harmMgKg ? W.harmful : W.mgkgIs, { n: mgkg }) : W.needsAmt,
          mgkg !== null && mgkg >= S.harmMgKg ? "warn" : undefined,
        ),
        row(
          W.rTakenAt,
          ingH !== null ? fill(W.takenAt, { t: hh(c.start - ingH * HR), h: ingH }) : "—",
        ),
      ],
    },
    st(ingH !== null && !!stag, false),
  );
  a1.brief =
    (ingH !== null ? fill(W.hAgo, { h: ingH }) : W.timeNotSet) +
    (mgkg !== null ? ` · ${fill(W.mgkgIs, { n: mgkg })}` : "") +
    (stag && stag !== STAG[0] ? ` · ${stag.toLowerCase()}` : "");

  const a2 = A(
    {
      n: 2,
      title: W.a2,
      sub: fill(W.a2Sub, { h: LN.atH }),
      fields: [
        fld("para", W.para, "mg/L"),
        fld("lvlH", W.lvlH, W.lvlHUnit),
        fld("alt", W.alt, "U/L"),
        fld("inr", W.inr, ""),
        fld("creat", W.creat, "µmol/L"),
        fld("cbg", W.cbg, "mmol/L"),
      ],
      rows: [
        row(
          W.rLine,
          line !== null
            ? fill(W.lineIs, { v: line, mg: LN.mgL, h: LN.atH, e: LN.halveEveryH })
            : lvlH !== null && lvlH < LN.atH
              ? fill(W.tooEarlyRow, { h: LN.atH })
              : W.needsTime,
        ),
        row(
          W.rVs,
          para !== null && line !== null
            ? fill(above ? W.above : W.below, { p: para, l: line })
            : "—",
          above ? "warn" : para !== null && line !== null ? "okv" : undefined,
        ),
      ],
      btns: K.orderMissing(["para", "alt", "inr"]),
      lines: lvlH !== null && lvlH < LN.atH ? [L(fill(W.tooEarly, { h: LN.atH }), "warn")] : [],
    },
    st(para !== null && alt !== null && inr !== null, false),
  );
  a2.brief =
    para !== null
      ? fill(W.levelBrief, { p: para }) + (line !== null ? fill(W.lineBrief, { l: line }) : "")
      : W.noLevel;

  const BAG = S.bags;
  const totalMin = BAG.reduce((a, b) => a + b.minutes, 0);
  const a3 = A(
    {
      n: 3,
      title: W.a3,
      sub: fill(W.a3Sub, { late: S.lateFromH }),
      branchHead:
        treat === null ? (wait ? fill(W.waiting, { h: LN.atH }) : W.needsDetails) : W.thisPatient,
      branches: [
        br(W.bTreat, fill(W.bTreatText, { h: totalMin / 60 }), treat === true, treat !== null),
        br(W.bWait, fill(W.bWaitText, { late: S.lateFromH, h: LN.atH }), wait, ingH !== null),
        br(W.bNo, W.bNoText, treat === false, treat !== null),
      ],
      lines: treat
        ? [
            L(
              fill(W.reason, {
                list: [
                  above ? W.rAbove : "",
                  unknownT ? stag.toLowerCase() : "",
                  late ? fill(W.rLate, { h: S.lateFromH }) : "",
                  liverBad ? W.rLiver : "",
                ]
                  .filter(Boolean)
                  .join(", "),
              }),
              "ok",
            ),
          ]
        : treat === false
          ? [L(W.noNac, "ok")]
          : [],
      btns:
        treat === false
          ? [...(T.mh ? [] : [btn(W.mhAsk, mark("mh"), "dr")]), K.endBtn(W.short)]
          : [],
    },
    st(treat !== null, treat === true && !T.b1),
  );
  a3.brief =
    treat === true ? W.treatBrief : treat === false ? W.noBrief : wait ? W.waitBrief : W.notDecided;

  // ─── The bags ───
  const keyOf = (i: number) => `b${i + 1}`;
  const mgOf = (i: number) => Math.round(BAG[i]!.mgKg * Wc);
  const ampsOf = (mg: number) => Math.ceil(mg / S.ampouleMg);
  const mlHOf = (i: number) => r1(BAG[i]!.ml / (BAG[i]!.minutes / 60));
  const dueOfBag = (i: number) =>
    i === 0 ? c.start : T[keyOf(i - 1)] ? T[keyOf(i - 1)]! + BAG[i - 1]!.minutes * MS : null;
  const bagBtn = (i: number) => {
    const d = dueOfBag(i);
    return btn(
      fill(W.bagStarted, { n: i + 1 }),
      mark(keyOf(i)),
      "rn",
      d !== null && now >= d - S.startEarlyMinutes * MS ? "main" : undefined,
    );
  };
  const bagAct = (i: number): Step => {
    const b = BAG[i]!;
    const mg = mgOf(i);
    const d = dueOfBag(i);
    const up = T[keyOf(i)];
    const prevUp = i === 0 || !!T[keyOf(i - 1)];
    const x = A(
      {
        n: 1,
        title: fill(W.bag, { n: i + 1, mgkg: b.mgKg, d: K.dur(b.minutes * MS) }),
        sub: fill(W.bagSub, { ml: big(b.ml), d: K.dur(b.minutes * MS) }),
        rows: [
          row(
            W.rDose,
            Wc
              ? fill(W.doseIs, {
                  mg: big(mg),
                  ml: r1(mg / S.mgPerMl),
                  c: S.mgPerMl,
                  n: ampsOf(mg),
                })
              : W.needsWeight,
            "strong",
          ),
          row(W.rRate, fill(W.rateIs, { r: mlHOf(i) })),
          row(W.rDue, d !== null ? hh(d) : fill(W.afterBag, { n: i })),
        ],
        btns: [
          ...(i === 0 && treat ? K.ivBtn() : []),
          ...(treat && prevUp && !up && Wc ? [bagBtn(i)] : []),
        ],
        lines: up
          ? [L(fill(W.bagLine, { t: hh(up), e: hh(up + b.minutes * MS) }), "ok")]
          : i === 0
            ? [K.ivLine()]
            : [],
      },
      st(!!up, !!treat && prevUp && !up && d !== null && now >= d),
    );
    x.brief = up
      ? fill(W.startedBrief, { t: hh(up) })
      : treat
        ? fill(W.dueBrief, { t: d !== null ? hh(d) : W.later })
        : W.ifTreating;
    return x;
  };
  const g1 = bagAct(0);
  const g2 = { ...bagAct(1), n: 2 };
  const g3 = bagAct(2);
  if (!Wc) g1.fields = K.wtBits(W.weightWhy).fields;

  const reacting = !!T.react && !(T.restart && T.restart > T.react);
  const reactBtn = T.b1 && !reacting ? [btn(W.paused, mark("react"), "rn")] : [];
  const g4 = A(
    {
      n: 3,
      title: W.g4,
      sub: W.g4Sub,
      btns: reacting ? [btn(W.restart, mark("restart"), "dr", "main")] : reactBtn,
      lines: [
        reacting
          ? L(fill(W.pausedAt, { t: hh(T.react!) }), "alert")
          : T.react
            ? L(fill(W.reactionAt, { t: hh(T.react), r: hh(T.restart!) }), "ok")
            : L(W.noneSoFar),
      ],
    },
    st(!reacting, reacting),
  );
  g4.brief = reacting ? W.pausedBrief : T.react ? W.settled : W.none;

  // ─── End of bag 3 ───
  const E = S.end;
  const b3 = T[keyOf(2)];
  const b3end = b3 ? b3 + BAG[2]!.minutes * MS : null;
  const endNow = b3end !== null && now >= b3end - E.bloodsBeforeMinutes * MS;
  const altL = K.latest("alt");
  const inrL = K.latest("inr");
  const crL = K.latest("creat");
  const phL = K.latest("ph");
  const stillBad = (altL !== null && altL >= E.altFrom) || (inrL !== null && inrL > E.inrOver);
  const LU = S.liverUnit;
  const kings =
    (phL !== null && phL < LU.phUnder) ||
    (inrL !== null && inrL > LU.inrOver) ||
    (crL !== null && crL > LU.creatOver);
  const e1 = A(
    {
      n: 1,
      title: W.e1,
      sub: fill(W.e1Sub, { inr: E.inrOver, alt: E.altFrom }),
      fields: [
        fld("alt", W.alt, "U/L"),
        fld("inr", W.inr, ""),
        fld("creat", W.creat, "µmol/L"),
        fld("ph", W.ph, ""),
      ],
      branches: [
        br(
          fill(W.bBad, { inr: E.inrOver, alt: E.altFrom }),
          fill(W.bBadText, { h: E.repeatH }),
          endNow ? stillBad : false,
          endNow,
        ),
        br(W.bFit, W.bFitText, endNow ? !stillBad : false, endNow),
      ],
      btns: [
        ...(endNow
          ? stillBad
            ? T.ext
              ? []
              : [btn(W.extBtn, mark("ext"), "dr", "main")]
            : [...(T.mh ? [] : [btn(W.mhAsk, mark("mh"), "dr", "main")]), K.endBtn(W.short)]
          : []),
        ...(kings && !T.liver ? [btn(W.liverBtn, mark("liver"), "dr")] : []),
      ],
      lines: kings
        ? [L(fill(W.kings, { ph: LU.phUnder, inr: LU.inrOver, cr: LU.creatOver }), "alert")]
        : [],
    },
    st(!!T.mh || !!T.ext, kings || (endNow && stillBad && !T.ext)),
  );
  e1.brief = endNow
    ? stillBad
      ? W.continueBrief
      : W.fitBrief
    : b3end
      ? fill(W.bloodsAt, { t: hh(b3end - E.bloodsBeforeMinutes * MS) })
      : W.afterBag3;

  const running = (i: number) => {
    const t = T[keyOf(i)];
    return !!t && now < t + BAG[i]!.minutes * MS;
  };
  const rateNow = running(2)
    ? mlHOf(2)
    : running(1)
      ? mlHOf(1)
      : running(0)
        ? mlHOf(0)
        : T.ext
          ? mlHOf(2)
          : 0;
  const rn1 = A(
    {
      n: 1,
      head: W.rnHead,
      title: W.rnTitle,
      items: [
        it(
          W.iRunning,
          rateNow ? fill(W.rateIs, { r: rateNow }) : W.nothingRunning,
          rateNow ? W.on : W.off,
          rateNow ? "done" : "na",
        ),
        it(
          W.iReaction,
          W.iReactionSub,
          reacting ? W.pausedBrief : W.none,
          reacting ? "alert" : "na",
          reactBtn,
        ),
      ],
    },
    st(!reacting, reacting),
  );

  // ─── Monitoring chart ───
  const nextBag = BAG.findIndex((_, i) => !T[keyOf(i)]);
  const nbAt = nextBag >= 0 ? dueOfBag(nextBag) : null;
  const PH = S.phases;
  const slotH = K.slotMin / 60;
  const bloodsH = (totalMin - E.bloodsBeforeMinutes) / 60;
  const bloodsSlot = (totalMin - E.bloodsBeforeMinutes) / K.slotMin;
  const winOf = (i: number) =>
    PH[i]!.to === null
      ? fill(W.winEnd, { a: bloodsH, b: totalMin / 60 })
      : fill(W.win, { a: PH[i]!.from * slotH, b: PH[i]!.to! * slotH });
  const titles = [W.ph1, W.ph2, W.ph3, W.ph4];
  const acts = [[a1, a2, a3], [g1, g2, g4], [g3], [e1]];
  const flag = (lvl: Interp["lvl"], word: string): Interp => ({ lvl, word, text: "", ref: "" });
  const supply = supplyOf(rules, {
    ageYears: p.ageYears,
    sex: p.sex,
    weightKg: p.weightKg,
    pregnant: p.pregnant,
  });
  const totMgKg = BAG.reduce((a, b) => a + b.mgKg, 0);
  const fBag = (i: number) =>
    fill(W.fBag, { n: i + 1, mgkg: BAG[i]!.mgKg, d: K.dur(BAG[i]!.minutes * MS) });

  return {
    phases: PH.map((ph, i) => ({ ...ph, title: titles[i]!, win: winOf(i), acts: acts[i]! })),
    rn: { title: W.rnTitle, note: "", acts: [rn1] },
    flow: (F) => [
      F.P(PH[0]!.id),
      F.N(`${PH[0]!.id}1`, W.fWhen),
      F.N(`${PH[0]!.id}2`, W.fLevel),
      F.D(`${PH[0]!.id}3`, W.fTreat, [
        F.Br(W.yes, W.fYes, treat === true ? true : treat === false ? false : null),
        F.Br(W.fWait, fill(W.fWaitSub, { late: S.lateFromH, h: LN.atH }), wait ? true : null),
        F.Br(W.no, W.fFit, treat === false ? true : treat === true ? false : null),
      ]),
      F.P(PH[1]!.id),
      F.N(`${PH[1]!.id}1`, fBag(0)),
      F.D(`${PH[1]!.id}3`, W.fReaction, [
        F.Br(W.yes, W.fPause, T.react ? true : null),
        F.Br(W.no, W.fContinue, T.b1 && !T.react ? true : null),
      ]),
      F.N(`${PH[1]!.id}2`, fBag(1)),
      F.P(PH[2]!.id),
      F.N(`${PH[2]!.id}1`, fBag(2)),
      F.P(PH[3]!.id),
      F.D(`${PH[3]!.id}1`, fill(W.fEnd, { inr: E.inrOver, alt: E.altFrom }), [
        F.Br(W.yes, W.fExt, endNow ? stillBad : null),
        F.Br(W.no, W.fMh, endNow ? !stillBad : null),
      ]),
    ],
    tasks: (tk) => {
      if (treat && nextBag >= 0 && nbAt !== null && Wc)
        tk(
          `bag${nextBag + 1}`,
          fill(W.tBag, { n: nextBag + 1, mg: big(mgOf(nextBag)), ml: big(BAG[nextBag]!.ml) }),
          fill(W.tBagSub, { d: K.dur(BAG[nextBag]!.minutes * MS), r: mlHOf(nextBag) }),
          nbAt,
          [bagBtn(nextBag)],
        );
      if (b3end !== null && !T.ext && !T.mh)
        tk("bloods", W.tBloods, W.tBloodsSub, b3end - E.bloodsBeforeMinutes * MS, []);
    },
    rows: [
      ["rate", W.gRate],
      ["cbg", W.gCbg],
      ["react", W.gReact],
      ["alt", W.gAlt],
      ["inr", W.gInr],
    ],
    cellFlag: (key, x) => {
      const n = parseFloat(x);
      if (Number.isNaN(n)) return null;
      if (key === "react") return n >= 1 ? flag("abn", W.wYes) : null;
      if (key === "inr") return n > E.inrOver ? flag("abn", W.wHigh) : flag("ok", "");
      if (key === "alt")
        return n >= E.altFrom
          ? flag("abn", W.wHigh)
          : n >= S.abnormal.altFrom
            ? flag("abn", W.wRaised)
            : flag("ok", "");
      if (key === "cbg") return n < S.glucoseUnder ? flag("crit", W.wLow) : null;
      return null;
    },
    dueAt: (key, h) => key === "rate" || ((key === "alt" || key === "inr") && h === bloodsSlot),
    form: [
      { key: "rate", label: W.fmRate, unit: "ml/h", dflt: String(rateNow) },
      { key: "cbg", label: W.fmCbg, unit: "mmol/L", dflt: "" },
      { key: "react", label: W.fmReact, unit: "1/0", dflt: "0" },
      { key: "alt", label: W.alt, unit: "U/L", dflt: "", opt: K.nextH !== bloodsSlot },
      { key: "inr", label: W.inr, unit: "", dflt: "", opt: K.nextH !== bloodsSlot },
    ],
    formReq: ["rate", "cbg"],
    labKeys: ["cbg", "alt", "inr"],
    recWhat: (h) => W.recWhat + (h === bloodsSlot ? W.recBloods : ""),
    recHint: (h) => W.recHint + (h === bloodsSlot ? W.recHintBloods : ""),
    panels: [
      {
        key: "inr",
        name: W.pInr,
        unit: "",
        min: 0.8,
        max: 3,
        ticks: [1, 2, 3],
        thr: [[E.inrOver, fill(W.thrInr, { n: E.inrOver }), "amb"]],
        fmt: K.n1,
        bad: (x) => x > E.inrOver,
      },
      {
        key: "alt",
        name: W.pAlt,
        unit: "U/L",
        min: 0,
        max: 200,
        ticks: [0, 100, 200],
        thr: [[E.altFrom, fill(W.thrAlt, { n: E.altFrom }), "amb"]],
        bad: (x) => x >= E.altFrom,
      },
      {
        key: "cbg",
        name: W.pCbg,
        unit: "mmol/L",
        min: 0,
        max: 12,
        ticks: [0, 4, 8, 12],
        thr: [[S.glucoseUnder, fill(W.thrCbg, { n: S.glucoseUnder }), "amb"]],
        bad: (x) => x < S.glucoseUnder,
      },
    ],
    stats: [
      {
        k: W.sTaken,
        v: ingH !== null ? fill(W.hBefore, { h: ingH }) : "—",
        s: mgkg !== null ? fill(W.mgkgIs, { n: mgkg }) : "",
      },
      {
        k: W.sLevel,
        v: para !== null ? `${para} mg/L` : "—",
        s: line !== null ? fill(W.lineS, { l: line }) : fill(W.atOrLater, { h: LN.atH }),
        ...(above ? { cls: "warn" as const } : {}),
      },
      {
        k: W.sDecision,
        v: treat === true ? W.treatBrief : treat === false ? W.noBrief : wait ? W.wait : "—",
        s: "",
      },
      {
        k: W.sBag,
        v: b3
          ? fill(W.bagOf, { n: 3, of: 3 })
          : T.b2
            ? fill(W.bagOf, { n: 2, of: 3 })
            : T.b1
              ? fill(W.bagOf, { n: 1, of: 3 })
              : "—",
        s: rateNow ? fill(W.mlH, { r: rateNow }) : "",
      },
      {
        k: W.sInrAlt,
        v: `${inrL ?? "—"} / ${altL ?? "—"}`,
        s: W.atEnd,
        ...(stillBad ? { cls: "warn" as const } : {}),
      },
    ],
    aims: [
      {
        word: fill(W.aStart, { h: S.lateFromH }),
        ok: !!T.b1 && ingH !== null && ingH + (T.b1 - c.start) / HR <= S.lateFromH,
        known: !!T.b1,
      },
      { word: W.aNoGap, ok: !!b3, known: !!T.b1 },
      {
        word: fill(W.aInr, { n: E.inrOver }),
        ok: endNow && inrL !== null && inrL <= E.inrOver,
        known: endNow,
      },
    ],
    meds: supply.map((s) => ({ drug: s.drug, qty: s.qty ?? 0, why: s.doseText })),
    phRows: [
      row(
        W.phNac,
        Wc
          ? fill(W.phTotal, {
              mgkg: totMgKg,
              mg: big(Math.round(totMgKg * Wc)),
              n: ampsOf(Math.round(totMgKg * Wc)),
              bags: BAG.map((_, i) => fill(W.phBagN, { i: i + 1, n: ampsOf(mgOf(i)) })).join(", "),
            }) +
              (T.ext
                ? fill(W.phExt, {
                    h: totalMin / 60,
                    n: ampsOf(mgOf(2)),
                    e: BAG[2]!.minutes / 60,
                  })
                : "")
          : W.waitingWeight,
      ),
      row(W.phBags, fill(W.phBagsIs, { list: BAG.map((b) => big(b.ml)).join(", ") })),
      row(
        W.phNext,
        nextBag >= 0 && nbAt !== null
          ? fill(W.phNextBag, { n: nextBag + 1, t: hh(nbAt) })
          : b3end
            ? fill(W.phB3Ends, { t: hh(b3end) })
            : W.phWaiting,
      ),
    ],
    logWords: W.log,
  };
}
