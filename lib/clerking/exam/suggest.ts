import type { ExamContext } from "./context";

import { evalCond, redFlagsYes } from "./context";

/**
 * Suggestions (PROMPT-CLERKING-EXAM-V2 §5.12, D-EX-18): the history, the patient and NEWS2 lead;
 * they never decide. A chip names its target and says why; it is "done" when the target is
 * recorded or marked not examined; it never answers anything. Ordered: to do first, then the
 * red-flag rules, then the rest (catalogue order). Pure.
 */

export interface Suggestion {
  /** The target (item id, system, "system/part", "system/part#block", a block id, or vs.*). */
  target: string;
  label: string;
  reasons: string[];
  ruleIds: string[];
  done: boolean;
  urgent: boolean;
}

/** Where a target opens: system and optional part / item / panel. */
export interface TargetPlace {
  system: string;
  part?: string;
  item?: string;
  block?: string;
  panel?: "postural" | "bothArms" | "peakFlow" | "ketones";
  field?: string;
}

const PANEL: Record<string, TargetPlace["panel"]> = {
  "vs.postural": "postural",
  "vs.both_arms": "bothArms",
  "vs.pef": "peakFlow",
  "vs.ketones": "ketones",
};

export function placeOfTarget(x: ExamContext, target: string): TargetPlace | null {
  if (target === "vs") return { system: "vitals" };
  if (target.startsWith("vs."))
    return PANEL[target]
      ? { system: "vitals", panel: PANEL[target] }
      : { system: "vitals", field: target };
  const [path, block] = target.split("#");
  if (path!.includes("/")) {
    const [sys, part] = path!.split("/");
    return { system: sys!.replace(/^ex\./, ""), part, ...(block ? { block } : {}) };
  }
  const item = x.cat.placeOf(path!);
  if (item) return { system: item.system.id, part: item.part.id, item: path };
  // A block addressed by id (ex.cardiovascular.pulses_grid).
  const b = Object.entries(x.cat.data.blocks).find(([, v]) => v.id === path);
  if (b) {
    const [sys, part] = String(b[1].part).split("/");
    return { system: sys!.replace(/^ex\./, ""), part, block: b[0] };
  }
  const sys = path!.replace(/^ex\./, "");
  return x.cat.system(sys) ? { system: sys } : null;
}

function blockDone(x: ExamContext, block: string): boolean {
  const b = x.exam.blocks;
  if (block === "amts") return !!b.amts && Object.keys(b.amts).length > 0;
  if (block === "pulses_grid") return !!b.pulses && Object.keys(b.pulses).length > 0;
  if (block === "motor_grids")
    return (
      !!(b.power && Object.keys(b.power).length) || !!(b.reflexes && Object.keys(b.reflexes).length)
    );
  if (block === "consciousness") return !!b.consciousness;
  return false;
}

const VS_VALUE: Record<string, keyof ExamContext["vitals"]> = {
  "vs.bp": "sbp",
  "vs.pulse": "pulse",
  "vs.rr": "rr",
  "vs.spo2": "spo2",
  "vs.temp": "temp",
  "vs.glucose": "glucose",
  "vs.weight": "weight",
  "vs.height": "height",
  "vs.waist": "waist",
};

export function targetDone(x: ExamContext, target: string): boolean {
  const d = x.exam;
  if (target === "vs") return !!d.vitalsSavedAt;
  if (target.startsWith("vs.")) {
    const p = d.panels ?? {};
    if (target === "vs.postural")
      return !!p.postural?.lying && !!(p.postural.standing_1min || p.postural.standing_3min);
    if (target === "vs.both_arms") return !!p.bothArms?.right && !!p.bothArms.left;
    if (target === "vs.pef") return !!p.peakFlow?.best;
    if (target === "vs.ketones") return p.ketones?.blood !== undefined || !!p.ketones?.urine;
    const saved = d.vitalsSavedFields?.includes(target);
    const typed =
      !!d.vitalsDraft && x.vitals[VS_VALUE[target] ?? "sbp"] !== null && draftHas(x, target);
    return !!saved || typed;
  }
  const place = placeOfTarget(x, target);
  if (!place) return false;
  if (d.systems?.[place.system]?.notExamined) return true; // the system was marked not examined
  if (place.item) return !!d.entries[place.item];
  if (place.block) return blockDone(x, place.block);
  const system = x.cat.system(place.system);
  if (!system) return false;
  const parts = system.parts.filter((p) => !place.part || p.id === place.part);
  if (parts.some((p) => p.block && blockDone(x, p.block))) return true;
  if (place.system === "general" && place.part === "consciousness")
    return blockDone(x, "consciousness");
  return parts.some((p) => p.items.some((id) => !!d.entries[id]));
}

function draftHas(x: ExamContext, target: string): boolean {
  const v = x.exam.vitalsDraft ?? {};
  const key: Record<string, string | undefined> = {
    "vs.bp": v.bp,
    "vs.pulse": v.pulse,
    "vs.rr": v.rr,
    "vs.spo2": v.spo2,
    "vs.temp": v.temp,
    "vs.glucose": v.glucose && v.glucoseContext ? v.glucose : undefined,
    "vs.weight": v.weight,
    "vs.height": v.height,
    "vs.waist": v.waist,
  };
  return !!key[target]?.trim();
}

function fillWhy(x: ExamContext, why: string, when: Record<string, unknown>): string {
  return why.replace(/\{([a-z_]+)\}/g, (_, k: string) => {
    if (k === "red_flags") {
      const sym = (JSON.stringify(when).match(/"symptom":"(sym\.[a-z_0-9]+)"/) ?? [])[1];
      return sym
        ? redFlagsYes(x, sym)
            .map((w) => w.charAt(0).toLowerCase() + w.slice(1))
            .join(", ")
        : "red flags";
    }
    if (k === "parameter") {
      const p = x.news2Latest?.parameters.find(
        (q) => q.present && q.points === 3 && q.parameter !== "supplemental_oxygen",
      );
      return p
        ? p.parameter.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
        : "A parameter";
    }
    if (k === "time") return x.latestSetTime ?? "the last set";
    return "";
  });
}

export function suggestions(x: ExamContext): Suggestion[] {
  const byTarget = new Map<string, Suggestion>();
  const order: string[] = [];
  for (const rule of x.cat.data.suggestion_rules.rules) {
    if (!evalCond(rule.when, x)) continue;
    const urgent = /red_flag/.test(JSON.stringify(rule.when));
    const why = fillWhy(x, rule.why, rule.when);
    for (const s of rule.suggest) {
      const cur = byTarget.get(s.target);
      if (cur) {
        if (!cur.reasons.includes(why)) cur.reasons.push(why);
        cur.ruleIds.push(rule.id);
        cur.urgent ||= urgent;
        continue;
      }
      byTarget.set(s.target, {
        target: s.target,
        label: s.label,
        reasons: [why],
        ruleIds: [rule.id],
        done: targetDone(x, s.target),
        urgent,
      });
      order.push(s.target);
    }
  }
  const all = order.map((t) => byTarget.get(t)!);
  const rank = (s: Suggestion) => (s.done ? 2 : 0) + (s.urgent ? 0 : 1);
  return all
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map(({ s }) => s);
}
