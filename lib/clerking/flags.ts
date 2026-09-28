import type { History, PropValue, SymptomEntry } from "./answers";
import type { Catalogue, FlagRule, PatientSex, Symptom } from "./catalogue";
import type { Linked } from "./linkage";
import type { News2Result } from "@/lib/triage/types";

import { durationDays, durationText, emptyEntry } from "./answers";
import { appliesTo, ASSOCIATED, isRestricted } from "./catalogue";
import { rosAnswer } from "./linkage";

/**
 * The flag engine (catalogue `flag_rules`, `flag_rule_language`; D-CV-04/05). Decision support
 * only: flags are derived from answers, never stored as facts, never block, order or change
 * triage (Law 6). Every threshold is a reference entry, and a rule fires only when it is signed
 * and none of its references is withheld (Law 7). NEWS2 comes from the triage engine, never
 * re-implemented.
 */

export type DeskSection = "complaint" | "history" | "systems" | "pmh" | "fh" | "social" | "exam";

export interface Flag {
  ruleId: string;
  level: "urgent" | "caution";
  badge: string;
  reason: string;
  /** Where it came from, in words ("Back pain", "Medicines", "Vital signs"). */
  where: string;
  section: DeskSection;
  restricted: boolean;
}

export interface Signoff {
  flagRules: "all" | string[];
  referenceEntries: "all" | string[];
  withheld: string[];
}

export interface FlagInput {
  history: History;
  linked: ReadonlyMap<string, Linked>;
  patient: { ageYears: number | null; sex: PatientSex };
  settings: { outbreakMode: boolean };
  medicines: readonly { name: string; adherence?: string | null }[];
  allergies: {
    status: "listed" | "no_known_drug_allergies" | "unable_to_assess" | "not_recorded";
    /** Reactions as catalogue reaction ids (record-map.ts maps the allergy record). */
    items: readonly { name: string; reactions: readonly string[] }[];
  };
  news2: News2Result | null;
  signoff: Signoff;
}

/** The words for a NEWS2 parameter on a badge (display only; the bands live in lib/triage). */
const VITAL_WORDS: Record<string, { label: string; unit: string }> = {
  respiratory_rate: { label: "Respiratory rate", unit: "/min" },
  spo2: { label: "SpO₂", unit: "%" },
  systolic_bp: { label: "Systolic BP", unit: "mmHg" },
  pulse: { label: "Pulse", unit: "/min" },
  temperature: { label: "Temperature", unit: "°C" },
  consciousness: { label: "Consciousness", unit: "" },
};
const ACVPU_WORDS: Record<string, string> = {
  C: "new confusion",
  V: "responds to voice",
  P: "responds to pain",
  U: "unresponsive",
};

const ADHERENCE_VERB: Record<string, string> = { sometimes_misses: "Misses", stopped: "Stopped" };

/** The references a rule names; a rule is live only when each is signed. */
const refsOf = (r: FlagRule): string[] => [
  ...new Set(JSON.stringify(r.when).match(/REF-FLAG-[A-Z0-9-]+/g) ?? []),
];

export function ruleIsLive(r: FlagRule, s: Signoff): boolean {
  const signed = (list: "all" | string[], id: string) => list === "all" || list.includes(id);
  if (!signed(s.flagRules, r.id) || s.withheld.includes(r.id)) return false;
  return refsOf(r).every((ref) => signed(s.referenceEntries, ref) && !s.withheld.includes(ref));
}

/* ─── The rule language ─────────────────────────────────────────── */

type Cond = Record<string, unknown>;

interface Env {
  cat: Catalogue;
  input: FlagInput;
  entry: SymptomEntry;
}

const REF_UNIT_DAYS: Record<string, number> = { days: 1, weeks: 7, months: 30, years: 365 };

function num(cat: Catalogue, ref: unknown): number | null {
  const v = cat.refValue(String(ref));
  return typeof v === "number" ? v : null;
}

function propMatch(v: PropValue | undefined, c: Cond, cat: Catalogue): boolean {
  const has = (x: string) => (Array.isArray(v) ? v.includes(x) : v === x);
  if ("equals" in c) return v !== undefined && has(String(c.equals));
  if ("not_equals" in c) return v === undefined || !has(String(c.not_equals));
  if ("any_of" in c) return v !== undefined && (c.any_of as string[]).some(has);
  if ("any_of_ref" in c) {
    const list = cat.refValue(String(c.any_of_ref));
    return v !== undefined && Array.isArray(list) && list.some(has);
  }
  if ("gte" in c) return typeof v === "number" && v >= Number(c.gte);
  if ("gte_ref" in c) {
    const n = num(cat, c.gte_ref);
    return typeof v === "number" && n !== null && v >= n;
  }
  return false;
}

/** Is the symptom present anywhere in this history (complaint, linked or own review answer)? */
function present(env: Env, symptom: string): SymptomEntry | null {
  const h = env.input.history;
  const c = h.complaints.find((x) => x.symptom === symptom);
  if (c) return c;
  if (rosAnswer(h, env.input.linked, symptom) === "yes")
    return h.rosDetail[symptom] ?? emptyEntry();
  return null;
}

export function evalCond(c: Cond, env: Env): boolean {
  const { cat, input, entry } = env;
  if ("all" in c) return (c.all as Cond[]).every((x) => evalCond(x, env));
  if ("any" in c) return (c.any as Cond[]).some((x) => evalCond(x, env));
  if ("not" in c) return !evalCond(c.not as Cond, env);
  if ("always" in c) return c.always === true;
  if ("red_flag_yes_any" in c)
    return (c.red_flag_yes_any as string[]).some((f) => entry.flags[f] === "yes");
  if ("duration_gte_ref" in c || "duration_gt_ref" in c) {
    const ref = String(c.duration_gte_ref ?? c.duration_gt_ref);
    const n = num(cat, ref);
    const unit = cat.data.reference_entries[ref]?.unit ?? "days";
    const days = durationDays(entry.duration);
    if (n === null || days === null) return false;
    const limit = n * (REF_UNIT_DAYS[unit] ?? 1);
    return "duration_gt_ref" in c ? days > limit : days >= limit;
  }
  if ("age_gte_ref" in c) {
    const n = num(cat, c.age_gte_ref);
    return n !== null && input.patient.ageYears !== null && input.patient.ageYears >= n;
  }
  if ("setting" in c) {
    const on = c.setting === "outbreak_mode" ? input.settings.outbreakMode : undefined;
    return on === c.equals;
  }
  if ("associated_count_gte_ref" in c) {
    const n = num(cat, c.associated_count_gte_ref);
    if (n === null) return false;
    const assoc = entry.props[ASSOCIATED];
    const count = (c.among_groups as unknown[][]).filter((group) =>
      group.some((item) => {
        if (typeof item === "string")
          return (Array.isArray(assoc) && assoc.includes(item)) || !!present(env, item);
        const it = item as { symptom: string; requires: Cond & { property: string } };
        const e = present(env, it.symptom);
        return !!e && propMatch(e.props[it.requires.property], it.requires, cat);
      }),
    ).length;
    return count >= n;
  }
  if ("count_gte_ref" in c) {
    const n = num(cat, c.count_gte_ref);
    const v = entry.props[String(c.property)];
    return n !== null && typeof v === "number" && v >= n;
  }
  if ("property" in c) return propMatch(entry.props[String(c.property)], c, cat);
  return false; // an atom this engine does not know never fires
}

/* ─── Evaluation ────────────────────────────────────────────────── */

interface Present {
  symptom: Symptom;
  entry: SymptomEntry;
  section: DeskSection;
}

/** Every symptom present, once: complaints first, then review-of-systems yes answers. */
function presentSymptoms(cat: Catalogue, input: FlagInput): Present[] {
  const out = new Map<string, Present>();
  const sex = input.patient.sex;
  for (const c of input.history.complaints) {
    const s = c.symptom ? cat.symptom(c.symptom) : undefined;
    if (s && appliesTo(s.applies_to_sex, sex) && !out.has(s.id))
      out.set(s.id, { symptom: s, entry: c, section: "complaint" });
  }
  const ids = new Set([...Object.keys(input.history.ros), ...input.linked.keys()]);
  for (const id of ids) {
    const s = cat.symptom(id);
    if (!s || out.has(id) || !appliesTo(s.applies_to_sex, sex)) continue;
    if (rosAnswer(input.history, input.linked, id) !== "yes") continue;
    out.set(id, {
      symptom: s,
      entry: input.history.rosDetail[id] ?? emptyEntry(),
      section: input.linked.has(id) ? "complaint" : "systems",
    });
  }
  return [...out.values()];
}

function matchesSymptom(r: FlagRule, s: Symptom): boolean {
  const targets = Array.isArray(r.applies_to) ? r.applies_to : [r.applies_to];
  return targets.some(
    (t) => t === s.id || t === "any" || (t.startsWith("family:") && t.slice(7) === s.family),
  );
}

function fill(template: string, vars: Record<string, string | number | undefined>): string {
  return template
    .replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

const lcFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export function evaluateFlags(cat: Catalogue, input: FlagInput): Flag[] {
  const live = cat.data.flag_rules.filter((r) => ruleIsLive(r, input.signoff));
  const flags: Flag[] = [];

  for (const p of presentSymptoms(cat, input)) {
    const env: Env = { cat, input, entry: p.entry };
    const symRestricted = isRestricted(p.symptom.sensitivity);
    let urgentHere = false;
    for (const r of live) {
      if (
        "each_red_flag_yes" in r.when ||
        !matchesSymptom(r, p.symptom) ||
        !evalCond(r.when as Cond, env)
      )
        continue;
      urgentHere ||= r.level === "urgent";
      flags.push({
        ruleId: r.id,
        level: r.level,
        badge: fill(r.badge, {
          symptom: p.symptom.label,
          severity: p.entry.props.severity as number | undefined,
          duration: durationText(p.entry.duration),
        }),
        reason: r.reason,
        where: p.symptom.label,
        section: p.section,
        restricted: !!r.restricted || symRestricted,
      });
    }
    // FLAG-RED-FLAG-ITEM: one caution per danger answer of yes, unless an urgent rule for this
    // symptom already fired; risk factors, exposures and restricted labels never make a badge.
    for (const r of live.filter(
      (x) => "each_red_flag_yes" in x.when && matchesSymptom(x, p.symptom),
    )) {
      if (urgentHere) break;
      const kind = (r.when as Cond).kind;
      for (const rf of p.symptom.red_flags) {
        if (rf.kind !== kind || p.entry.flags[rf.id] !== "yes" || isRestricted(rf.sensitivity))
          continue;
        flags.push({
          ruleId: r.id,
          level: r.level,
          badge: fill(r.badge, { red_flag: rf.label }),
          reason: `${r.reason}: ${lcFirst(rf.label)}`,
          where: p.symptom.label,
          section: p.section,
          restricted: symRestricted,
        });
      }
    }
  }

  for (const r of live) {
    const t = r.applies_to;
    if (t === "medicines" && "adherence_any" in r.when) {
      const any = r.when.adherence_any as string[];
      for (const m of input.medicines)
        if (m.adherence && any.includes(m.adherence))
          flags.push(
            record(
              r,
              fill(r.badge, { verb: ADHERENCE_VERB[m.adherence] ?? "", medicine: lcFirst(m.name) }),
              m.name,
              "pmh",
            ),
          );
    }
    if (t === "allergies") {
      const w = r.when as Cond;
      if (w.reaction_high_risk) {
        const high = new Set(
          cat.data.allergies.reactions.filter((x) => x.high_risk).map((x) => x.id),
        );
        for (const a of input.allergies.items)
          if (a.reactions.some((x) => high.has(x)))
            flags.push(record(r, fill(r.badge, { substance: a.name }), "Allergies", "pmh"));
      }
      if (w.status && w.status === input.allergies.status)
        flags.push(record(r, r.badge, "Allergies", "pmh"));
    }
    if (t === "vital_signs" && input.news2) {
      const w = r.when as Cond;
      if (w.news2_parameter_score_gte_ref) {
        const n = num(cat, w.news2_parameter_score_gte_ref);
        for (const p of input.news2.parameters) {
          const words = VITAL_WORDS[p.parameter];
          if (!words || n === null || p.points < n) continue;
          const value =
            p.parameter === "consciousness"
              ? (ACVPU_WORDS[String(p.value)] ?? String(p.value))
              : `${p.value}${words.unit ? ` ${words.unit}` : ""}`;
          flags.push(
            record(r, fill(r.badge, { vital: words.label, value }), "Vital signs", "exam"),
          );
        }
      }
      if (w.news2_total_gte_ref) {
        const n = num(cat, w.news2_total_gte_ref);
        if (n !== null && input.news2.total >= n)
          flags.push(record(r, fill(r.badge, { total: input.news2.total }), "Vital signs", "exam"));
      }
    }
  }

  // Urgent first; otherwise catalogue order.
  return flags.sort((a, b) => (a.level === b.level ? 0 : a.level === "urgent" ? -1 : 1));
}

function record(r: FlagRule, badge: string, where: string, section: DeskSection): Flag {
  return {
    ruleId: r.id,
    level: r.level,
    badge,
    reason: r.reason,
    where,
    section,
    restricted: !!r.restricted,
  };
}

/* ─── Badges: one per wording, the most severe level wins ───────── */

export interface Badge {
  label: string;
  level: "urgent" | "caution";
  reasons: { reason: string; where: string }[];
  ruleIds: string[];
  section: DeskSection;
  restricted: boolean;
}

export function toBadges(flags: readonly Flag[], canSeeRestricted: boolean): Badge[] {
  const by = new Map<string, Badge>();
  for (const f of flags) {
    if (f.restricted && !canSeeRestricted) continue;
    const b = by.get(f.badge);
    if (!b) {
      by.set(f.badge, {
        label: f.badge,
        level: f.level,
        reasons: [{ reason: f.reason, where: f.where }],
        ruleIds: [f.ruleId],
        section: f.section,
        restricted: f.restricted,
      });
      continue;
    }
    if (f.level === "urgent" && b.level !== "urgent") {
      b.level = "urgent";
      b.section = f.section;
    }
    if (!b.reasons.some((x) => x.reason === f.reason && x.where === f.where))
      b.reasons.push({ reason: f.reason, where: f.where });
    if (!b.ruleIds.includes(f.ruleId)) b.ruleIds.push(f.ruleId);
    b.restricted ||= f.restricted;
  }
  return [...by.values()].sort((a, b) => (a.level === b.level ? 0 : a.level === "urgent" ? -1 : 1));
}
