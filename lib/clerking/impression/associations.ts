import type { ExamContext } from "../exam/context";
import type { Board } from "./board";
import type { DxCatalogue, DxLive, RestrictedClass } from "./catalogue";
import type { Viewer } from "./facts";
import type { Edge } from "./relations";
import type { DueLabel } from "./relations-catalogue";

import ASSOCIATIONS from "@/data/clerking/dx-associations.v1.json";
import { onBoard } from "./board";
import { suggestedFor } from "./evidence";
import { canSee } from "./facts";
import { linkedCandidates } from "./relations-catalogue";

/**
 * "Add a linked diagnosis" under a diagnosis (owner, 2026-10-08; dx-relations-design §2.4): its
 * signed complications, the diagnoses it can cause (the cause catalogue, with its suggest_when), and
 * what goes with it (`linkedCandidates`). For each, what the record already supports (the
 * profile's own `suggest_for`, judged as the evidence matrix judges it) or what would check for it
 * (`tests_to_decide`). Decision support: nothing is added or linked until the clinician adds it;
 * the link is a relation in the record (condition_relations, D-REL-02). Pure.
 */

export type AssociationType = "complication" | "cause" | "goes_with";

export interface AssociationData {
  status: string;
  associations: Record<string, { complications?: string[]; goes_with?: string[] }>;
}

export interface Association {
  dxId: string;
  display: string;
  type: AssociationType;
  /** The relation it would be: the candidate due_to the parent (with its label), or associated. */
  relationType: "due_to" | "associated_with";
  label: DueLabel | null;
  /** The catalogue entry, stored on the relation. */
  ref: string;
  /** When the cause catalogue says it is worth offering, in words. */
  suggestWhen: string | null;
  mustNotMiss: boolean;
  /** Already a diagnosis at this visit (its logical id). */
  onVisit: string | null;
  /** Already linked to this parent in the record. */
  linked: boolean;
  /** Recorded findings that support it (finding refs, for the step to name). */
  supportedBy: string[];
  /** Test ids that would check for it. */
  checkFor: string[];
}

/** Only a signed typing is used: a draft offers nothing. */
export const associationsLive = (d: AssociationData = ASSOCIATIONS as AssociationData) =>
  d.status.startsWith("signed");

export function associationsOf(
  parent: { dxId: string | null; logicalId: string },
  i: {
    x: ExamContext;
    dx: { cat: DxCatalogue; names: Readonly<Record<string, { display: string }>> };
    live: DxLive;
    viewer: Viewer;
    board: Board;
    /** The record's relations (0096). */
    relations: readonly Pick<Edge, "conditionId" | "relatedConditionId" | "relationType">[];
  },
): Association[] {
  if (!parent.dxId) return [];
  const here = new Map(
    onBoard(i.board).flatMap((r) => (r.dx.dxId ? [[r.dx.dxId, r.dx.logicalId] as const] : [])),
  );
  const linkedTo = new Set(
    i.relations.flatMap((e) =>
      e.conditionId === parent.logicalId
        ? [e.relatedConditionId]
        : e.relatedConditionId === parent.logicalId
          ? [e.conditionId]
          : [],
    ),
  );
  const sex = i.x.patient.sex;
  const sexRule = i.dx.cat.data.engine_rules.sex_specific;
  const out: Association[] = [];
  for (const c of linkedCandidates(parent.dxId)) {
    const p = i.dx.cat.profile(c.dxId);
    if (!p || !i.live.profile(c.dxId) || !canSee(i.viewer, p.restricted_class)) continue;
    if (!canSee(i.viewer, (c.restrictedClass as RestrictedClass | null) ?? null)) continue;
    if (sex === "male" && sexRule.female_only.includes(c.dxId)) continue;
    if (sex === "female" && sexRule.male_only.includes(c.dxId)) continue;
    if (p.category === "obstetric" && i.x.patient.pregnant === false) continue;
    const marks = suggestedFor(p, i);
    const onVisit = here.get(c.dxId) ?? null;
    out.push({
      dxId: c.dxId,
      display: i.dx.names[c.dxId]?.display ?? c.dxId,
      type:
        c.type === "associated_with"
          ? "goes_with"
          : c.label === "complication"
            ? "complication"
            : "cause",
      relationType: c.type,
      label: c.label,
      ref: c.ref,
      suggestWhen: c.suggestWhen,
      mustNotMiss: p.must_not_miss,
      onVisit,
      linked: !!onVisit && linkedTo.has(onVisit),
      supportedBy: [...marks].filter(([, s]) => s === "for").map(([ref]) => ref),
      checkFor: p.tests_to_decide.slice(0, 3),
    });
  }
  // Supported first, then must-not-miss, then the catalogue's order.
  return out
    .map((a, n) => ({ a, n }))
    .sort(
      (p, q) =>
        Number(q.a.supportedBy.length > 0) - Number(p.a.supportedBy.length > 0) ||
        Number(q.a.mustNotMiss) - Number(p.a.mustNotMiss) ||
        p.n - q.n,
    )
    .map(({ a }) => a);
}
