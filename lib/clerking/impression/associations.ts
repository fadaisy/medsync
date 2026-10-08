import type { ExamContext } from "../exam/context";
import type { Board, ImpressionDraft } from "./board";
import type { DxCatalogue, DxLive } from "./catalogue";
import type { Viewer } from "./facts";

import ASSOCIATIONS from "@/data/clerking/dx-associations.v1.json";
import { onBoard } from "./board";
import { suggestedFor } from "./evidence";
import { canSee } from "./facts";

/**
 * A diagnosis's associations on step 09 (owner, 2026-10-08): its complications and the conditions
 * that commonly go with it, from the CSO-signed typing of the catalogue's `related` lists
 * (data/clerking/dx-associations.v1.json; alternatives are never offered). For each, what the
 * record already supports (the profile's own `suggest_for`, judged as the evidence matrix judges
 * it) or what would check for it (`tests_to_decide`). Decision support: nothing is added until the
 * clinician adds it, and the link to the parent lives in this visit's Impression (meta.with). Pure.
 */

export type AssociationType = "complication" | "goes_with";

export interface AssociationData {
  status: string;
  associations: Record<string, { complications?: string[]; goes_with?: string[] }>;
}

export interface Association {
  dxId: string;
  display: string;
  type: AssociationType;
  mustNotMiss: boolean;
  /** Already a diagnosis at this visit. */
  onVisit: boolean;
  /** Linked to this parent in the Impression (meta.with). */
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
    draft: ImpressionDraft;
  },
  data: AssociationData = ASSOCIATIONS as AssociationData,
): Association[] {
  if (!parent.dxId || !associationsLive(data)) return [];
  const entry = data.associations[parent.dxId];
  if (!entry) return [];
  const here = new Set(
    onBoard(i.board)
      .map((r) => r.dx.dxId)
      .filter(Boolean) as string[],
  );
  const linked = new Set(i.draft.meta[parent.logicalId]?.with ?? []);
  const sex = i.x.patient.sex;
  const sexRule = i.dx.cat.data.engine_rules.sex_specific;
  const out: Association[] = [];
  const add = (dxId: string, type: AssociationType) => {
    const p = i.dx.cat.profile(dxId);
    if (!p || !i.live.profile(dxId) || !canSee(i.viewer, p.restricted_class)) return;
    if (sex === "male" && sexRule.female_only.includes(dxId)) return;
    if (sex === "female" && sexRule.male_only.includes(dxId)) return;
    if (p.category === "obstetric" && i.x.patient.pregnant === false) return;
    const marks = suggestedFor(p, i);
    out.push({
      dxId,
      display: i.dx.names[dxId]?.display ?? dxId,
      type,
      mustNotMiss: p.must_not_miss,
      onVisit: here.has(dxId),
      linked: linked.has(dxId),
      supportedBy: [...marks].filter(([, s]) => s === "for").map(([ref]) => ref),
      checkFor: p.tests_to_decide.slice(0, 3),
    });
  };
  for (const id of entry.complications ?? []) add(id, "complication");
  for (const id of entry.goes_with ?? []) add(id, "goes_with");
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

/** Link a child diagnosis (by dx id) to its parent in the Impression draft. */
export function withLink(
  d: ImpressionDraft,
  parentLogicalId: string,
  dxId: string,
): ImpressionDraft {
  const m = d.meta[parentLogicalId] ?? {};
  if (m.with?.includes(dxId)) return d;
  return {
    ...d,
    meta: { ...d.meta, [parentLogicalId]: { ...m, with: [...(m.with ?? []), dxId] } },
  };
}
