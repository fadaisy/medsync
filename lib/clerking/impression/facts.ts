import type { ClassifierResult } from "../exam/classifiers";
import type { ExamContext } from "../exam/context";
import type { Cond, RestrictedClass } from "./catalogue";
import type { ScoreBand } from "@/lib/triage/constants";

import {
  NEWS2_PULSE,
  NEWS2_RESP_RATE,
  NEWS2_SPO2_SCALE1,
  NEWS2_SYSTOLIC_BP,
  NEWS2_TEMPERATURE,
} from "@/lib/triage/constants";
import { durationText } from "../answers";
import { lc } from "../compose";
import { entryOf } from "../exam/answers";
import { itemSummary } from "../exam/compose";
import { symptomAnswer, symptomEntry } from "../exam/context";
import { amts, gcsP, gcsTotal } from "../exam/scores";
import { RESTRICTED_CLASSES } from "./catalogue";

/**
 * The encounter's recorded findings as typed refs, shared by the Summary and the Impression
 * (PROMPT-CLERKING-SUMMARY-IMPRESSION §8): `sym:<id>`, `sym:<id>#<red flag>`, `pmh:<id>`,
 * `fh:<id>`, `med:<id>`, `soc:<id>`, `ex:<item>`, `vs:<id>`, `sc:<id>`, `cl:<id>`, `pt:age`,
 * `pt:sex`, `gr:<grid>`, `pn:<panel>`. Refs are ids, never labels (SI4). Pure.
 */

export type FindingRef = string;
/** The step that owns a finding: its tag in the composed paragraph and the matrix. */
export type StepTag = "01" | "03" | "04" | "05" | "06" | "07";

export interface Finding {
  ref: FindingRef;
  text: string;
  step: StepTag;
  kind:
    | "complaint"
    | "symptom"
    | "red_flag"
    | "past"
    | "family"
    | "medicine"
    | "social"
    | "exam"
    | "vital"
    | "score"
    | "classifier"
    | "patient";
  /** Recorded as present (a "no" answer, a normal examination or an in-band vital is false). */
  positive: boolean;
  /** A vital outside the NEWS2 zero band: its direction, for the arrow and the critical style. */
  out?: "high" | "low";
  cls: RestrictedClass | null;
}

const classOf = (s: string | null | undefined): RestrictedClass | null =>
  (RESTRICTED_CLASSES as readonly string[]).includes(s ?? "") ? (s as RestrictedClass) : null;

/** Who may see a restricted class (D-SI-18). One place holds the rule: today a viewer with an
 *  EMR access basis in a clinical workspace holds every class; reception and patients hold none. */
export interface Viewer {
  classes: ReadonlySet<RestrictedClass>;
}
export const CLINICAL_VIEWER: Viewer = { classes: new Set(RESTRICTED_CLASSES) };
export const NO_CLASSES: Viewer = { classes: new Set() };
export const canSee = (v: Viewer, cls: RestrictedClass | null) => !cls || v.classes.has(cls);

/* ─── Atoms → refs and classes ──────────────────────────────────── */

/** The finding an atom reads (the matrix row it marks). A combinator reads its first leaf. */
export function atomRef(c: Cond): FindingRef | null {
  if ("all" in c || "any" in c) {
    const list = (c.all ?? c.any) as Cond[];
    for (const y of list) {
      const r = atomRef(y);
      if (r) return r;
    }
    return null;
  }
  if ("not" in c) return atomRef(c.not as Cond);
  if ("symptom" in c)
    return "red_flag" in c ? `sym:${c.symptom}#${c.red_flag}` : `sym:${c.symptom}`;
  if ("past_condition" in c) return `pmh:${c.past_condition}`;
  if ("past_detail" in c) return `pmh:${c.past_detail}#${c.property}`;
  if ("result" in c) return `res:${c.result}`;
  if ("pregnancy" in c) return "pt:pregnancy";
  if ("medicine_group" in c) return `mg:${c.medicine_group}`;
  if ("derived" in c) return `dv:${c.derived}`;
  if ("family_condition" in c) return `fh:${c.family_condition}`;
  if ("medicine" in c) return `med:${c.medicine}`;
  if ("social" in c) return `soc:${c.social}`;
  if ("finding" in c) return `ex:${c.finding}`;
  if ("item" in c) return `ex:${c.item}`;
  if ("classifier" in c) return `cl:${c.classifier}`;
  if ("score" in c) return `sc:${c.score}`;
  if ("vital" in c) return `vs:${c.vital}`;
  if ("news2_total" in c) return "vs:news2";
  if ("patient" in c) return c.patient === "sex" ? "pt:sex" : "pt:age";
  if ("grid" in c) return `gr:${c.grid}`;
  if ("panel" in c) return `pn:${c.panel}`;
  return null;
}

/** The restricted class of the fact a ref names (a fact keeps its own sensitivity everywhere). */
export function refClass(ref: FindingRef, x: ExamContext): RestrictedClass | null {
  const [kind, rest = ""] = split(ref);
  const hcat = x.history.cat;
  if (kind === "sym") {
    const [sid, rf] = rest.split("#");
    const s = hcat.symptom(sid!);
    const f = rf ? s?.red_flags.find((r) => r.id === rf) : undefined;
    return classOf(f?.sensitivity) ?? classOf(s?.sensitivity);
  }
  if (kind === "pmh") {
    const id = rest.split("#")[0];
    return classOf(hcat.data.past_history.conditions.find((c) => c.id === id)?.sensitivity);
  }
  if (kind === "med")
    return classOf(
      (hcat.data.medicines.quick_picks as readonly { id: string; sensitivity?: string }[]).find(
        (p) => p.id === rest,
      )?.sensitivity,
    );
  if (kind === "soc" && rest === "substances")
    return classOf(
      (hcat.data.social_history.other_substances as { sensitivity?: string }).sensitivity,
    );
  if (kind === "ex") return classOf(x.cat.item(rest)?.sensitivity);
  return null;
}

/** Every restricted class an atom reads. */
export function atomClasses(c: Cond, x: ExamContext): RestrictedClass[] {
  if ("all" in c || "any" in c)
    return ((c.all ?? c.any) as Cond[]).flatMap((y) => atomClasses(y, x));
  if ("not" in c) return atomClasses(c.not as Cond, x);
  const r = atomRef(c);
  const k = r ? refClass(r, x) : null;
  return k ? [k] : [];
}

/** The atom as this viewer may evaluate it: a restricted leaf the viewer cannot see counts as
 *  unanswered (never fires), so a restricted trigger never suggests anything to them (SI9). */
export function gate(c: Cond, x: ExamContext, v: Viewer): Cond {
  if ("all" in c) return { all: (c.all as Cond[]).map((y) => gate(y, x, v)) };
  if ("any" in c) return { any: (c.any as Cond[]).map((y) => gate(y, x, v)) };
  if ("not" in c) return { not: gate(c.not as Cond, x, v) };
  return atomClasses(c, x).every((k) => v.classes.has(k)) ? c : { always: false };
}

/* ─── Recorded findings ─────────────────────────────────────────── */

const split = (ref: FindingRef): [string, string] => {
  const i = ref.indexOf(":");
  return [ref.slice(0, i), ref.slice(i + 1)];
};

const outOf = (v: number | null, bands: readonly ScoreBand[]): "high" | "low" | undefined => {
  if (v === null) return undefined;
  const zero = bands.find((b) => b.points === 0);
  if (!zero) return undefined;
  if (zero.min !== null && v < zero.min) return "low";
  if (zero.max !== null && v > zero.max) return "high";
  return undefined;
};

const words = (label: string) => label.replace(/\s*\(for example[^)]*\)/i, "");

/** The quick pick a recorded medicine is (the same matching as the `medicine` atom). */
export function medicinePick(x: ExamContext, name: string): string | null {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\([^)]*\)/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const n = norm(name);
  const picks = x.history.cat.data.medicines.quick_picks as readonly {
    id: string;
    label: string;
  }[];
  const hit = picks.find((p) =>
    [norm(p.label), norm(p.id.replace(/_/g, " "))].some(
      (w) => w && (n === w || n.startsWith(`${w} `) || n.includes(` ${w}`)),
    ),
  );
  return hit?.id ?? null;
}

/**
 * Everything recorded at this encounter that can be a finding, in history, examination and
 * vital-sign order. "Not asked" never appears (Law 4): only answered items are findings.
 */
export function recordedFindings(x: ExamContext): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  const push = (f: Omit<Finding, "cls">) => {
    if (seen.has(f.ref)) return;
    seen.add(f.ref);
    out.push({ ...f, cls: refClass(f.ref, x) });
  };
  const h = x.history.answers;
  const hcat = x.history.cat;

  // 01 Complaints, with their red flags
  for (const c of h.complaints) {
    const s = c.symptom ? hcat.symptom(c.symptom) : undefined;
    if (!s) continue;
    const d = durationText(c.duration);
    push({
      ref: `sym:${s.id}`,
      text: `${s.label}${d ? ` (${d})` : ""}`,
      step: "01",
      kind: "complaint",
      positive: true,
    });
    for (const f of s.red_flags) {
      const a = c.flags[f.id];
      if (a)
        push({
          ref: `sym:${s.id}#${f.id}`,
          text: a === "yes" ? words(f.label) : `No ${lc(words(f.label))}`,
          step: "01",
          kind: "red_flag",
          positive: a === "yes",
        });
    }
  }
  // 03 Review of systems (and the red flags of a detailed "yes")
  for (const s of hcat.symptoms) {
    if (seen.has(`sym:${s.id}`)) continue;
    const a = symptomAnswer(x, s.id);
    if (!a) continue;
    const d = a === "yes" ? durationText(h.rosDetail[s.id]?.duration) : null;
    push({
      ref: `sym:${s.id}`,
      text: a === "yes" ? `${s.label}${d ? ` (${d})` : ""}` : `No ${lc(s.label)}`,
      step: "03",
      kind: "symptom",
      positive: a === "yes",
    });
    const e = a === "yes" ? symptomEntry(x, s.id) : null;
    for (const f of e ? s.red_flags : []) {
      const r = e!.flags[f.id];
      if (r)
        push({
          ref: `sym:${s.id}#${f.id}`,
          text: r === "yes" ? words(f.label) : `No ${lc(words(f.label))}`,
          step: "03",
          kind: "red_flag",
          positive: r === "yes",
        });
    }
  }
  // 04 Past history and medicines
  for (const c of hcat.data.past_history.conditions) {
    const a = h.past.conditions[c.id]?.answer;
    if (a)
      push({
        ref: `pmh:${c.id}`,
        text: a === "yes" ? c.label : `No ${lc(c.label)}`,
        step: "04",
        kind: "past",
        positive: a === "yes",
      });
  }
  for (const m of x.medicines) {
    const pick = medicinePick(x, m.name);
    if (pick)
      push({ ref: `med:${pick}`, text: m.name, step: "04", kind: "medicine", positive: true });
  }
  // 05 Family
  for (const c of hcat.data.family_history.conditions) {
    const a = h.family[c.id]?.answer;
    if (a)
      push({
        ref: `fh:${c.id}`,
        text:
          a === "yes" ? `Family history of ${lc(c.label)}` : `No family history of ${lc(c.label)}`,
        step: "05",
        kind: "family",
        positive: a === "yes",
      });
  }
  // 06 Social (one row per recorded item)
  const sh = hcat.data.social_history as unknown as Record<string, unknown>;
  for (const [id, v] of Object.entries(h.social)) {
    if (v === undefined || id === "occupationCode" || typeof v === "number") continue;
    const text = socialText(sh, id, v);
    if (text) push({ ref: `soc:${id}`, text, step: "06", kind: "social", positive: true });
  }
  // 07 Examination
  for (const [id, e] of Object.entries(x.exam.entries)) {
    const item = x.cat.item(id);
    if (!item || e.state === "not_examined") continue;
    const s = itemSummary(
      x,
      (x.results ?? new Map()) as ReadonlyMap<string, ClassifierResult>,
      item,
      entryOf(x.cat, x.exam, id),
    );
    if (!s?.text) continue;
    push({
      ref: `ex:${id}`,
      text: s.text,
      step: "07",
      kind: "exam",
      positive: e.state === "positive",
    });
  }
  // 07 Vital signs
  const v = x.vitals;
  const vital = (
    id: string,
    label: string,
    val: number | null,
    unit: string,
    bands?: readonly ScoreBand[],
  ) => {
    if (val === null) return;
    const o = bands ? outOf(val, bands) : undefined;
    push({
      ref: `vs:${id}`,
      text: `${label} ${val}${unit}`,
      step: "07",
      kind: "vital",
      positive: !!o,
      ...(o ? { out: o } : {}),
    });
  };
  vital("vs.temp", "Temperature", v.temp, " °C", NEWS2_TEMPERATURE);
  vital("vs.pulse", "Pulse", v.pulse, "", NEWS2_PULSE);
  if (v.sbp !== null) {
    const o = outOf(v.sbp, NEWS2_SYSTOLIC_BP);
    push({
      ref: "vs:vs.bp",
      text: `BP ${v.sbp}/${v.dbp ?? "?"}`,
      step: "07",
      kind: "vital",
      positive: !!o,
      ...(o ? { out: o } : {}),
    });
  }
  vital("vs.rr", "Respiratory rate", v.rr, "", NEWS2_RESP_RATE);
  vital("vs.spo2", "SpO₂", v.spo2, " %", NEWS2_SPO2_SCALE1);
  vital("vs.glucose", "Glucose", v.glucose, " mmol/L");
  if (x.news2Latest)
    push({
      ref: "vs:news2",
      text: `NEWS2 ${x.news2Latest.total}${x.news2Latest.provisional ? " (incomplete)" : ""}`,
      step: "07",
      kind: "vital",
      positive: x.news2Latest.total > 0,
    });
  return out;
}

function socialText(sh: Record<string, unknown>, id: string, v: unknown): string | null {
  const labelIn = (opts: unknown, o: string) =>
    (Array.isArray(opts) ? (opts as { id: string; label: string }[]) : []).find((x) => x.id === o)
      ?.label;
  const block = sh[id];
  const opts =
    id === "tobacco"
      ? (block as { status?: unknown })?.status
      : id === "alcohol"
        ? (block as { pattern?: unknown })?.pattern
        : id === "travel" || id === "substances"
          ? (sh[id === "substances" ? "other_substances" : "travel"] as { options?: unknown })
              ?.options
          : block;
  if (typeof v === "string") {
    if (id === "occupation" || id === "travelDetail")
      return v.trim() ? `Occupation: ${v.trim()}` : null;
    const l = labelIn(opts, v);
    return l ? `${cap(id)}: ${lc(l)}` : null;
  }
  if (Array.isArray(v)) {
    const ls = (v as string[]).map((o) => labelIn(opts, o)).filter(Boolean) as string[];
    return ls.length ? `${cap(id)}: ${ls.map(lc).join(", ")}` : null;
  }
  return null;
}

const cap = (s: string) => {
  const t = s === "substances" ? "other substances" : s === "otherForms" ? "tobacco forms" : s;
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** The text of a finding the list lacks (an atom true for a fact outside the recorded list:
 *  age, sex, a grid, a panel, a score or a classifier result). */
export function syntheticFinding(ref: FindingRef, x: ExamContext): Finding | null {
  const [kind, rest] = split(ref);
  const base = { ref, step: "07" as StepTag, positive: true, cls: null };
  if (kind === "pt" && rest === "pregnancy")
    return x.patient.pregnant ? { ...base, step: "01", kind: "patient", text: "Pregnant" } : null;
  if (kind === "pt")
    return rest === "age"
      ? x.patient.ageYears === null
        ? null
        : { ...base, step: "01", kind: "patient", text: `Age ${x.patient.ageYears}` }
      : x.patient.sex
        ? {
            ...base,
            step: "01",
            kind: "patient",
            text: x.patient.sex === "male" ? "Male" : "Female",
          }
        : null;
  if (kind === "cl") {
    const r = x.results?.get(rest) as { result: string | null; text?: string } | undefined;
    return r?.result ? { ...base, kind: "classifier", text: r.text ?? r.result } : null;
  }
  if (kind === "sc") return { ...base, kind: "score", text: scoreText(rest, x) };
  if (kind === "gr")
    return {
      ...base,
      kind: "exam",
      text: rest === "pulses" ? "Peripheral pulses" : rest === "reflex" ? "Reflexes" : "Power",
    };
  if (kind === "pn") {
    const k = x.exam.panels?.ketones;
    if (rest === "vs.ketones")
      return {
        ...base,
        kind: "vital",
        text: `Ketones${k?.blood !== undefined ? ` blood ${k.blood} mmol/L` : ""}${k?.urine ? ` urine ${k.urine.replace("plus", "+")}` : ""}`,
      };
    return { ...base, kind: "exam", text: rest === "vs.both_arms" ? "BP in both arms" : rest };
  }
  if (kind === "res") return resultFinding(base, rest, x);
  if (kind === "pmh" && rest.includes("#")) {
    const [cond, prop] = rest.split("#");
    const def = (
      x.history.cat.data.past_history as {
        condition_details?: Record<
          string,
          { label: string; properties: { id: string; label: string }[] }
        >;
      }
    ).condition_details?.[cond!];
    const v = x.history.answers.past.conditions[cond!]?.details?.[prop!];
    const p = def?.properties.find((q) => q.id === prop);
    if (!p || v === undefined) return null;
    const c = x.history.cat.data.past_history.conditions.find((q) => q.id === cond);
    return {
      ...base,
      step: "04",
      kind: "past",
      text: `${c?.label ?? cond}, ${lc(p.label)}: ${detailWords(x, cond!, prop!, v)}`,
    };
  }
  if (kind === "mg") {
    const g = x.cat.data.medicine_groups?.[rest];
    return g ? { ...base, step: "04", kind: "medicine", text: g.label } : null;
  }
  if (kind === "dv")
    return {
      ...base,
      step: "07",
      kind: "exam",
      text:
        rest === "iwgdf_risk.lops" ? "Loss of protective sensation" : "Peripheral arterial disease",
    };
  return null;
}

/** The words of a past-history detail answer (EC-2). */
export function detailWords(x: ExamContext, cond: string, prop: string, v: unknown): string {
  const def = (
    x.history.cat.data.past_history as {
      condition_details?: Record<
        string,
        { properties: { id: string; options?: Opt[]; options_ref?: string }[] }
      >;
    }
  ).condition_details?.[cond]?.properties.find((q) => q.id === prop);
  const opts =
    def?.options ?? (def?.options_ref ? x.history.cat.data.option_sets[def.options_ref] : []) ?? [];
  const word = (id: unknown) => lc(opts.find((o) => o.id === id)?.label ?? String(id));
  return Array.isArray(v) ? v.map(word).join(", ") : word(v);
}
type Opt = { id: string; label: string };

/** A result's display: the concept, the newest value, its date, age in days and trust (EC-1). */
const RESULT_WORDS: Record<string, [string, string]> = {
  "obs.glucose": ["Glucose", " mmol/L"],
  "obs.hba1c": ["HbA1c", "%"],
  "obs.uacr": ["Urine ACR", " mg/mmol"],
  "derived.egfr": ["eGFR", " mL/min/1.73 m²"],
  "obs.bicarbonate": ["Bicarbonate", " mmol/L"],
  "obs.ph": ["pH", ""],
  "derived.osmolality_effective": ["Effective osmolality", " mOsm/kg"],
};

function resultFinding(base: Omit<Finding, "kind" | "text">, concept: string, x: ExamContext) {
  const f = [...(x.facts ?? [])]
    .filter((r) => r.concept === concept)
    .sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  if (!f) return null;
  const [label, unit] = RESULT_WORDS[concept] ?? [concept, ""];
  const days =
    x.now && !Number.isNaN(Date.parse(x.now))
      ? Math.max(0, Math.floor((Date.parse(x.now) - Date.parse(f.at)) / 86_400_000))
      : null;
  const when = `${f.at.slice(0, 10)}${days !== null ? `, ${days} days ago` : ""}`;
  return {
    ...base,
    kind: "vital" as const,
    text: `${label} ${f.comparator ?? ""}${f.value}${unit} (${when}, trust ${f.trust})`,
  };
}

/** A score with its value, as the examination writes it ("GCS 14/15", "AMTS 7/10"). */
function scoreText(id: string, x: ExamContext): string {
  if (id === "gcs_total") {
    const t = gcsTotal(x.exam.blocks.consciousness);
    return t === null ? "GCS" : `GCS ${t}/15`;
  }
  if (id === "gcs_p") {
    const p = gcsP(x.exam);
    return p ? `GCS-P ${p.value}` : "GCS-P";
  }
  if (id === "amts") {
    const a = amts(x.exam);
    return a ? `AMTS ${a.score}/10` : "AMTS";
  }
  return id;
}
