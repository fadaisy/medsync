import type { DeskDiagnosis, DeskPayload, DeskRelation } from "./model";

/**
 * What the board shows the instant a clinician taps, before the server answers (owner, 2026-10-09:
 * "I want this to be instant"). Each op is the expected outcome of one chart action; React's
 * useOptimistic keeps it until the action's own response brings the real payload (the action
 * refreshes the page in that response), and drops it if the action is refused. Rows made here carry
 * a `pending:` id until then: the desk refuses to act on them, never sends a made-up id. Pure.
 */

export type BoardOp =
  | {
      kind: "add-dx";
      key: string;
      termId: string | null;
      display: string;
      verification: string;
      primary: boolean;
    }
  | { kind: "remove-dx"; logicalId: string }
  | { kind: "leading"; logicalId: string }
  | { kind: "to-differential"; logicalId: string; retireLinks: boolean }
  | {
      kind: "relate";
      key: string;
      conditionId: string;
      relatedConditionId: string;
      relationType: DeskRelation["relationType"];
      label: DeskRelation["label"];
    }
  | { kind: "unlink"; id: string }
  | { kind: "move"; id: string; position: number }
  | {
      kind: "add-linked";
      key: string;
      parentId: string;
      /** An existing diagnosis on the visit to link, or a new one to add. */
      conditionId?: string;
      termId: string | null;
      display: string;
      relationType: DeskRelation["relationType"];
      label: DeskRelation["label"];
    };

export const PENDING = "pending:";
export const isPending = (id: string) => id.startsWith(PENDING);

function newDx(key: string, o: { termId: string | null; display: string }): DeskDiagnosis {
  return {
    id: `${PENDING}${key}`,
    logicalId: `${PENDING}${key}`,
    termId: o.termId,
    display: o.display,
    code: null,
    verification: "provisional",
    rank: "secondary",
    restricted: false,
    onProblemList: false,
    cosignPending: false,
    addedHere: true,
  };
}

function newRelation(
  key: string,
  p: DeskPayload,
  o: Pick<DeskRelation, "conditionId" | "relatedConditionId" | "relationType" | "label">,
): DeskRelation {
  const siblings = (p.relations ?? []).filter((r) => r.relatedConditionId === o.relatedConditionId);
  return {
    id: `${PENDING}${key}`,
    logicalId: `${PENDING}${key}`,
    ...o,
    position: Math.max(0, ...siblings.map((r) => r.position)) + 1,
    qualifiers: [],
    restricted: false,
    origin: "clinician",
    encounterId: p.encounter.id,
  };
}

export function applyBoardOp(p: DeskPayload, op: BoardOp): DeskPayload {
  const dx = p.diagnoses;
  const rel = p.relations ?? [];
  switch (op.kind) {
    case "add-dx": {
      const row = {
        ...newDx(op.key, op),
        verification: op.verification,
        rank: op.primary ? ("primary" as const) : ("secondary" as const),
      };
      // A new leading diagnosis: the old one takes its place in the differential (D-SI-21).
      const rest = op.primary
        ? dx.map((d) =>
            d.rank === "primary"
              ? { ...d, rank: "secondary" as const, verification: "differential" }
              : d,
          )
        : dx;
      return { ...p, diagnoses: [...rest, row] };
    }
    case "remove-dx":
      return {
        ...p,
        diagnoses: dx.filter((d) => d.logicalId !== op.logicalId),
        relations: rel.filter(
          (r) => r.conditionId !== op.logicalId && r.relatedConditionId !== op.logicalId,
        ),
      };
    case "leading": {
      const target = dx.find((d) => d.logicalId === op.logicalId);
      if (!target) return p;
      // From the differential, the old leading goes to the differential; a co-existing one swaps.
      const fromDifferential = target.verification === "differential";
      return {
        ...p,
        diagnoses: dx.map((d) =>
          d.logicalId === op.logicalId
            ? {
                ...d,
                rank: "primary" as const,
                verification: fromDifferential ? "provisional" : d.verification,
              }
            : d.rank === "primary"
              ? {
                  ...d,
                  rank: "secondary" as const,
                  verification: fromDifferential ? "differential" : d.verification,
                }
              : d,
        ),
      };
    }
    case "to-differential":
      return {
        ...p,
        diagnoses: dx.map((d) =>
          d.logicalId === op.logicalId
            ? { ...d, rank: "secondary" as const, verification: "differential" }
            : d,
        ),
        relations: op.retireLinks
          ? rel.filter(
              (r) => r.conditionId !== op.logicalId && r.relatedConditionId !== op.logicalId,
            )
          : rel,
      };
    case "relate":
      return { ...p, relations: [...rel, newRelation(op.key, p, op)] };
    case "unlink":
      return { ...p, relations: rel.filter((r) => r.id !== op.id) };
    case "move":
      return {
        ...p,
        relations: rel
          .map((r) => (r.id === op.id ? { ...r, position: op.position } : r))
          .sort((a, b) => a.position - b.position),
      };
    case "add-linked": {
      const row = op.conditionId ? null : newDx(op.key, op);
      const conditionId = op.conditionId ?? row!.logicalId;
      return {
        ...p,
        diagnoses: row ? [...dx, row] : dx,
        relations: [
          ...rel,
          newRelation(op.key, p, {
            conditionId,
            relatedConditionId: op.parentId,
            relationType: op.relationType,
            label: op.label,
          }),
        ],
      };
    }
  }
}
