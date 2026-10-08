/**
 * The diabetes pack inside the ten-step clerking desk (NCD_DM_DESK, ADR 0216): the pack runs on the
 * clerking record as it is written and its result goes where the clinician already looks. Pure.
 *
 * - Flags: the one interrupt is urgent; same-day items and medicines to review are caution, a red
 *   therapy flag urgent. Decision support only, like every flag (ADR 0165).
 * - Impression: the default criteria set's verdict, in the pack's words, leads the diabetes
 *   suggestion (owner decision 2026-10-08: the desk's rules find the case, the pack says how sure).
 * - The profile card shows once the pack sees diabetes or a reason to suspect it; an empty record
 *   fires nothing (ADR 0205), so the card stays away for everyone else.
 */
import type { DiabetesPack, PackInput, PackResult } from "./types";
import type { PackView } from "./view";
import type { Flag } from "@/lib/clerking/flags";

import { explainCriterion, runProtocol } from "./engine";
import { buildPackView } from "./view";

export interface DeskVerdict {
  state: string;
  /** Leads the diabetes suggestion's reasons in Impression. */
  words: string;
}

/** One criterion of a criteria set, with each of its parts judged (for the hover detail). */
export interface DeskCriterion {
  id: string;
  label: string;
  state: string;
  parts: {
    feature: string;
    display: string;
    state: string;
    value: string | null;
    unit: string | null;
  }[];
}

export interface DeskDiabetes {
  view: PackView;
  /** Criteria set id → its criteria, each part judged as the engine judges it. */
  criteria: Record<string, DeskCriterion[]>;
  result: PackResult;
  flags: Flag[];
  verdict: DeskVerdict | null;
  /** Show the profile card: something fired, a criteria set is met, or diabetes is known. */
  show: boolean;
  established: boolean;
}

const restrictedOf = (x: { restrictedClasses?: string[] } | undefined) =>
  !!x?.restrictedClasses?.length;

export function deskDiabetes(pack: DiabetesPack, input: PackInput): DeskDiabetes {
  const result = runProtocol(pack, input);
  const view = buildPackView(pack, input, result);
  const items = new Map<string, { x?: { restrictedClasses?: string[] } }>(
    [...pack.rules, ...pack.management, ...pack.therapyFlags].map((i) => [i.id, i]),
  );
  const flags: Flag[] = [];
  if (view.interrupt)
    flags.push({
      ruleId: view.interrupt.id,
      level: "urgent",
      badge: "Diabetes: act now",
      reason: [view.interrupt.title, ...view.interrupt.actions].join(" Also: "),
      where: "Diabetes pack",
      section: "exam",
      restricted: restrictedOf(items.get(view.interrupt.id)?.x),
    });
  for (const t of view.today)
    flags.push({
      ruleId: t.id,
      level: "caution",
      badge: t.urgency === "today" ? "Diabetes: today" : "Diabetes: soon",
      reason: t.display,
      where: "Diabetes pack",
      section: "exam",
      restricted: restrictedOf(items.get(t.id)?.x),
    });
  for (const f of view.flags)
    flags.push({
      ruleId: f.id,
      level: f.severity === "red" ? "urgent" : "caution",
      badge: f.display,
      reason: f.action,
      where: "Medicines",
      section: "pmh",
      restricted: restrictedOf(items.get(f.id)?.x),
    });

  const set = [...pack.diagnosis, ...pack.diagnosisPending].find(
    (s) => s.x.default === true && (s.x.verdict ?? "diabetes") === "diabetes",
  );
  const state = set ? result.diagnosis[set.id] : undefined;
  const name = set ? (SET_NAME[set.id] ?? set.id) : "";
  const met = set?.anyOf.find((c) => result.criteria[c.id] === "met");
  const verdict: DeskVerdict | null =
    !set || !state || state === "not_applicable"
      ? null
      : state === "met"
        ? { state, words: `${name} criteria met: ${met?.label ?? ""}`.replace(/: $/, "") }
        : state === "not_met"
          ? { state, words: `${name} criteria not met on the recorded results` }
          : state === "unavailable"
            ? { state, words: `${name} criteria cannot be assessed here` }
            : {
                state,
                words: `Possible diabetes: the ${name} criteria need a classic symptom or a repeat result on another day`,
              };
  const show =
    input.established ||
    Object.keys(result.fired).length > 0 ||
    view.diagnosis.some((d) => d.state === "met");
  const shown = new Set(view.diagnosis.map((d) => d.id));
  const criteria: Record<string, DeskCriterion[]> = {};
  for (const s of [...pack.diagnosis, ...pack.diagnosisPending])
    if (shown.has(s.id))
      criteria[s.id] = s.anyOf.map((c) => ({
        id: c.id,
        label: c.label,
        state: result.criteria[c.id] ?? "insufficient",
        parts: explainCriterion(pack, input, c).map((x) => ({
          feature: x.feature,
          display: pack.features[x.feature]?.display ?? x.feature,
          state: x.state,
          value: x.value === null || x.value === undefined ? null : String(x.value),
          unit: x.unit,
        })),
      }));
  return { view, result, criteria, flags, verdict, show, established: input.established };
}

const SET_NAME: Record<string, string> = {
  ug_integrated_dm_2026: "Uganda 2026",
  who_hearts_d_2020: "WHO HEARTS-D",
  ug_ucg_2023: "UCG 2023",
};
