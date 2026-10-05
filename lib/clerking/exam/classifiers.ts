import type { ExamContext } from "./context";

import { entryOf, readAttr } from "./answers";
import { evalCond, pefPercent, symptomAnswer } from "./context";
import {
  acvpuOf,
  acvpuSuggestion,
  amts,
  crb65,
  gcsP,
  gcsTotal,
  orientation,
  orientationState,
} from "./scores";
import { bmiOf, scale2, whtrOf } from "./vitals";

/**
 * Every classifier in the catalogue, driven by its reference entries (PROMPT-CLERKING-EXAM-V2 §7
 * classifiers.ts, E4): each result carries its inputs and reason. Hints (treatment plans, the
 * motor pattern, the West Haven suggestion) are returned apart and never written. A classifier
 * whose reference entry is not signed shows "Awaiting sign-off" instead of a result. Pure.
 */

export type Tone = "ok" | "caution" | "strong" | "neutral";

export interface ClassifierResult {
  id: string;
  label: string;
  status: "result" | "not_applicable" | "not_graded" | "incomplete" | "awaiting_signoff" | "none";
  /** The result id (for rules), or null. */
  result: string | null;
  text: string;
  reason: string;
  tone: Tone;
  inputs: string[];
  value?: number;
  /** Shown beside the result; never written to the note (E5). */
  hint?: string;
  /** A second line that belongs with the result (e.g. the oedema caution for IMAM). */
  note?: string;
}

export interface ExamSignoff {
  classifiers: "all" | string[];
  referenceEntries: "all" | string[];
  flagRules: "all" | string[];
  withheld: string[];
}

const signed = (list: "all" | string[], id: string) => list === "all" || list.includes(id);

export function classifierIsLive(x: ExamContext, id: string, s: ExamSignoff): boolean {
  const def = x.cat.data.classifiers[id];
  if (!def || !signed(s.classifiers, id) || s.withheld.includes(id)) return false;
  const refs = [...new Set(JSON.stringify(def).match(/REF-EX-[A-Z0-9-]+/g) ?? [])];
  return refs.every((r) => signed(s.referenceEntries, r) && !s.withheld.includes(r));
}

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const list = (xs: string[], joiner = "and") =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} ${joiner} ${xs.at(-1)}`;

function optionLabel(x: ExamContext, item: string, attribute: string, id: string): string {
  return x.cat.attribute(item, attribute)?.options?.find((o) => o.id === id)?.label ?? id;
}

function r(
  id: string,
  label: string,
  p: Partial<ClassifierResult> & Pick<ClassifierResult, "status">,
): ClassifierResult {
  return { id, label, result: null, text: "", reason: "", tone: "neutral", inputs: [], ...p };
}

function labelOf(x: ExamContext, id: string): string {
  return String(x.cat.data.classifiers[id]?.label ?? id);
}

/* ─── Hydration (GTFCC) ───────────────────────────────────────────── */

/** GTFCC columns: each severe-column sign also counts toward "some"; slow and very slow pinch
 *  count once; drinks poorly counts in the thirst column (catalogue `counting`). */
const GTFCC_COLUMN: Record<string, string> = {
  restless_or_irritable: "mind",
  sunken_eyes: "eyes",
  rapid_pulse: "pulse",
  drinks_eagerly_thirsty: "thirst",
  drinks_poorly_or_not_able: "thirst",
  skin_pinch_goes_back_slowly: "pinch",
  skin_pinch_goes_back_very_slowly: "pinch",
};

export function dehydration(x: ExamContext): ClassifierResult {
  const id = "dehydration_gtfcc";
  const def = x.cat.data.classifiers[id] as {
    applies_when: Record<string, unknown>;
    groups: Record<"danger" | "severe_signs" | "some_signs", string[]>;
    results: Record<string, { label: string; treatment_hint?: string }>;
    hint_suppressed_when: { show_instead: string } & Record<string, unknown>;
  };
  const label = labelOf(x, id);
  const e = x.exam.entries["ex.general.hydration"];
  if (!e || e.state === "not_examined") return r(id, label, { status: "none" });
  const signs = (e.attrs?.signs_present as string[] | undefined) ?? [];
  const words = signs.map((s) => lc(optionLabel(x, "ex.general.hydration", "signs_present", s)));
  if (!evalCond(def.applies_when, x))
    return r(id, label, {
      status: "not_graded",
      text: signs.length ? list(words) : "No signs",
      reason: "The GTFCC table grades dehydration from diarrhoea or vomiting",
      inputs: words,
    });
  const n = x.cat.refNumber("REF-EX-GTFCC-COUNT") ?? 2;
  const danger = signs.filter((s) => def.groups.danger.includes(s));
  const severe = signs.filter((s) => def.groups.severe_signs.includes(s));
  const someCols = new Set(
    signs.filter((s) => def.groups.some_signs.includes(s)).map((s) => GTFCC_COLUMN[s] ?? s),
  );
  const name = (s: string) => lc(optionLabel(x, "ex.general.hydration", "signs_present", s));
  let result: string;
  let reason: string;
  if (danger.length || severe.length >= n) {
    result = "severe";
    reason = danger.length
      ? `danger sign: ${list(danger.map(name))}`
      : `${severe.length} severe signs: ${list(severe.map(name))}`;
  } else if (someCols.size >= n) {
    result = "some";
    reason = `${someCols.size} signs: ${list(words)}`;
  } else if (someCols.size >= 1) {
    result = "below_threshold";
    reason = `${list(words)}; below the GTFCC threshold`;
  } else {
    result = "none";
    reason = "all signs normal";
  }
  const overload = evalCond(def.hint_suppressed_when, x);
  return r(id, label, {
    status: "result",
    result,
    text: def.results[result]!.label,
    reason,
    tone: result === "severe" ? "strong" : result === "none" ? "ok" : "caution",
    inputs: words,
    hint: overload ? def.hint_suppressed_when.show_instead : def.results[result]!.treatment_hint,
  });
}

/* ─── Nutrition (Uganda IMAM) ─────────────────────────────────────── */

type MuacBand = { sam_lt: number; mam_lt?: number; mam_lte?: number };

export function muac(x: ExamContext): ClassifierResult {
  const id = "muac_uganda_imam";
  const def = x.cat.data.classifiers[id] as {
    results: Record<string, string>;
    oedema_rule: { when: Record<string, unknown> };
  };
  const label = labelOf(x, id);
  const age = x.patient.ageYears;
  if (age !== null && age < 15)
    return r(id, label, {
      status: "not_applicable",
      text: "Not applicable",
      reason: "Paediatric criteria not in this catalogue",
    });
  const e = x.exam.entries["ex.general.nutrition"];
  const cm = typeof e?.attrs?.muac === "number" ? e.attrs.muac : null;
  const oedema = evalCond(def.oedema_rule.when, x);
  const cause = e?.attrs?.oedema_cause;
  const note =
    oedema && cause !== "nutritional"
      ? "Bilateral pitting oedema: exclude heart, kidney, liver and pregnancy causes"
      : undefined;
  if (oedema && cause === "nutritional")
    return r(id, label, {
      status: "result",
      result: "sam",
      text: def.results.sam!,
      reason: "bilateral pitting oedema, recorded as nutritional",
      tone: "strong",
      inputs: [...(cm !== null ? [`MUAC ${cm} cm`] : []), "bilateral pitting oedema (nutritional)"],
    });
  if (cm === null) return r(id, label, { status: "none", text: def.results.not_measured!, note });
  if (age === null)
    return r(id, label, {
      status: "incomplete",
      text: "Age not recorded",
      reason: "The MUAC band depends on age",
      note,
    });
  const bands = x.cat.refValue("REF-EX-MUAC-BANDS") as Record<string, MuacBand>;
  const pl =
    x.patient.sex === "female" &&
    (e?.attrs?.pregnant_or_lactating === "yes" || x.patient.pregnant === true);
  const key = pl
    ? "pregnant_or_lactating"
    : age < 18
      ? "adolescent_15_17"
      : age < 60
        ? "adult_18_59"
        : "older_60_plus";
  const b = bands[key]!;
  const mam = b.mam_lt !== undefined ? cm < b.mam_lt : cm <= b.mam_lte!;
  const result = cm < b.sam_lt ? "sam" : mam ? "mam" : "normal";
  const band = {
    adolescent_15_17: "15 to 17 years",
    adult_18_59: "18 to 59 years",
    older_60_plus: "60 and over",
    pregnant_or_lactating: "pregnant or breastfeeding",
  }[key];
  return r(id, label, {
    status: "result",
    result,
    text: def.results[result]!,
    reason: `MUAC ${cm} cm (${band}: SAM below ${b.sam_lt} cm)`,
    tone: result === "sam" ? "strong" : result === "mam" ? "caution" : "ok",
    inputs: [`MUAC ${cm} cm`],
    note,
  });
}

/* ─── BMI, waist, waist-to-height ─────────────────────────────────── */

export function bmiClass(x: ExamContext): ClassifierResult {
  const id = "bmi_who";
  const def = x.cat.data.classifiers[id] as {
    results: Record<string, string>;
    tone: Record<string, Tone>;
  };
  const label = labelOf(x, id);
  const bmi = bmiOf(x.vitals.weight, x.vitals.height);
  if (bmi === null) return r(id, label, { status: "none" });
  const adult = x.cat.refNumber("REF-EX-BMI-ADULT-AGE") ?? 20;
  const age = x.patient.ageYears;
  if (x.patient.pregnant)
    return r(id, label, {
      status: "not_applicable",
      text: "BMI class not applicable",
      reason: "pregnancy",
      value: bmi,
    });
  if (age !== null && age < adult)
    return r(id, label, {
      status: "not_applicable",
      text: age >= 15 ? "BMI-for-age not structured" : "BMI class not applicable",
      reason: `adult classes start at ${adult}`,
      value: bmi,
    });
  const bands = x.cat.refValue("REF-EX-BMI-BANDS") as [number | null, string][];
  const result = bands.find(([lim]) => lim === null || bmi < lim)![1];
  return r(id, label, {
    status: "result",
    result,
    text: def.results[result]!,
    reason: `BMI ${bmi}`,
    tone: def.tone[result] ?? "neutral",
    inputs: [`weight ${x.vitals.weight} kg`, `height ${x.vitals.height} cm`],
    value: bmi,
  });
}

export function waistRisk(x: ExamContext): ClassifierResult {
  const id = "waist_risk";
  const def = x.cat.data.classifiers[id] as { results: Record<string, string> };
  const label = labelOf(x, id);
  const w = x.vitals.waist;
  if (w === null) return r(id, label, { status: "none" });
  if (!x.patient.sex)
    return r(id, label, {
      status: "incomplete",
      text: "Record sex to classify",
      reason: "The thresholds differ by sex",
    });
  const t = (
    x.cat.refValue("REF-EX-WAIST") as Record<string, { increased: number; substantial: number }>
  )[x.patient.sex]!;
  const result = w >= t.substantial ? "substantial" : w >= t.increased ? "increased" : "low";
  return r(id, label, {
    status: "result",
    result,
    text: def.results[result]!,
    reason: `waist ${w} cm (${x.patient.sex}: ${t.increased} and ${t.substantial} cm)`,
    tone: result === "low" ? "ok" : result === "increased" ? "caution" : "strong",
    inputs: [`waist ${w} cm`],
  });
}

export function whtrBand(x: ExamContext): ClassifierResult {
  const id = "whtr_band";
  const def = x.cat.data.classifiers[id] as { results: Record<string, string> };
  const label = labelOf(x, id);
  const v = whtrOf(x.vitals.waist, x.vitals.height);
  if (v === null) return r(id, label, { status: "none" });
  const t = x.cat.refValue("REF-EX-WHTR") as { increased: number; high: number };
  const result = v >= t.high ? "high" : v >= t.increased ? "increased" : "healthy";
  return r(id, label, {
    status: "result",
    result,
    text: def.results[result]!,
    reason: `waist-to-height ${v.toFixed(2)}`,
    tone: result === "healthy" ? "ok" : result === "increased" ? "caution" : "strong",
    inputs: [`waist ${x.vitals.waist} cm`, `height ${x.vitals.height} cm`],
    value: v,
  });
}

/* ─── Distress ────────────────────────────────────────────────────── */

const RANK: Record<string, number> = { none: 0, mild: 1, moderate: 2, severe: 3 };
const SEV_TONE = (s: string | null): Tone =>
  s === "severe" ? "strong" : s === "moderate" || s === "mild" ? "caution" : "ok";

export function respiratoryDistress(x: ExamContext): ClassifierResult {
  const id = "respiratory_distress_severity";
  const def = x.cat.data.classifiers[id] as {
    rules: { result: string; when: Record<string, unknown> }[];
  };
  const label = labelOf(x, id);
  const signs =
    (readAttr(x.cat, x.exam, "ex.respiratory.work_of_breathing", "signs") as
      | string[]
      | undefined) ?? [];
  if (!signs.length) return r(id, label, { status: "none" });
  const hit = def.rules.find((q) => evalCond(q.when, x));
  const words = signs.map((s) =>
    lc(optionLabel(x, "ex.respiratory.work_of_breathing", "signs", s)),
  );
  return r(id, label, {
    status: hit ? "result" : "none",
    result: hit?.result ?? null,
    text: hit ? `${hit.result.charAt(0).toUpperCase()}${hit.result.slice(1)}` : "",
    reason: list(words),
    tone: SEV_TONE(hit?.result ?? null),
    inputs: words,
  });
}

export function painSeverity(x: ExamContext): ClassifierResult {
  const id = "pain_severity";
  const label = labelOf(x, id);
  const n = x.exam.entries["ex.general.distress"]?.attrs?.pain_nrs;
  if (typeof n !== "number") return r(id, label, { status: "none" });
  const b = x.cat.refValue("REF-EX-NRS-BANDS") as { mild_lte: number; moderate_lte: number };
  const result =
    n === 0 ? "none" : n <= b.mild_lte ? "mild" : n <= b.moderate_lte ? "moderate" : "severe";
  return r(id, label, {
    status: "result",
    result,
    text: result,
    reason: `pain ${n}/10`,
    tone: SEV_TONE(result),
    inputs: [`pain ${n}/10`],
    value: n,
  });
}

export function agitationSeverity(x: ExamContext): ClassifierResult {
  const id = "agitation_severity";
  const label = labelOf(x, id);
  const v = x.exam.entries["ex.general.distress"]?.attrs?.rass;
  if (typeof v !== "string") return r(id, label, { status: "none" });
  const result = v === "plus_1" ? "mild" : v === "plus_2" ? "moderate" : "severe";
  const rass = `RASS ${optionLabel(x, "ex.general.distress", "rass", v).split(" ")[0]}`;
  return r(id, label, {
    status: "result",
    result,
    text: result,
    reason: rass,
    tone: SEV_TONE(result),
    inputs: [rass],
  });
}

export function distress(
  x: ExamContext,
  parts: { respiratory: ClassifierResult; pain: ClassifierResult; agitation: ClassifierResult },
): ClassifierResult {
  const id = "distress_severity";
  const label = labelOf(x, id);
  const e = x.exam.entries["ex.general.distress"];
  if (e?.state !== "positive") return r(id, label, { status: "none" });
  const types = (e.attrs?.type as string[] | undefined) ?? [];
  const comps = types
    .map((t) => ({ t, c: parts[t as keyof typeof parts] }))
    .filter((p) => p.c && p.c.result);
  if (!comps.length)
    return r(id, label, { status: "incomplete", text: "In distress", reason: "grade each type" });
  const top = comps.reduce((a, b) => ((RANK[b.c.result!] ?? 0) > (RANK[a.c.result!] ?? 0) ? b : a));
  return r(id, label, {
    status: "result",
    result: top.c.result,
    text: `${top.c.result!.charAt(0).toUpperCase()}${top.c.result!.slice(1)} distress`,
    reason: comps.map((p) => `${p.t} ${p.c.result}`).join(", "),
    tone: SEV_TONE(top.c.result),
    inputs: comps.map((p) => `${p.t}: ${p.c.reason}`),
  });
}

/* ─── Consciousness ───────────────────────────────────────────────── */

export function consciousnessResults(x: ExamContext): ClassifierResult[] {
  const c = x.exam.blocks.consciousness;
  const t = gcsTotal(c);
  const p = gcsP(x.exam);
  const a = acvpuOf(c);
  const o = orientation(c);
  return [
    r(
      "gcs_total",
      labelOf(x, "gcs_total"),
      t === null
        ? { status: c?.nt ? "incomplete" : "none" }
        : {
            status: "result",
            result: String(t),
            text: `GCS ${t}/15`,
            value: t,
            tone:
              t === 15
                ? "ok"
                : t <= (x.cat.refNumber("REF-EX-GCS-AIRWAY") ?? 8)
                  ? "strong"
                  : "caution",
            reason: `E${c!.E} V${c!.V} M${c!.M}`,
          },
    ),
    r(
      "gcs_p",
      labelOf(x, "gcs_p"),
      p
        ? {
            status: "result",
            result: String(p.value),
            value: p.value,
            text: `GCS-P ${p.value}`,
            reason: p.show ? "a pupil is unreactive" : "",
            tone: p.show ? "strong" : "neutral",
          }
        : { status: "none" },
    ),
    r(
      "acvpu_from_consciousness",
      labelOf(x, "acvpu_from_consciousness"),
      a
        ? { status: "result", result: a, text: `ACVPU ${a}` }
        : {
            status: c ? "incomplete" : "none",
            text: "Choose ACVPU",
            hint: acvpuSuggestion(c) ? `Suggested: ${acvpuSuggestion(c)}` : undefined,
          },
    ),
    r(
      "orientation",
      labelOf(x, "orientation"),
      o.full === null
        ? {
            status: orientationState(c).kind === "not_assessable" ? "not_applicable" : "none",
            text: orientationState(c).kind === "not_assessable" ? "Not assessable" : "",
          }
        : {
            status: "result",
            result: o.full ? "oriented" : "not_fully_oriented",
            text: o.full
              ? "Oriented to time, place and person"
              : `Not oriented to ${list(o.not, "or")}`,
          },
    ),
  ];
}

/* ─── Vital-sign panels ───────────────────────────────────────────── */

export function orthostatic(x: ExamContext): ClassifierResult {
  const id = "orthostatic_hypotension";
  const label = labelOf(x, id);
  const p = x.exam.panels?.postural;
  const lying = p?.lying;
  const stands = [p?.standing_1min, p?.standing_3min].filter(
    (s) => s?.sbp !== undefined || s?.dbp !== undefined,
  );
  if (!lying?.sbp || !stands.length)
    return r(id, label, {
      status: lying || stands.length ? "incomplete" : "none",
      text: "Needs lying and a standing reading",
    });
  const sbpDrop = Math.max(
    ...stands.map((s) => (s!.sbp !== undefined ? lying.sbp! - s!.sbp : -Infinity)),
  );
  const dbpDrop =
    lying.dbp !== undefined
      ? Math.max(...stands.map((s) => (s!.dbp !== undefined ? lying.dbp! - s!.dbp : -Infinity)))
      : -Infinity;
  const sLim = x.cat.refNumber("REF-EX-OH-SBP")!;
  const dLim = x.cat.refNumber("REF-EX-OH-DBP")!;
  const present = sbpDrop >= sLim || dbpDrop >= dLim;
  return r(id, label, {
    status: "result",
    result: present ? "present" : "absent",
    text: present ? "Orthostatic hypotension" : "No orthostatic drop",
    reason: `systolic fall ${Math.max(0, sbpDrop)} mmHg${Number.isFinite(dbpDrop) ? `, diastolic fall ${Math.max(0, dbpDrop)} mmHg` : ""}`,
    tone: present ? "caution" : "ok",
    inputs: [`lying ${lying.sbp}/${lying.dbp ?? "?"}`],
  });
}

export function interArm(x: ExamContext): ClassifierResult {
  const id = "inter_arm_difference";
  const label = labelOf(x, id);
  const b = x.exam.panels?.bothArms;
  const R = b?.right?.sbp;
  const L = b?.left?.sbp;
  if (R === undefined || L === undefined)
    return r(id, label, { status: b ? "incomplete" : "none" });
  const lim = x.cat.refNumber("REF-EX-ARM-DIFF")!;
  const diff = Math.abs(R - L);
  const above = diff > lim;
  const higher = R >= L ? "right" : "left";
  return r(id, label, {
    status: "result",
    result: !above ? "within" : b?.repeated ? "persistent" : "repeat",
    text: !above
      ? `Difference ${diff} mmHg`
      : b?.repeated
        ? `Difference ${diff} mmHg on repeat: use the ${higher} arm`
        : `Difference ${diff} mmHg: repeat`,
    reason: `right ${R}, left ${L} (above ${lim} mmHg ${above ? "" : "not "}reached)`,
    tone: above ? "caution" : "ok",
    inputs: [`right ${R}`, `left ${L}`],
    value: diff,
  });
}

/* ─── Asthma, CRB65, hypoglycaemia, ROSIER ────────────────────────── */

function atomWords(x: ExamContext, c: Record<string, unknown>): string {
  if (typeof c.label === "string") return c.label;
  if ("pef_percent" in c) return `PEF ${pefPercent(x)}% of best or predicted`;
  if (c.vital === "vs.spo2") return `SpO₂ ${x.vitals.spo2}%`;
  if (c.vital === "vs.rr") return `respiratory rate ${x.vitals.rr}`;
  if (c.vital === "vs.pulse") return `pulse ${x.vitals.pulse}`;
  if ("includes_any" in c || "equals" in c) {
    const vals = [...((c.includes_any as string[]) ?? []), ...(c.equals ? [String(c.equals)] : [])];
    const v = readAttr(x.cat, x.exam, String(c.item), String(c.attribute));
    const hit = vals.find((o) => (Array.isArray(v) ? v.includes(o) : v === o)) ?? vals[0]!;
    return lc(optionLabel(x, String(c.item), String(c.attribute), hit));
  }
  if (c.score === "gcs_total") return `GCS ${gcsTotal(x.exam.blocks.consciousness)}`;
  if ("acvpu_not" in c) return `ACVPU ${acvpuOf(x.exam.blocks.consciousness)}`;
  return "criterion met";
}

export function asthma(x: ExamContext): ClassifierResult {
  const id = "acute_asthma_severity";
  const def = x.cat.data.classifiers[id] as {
    rules: { result: string; when: Record<string, unknown> }[];
  };
  const label = labelOf(x, id);
  const offered =
    entryOf(x.cat, x.exam, "ex.respiratory.wheeze")?.state === "positive" ||
    symptomAnswer(x, "sym.wheeze") === "yes" ||
    x.history.answers.past.conditions.asthma_or_copd?.answer === "yes";
  if (!offered) return r(id, label, { status: "none" });
  if (scale2(x.exam))
    return r(id, label, {
      status: "not_applicable",
      text: "Asthma severity not applied",
      reason: "hypercapnic target recorded",
    });
  if (!x.exam.panels?.asthmaConfirmed)
    return r(id, label, { status: "incomplete", text: "Confirm acute asthma to grade" });
  const words: Record<string, string> = {
    life_threatening: "Life-threatening asthma",
    acute_severe: "Acute severe asthma",
    moderate: "Moderate acute asthma",
  };
  for (const q of def.rules) {
    const atoms = "any" in q.when ? (q.when.any as Record<string, unknown>[]) : [q.when];
    const fired = atoms.filter((a) => evalCond(a, x));
    if (fired.length)
      return r(id, label, {
        status: "result",
        result: q.result,
        text: words[q.result] ?? q.result,
        reason: fired.map((a) => atomWords(x, a)).join(", "),
        tone: q.result === "moderate" ? "caution" : "strong",
        inputs: fired.map((a) => atomWords(x, a)),
      });
  }
  return r(id, label, {
    status: "incomplete",
    text: "No severity criterion met yet",
    reason: "record PEF, SpO₂, RR and pulse",
  });
}

export function crb65Result(x: ExamContext): ClassifierResult {
  const id = "crb65";
  const def = x.cat.data.classifiers[id] as { applies_when: Record<string, unknown> };
  const label = labelOf(x, id);
  if (!evalCond(def.applies_when, x)) return r(id, label, { status: "none" });
  const a = amts(x.exam);
  const o = orientation(x.exam.blocks.consciousness);
  const s = crb65(x.cat, {
    amts: a?.complete ? a.score : null,
    newDisorientation: o.full === null ? null : !o.full,
    rr: x.vitals.rr,
    sbp: x.vitals.sbp,
    dbp: x.vitals.dbp,
    age: x.patient.ageYears,
  });
  return r(id, label, {
    status: s.complete ? "result" : "incomplete",
    result: s.complete ? s.band : null,
    text: `CRB65 ${s.score}${s.complete ? "" : " (incomplete)"}`,
    reason: s.points
      .map((p) => `${p.label}: ${p.met === null ? "not recorded" : p.met ? "yes" : "no"}`)
      .join("; "),
    tone: s.band === "high" ? "strong" : s.band === "intermediate" ? "caution" : "ok",
    inputs: s.points.filter((p) => p.met).map((p) => p.label),
    value: s.score,
  });
}

export function hypoglycaemia(x: ExamContext): ClassifierResult {
  const id = "hypoglycaemia_level";
  const def = x.cat.data.classifiers[id] as {
    rules: { result: string; when: Record<string, unknown> }[];
  };
  const label = labelOf(x, id);
  // A meter's LO is below every limit (EC-6); HI is above them.
  const g = x.vitals.glucose ?? x.vitals.glucoseReads ?? null;
  if (g === null) return r(id, label, { status: "none" });
  const hit = def.rules.find((q) => evalCond(q.when, x));
  const reading = typeof g === "number" ? `glucose ${g} mmol/L` : `glucose ${g} on the meter`;
  return r(id, label, {
    status: hit ? "result" : "none",
    result: hit?.result ?? null,
    text: hit ? (hit.result === "level_2" ? "Level 2 hypoglycaemia" : "Level 1 hypoglycaemia") : "",
    reason: reading,
    tone: hit?.result === "level_2" ? "strong" : hit ? "caution" : "ok",
    inputs: [reading],
  });
}

/** A classifier that is its catalogue rules, first match wins (EC-7: ketone_band, acuity_band,
 *  dr_review). Each rule carries its own words and tone; a rule named "incomplete" says so. */
export function ruleClassifier(x: ExamContext, id: string): ClassifierResult {
  const def = x.cat.data.classifiers[id] as
    | { rules?: { result: string; when: Record<string, unknown>; text?: string; tone?: Tone }[] }
    | undefined;
  const label = labelOf(x, id);
  const hit = def?.rules?.find((q) => evalCond(q.when, x));
  if (!hit) return r(id, label, { status: "none" });
  return r(id, label, {
    status: hit.result === "incomplete" ? "incomplete" : "result",
    result: hit.result,
    text: hit.text ?? hit.result,
    reason: label,
    tone: hit.tone ?? "neutral",
  });
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export function rosier(x: ExamContext): ClassifierResult {
  const id = "rosier";
  const def = x.cat.data.classifiers[id] as {
    applies_when: Record<string, unknown>;
    points: {
      points: number;
      when: Record<string, unknown>;
      label: string;
      requires_new?: boolean;
    }[];
  };
  const label = labelOf(x, id);
  if (!evalCond(def.applies_when, x)) return r(id, label, { status: "none" });
  const g = x.vitals.glucose;
  if (g === null)
    return r(id, label, {
      status: "incomplete",
      text: "Record glucose first",
      reason: "ROSIER is scored after a glucose check",
    });
  const panel = x.exam.panels?.rosier ?? {};
  if (!panel.syncope || !panel.seizure)
    return r(id, label, {
      status: "incomplete",
      text: "Confirm syncope and seizure for this episode",
      reason: "ROSIER counts this episode only",
    });
  const newSigns = new Set(panel.newSigns ?? []);
  const scored: string[] = [];
  let total = 0;
  for (const p of def.points) {
    let met: boolean;
    if (p.points < 0) {
      // Syncope and seizure: this episode, as confirmed in the panel.
      met = (/syncope/i.test(p.label) ? panel.syncope : panel.seizure) === "yes";
    } else met = evalCond(p.when, x) && (!p.requires_new || newSigns.has(slug(p.label)));
    if (met) {
      total += p.points;
      scored.push(`${p.label} ${p.points > 0 ? "+1" : "−1"}`);
    }
  }
  const low = g < 3.5;
  return r(id, label, {
    status: "result",
    result: total > 0 ? "likely" : "unlikely",
    text: `ROSIER ${total > 0 ? "+" : ""}${total}`,
    reason: scored.length ? scored.join(", ") : "no item scored",
    tone: total > 0 ? "strong" : "neutral",
    inputs: scored,
    value: total,
    ...(low ? { note: "Glucose below 3.5 mmol/L: treat and reassess" } : {}),
  });
}
export const rosierSignId = slug;

/* ─── Feet (IWGDF) ────────────────────────────────────────────────── */

type Foot = "left" | "right";
const SIDE: Record<Foot, "L" | "R"> = { left: "L", right: "R" };

export interface FootFacts {
  lops: boolean | null;
  pad: boolean | null;
  deformity: boolean;
}

export function footFacts(x: ExamContext, foot: Foot): FootFacts {
  const e = (id: string) => x.exam.entries[id];
  const mono = e("ex.feet.monofilament");
  const vib = e("ex.feet.vibration_128");
  const itt = e("ex.feet.ipswich_touch");
  const ittLim = x.cat.refNumber("REF-EX-ITT-LOPS") ?? 2;
  const monoN = mono?.attrs?.[`sites_not_felt_${foot}`];
  const monoLoss = mono?.state === "positive" && typeof monoN === "number" && monoN >= 1;
  const vibSide = vib?.attrs?.side;
  const vibLoss = vib?.state === "positive" && (vibSide === foot || vibSide === "both");
  const ittN = itt?.attrs?.toes_not_felt;
  const ittLoss = itt?.state === "positive" && typeof ittN === "number" && ittN >= ittLim; // both feet (SC4)
  const sensationRecorded =
    mono?.state === "negative" || typeof monoN === "number" || !!vib || !!itt;
  const lops = monoLoss || vibLoss || ittLoss ? true : sensationRecorded ? false : null;
  const cells = x.exam.blocks.pulses ?? {};
  const dp = cells["Dorsalis pedis"]?.[SIDE[foot]];
  const pt = cells["Posterior tibial"]?.[SIDE[foot]];
  const pad = dp === "absent" || pt === "absent" ? true : dp && pt ? false : null;
  const def = e("ex.feet.deformity");
  const dSide = def?.attrs?.side;
  return {
    lops,
    pad,
    deformity:
      def?.state === "positive" && (dSide === foot || dSide === "both" || dSide === undefined),
  };
}

function highRiskHistory(x: ExamContext): string[] {
  const h = x.exam.entries["ex.feet.foot_risk_history"];
  const out =
    h?.state === "positive"
      ? ((h.attrs?.history as string[] | undefined) ?? []).map((o) =>
          lc(optionLabel(x, "ex.feet.foot_risk_history", "history", o)),
        )
      : [];
  const seen = (x.exam.entries["ex.feet.deformity"]?.attrs?.seen as string[] | undefined) ?? [];
  if (seen.some((s) => s.endsWith("amputation")) && !out.some((s) => s.includes("amputation")))
    out.push("amputation");
  return out;
}

export function iwgdfRisk(
  x: ExamContext,
): ClassifierResult & { perFoot?: Record<Foot, number | null> } {
  const id = "iwgdf_risk";
  const def = x.cat.data.classifiers[id] as { results: Record<string, string> };
  const label = labelOf(x, id);
  const hist = highRiskHistory(x);
  const cat = (f: FootFacts): number | null => {
    if (f.lops === null || f.pad === null) return null;
    if ((f.lops || f.pad) && hist.length) return 3;
    if ((f.lops && f.pad) || (f.lops && f.deformity) || (f.pad && f.deformity)) return 2;
    if (f.lops || f.pad) return 1;
    return 0;
  };
  const L = footFacts(x, "left");
  const R = footFacts(x, "right");
  const perFoot = { left: cat(L), right: cat(R) };
  const anyRecorded = [L.lops, L.pad, R.lops, R.pad].some((v) => v !== null);
  if (!anyRecorded) return r(id, label, { status: "none" });
  const activeUlcer = x.exam.entries["ex.feet.ulcer"]?.state === "positive";
  const note = activeUlcer
    ? "Active ulcer: manage the ulcer; the screening interval applies after healing"
    : undefined;
  if (perFoot.left === null || perFoot.right === null)
    return {
      ...r(id, label, {
        status: "incomplete",
        text: "Incomplete",
        reason: "both feet need sensation and pulses recorded",
        note,
      }),
      perFoot,
    };
  const top = Math.max(perFoot.left, perFoot.right);
  const why = [
    ...(L.lops || R.lops ? ["loss of protective sensation"] : []),
    ...(L.pad || R.pad ? ["PAD sign (absent foot pulse)"] : []),
    ...(L.deformity || R.deformity ? ["foot deformity"] : []),
    ...hist.map((h) => `history: ${h}`),
  ];
  return {
    ...r(id, label, {
      status: "result",
      result: String(top),
      text: `IWGDF risk ${top}`,
      reason: why.length ? list(why) : "no loss of sensation or PAD sign",
      tone: top >= 2 ? "strong" : top === 1 ? "caution" : "ok",
      inputs: why,
      value: top,
      hint: def.results[String(top)],
      note,
    }),
    perFoot,
  };
}

const LOCAL_SIGNS = [
  "swelling_or_induration",
  "redness_0_5_to_under_2",
  "redness_2_cm_or_more",
  "local_tenderness",
  "local_warmth",
  "pus",
];

export function footInfection(x: ExamContext): ClassifierResult {
  const id = "dfi_iwgdf_idsa";
  const def = x.cat.data.classifiers[id] as { results: Record<string, string> };
  const label = labelOf(x, id);
  const u = x.exam.entries["ex.feet.ulcer"];
  if (u?.state !== "positive") return r(id, label, { status: "none" });
  const signs = (u.attrs?.infection_signs as string[] | undefined) ?? [];
  const local = signs.filter((s) => LOCAL_SIGNS.includes(s));
  // Redness in two bands is one sign.
  const localCount = new Set(local.map((s) => (s.startsWith("redness") ? "redness" : s))).size;
  const isLocal = localCount >= 2;
  const v = x.vitals;
  const sirs = [
    v.temp !== null && (v.temp > 38 || v.temp < 36),
    v.pulse !== null && v.pulse > 90,
    v.rr !== null && v.rr > 20,
  ].filter(Boolean).length;
  const deep =
    signs.includes("redness_2_cm_or_more") ||
    signs.includes("deeper_than_skin_and_subcutaneous_tissue");
  const grade = isLocal && sirs >= 2 ? 4 : isLocal && deep ? 3 : isLocal ? 2 : 1;
  const osteo = u.attrs?.osteomyelitis;
  const suffix = grade >= 3 && (osteo === "suspected" || osteo === "confirmed") ? " (O)" : "";
  const suggestO = u.attrs?.depth === "probes_to_bone_or_joint" && !osteo;
  const words = signs.map((s) => lc(optionLabel(x, "ex.feet.ulcer", "infection_signs", s)));
  return r(id, label, {
    status: "result",
    result: String(grade),
    text: `Infection grade ${grade}${suffix} (${def.results[String(grade)]!.toLowerCase()})`,
    reason: words.length
      ? list(words) + (grade === 4 ? `; ${sirs} SIRS signs` : "")
      : "no infection signs",
    tone: grade >= 3 ? "strong" : grade === 2 ? "caution" : "ok",
    inputs: words,
    value: grade,
    ...(suggestO ? { hint: "(O) suggested: probes to bone" } : {}),
  });
}

export function sinbad(x: ExamContext, infection: ClassifierResult): ClassifierResult {
  const id = "sinbad";
  const label = String(x.cat.data.classifiers[id]?.label ?? "SINBAD");
  const u = x.exam.entries["ex.feet.ulcer"];
  if (u?.state !== "positive") return r(id, label, { status: "none" });
  const side =
    u.attrs?.side === "left" || u.attrs?.side === "right" ? (u.attrs.side as Foot) : null;
  if (!side) return r(id, label, { status: "incomplete", text: "SINBAD needs the ulcer's side" });
  const f = footFacts(x, side);
  const cells = x.exam.blocks.pulses ?? {};
  const dp = cells["Dorsalis pedis"]?.[SIDE[side]];
  const pt = cells["Posterior tibial"]?.[SIDE[side]];
  const area = typeof u.attrs?.area === "number" ? u.attrs.area : null;
  const comp = [
    { k: "site", v: u.attrs?.site === "midfoot_or_hindfoot" ? 1 : u.attrs?.site ? 0 : null },
    {
      k: "ischaemia",
      v:
        dp && pt
          ? dp === "absent" && pt === "absent"
            ? 1
            : 0
          : dp === "present" ||
              pt === "present" ||
              dp === "bounding" ||
              pt === "bounding" ||
              dp === "reduced" ||
              pt === "reduced"
            ? 0
            : null,
    },
    { k: "neuropathy", v: f.lops === null ? null : f.lops ? 1 : 0 },
    {
      k: "bacterial infection",
      v: infection.status === "result" ? (Number(infection.result) >= 2 ? 1 : 0) : null,
    },
    {
      k: "area",
      v: area === null ? null : area >= (x.cat.refNumber("REF-EX-SINBAD-AREA") ?? 1) ? 1 : 0,
    },
    {
      k: "depth",
      v: u.attrs?.depth ? (u.attrs.depth === "skin_or_subcutaneous_only" ? 0 : 1) : null,
    },
  ];
  const total = comp.reduce((s, c) => s + (c.v ?? 0), 0);
  const complete = comp.every((c) => c.v !== null);
  return r(id, label, {
    status: complete ? "result" : "incomplete",
    result: String(total),
    text: `SINBAD ${total}${complete ? "" : " (incomplete)"}`,
    reason: comp.map((c) => `${c.k} ${c.v ?? "?"}`).join(", "),
    tone: total >= 3 ? "strong" : total >= 1 ? "caution" : "ok",
    inputs: comp.map((c) => `${c.k} ${c.v ?? "not recorded"}`),
    value: total,
  });
}

/* ─── Hints ───────────────────────────────────────────────────────── */

/** Motor pattern hint (display only, never in the note). */
export function motorPattern(x: ExamContext): string | null {
  const b = x.exam.blocks;
  const upper: string[] = [];
  const lower: string[] = [];
  const tone = x.exam.entries["ex.nervous.tone"];
  const toneVal = String(tone?.attrs?.tone ?? "");
  if (tone?.state === "positive" && /spastic|increased|rigid/.test(toneVal))
    upper.push("increased tone");
  if (tone?.state === "positive" && /reduced|flaccid/.test(toneVal)) lower.push("reduced tone");
  const reflexes = Object.values(b.reflexes ?? {})
    .flatMap((c) => [c.R, c.L])
    .filter((v): v is number => v !== undefined);
  if (reflexes.some((v) => v === 4)) upper.push("reflexes grade 4");
  if (reflexes.some((v) => v <= 1)) lower.push("reflexes 0 to 1");
  if (b.plantars?.R === "extensor" || b.plantars?.L === "extensor") upper.push("extensor plantar");
  if (x.exam.entries["ex.nervous.hoffmann"]?.state === "positive") upper.push("Hoffmann positive");
  const clonus = x.exam.entries["ex.nervous.ankle_clonus"];
  if (clonus?.state === "positive") upper.push("clonus");
  const wasting = x.exam.entries["ex.nervous.wasting_involuntary"];
  const seen = (wasting?.attrs?.seen as string[] | undefined) ?? [];
  if (seen.some((s) => /wasting|fasciculation/.test(s))) lower.push("wasting or fasciculation");
  if (!upper.length && !lower.length) return null;
  const kind =
    upper.length && lower.length
      ? "Mixed pattern"
      : upper.length
        ? "Upper motor neurone pattern"
        : "Lower motor neurone pattern";
  return `${kind}: ${list([...upper, ...lower])}`;
}

/** West Haven: the clinician chooses; this suggests from orientation, GCS and asterixis. */
export function westHavenSuggestion(x: ExamContext): "I" | "II" | "III" | "IV" | null {
  const c = x.exam.blocks.consciousness;
  const t = gcsTotal(c);
  const o = orientation(c);
  const signs = readAttr(x.cat, x.exam, "ex.general.hand_signs", "signs");
  const asterixis = Array.isArray(signs) && signs.includes("asterixis_flap");
  if (t !== null && t <= 8) return "IV";
  if (o.not.includes("place") || (t !== null && t < 14)) return "III";
  if (o.not.includes("time") || asterixis) return "II";
  if (o.full) return "I";
  return null;
}

/* ─── All of them ─────────────────────────────────────────────────── */

export function classifyAll(x: ExamContext, signoff: ExamSignoff): Map<string, ClassifierResult> {
  const respiratory = respiratoryDistress(x);
  const pain = painSeverity(x);
  const agitation = agitationSeverity(x);
  const infection = footInfection(x);
  const acuity = ruleClassifier(x, "acuity_band");
  const out: ClassifierResult[] = [
    dehydration(x),
    muac(x),
    bmiClass(x),
    waistRisk(x),
    whtrBand(x),
    respiratory,
    pain,
    agitation,
    distress(x, { respiratory, pain, agitation }),
    ...consciousnessResults(x),
    orthostatic(x),
    interArm(x),
    asthma(x),
    crb65Result(x),
    hypoglycaemia(x),
    ruleClassifier(x, "ketone_band"),
    acuity,
    // dr_review reads the acuity result.
    ruleClassifier({ ...x, results: new Map([[acuity.id, acuity]]) }, "dr_review"),
    rosier(x),
    iwgdfRisk(x),
    infection,
    sinbad(x, infection),
  ];
  return new Map(
    out.map((c) =>
      classifierIsLive(x, c.id, signoff) || c.status === "none"
        ? [c.id, c]
        : [
            c.id,
            {
              ...c,
              status: "awaiting_signoff" as const,
              result: null,
              text: "Awaiting sign-off",
              tone: "neutral" as const,
            },
          ],
    ),
  );
}
