/**
 * The diabetes pack's protocol evaluator: pure, deterministic, no I/O, no clinical
 * content. A line-for-line port of the pack's reference evaluator
 * (`docs/ncd/diabetes/pack-0.3.0-draft/tools/build/build.py`, `run_vignette`), which
 * is the specification; `tests/ncd/pack-parity.test.ts` proves the two agree on every
 * golden patient, and `tests/ncd/pack-grid.test.ts` re-runs the escalation floor
 * (D-DM-41). Semantics in brief (the pack's `semantics` block says them in full):
 *
 *   - four states; AND: not_met > unavailable > insufficient > met;
 *     OR: met > insufficient > unavailable > not_met; atLeast counts honestly;
 *   - a blocking validity caveat acts by its direction, never on the acute lane;
 *   - `notWhen` stands an item down, `enabled: false` keeps it dark (reported, never shown);
 *   - adult is 16 and over by numeric age; under 16, recognition and referral only;
 *   - an unanswered pregnancy is never 'not pregnant' where an item depends on it;
 *   - one interrupt per event, headed by `acuteOrder`, the rest folded inside it.
 *
 * Shadow only (I10): nothing here is shown to a clinician until the CSO signs go-live.
 */
import type {
  DiabetesPack,
  ItemState,
  PackCriterion,
  PackInput,
  PackPredicate,
  PackResult,
  PackSite,
  PackValue,
  PackValues,
  PackX,
  State,
} from "@/lib/ncd/pack/types";

const MET: State = "met";
const NOT: State = "not_met";
const INS: State = "insufficient";
const UNA: State = "unavailable";

type Site = "ALL" | string[];

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function siteOf(pack: DiabetesPack, site: PackSite): Site {
  if (site === "referral") return "ALL";
  if (site === "district") return pack.districtCapabilities;
  return site;
}

const capable = (site: Site, cap: string) => site === "ALL" || site.includes(cap);

export function predicatesOf(c: PackCriterion): PackPredicate[] {
  return [...(c.all ?? []), ...(c.any ?? []), ...(c.atLeast?.of ?? [])];
}

function truthy(v: PackValue): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v !== "none" && v !== "neg";
  return v !== null && v !== undefined;
}

function compare(op: string, v: PackValue, t: PackPredicate["value"]): boolean {
  if (Array.isArray(v)) {
    if (op === "==") return v.includes(t as string);
    if (op === "!=") return !v.includes(t as string);
    if (op === "in") return (Array.isArray(t) ? t : [t]).some((x) => v.includes(x as string));
    throw new Error(`operator ${op} on a multi-select`);
  }
  switch (op) {
    case "==":
      return v === t;
    case "!=":
      return v !== t;
    case "in":
      return Array.isArray(t) ? (t as PackValue[]).includes(v) : String(t).includes(String(v));
    case ">=":
      return (v as number) >= (t as number);
    case ">":
      return (v as number) > (t as number);
    case "<=":
      return (v as number) <= (t as number);
    case "<":
      return (v as number) < (t as number);
    default:
      throw new Error(`unknown operator ${op}`);
  }
}

export function and(sts: State[]): State {
  if (sts.includes(NOT)) return NOT;
  if (sts.includes(UNA)) return UNA;
  if (sts.includes(INS)) return INS;
  return MET;
}

export function or(sts: State[]): State {
  if (sts.includes(MET)) return MET;
  if (sts.includes(INS)) return INS;
  if (sts.includes(UNA)) return UNA;
  return NOT;
}

export function atLeast(sts: State[], n: number): State {
  const m = sts.filter((s) => s === MET).length;
  const i = sts.filter((s) => s === INS).length;
  const u = sts.filter((s) => s === UNA).length;
  return m >= n ? MET : m + i + u < n ? NOT : m + i >= n ? INS : UNA;
}

/** One evaluation context: the pack, the values, the site. */
class Ctx {
  constructor(
    readonly pack: DiabetesPack,
    readonly values: PackValues,
    readonly site: Site,
  ) {}

  vstate(code: string): ["recorded", PackValue] | ["unavailable" | "not_assessed", null] {
    if (has(this.values, code)) return ["recorded", this.values[code]!];
    const cap = this.pack.features[code]?.requires;
    if (cap && !capable(this.site, cap)) return ["unavailable", null];
    return ["not_assessed", null];
  }

  pred(
    p: PackPredicate,
    blocked: ReadonlySet<string> = EMPTY,
    values: PackValues = this.values,
  ): State {
    const ctx = values === this.values ? this : new Ctx(this.pack, values, this.site);
    const [st, v] = ctx.vstate(p.feature);
    if (st !== "recorded") return st === "unavailable" ? UNA : INS;
    if (blocked.has(p.feature)) return INS;
    if (p.op === "recorded") return MET;
    if (p.op === "present") return truthy(v) ? MET : NOT;
    if (p.op === "absent") return !truthy(v) ? MET : NOT;
    return compare(p.op, v, p.value) ? MET : NOT;
  }

  crit(
    c: PackCriterion,
    blocked: ReadonlySet<string> = EMPTY,
    values: PackValues = this.values,
  ): State {
    const groups: State[] = [];
    if (c.all?.length) groups.push(and(c.all.map((p) => this.pred(p, blocked, values))));
    if (c.any?.length) groups.push(or(c.any.map((p) => this.pred(p, blocked, values))));
    if (c.atLeast)
      groups.push(
        atLeast(
          c.atLeast.of.map((p) => this.pred(p, blocked, values)),
          c.atLeast.n,
        ),
      );
    return and(groups);
  }
}
const EMPTY: ReadonlySet<string> = new Set();

export function pregnancyState(values: PackValues, band: string): PackResult["pregnancyState"] {
  if (values.pregnant === true) return "pregnant";
  if (
    values.pregnant === false ||
    values.sex === "male" ||
    values.pregnancy_possible === false ||
    ["neonate", "infant", "child"].includes(band)
  )
    return "not_pregnant";
  return "unknown";
}

/** The band the evaluator uses: a recorded numeric age wins over the display band (P0-01, U12, V16). */
export function effectiveBand(band: string, age: PackValue | undefined): string {
  if (typeof age !== "number") return band;
  if (age < 16 && (band === "adult" || band === "older_adult"))
    return age >= 10 ? "adolescent" : "child";
  if (age >= 16 && (band === "child" || band === "adolescent")) return "adult";
  if (age >= 10 && age < 16 && band === "child") return "adolescent";
  return band;
}

export function runProtocol(pack: DiabetesPack, input: PackInput): PackResult {
  const vals = input.values;
  const site = siteOf(pack, input.site);
  const est = input.established;
  const band = effectiveBand(input.ageBand, vals.age_years);
  const adult = band === "adult" || band === "older_adult";
  const cx = new Ctx(pack, vals, site);
  const suppressed = (x: PackX) => (x.notWhen ?? []).some((k) => cx.crit(k) === MET);

  const metCav = pack.validityCaveats.filter((c) => cx.crit(c.when) === MET && !suppressed(c.x));
  const caveats = metCav.filter((c) => c.blocksDiagnosis || has(vals, c.feature));
  const blocking = caveats.filter((c) => c.blocksDiagnosis);
  const blockedAny = new Set(blocking.map((c) => c.feature));
  const blockedPos = new Set(
    blocking
      .filter((c) => c.direction === "manufactures" || c.direction === "unpredictable")
      .map((c) => c.feature),
  );
  const blockedNeg = new Set(
    blocking
      .filter((c) => c.direction === "masks" || c.direction === "unpredictable")
      .map((c) => c.feature),
  );
  const reads = (c: PackCriterion, feats: ReadonlySet<string>) =>
    predicatesOf(c).some((p) => feats.has(p.feature));
  const guarded = (c: PackCriterion, s: State, dx = false): State => {
    if (s === MET && reads(c, dx ? blockedAny : blockedPos)) return INS;
    if (s === NOT && reads(c, blockedNeg)) return INS;
    return s;
  };
  const hiddenBy = (c: PackCriterion) =>
    [...new Set(predicatesOf(c).map((p) => p.feature))].filter((f) => blockedAny.has(f)).sort();
  const ps = pregnancyState(vals, band);
  const applies = (x: PackX): boolean | null => {
    const a = x.appliesTo?.pregnancy;
    if (a === undefined || a === null || a === "any") return true;
    return ps === "unknown" ? null : a === ps;
  };
  const agesOk = (x: PackX) => adult || x.ages !== "adult";
  const siteOk = (x: PackX) => !x.requiresCapability || capable(site, x.requiresCapability);

  const res: PackResult = {
    caveats: caveats.map((c) => c.id),
    fired: {},
    dark: {},
    states: {},
    diagnosis: {},
    criteria: {},
    blockedCriteria: [],
    unavailableFeatures: [],
    complications: {},
    stages: {},
    risk: {},
    targets: [],
    bands: {},
    bandsBlocked: [],
    classification: {},
    restricted: [],
    stepsFired: [],
    cautions: {},
    gaps: {},
    urgency: {},
    withheld: [],
    metViaUnknown: {},
    interrupt: null,
    foldedInto: {},
    interruptActions: [],
    actionOverride: {},
    pregnancyState: ps,
  };
  const unavailable = new Set<string>();
  const restricted = new Set<string>();
  const gap = (id: string, items: string[]) => {
    (res.gaps[id] ??= []).push(...items);
  };

  for (const cs of [...pack.diagnosis, ...pack.diagnosisPending]) {
    const ap = applies(cs.x);
    if (ap === false || (cs.x.appliesTo.runWhen === "established") !== est) {
      res.diagnosis[cs.id] = "not_applicable";
      continue;
    }
    if (ap === null) {
      res.diagnosis[cs.id] = INS;
      gap(cs.id, ["pregnant"]);
      continue;
    }
    const sts: State[] = [];
    for (const c of cs.anyOf) {
      const raw = cx.crit(c);
      res.criteria[c.id] = raw;
      for (const p of predicatesOf(c))
        if (cx.vstate(p.feature)[0] === "unavailable") unavailable.add(p.feature);
      const s = guarded(c, raw, true);
      if (raw === MET && s === INS) res.blockedCriteria.push(c.id);
      sts.push(s);
    }
    let d = sts.length ? or(sts) : INS;
    if (d === MET && suppressed(cs.x)) d = NOT;
    res.diagnosis[cs.id] = d;
  }
  for (const c of pack.complicationAmendmentCriteria) res.criteria[c.id] = guarded(c, cx.crit(c));

  const setById = (id: string) =>
    [...pack.diagnosis, ...pack.diagnosisPending].find((c) => c.id === id)!;
  const metIgnoringPregnancy = (id: string) => {
    const cs = setById(id);
    return or(cs.anyOf.map((c) => guarded(c, cx.crit(c), true))) === MET && !suppressed(cs.x);
  };
  const metNow = ["who_hearts_d_2020", "ug_ucg_2023"].some(
    (id) => res.diagnosis[id] === MET || (ps === "unknown" && metIgnoringPregnancy(id)),
  );
  const gate = (rw?: string) =>
    (
      ({
        always: true,
        established: est,
        not_established: !est,
        established_or_met: est || metNow,
        newly_met: !est && metNow,
      }) as Record<string, boolean>
    )[rw ?? "always"];

  const fire = (
    item: { id: string; x: PackX },
    kind: "rule" | "step" | "therapyFlag",
    state: ItemState,
  ): ItemState => {
    if (state === MET && suppressed(item.x)) state = "suppressed";
    if (state === MET && !siteOk(item.x)) state = "unavailable_here";
    res.states[item.id] = state;
    if (state === MET) {
      if (item.x.enabled === false) {
        res.dark[item.id] = item.x.enabledBy;
        return "dark";
      }
      res.fired[item.id] = kind;
      for (const rc of item.x.restrictedClasses ?? []) restricted.add(rc);
    }
    return state;
  };

  for (const r of pack.rules) {
    if (!gate(r.x.runWhen)) continue;
    if (r.ageBands?.length && !r.ageBands.includes(band)) continue;
    if (r.x.unlessCapability && capable(site, r.x.unlessCapability)) continue;
    let st: State = cx.crit(r.when);
    let via: string | null = null;
    if (r.x.lane !== "acute_route") {
      const g = guarded(r.when, st);
      if (st === MET && g !== MET) gap(r.id, hiddenBy(r.when));
      st = g;
    }
    if (st !== MET && r.x.pregnancyUnknownCounts) {
      let alt: [PackValues, string] | null = null;
      if (ps === "unknown") alt = [{ ...vals, pregnant: true }, "pregnant"];
      else if (
        vals.pregnant === false &&
        !has(vals, "postpartum_weeks") &&
        vals.sex === "female" &&
        vals.pregnancy_possible !== false &&
        !["neonate", "infant", "child"].includes(band)
      )
        alt = [{ ...vals, postpartum_weeks: 0 }, "postpartum_weeks"];
      if (alt && cx.crit(r.when, EMPTY, alt[0]) === MET) {
        st = MET;
        via = alt[1];
      }
    }
    if (fire(r, "rule", st) === MET) {
      res.urgency[r.id] = via ? (r.x.unknownUrgency ?? r.urgency) : r.urgency;
      if (via) {
        gap(r.id, [via]);
        res.metViaUnknown[r.id] = via;
      }
    }
  }

  for (const s of pack.management) {
    if (!gate(s.x.runWhen) || !agesOk(s.x)) continue;
    const held = pack.heldKinds.includes(s.x.kind ?? "") && !s.x.lessTreatment;
    let st: ItemState = cx.crit(s.when, held ? blockedAny : EMPTY);
    if (!held && !s.x.lessTreatment && (s.x.kind !== "refer" || s.x.urgency === "routine")) {
      const g = guarded(s.when, st as State);
      if (st === MET && g !== MET) gap(s.id, hiddenBy(s.when));
      st = g;
    }
    if (st === MET && s.x.measures && blockedAny.has(s.x.measures)) {
      gap(s.id, [`${s.x.measures} not valid for this patient: use the caveat's alternative`]);
      st = "blocked_by_caveat";
    }
    if (held && st !== MET && cx.crit(s.when) === MET) gap(s.id, hiddenBy(s.when));
    if (st === MET && (s.contraindications ?? []).some((k) => cx.crit(k) === MET))
      st = "contraindicated";
    const ap = applies(s.x);
    if (ap === null) {
      if (st === MET && !suppressed(s.x) && s.x.enabled !== false) res.withheld.push(s.id);
      continue;
    }
    if (!ap) continue;
    if (fire(s, "step", st) === MET) {
      res.stepsFired.push(s.id);
      res.urgency[s.id] = s.x.urgency ?? "routine";
      const cz = (s.x.cautions ?? []).filter((k) => cx.crit(k) === MET).map((k) => k.id);
      const gz = (s.x.needsBeforeActing ?? [])
        .filter((g) => !has(vals, g.feature))
        .map((g) => g.feature);
      if (cz.length) res.cautions[s.id] = cz;
      if (gz.length) res.gaps[s.id] = gz;
    }
  }

  for (const t of pack.therapyFlags) {
    if (
      agesOk(t.x) &&
      fire(t, "therapyFlag", cx.crit(t.when)) === MET &&
      !adult &&
      t.x.under16Action
    )
      res.actionOverride[t.id] = t.x.under16Action;
  }
  for (const c of caveats) for (const rc of c.x.restrictedClasses ?? []) restricted.add(rc);

  if (est) {
    for (const c of pack.complications) {
      let d = or(c.establishedBy.map((k) => guarded(k, cx.crit(k))));
      const nr = c.x.notMetRequires;
      if (d === NOT && nr && cx.crit(nr) !== MET) d = INS;
      res.complications[c.code] = d;
      for (const st of c.staging ?? []) {
        for (const sg of st.stages) {
          if (cx.crit(sg.when) === MET) {
            const neg = sg.severity === "none";
            if (
              !reads(sg.when, neg ? blockedNeg : blockedPos) &&
              !(neg && nr && cx.crit(nr) !== MET)
            )
              res.stages[st.id] = sg.code;
            break;
          }
        }
      }
    }
    for (const t of pack.targets) {
      if (!(agesOk(t.x) && guarded(t.when, cx.crit(t.when)) === MET && !suppressed(t.x))) continue;
      if (blockedAny.has(t.measure)) continue;
      const ap = applies(t.x);
      if (ap === null) res.withheld.push(t.id);
      else if (ap) res.targets.push(t.id);
    }
    for (const c of pack.classifications) {
      let d = or(c.supportedBy.map((k) => guarded(k, cx.crit(k))));
      if (d === NOT && c.x.neverNotMet) d = INS;
      res.classification[c.code] = d;
    }
  }
  const sup = new Set(
    pack.targets.filter((t) => res.targets.includes(t.id)).flatMap((t) => t.x.supersedes ?? []),
  );
  res.targets = res.targets.filter((t) => !sup.has(t));

  const order = (k: string) => {
    const i = pack.acuteOrder.indexOf(k);
    return i < 0 ? pack.acuteOrder.length : i;
  };
  const imm = Object.keys(res.fired)
    .filter((k) => res.urgency[k] === "immediate")
    .sort(
      (a, b) =>
        Number(a in res.metViaUnknown) - Number(b in res.metViaUnknown) || order(a) - order(b),
    );
  res.interrupt = imm[0] ?? null;
  const rulesById = new Map(pack.rules.map((r) => [r.id, r]));
  res.interruptActions = imm.map((k) => {
    const r = rulesById.get(k);
    if (!r) return k;
    return k in res.metViaUnknown ? r.x.unknownDisplays![res.metViaUnknown[k]!]! : r.display;
  });
  for (const k of imm.slice(1)) {
    res.urgency[k] = "folded";
    res.foldedInto[k] = imm[0]!;
  }

  for (const m of pack.riskModels) {
    if (!agesOk(m.x)) continue;
    if ((m.x.mustHave ?? []).some((f) => !has(vals, f)) || suppressed(m.x)) continue;
    for (const b of m.bands)
      if (cx.crit(b.when) === MET) {
        res.risk[m.id] = b.code;
        break;
      }
  }
  for (const t of pack.interpretation) {
    if (!has(vals, t.feature) || !agesOk(t.x)) continue;
    if (t.x.lane === "stratify" && !est) continue;
    if (!applies(t.x)) continue;
    if (t.when && cx.pred(t.when) !== MET) continue;
    if (blockedAny.has(t.feature)) {
      res.bandsBlocked.push(t.id);
      continue;
    }
    const noTarget = !!t.x.forTarget && !res.targets.includes(t.x.forTarget);
    const x = vals[t.feature] as number;
    for (const b of t.bands) {
      if ((b.from === undefined || x >= b.from) && (b.to === undefined || x < b.to)) {
        if (!noTarget || b.code === "low" || b.tone === "low") res.bands[t.id] = b.code;
        break;
      }
    }
  }
  res.unavailableFeatures = [...unavailable].sort();
  res.restricted = [...restricted].sort();
  return res;
}
