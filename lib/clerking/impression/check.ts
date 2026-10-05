import type { Catalogue } from "../catalogue";
import type { ExamCatalogue } from "../exam/catalogue";
import type { AskTarget, Cond, DxCatalogue, DxProfile, RestrictedClass } from "./catalogue";

import { RESULT_CONCEPTS } from "../exam/context";
import { RESTRICTED_CLASSES } from "./catalogue";

/**
 * The diagnosis catalogue's cross-catalogue check (PROMPT-CLERKING-SUMMARY-IMPRESSION §6): every
 * id it names resolves in REF-DX-TERMS (with the v1.1 addendum), the history catalogue, the
 * examination catalogue or the test catalogue; and no restricted fact is evidence on a standard
 * diagnosis (the build's rule, enforced here too). Pure: the check script and the tests call it.
 */

export interface TermLite {
  id: string;
  sensitivity: string;
  restricted_class?: string | null;
}

export interface CheckInput {
  dx: DxCatalogue;
  cat: Catalogue;
  exam: ExamCatalogue;
  terms: readonly TermLite[];
  /** Test ids on the default menu (data/emr/test-catalogue.v1.json). */
  tests: ReadonlySet<string>;
  /** Source ids of the history and examination catalogues (the diagnosis catalogue adds its own). */
  otherSources: ReadonlySet<string>;
}

export interface CheckResult {
  problems: string[];
  /** Tests referenced but not on the menu (the addendum's; D-SI-27). */
  testsProposed: Set<string>;
  testsExisting: Set<string>;
}

const VITALS = new Set([
  "vs.bp",
  "vs.pulse",
  "vs.rr",
  "vs.spo2",
  "vs.temp",
  "vs.glucose",
  "vs.weight",
  "vs.height",
  "vs.waist",
  "vs.bmi",
  "vs.consciousness",
  "vs.muac",
]);
const SCORES = new Set(["gcs_total", "gcs_p", "amts"]);
/** Result ids of classifiers computed in code (lib/clerking/exam/classifiers.ts), for the one
 *  whose catalogue entry names none (D-SI-30). */
const CODE_RESULTS: Record<string, readonly string[]> = {
  inter_arm_difference: ["within", "repeat", "persistent"],
};

const isClass = (s: string | null | undefined): s is RestrictedClass =>
  (RESTRICTED_CLASSES as readonly string[]).includes(s ?? "");

export function dxCatalogueProblems(i: CheckInput): CheckResult {
  const { dx, cat, exam } = i;
  const problems: string[] = [];
  const testsProposed = new Set<string>();
  const testsExisting = new Set<string>();
  const terms = new Map(i.terms.map((t) => [t.id, t]));
  const profiles = new Set(dx.profiles.map((p) => p.id));
  const dxRefs = new Set(Object.keys(dx.data.reference_entries));
  const examRefs = new Set(Object.keys(exam.data.reference_entries));
  const histRefs = new Set(Object.keys(cat.data.reference_entries));
  const sources = new Set([...Object.keys(dx.data.sources), ...i.otherSources]);
  const past = new Map(cat.data.past_history.conditions.map((c) => [c.id, c]));
  const family = new Set(cat.data.family_history.conditions.map((c) => c.id));
  const picks = new Map(
    (cat.data.medicines.quick_picks as readonly { id: string; sensitivity?: string }[]).map((p) => [
      p.id,
      p,
    ]),
  );
  const social = cat.data.social_history as unknown as Record<string, unknown>;
  const socialOpts = (id: string): string[] | null => {
    const arr = (v: unknown) =>
      Array.isArray(v) ? (v as { id: string }[]).map((o) => o.id) : null;
    if (id === "tobacco") return arr((social.tobacco as { status?: unknown })?.status);
    if (id === "alcohol") return arr((social.alcohol as { pattern?: unknown })?.pattern);
    if (id === "travel") return arr((social.travel as { options?: unknown })?.options);
    if (id === "substances")
      return arr((social.other_substances as { options?: unknown })?.options);
    if (id === "occupation") return [];
    return arr(social[id]);
  };
  const classifiers = exam.data.classifiers as Record<string, { rules?: { result?: string }[] }>;
  const resultIds = (id: string): Set<string> | null => {
    const c = classifiers[id];
    if (!c) return null;
    const ids = new Set(CODE_RESULTS[id] ?? []);
    for (const r of JSON.stringify(c).matchAll(/"result":"([a-z0-9_]+)"/g)) ids.add(r[1]!);
    return ids;
  };
  // EC-2: past-history details (condition → property → option ids; a year has none).
  const details = (cat.data.past_history as { condition_details?: unknown }).condition_details as
    | Record<
        string,
        { properties: { id: string; options?: { id: string }[]; options_ref?: string }[] }
      >
    | undefined;
  const detailOptions = (cond: string, prop: string): Set<string> | null => {
    const p = details?.[cond]?.properties.find((x) => x.id === prop);
    if (!p) return null;
    const opts = p.options ?? (p.options_ref ? cat.data.option_sets[p.options_ref] : []) ?? [];
    return new Set(opts.map((o) => o.id));
  };
  const panels = (exam.data.vital_signs.panels ?? []) as {
    id: string;
    fields?: (string | { id: string; options?: { id: string }[] })[];
  }[];
  const glucoseContexts = new Set(
    exam.data.vital_signs.fields.find((f) => f.id === "vs.glucose")?.qualifiers?.context ?? [],
  );
  const grids = {
    power: new Set(exam.grids.power.map((r) => r.movement)),
    reflex: new Set(exam.grids.reflexes.map((r) => r.reflex)),
    pulses: new Set(exam.grids.pulses),
    plantar: new Set(["plantars"]),
  } as Record<string, Set<string>>;

  const ref = (where: string, id: unknown) => {
    const r = String(id);
    const base = r.split(".")[0]!;
    const ok = r.startsWith("REF-DX-")
      ? dxRefs.has(r)
      : r.startsWith("REF-EX-")
        ? examRefs.has(base)
        : r.startsWith("REF-FLAG-")
          ? histRefs.has(r)
          : false;
    if (!ok) problems.push(`${where}: unknown reference ${r}`);
  };
  const option = (where: string, item: string, attribute: string | undefined, opts: unknown) => {
    const it = exam.item(item);
    if (!it) return;
    const known = new Set<string>();
    if (attribute) {
      const a = exam.attribute(item, attribute);
      if (!a) {
        problems.push(`${where}: unknown attribute ${item}.${attribute}`);
        return;
      }
      for (const o of a.options ?? []) known.add(o.id);
      for (const z of a.kind === "zones" ? exam.zones(a) : []) known.add(z.id);
      if (a.kind === "shared" && a.shared_with)
        for (const o of exam.attribute(a.shared_with.item, a.shared_with.attribute)?.options ?? [])
          known.add(o.id);
    } else if (it.response.type === "choice") for (const o of it.response.options) known.add(o.id);
    if (!known.size) return; // numbers, text: nothing to resolve
    for (const o of Array.isArray(opts) ? opts : [opts])
      if (typeof o === "string" && !known.has(o))
        problems.push(`${where}: unknown option ${item}${attribute ? `.${attribute}` : ""}=${o}`);
  };

  const atom = (where: string, c: Cond) => {
    if ("all" in c || "any" in c) {
      for (const y of (c.all ?? c.any) as Cond[]) atom(where, y);
      return;
    }
    if ("not" in c) return atom(where, c.not as Cond);
    for (const [k, v] of Object.entries(c))
      if (/_ref$|^ref$|^value_ref$/.test(k) || (typeof v === "string" && /^REF-/.test(v)))
        ref(where, v);
    if ("symptom" in c) {
      const s = cat.symptom(String(c.symptom));
      if (!s) problems.push(`${where}: unknown symptom ${c.symptom}`);
      else if ("red_flag" in c && !s.red_flags.some((f) => f.id === c.red_flag))
        problems.push(`${where}: unknown red flag ${c.symptom}#${c.red_flag}`);
    } else if ("past_condition" in c) {
      if (!past.has(String(c.past_condition)))
        problems.push(`${where}: unknown past condition ${c.past_condition}`);
    } else if ("family_condition" in c) {
      if (!family.has(String(c.family_condition)))
        problems.push(`${where}: unknown family condition ${c.family_condition}`);
    } else if ("medicine" in c) {
      if (!picks.has(String(c.medicine))) problems.push(`${where}: unknown medicine ${c.medicine}`);
      if (c.answer !== "taking" && c.answer !== "not_taking")
        problems.push(`${where}: medicine answer ${String(c.answer)}`);
    } else if ("social" in c) {
      const o = socialOpts(String(c.social));
      if (!o) problems.push(`${where}: unknown social item ${c.social}`);
      else
        for (const x of c.any_of as string[])
          if (!o.includes(x)) problems.push(`${where}: unknown social option ${c.social}=${x}`);
    } else if ("finding" in c || "item" in c) {
      const id = String(c.finding ?? c.item);
      if (!exam.item(id)) problems.push(`${where}: unknown item ${id}`);
      else if ("item" in c)
        option(
          where,
          id,
          c.attribute as string | undefined,
          c.any_of ?? c.includes_any ?? c.equals,
        );
    } else if ("classifier" in c) {
      const r = resultIds(String(c.classifier));
      if (!r) problems.push(`${where}: unknown classifier ${c.classifier}`);
      else
        for (const x of c.any_of as string[])
          if (r.size && !r.has(x)) problems.push(`${where}: unknown result ${c.classifier}=${x}`);
    } else if ("score" in c) {
      if (!SCORES.has(String(c.score)) && !classifiers[String(c.score)])
        problems.push(`${where}: unknown score ${c.score}`);
    } else if ("vital" in c) {
      if (!VITALS.has(String(c.vital))) problems.push(`${where}: unknown vital ${c.vital}`);
      if ("context" in c && (c.vital !== "vs.glucose" || !glucoseContexts.has(String(c.context))))
        problems.push(`${where}: unknown context ${c.vital}(${c.context})`);
    } else if ("grid" in c) {
      const g = grids[String(c.grid)];
      if (!g) problems.push(`${where}: unknown grid ${c.grid}`);
      else if (Array.isArray(c.rows))
        for (const r of c.rows as string[])
          if (!g.has(r)) problems.push(`${where}: unknown ${c.grid} row ${r}`);
    } else if ("result" in c) {
      if (!(RESULT_CONCEPTS as readonly string[]).includes(String(c.result)))
        problems.push(`${where}: unknown result concept ${c.result}`);
      if (!["gte_ref", "gt_ref", "lt_ref", "lte_ref"].some((k) => k in c))
        problems.push(`${where}: result atom without a limit`);
    } else if ("pregnancy" in c) {
      if (!["current", "not_pregnant", "unknown"].includes(String(c.pregnancy)))
        problems.push(`${where}: unknown pregnancy state ${c.pregnancy}`);
    } else if ("past_detail" in c) {
      const opts = detailOptions(String(c.past_detail), String(c.property));
      if (!opts) problems.push(`${where}: unknown past detail ${c.past_detail}#${c.property}`);
      else
        for (const o of [c.equals, ...((c.any_of ?? c.includes_any ?? []) as unknown[])])
          if (typeof o === "string" && !opts.has(o))
            problems.push(`${where}: unknown option ${c.past_detail}#${c.property}=${o}`);
    } else if ("medicine_group" in c) {
      if (!exam.data.medicine_groups?.[String(c.medicine_group)])
        problems.push(`${where}: unknown medicine group ${c.medicine_group}`);
    } else if ("derived" in c) {
      if (!["iwgdf_risk.lops", "iwgdf_risk.pad"].includes(String(c.derived)))
        problems.push(`${where}: unknown derived fact ${c.derived}`);
    } else if ("setting" in c) {
      const ok = Array.isArray(c.setting)
        ? c.setting.every((s) => typeof s === "string")
        : c.setting === "outbreak_mode";
      if (!ok) problems.push(`${where}: unknown setting ${JSON.stringify(c.setting)}`);
    } else if ("panel" in c) {
      const pn = panels.find((p) => p.id === c.panel);
      if (!pn || (c.panel !== "vs.both_arms" && c.panel !== "vs.ketones"))
        problems.push(`${where}: unknown panel ${c.panel}`);
      else if ("field" in c) {
        const f = pn.fields?.find((x) => typeof x === "object" && x.id === c.field) as
          | { options?: { id: string }[] }
          | undefined;
        if (!f) problems.push(`${where}: unknown panel field ${c.panel}.${c.field}`);
        else
          for (const o of (c.any_of ?? []) as string[])
            if (!f.options?.some((x) => x.id === o))
              problems.push(`${where}: unknown option ${c.panel}.${c.field}=${o}`);
      }
    } else if ("patient" in c) {
      if (!["age_gte", "age_lt", "sex"].includes(String(c.patient)))
        problems.push(`${where}: unknown patient atom ${c.patient}`);
    } else if ("news2_total" in c) {
      if (c.news2_total !== "gte_ref")
        problems.push(`${where}: unknown news2_total ${c.news2_total}`);
    } else if (!("always" in c)) problems.push(`${where}: unknown atom ${JSON.stringify(c)}`);
  };

  /** The restricted class of the fact an atom reads (null: standard). */
  const factClass = (c: Cond): RestrictedClass[] => {
    if ("all" in c || "any" in c) return ((c.all ?? c.any) as Cond[]).flatMap(factClass);
    if ("not" in c) return factClass(c.not as Cond);
    const out: string[] = [];
    if ("symptom" in c) {
      const s = cat.symptom(String(c.symptom));
      out.push(s?.sensitivity ?? "");
      if ("red_flag" in c)
        out.push(s?.red_flags.find((f) => f.id === c.red_flag)?.sensitivity ?? "");
    } else if ("past_condition" in c || "past_detail" in c)
      out.push(past.get(String(c.past_condition ?? c.past_detail))?.sensitivity ?? "");
    else if ("medicine" in c) out.push(picks.get(String(c.medicine))?.sensitivity ?? "");
    else if ("social" in c && c.social === "substances")
      out.push((social.other_substances as { sensitivity?: string })?.sensitivity ?? "");
    else if ("finding" in c || "item" in c) {
      const it = exam.item(String(c.finding ?? c.item));
      out.push(it?.sensitivity ?? "");
      const a = "attribute" in c ? exam.attribute(String(c.item), String(c.attribute)) : undefined;
      for (const o of a?.options ?? [])
        if (
          (c.any_of as string[] | undefined)?.includes(o.id) ||
          (c.includes_any as string[] | undefined)?.includes(o.id)
        )
          out.push(o.sensitivity ?? "");
    }
    return out.filter(isClass);
  };

  const ask = (where: string, a: AskTarget) => {
    switch (a.kind) {
      case "symptom":
        return atom(where, { symptom: a.id, answer: "yes" });
      case "red_flag":
        return atom(where, { symptom: a.symptom, red_flag: a.red_flag });
      case "past_condition":
        return atom(where, { past_condition: a.id, answer: "yes" });
      case "family_condition":
        return atom(where, { family_condition: a.id, answer: "yes" });
      case "medicine":
        return atom(where, { medicine: a.id, answer: "taking" });
      case "social":
        if (!socialOpts(a.id)) problems.push(`${where}: unknown social item ${a.id}`);
        return;
      case "exam_item":
        if (!exam.item(a.id)) problems.push(`${where}: unknown item ${a.id}`);
        return;
      case "vital":
        if (!VITALS.has(a.id)) problems.push(`${where}: unknown vital ${a.id}`);
        return;
      case "classifier":
        if (!classifiers[a.id]) problems.push(`${where}: unknown classifier ${a.id}`);
        return;
      case "panel":
        if (!panels.some((p) => p.id === a.id)) problems.push(`${where}: unknown panel ${a.id}`);
        return;
      case "past_detail": {
        const [cond, prop] = a.id.split(".");
        if (!detailOptions(cond!, prop!)) problems.push(`${where}: unknown past detail ${a.id}`);
        return;
      }
    }
  };

  const profile = (p: DxProfile) => {
    const w = p.id;
    const t = terms.get(p.id);
    if (!t) problems.push(`${w}: not in REF-DX-TERMS or the v1.1 addendum`);
    else {
      const termClass = t.restricted_class ?? null;
      const restricted = t.sensitivity === "restricted";
      if (restricted !== (p.restricted_class !== null))
        problems.push(
          `${w}: restricted_class ${p.restricted_class} but the term is ${t.sensitivity}`,
        );
      if (termClass && termClass !== p.restricted_class)
        problems.push(
          `${w}: restricted_class ${p.restricted_class} but the term says ${termClass}`,
        );
    }
    if (!p.onset.allowed.includes(p.onset.default))
      problems.push(`${w}: default onset not allowed`);
    for (const [n, e] of [...p.suggest_for, ...p.suggest_against].entries()) {
      atom(`${w} evidence ${n + 1}`, e.atom);
      // A restricted fact is never evidence on a standard diagnosis (CATALOGUE-REVIEW §2.5).
      if (p.restricted_class === null) {
        const leak = factClass(e.atom);
        if (leak.length)
          problems.push(
            `${w}: restricted fact (${leak.join(", ")}) as evidence on a standard diagnosis`,
          );
      }
    }
    for (const a of p.ask) ask(`${w} ask`, a);
    for (const id of p.tests_to_decide) (i.tests.has(id) ? testsExisting : testsProposed).add(id);
    for (const id of p.related) if (!profiles.has(id)) problems.push(`${w}: unknown related ${id}`);
    if (p.requires) atom(`${w} requires`, p.requires);
    if (p.severity.kind === "named_scale" && !dx.scale(p.severity.id))
      problems.push(`${w}: unknown named scale ${p.severity.id}`);
    if (
      p.severity.kind === "classifier" &&
      !classifiers[p.severity.id] &&
      !SCORES.has(p.severity.id)
    )
      problems.push(`${w}: unknown classifier ${p.severity.id}`);
    for (const s of p.sources) if (!sources.has(s)) problems.push(`${w}: unknown source ${s}`);
  };
  for (const p of dx.profiles) profile(p);

  for (const r of dx.rules) {
    atom(r.id, r.when);
    for (const id of r.suggest)
      if (!profiles.has(id)) problems.push(`${r.id}: unknown diagnosis ${id}`);
    for (const id of r.must_not_miss_first)
      if (!r.suggest.includes(id))
        problems.push(`${r.id}: must_not_miss_first ${id} not in suggest`);
    if (!sources.has(r.source)) problems.push(`${r.id}: unknown source ${r.source}`);
  }
  for (const [id, e] of Object.entries(dx.data.reference_entries)) {
    // An entry with no source or no value is a product setting awaiting the CSO (D-DM-08).
    if (e.source === null || e.value === null) {
      if (e.status !== "needs-cso") problems.push(`${id}: no source or value, not needs-cso`);
    } else if (!sources.has(e.source)) problems.push(`${id}: unknown source ${e.source}`);
  }
  const sexRule = dx.data.engine_rules.sex_specific;
  for (const id of [...sexRule.female_only, ...sexRule.male_only])
    if (!profiles.has(id)) problems.push(`sex_specific: unknown diagnosis ${id}`);
  return { problems, testsProposed, testsExisting };
}
