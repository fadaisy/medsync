import type { Flag } from "../flags";
import type { ExamFlagRule } from "./catalogue";
import type { ClassifierResult, ExamSignoff } from "./classifiers";
import type { DerivedReader, ExamContext } from "./context";

import { entryOf, readAttr } from "./answers";
import { classifyAll, footFacts } from "./classifiers";
import { evalCond } from "./context";
import { acvpuOf, amts, gcsTotal, mrcNumber } from "./scores";

/**
 * Examination flags (PROMPT-CLERKING-EXAM-V2 §7 flags.ts, §5.13): the catalogue's rules over the
 * examination and history atoms, evaluated like v2's (a rule fires only when it and every
 * reference it names are signed and not withheld). Badges name a finding, a value or a named
 * scale with its result (E5); the reason says why. Output is v2's `Flag`, so the Flags panel
 * merges them with the history's. Pure.
 */

export function examRuleIsLive(r: ExamFlagRule, s: ExamSignoff): boolean {
  const signed = (list: "all" | string[], id: string) => list === "all" || list.includes(id);
  if (!signed(s.flagRules, r.id) || s.withheld.includes(r.id)) return false;
  const refs = [...new Set(JSON.stringify(r.when).match(/REF-EX-[A-Z0-9-]+/g) ?? [])];
  return refs.every((ref) => signed(s.referenceEntries, ref) && !s.withheld.includes(ref));
}

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Cond = Record<string, unknown>;

/** The atoms of a rule that are true, flattened (for finding-word tokens). */
function trueAtoms(c: Cond, x: ExamContext, derived: DerivedReader): Cond[] {
  if ("all" in c) return (c.all as Cond[]).flatMap((y) => trueAtoms(y, x, derived));
  if ("any" in c) return (c.any as Cond[]).flatMap((y) => trueAtoms(y, x, derived));
  if ("not" in c) return [];
  return evalCond(c, x, derived) ? [c] : [];
}

function optionWords(x: ExamContext, a: Cond): string[] {
  const item = String(a.item);
  const attr = x.cat.attribute(item, String(a.attribute));
  const v = readAttr(x.cat, x.exam, item, String(a.attribute));
  const vals = Array.isArray(v) ? v : v === undefined ? [] : [String(v)];
  const wanted = [
    ...((a.includes_any as string[]) ?? []),
    ...((a.any_of as string[]) ?? []),
    ...(a.equals ? [String(a.equals)] : []),
  ];
  return vals
    .filter((o) => !wanted.length || wanted.includes(o))
    .map((o) => attr?.options?.find((p) => p.id === o)?.label ?? o)
    .map((l) => l.split(" · ")[0]!);
}

/** "Saddle anaesthesia", "guarding and rebound": the findings that made the rule true. */
function findingWords(x: ExamContext, rule: ExamFlagRule, derived: DerivedReader): string {
  const words = trueAtoms(rule.when, x, derived).flatMap((a) => {
    if ("finding" in a) {
      const it = x.cat.item(String(a.finding));
      return it ? [it.phrase?.positive ?? it.label] : [];
    }
    if ("item" in a && "attribute" in a) return optionWords(x, a);
    return [];
  });
  return list([...new Set(words.map(lc))]);
}

const SIDE_WORD = { R: "right", L: "left" } as const;

function tokens(
  x: ExamContext,
  rule: ExamFlagRule,
  results: ReadonlyMap<string, ClassifierResult>,
  derived: DerivedReader,
): Record<string, string> {
  const v = x.vitals;
  const c = x.exam.blocks.consciousness;
  const t: Record<string, () => string> = {
    gcs_total: () => String(gcsTotal(c) ?? ""),
    acvpu: () => acvpuOf(c) ?? "",
    muac: () => String(x.exam.entries["ex.general.nutrition"]?.attrs?.muac ?? ""),
    distress_kind: () => {
      const types =
        (x.exam.entries["ex.general.distress"]?.attrs?.type as string[] | undefined) ?? [];
      const sev = types.filter(
        (ty) =>
          results.get(
            `${ty === "respiratory" ? "respiratory_distress" : ty === "pain" ? "pain" : "agitation"}_severity`,
          )?.result === "severe",
      );
      return list(sev.length ? sev : types);
    },
    vip: () => String(x.exam.entries["ex.general.vascular_access"]?.attrs?.vip_score_site ?? ""),
    modality: () =>
      cap(optionWords(x, { item: "ex.general.oxygen", attribute: "modality" })[0] ?? ""),
    asthma_features: () => results.get("acute_asthma_severity")?.reason ?? "",
    crb65: () => String(results.get("crb65")?.value ?? ""),
    lying_bp: () => {
      const l = x.exam.panels?.postural?.lying;
      return l ? `${l.sbp}/${l.dbp ?? "?"}` : "";
    },
    standing_bp: () => {
      const p = x.exam.panels?.postural;
      const s = p?.standing_3min?.sbp !== undefined ? p.standing_3min : p?.standing_1min;
      return s ? `${s.sbp}/${s.dbp ?? "?"}` : "";
    },
    pulse: () => {
      const rows = new Set(
        trueAtoms(rule.when, x, derived)
          .filter((a) => a.grid === "pulses")
          .flatMap((a) => (a.rows as string[]) ?? []),
      );
      const cells = x.exam.blocks.pulses ?? {};
      const out: string[] = [];
      for (const [row, cell] of Object.entries(cells))
        if (!rows.size || rows.has(row))
          for (const side of ["R", "L"] as const)
            if (cell[side] === "absent") out.push(`${SIDE_WORD[side]} ${lc(row)}`);
      return list(out);
    },
    crt: () => String(x.exam.entries["ex.cardiovascular.capillary_refill"]?.attrs?.time ?? ""),
    peritonism_sign: () => cap(findingWords(x, rule, derived)),
    cauda_sign: () => cap(findingWords(x, rule, derived)),
    prostate_findings: () => findingWords(x, rule, derived),
    organ_sign: () => findingWords(x, rule, derived),
    level: () => {
      const vals = ["ex.nervous.light_touch", "ex.nervous.pinprick"].flatMap((i) =>
        optionWords(x, { item: i, attribute: "level_or_dermatome" }),
      );
      return [...new Set(vals)].join(", ");
    },
    muscle: () => {
      const limit = x.cat.refNumber("REF-EX-POWER-WEAK") ?? 3;
      const out: string[] = [];
      for (const [row, cell] of Object.entries(x.exam.blocks.power ?? {}))
        for (const side of ["R", "L"] as const) {
          const n = mrcNumber(cell[side]);
          if (n !== null && n <= limit) out.push(`${SIDE_WORD[side]} ${lc(row)} ${cell[side]}/5`);
        }
      return list(out);
    },
    rosier: () => {
      const n = results.get("rosier")?.value ?? 0;
      return `${n > 0 ? "+" : ""}${n}`;
    },
    amts: () => String(amts(x.exam)?.score ?? ""),
    levels: () => {
      const a = x.cat.attribute("ex.spine_joints.spinal_tenderness", "levels");
      const vals =
        (readAttr(x.cat, x.exam, "ex.spine_joints.spinal_tenderness", "levels") as
          | string[]
          | undefined) ?? [];
      const zones = a ? x.cat.zones(a) : [];
      return vals.map((z) => zones.find((q) => q.id === z)?.label ?? z).join(", ");
    },
    stage: () => optionWords(x, { item: "ex.skin.pressure_injury", attribute: "stage" }).join(", "),
    glucose: () => (v.glucose === null ? "" : String(v.glucose)),
    bp: () => (v.sbp === null ? "" : `${v.sbp}/${v.dbp ?? "?"}`),
  };
  return Object.fromEntries(Object.entries(t).map(([k, f]) => [k, f()]));
}

const fill = (s: string, t: Record<string, string>) =>
  s.replace(/\{([a-z_0-9]+)\}/g, (_, k: string) => t[k] ?? "");

/** Where a rule's finding lives: the system (and part) its first item atom names. */
export function ruleTarget(
  x: ExamContext,
  rule: ExamFlagRule,
): { system: string; part?: string; where: string } {
  const find = (c: Cond): string | null => {
    if ("all" in c || "any" in c) {
      for (const y of (c.all ?? c.any) as Cond[]) {
        const f = find(y);
        if (f) return f;
      }
      return null;
    }
    if ("finding" in c) return String(c.finding);
    if ("item" in c) return String(c.item);
    return null;
  };
  const item = find(rule.when);
  const place = item ? x.cat.placeOf(item) : undefined;
  if (place)
    return {
      system: place.system.id,
      part: place.part.id,
      where: `Examination: ${place.system.name}`,
    };
  const s = JSON.stringify(rule.when);
  if (/"vital"|"panel"|hypoglycaemia|orthostatic/.test(s))
    return { system: "vitals", where: "Vital signs" };
  if (/gcs|acvpu|consciousness|orientation/.test(s))
    return { system: "general", part: "consciousness", where: "Examination: General" };
  if (/"grid":"power"|amts|rosier/.test(s))
    return { system: "nervous", where: "Examination: Nervous system" };
  if (/"grid":"pulses"/.test(s))
    return { system: "cardiovascular", part: "palpation", where: "Examination: Cardiovascular" };
  if (/muac|dehydration|distress/.test(s))
    return { system: "general", where: "Examination: General" };
  if (/crb65|asthma/.test(s)) return { system: "respiratory", where: "Examination: Respiratory" };
  if (/iwgdf|sinbad|dfi/.test(s)) return { system: "feet", where: "Examination: Feet" };
  return { system: "general", where: "Examination" };
}

export function derivedReader(x: ExamContext): DerivedReader {
  return (id, side) => {
    const u = x.exam.entries["ex.feet.ulcer"]?.attrs?.side;
    const both = ["left", "right"] as const;
    const feet =
      side !== "ulcer side" || u === "both"
        ? both
        : u === "left"
          ? (["left"] as const)
          : u === "right"
            ? (["right"] as const)
            : [];
    const key = id.split(".")[1] as "lops" | "pad";
    return feet.some((f) => footFacts(x, f)[key] === true);
  };
}

export interface ExamFlags {
  flags: Flag[];
  results: Map<string, ClassifierResult>;
}

export function evaluateExamFlags(x0: ExamContext, signoff: ExamSignoff): ExamFlags {
  const results = classifyAll(x0, signoff);
  const x: ExamContext = { ...x0, results };
  const derived = derivedReader(x);
  const flags: Flag[] = [];
  for (const rule of x.cat.data.flag_rules) {
    if (!examRuleIsLive(rule, signoff) || !evalCond(rule.when, x, derived)) continue;
    const t = tokens(x, rule, results, derived);
    flags.push({
      ruleId: rule.id,
      level: rule.level,
      badge: fill(rule.badge, t).replace(/\s+/g, " ").trim(),
      reason: fill(rule.reason, t),
      where: ruleTarget(x, rule).where,
      section: "exam",
      restricted: !!rule.restricted,
    });
  }
  return { flags, results };
}

/** Is an item's finding recorded (or marked not examined)? Suggestions read this for "done". */
export function isRecorded(x: ExamContext, itemId: string): boolean {
  return !!entryOf(x.cat, x.exam, itemId);
}
