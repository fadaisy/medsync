import type { ExamContext } from "../exam/context";
import type { Board } from "./board";
import type { Cond, DdxRule, DxCatalogue, DxLive, DxProfile } from "./catalogue";
import type { Viewer } from "./facts";

import { onBoard } from "./board";
import { atomTrue } from "./evidence";
import { canSee } from "./facts";

/**
 * "Also considered with these findings" (§5.3, D-SI-12, D-DX-08): the differential rules fired
 * by this encounter, in rule order (rules fired by red flags, vital signs and examination findings
 * before rules fired by the complaint alone), must-not-miss first within a rule, then catalogue
 * order. Never ranked by likelihood (SI2). Decision support: nothing is added until the clinician
 * adds it. Pure.
 */

export interface Suggestion {
  dxId: string;
  profile: DxProfile;
  /** Every fired rule's `why`, in rule order (the chip's tooltip and accessible description). */
  why: string[];
  rules: string[];
  mustNotMiss: boolean;
  /** A symptom-level term: offered for the leading slot only (when it is empty). */
  forLeading: boolean;
}

export interface SuggestInput {
  x: ExamContext;
  dx: DxCatalogue;
  live: DxLive;
  viewer: Viewer;
  board: Board;
}

/** A rule fired by the complaint alone: every leaf is a plain symptom answer. */
export function complaintOnly(c: Cond): boolean {
  if ("all" in c || "any" in c) return ((c.all ?? c.any) as Cond[]).every(complaintOnly);
  if ("not" in c) return complaintOnly(c.not as Cond);
  return "symptom" in c && !("red_flag" in c) && !("any_red_flag" in c);
}

export function firedRules(i: Pick<SuggestInput, "x" | "dx" | "live" | "viewer">): DdxRule[] {
  const fired = i.dx.rules.filter((r) => i.live.rule(r.id) && atomTrue(r.when, i));
  return [
    ...fired.filter((r) => !complaintOnly(r.when)),
    ...fired.filter((r) => complaintOnly(r.when)),
  ];
}

export function suggestions(i: SuggestInput): Suggestion[] {
  const sex = i.x.patient.sex;
  const sexRule = i.dx.data.engine_rules.sex_specific;
  const onIt = new Set(
    onBoard(i.board)
      .map((r) => r.dx.dxId)
      .filter(Boolean) as string[],
  );
  const out = new Map<string, Suggestion>();
  for (const rule of firedRules(i)) {
    const inRule = new Set(rule.suggest);
    // Symptom-level terms only while no disease-level diagnosis from this rule is on the board.
    const ruleHasDisease = [...onIt].some(
      (id) => inRule.has(id) && i.dx.profile(id)?.kind !== "symptom_level",
    );
    const first = rule.must_not_miss_first.filter((id) => inRule.has(id));
    const order = [...first, ...rule.suggest.filter((id) => !first.includes(id))];
    for (const id of order) {
      const p = i.dx.profile(id);
      if (!p || !i.live.profile(id) || onIt.has(id)) continue;
      if (!canSee(i.viewer, p.restricted_class)) continue;
      if (p.requires && !atomTrue(p.requires, i)) continue; // EC-5: unknown never opens the gate
      if (sex === "male" && sexRule.female_only.includes(id)) continue;
      if (sex === "female" && sexRule.male_only.includes(id)) continue;
      // R-6: a recorded "not pregnant" suppresses pregnancy-related diagnoses.
      if (p.category === "obstetric" && i.x.patient.pregnant === false) continue;
      const symptomLevel = p.kind === "symptom_level";
      if (symptomLevel && (i.board.leading || ruleHasDisease)) continue;
      const had = out.get(id);
      if (had) {
        had.why.push(rule.why);
        had.rules.push(rule.id);
      } else
        out.set(id, {
          dxId: id,
          profile: p,
          why: [rule.why],
          rules: [rule.id],
          mustNotMiss: p.must_not_miss,
          forLeading: symptomLevel,
        });
    }
  }
  return [...out.values()];
}

export const SUGGESTION_CHIPS = 8;
