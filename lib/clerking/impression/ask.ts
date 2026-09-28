import type { History, YesNo } from "../answers";
import type { ExamContext } from "../exam/context";
import type { Board, BoardRow } from "./board";
import type { AskTarget, DxCatalogue } from "./catalogue";
import type { StepTag, Viewer } from "./facts";

import {
  setAlcohol,
  setFlag,
  setRos,
  setTobacco,
  toggleEntry,
  toggleIn,
  updateComplaint,
  updateRosDetail,
} from "../answers";
import { lc } from "../compose";
import { entryOf } from "../exam/answers";
import { symptomAnswer, symptomEntry } from "../exam/context";
import { onBoard } from "./board";
import { askKey } from "./catalogue";
import { canSee, medicinePick, refClass } from "./facts";

/**
 * "Not asked yet, relevant to your differential" (§5.2, D-SI-11, D-SI-17): the union of `ask`
 * targets of the signed profiles on the board, minus those already answered, one row per target
 * with the diagnoses that ask it. Each row says how it is answered and which step owns the answer
 * (SI4): history yes/no in place, social options in place, medicines and examination navigate.
 * Pure: answering goes through the owner step's own write path.
 */

export type AskMode =
  /** No / Yes in place (symptom, red flag, past, family). */
  | "yesno"
  /** The item's own options in place (a social item). */
  | "options"
  /** The red flag's symptom is not yet answered: ask the symptom first. */
  | "symptom_first"
  /** Open the owner step at the item (examination, vital, classifier, medicine, occupation). */
  | "navigate";

export interface AskRow {
  key: string;
  target: AskTarget;
  label: string;
  /** The diagnoses that ask it, in board order ("· for Sepsis, Cold exposure"). */
  for: string[];
  forIds: string[];
  step: StepTag;
  mode: AskMode;
  options?: { id: string; label: string }[];
  multiple?: boolean;
}

export const SOCIAL_LABEL: Record<string, string> = {
  tobacco: "Tobacco",
  alcohol: "Alcohol",
  substances: "Other substances",
  living: "Who they live with",
  activity: "Day-to-day activity",
  occupation: "Occupation",
  travel: "Recent travel",
  diet: "Diet",
};

export const VITAL_LABEL: Record<string, string> = {
  "vs.bp": "Blood pressure",
  "vs.pulse": "Pulse",
  "vs.rr": "Respiratory rate",
  "vs.spo2": "SpO₂",
  "vs.temp": "Temperature",
  "vs.glucose": "Capillary glucose",
  "vs.consciousness": "Consciousness (ACVPU)",
  "vs.weight": "Weight",
  "vs.height": "Height",
  "vs.bmi": "BMI (weight and height)",
  "vs.waist": "Waist",
  "vs.muac": "MUAC",
};

type Opt = { id: string; label: string };

export function socialOptions(
  x: ExamContext,
  id: string,
): { options: Opt[]; multiple: boolean } | null {
  const sh = x.history.cat.data.social_history as unknown as Record<string, unknown>;
  const pick = (v: unknown) => (Array.isArray(v) ? (v as Opt[]) : null);
  const o =
    id === "tobacco"
      ? pick((sh.tobacco as { status?: unknown })?.status)
      : id === "alcohol"
        ? pick((sh.alcohol as { pattern?: unknown })?.pattern)
        : id === "travel"
          ? pick((sh.travel as { options?: unknown })?.options)
          : id === "substances"
            ? pick((sh.other_substances as { options?: unknown })?.options)
            : pick(sh[id]);
  return o
    ? { options: o.map(({ id, label }) => ({ id, label })), multiple: id === "substances" }
    : null;
}

/** Answered already: the target leaves the list ("not asked" is the absence of an answer). */
export function answered(t: AskTarget, x: ExamContext): boolean {
  const h = x.history.answers;
  switch (t.kind) {
    case "symptom":
      return symptomAnswer(x, t.id) !== undefined;
    case "red_flag": {
      const e = symptomEntry(x, t.symptom);
      if (e) return e.flags[t.red_flag] !== undefined;
      return symptomAnswer(x, t.symptom) === "no"; // no symptom: its red flag is moot
    }
    case "past_condition":
      return h.past.conditions[t.id]?.answer !== undefined;
    case "family_condition":
      return h.family[t.id]?.answer !== undefined;
    case "medicine":
      return !!h.past.medicinesNone || x.medicines.some((m) => medicinePick(x, m.name) === t.id);
    case "social": {
      const v = (h.social as Record<string, unknown>)[t.id];
      return v !== undefined && !(Array.isArray(v) && v.length === 0) && v !== "";
    }
    case "exam_item":
      return !!entryOf(x.cat, x.exam, t.id);
    case "vital": {
      const v = x.vitals;
      const map: Record<string, boolean> = {
        "vs.bp": v.sbp !== null,
        "vs.pulse": v.pulse !== null,
        "vs.rr": v.rr !== null,
        "vs.spo2": v.spo2 !== null,
        "vs.temp": v.temp !== null,
        "vs.glucose": v.glucose !== null,
        "vs.weight": v.weight !== null,
        "vs.height": v.height !== null,
        "vs.bmi": v.weight !== null && v.height !== null,
        "vs.waist": v.waist !== null,
        "vs.consciousness":
          !!x.exam.blocks.consciousness ||
          !!x.news2Latest?.parameters.some((p) => p.parameter === "consciousness" && p.present),
        "vs.muac": typeof x.exam.entries["ex.general.nutrition"]?.attrs?.muac === "number",
      };
      return map[t.id] ?? false;
    }
    case "classifier":
      return (x.results?.get(t.id) as { status?: string } | undefined)?.status === "result";
  }
}

const refOfTarget = (t: AskTarget): string | null =>
  t.kind === "symptom"
    ? `sym:${t.id}`
    : t.kind === "red_flag"
      ? `sym:${t.symptom}#${t.red_flag}`
      : t.kind === "past_condition"
        ? `pmh:${t.id}`
        : t.kind === "medicine"
          ? `med:${t.id}`
          : t.kind === "social"
            ? `soc:${t.id}`
            : t.kind === "exam_item"
              ? `ex:${t.id}`
              : null;

function describe(
  t: AskTarget,
  x: ExamContext,
): Omit<AskRow, "key" | "target" | "for" | "forIds"> | null {
  const hcat = x.history.cat;
  switch (t.kind) {
    case "symptom": {
      const s = hcat.symptom(t.id);
      return s ? { label: s.label, step: "03", mode: "yesno" } : null;
    }
    case "red_flag": {
      const s = hcat.symptom(t.symptom);
      const f = s?.red_flags.find((r) => r.id === t.red_flag);
      if (!s || !f) return null;
      const first = !symptomEntry(x, t.symptom);
      return {
        label: first
          ? s.label
          : `${f.label.replace(/\s*\(for example[^)]*\)/i, "")} (with ${lc(s.label)})`,
        step: x.history.answers.complaints.some((c) => c.symptom === t.symptom) ? "01" : "03",
        mode: first ? "symptom_first" : "yesno",
      };
    }
    case "past_condition": {
      const c = hcat.data.past_history.conditions.find((p) => p.id === t.id);
      return c ? { label: c.label, step: "04", mode: "yesno" } : null;
    }
    case "family_condition": {
      const c = hcat.data.family_history.conditions.find((p) => p.id === t.id);
      return c ? { label: `Family history of ${lc(c.label)}`, step: "05", mode: "yesno" } : null;
    }
    case "medicine": {
      const p = (hcat.data.medicines.quick_picks as readonly Opt[]).find((q) => q.id === t.id);
      return p ? { label: `Taking ${lc(p.label)}`, step: "04", mode: "navigate" } : null;
    }
    case "social": {
      const o = socialOptions(x, t.id);
      return {
        label: SOCIAL_LABEL[t.id] ?? t.id,
        step: "06",
        mode: o ? "options" : "navigate",
        ...(o ? { options: o.options, multiple: o.multiple } : {}),
      };
    }
    case "exam_item": {
      const item = x.cat.item(t.id);
      return item ? { label: item.label, step: "07", mode: "navigate" } : null;
    }
    case "vital":
      return { label: VITAL_LABEL[t.id] ?? t.id, step: "07", mode: "navigate" };
    case "classifier": {
      const c = (x.cat.data.classifiers as Record<string, { label?: string }>)[t.id];
      return { label: c?.label ?? t.id, step: "07", mode: "navigate" };
    }
  }
}

export interface AskInput {
  x: ExamContext;
  dx: DxCatalogue;
  board: Board;
  viewer: Viewer;
  /** One diagnosis only (the Details panel). */
  only?: string;
}

export function asks(i: AskInput): AskRow[] {
  const rows = new Map<string, AskRow>();
  const board: BoardRow[] = onBoard(i.board).filter((r) => !i.only || r.dx.logicalId === i.only);
  for (const r of board) {
    if (!r.profile) continue; // unsigned reasoning is inert (SI10)
    for (const t of r.profile.ask) {
      const ref = refOfTarget(t);
      if (ref && !canSee(i.viewer, refClass(ref, i.x))) continue; // SI9
      if (answered(t, i.x)) continue;
      const d = describe(t, i.x);
      if (!d) continue;
      // Until its symptom is answered, a red flag's ask is the symptom's own question: one row
      // for every diagnosis that asks either (its red flag follows a Yes).
      const key =
        t.kind === "red_flag" && d.mode === "symptom_first"
          ? askKey({ kind: "symptom", id: t.symptom })
          : askKey(t);
      const had = rows.get(key);
      if (had) {
        if (!had.forIds.includes(r.dx.logicalId)) {
          had.for.push(r.dx.display);
          had.forIds.push(r.dx.logicalId);
        }
        continue;
      }
      rows.set(key, { key, target: t, for: [r.dx.display], forIds: [r.dx.logicalId], ...d });
    }
  }
  // History first (in step order), then examination.
  return [...rows.values()].sort((a, b) => a.step.localeCompare(b.step));
}

/* ─── Answering in place (SI4: through the history step's own updaters) ─── */

/** Write an answer to its owner: the history draft. Examination, vital, classifier and medicine
 *  targets are never answered here (they navigate). */
export function answerAsk(h: History, t: AskTarget, answer: YesNo | string): History {
  switch (t.kind) {
    case "symptom":
      return setRos(h, t.id, answer as YesNo);
    case "red_flag": {
      const c = h.complaints.find((x) => x.symptom === t.symptom);
      if (c) return updateComplaint(h, c.key, (e) => setFlag(e, t.red_flag, answer as YesNo));
      if (h.ros[t.symptom] !== "yes") return setRos(h, t.symptom, answer as YesNo); // symptom first
      return updateRosDetail(h, t.symptom, (e) => setFlag(e, t.red_flag, answer as YesNo));
    }
    case "past_condition":
      return {
        ...h,
        past: { ...h.past, conditions: toggleEntry(h.past.conditions, t.id, answer as YesNo) },
      };
    case "family_condition":
      return { ...h, family: toggleEntry(h.family, t.id, answer as YesNo) };
    case "social": {
      const s = h.social;
      if (t.id === "tobacco") return { ...h, social: setTobacco(s, answer) };
      if (t.id === "alcohol") return { ...h, social: setAlcohol(s, answer) };
      if (t.id === "substances")
        return { ...h, social: { ...s, substances: toggleIn(s.substances, answer, ["none"]) } };
      const cur = (s as Record<string, unknown>)[t.id];
      return { ...h, social: { ...s, [t.id]: cur === answer ? undefined : answer } };
    }
    default:
      return h;
  }
}
