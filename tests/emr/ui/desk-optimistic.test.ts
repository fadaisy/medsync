import { describe, expect, it } from "vitest";

import { applyBoardOp, isPending } from "@/components/emr/desk/optimistic";
import { standardVisitMidway } from "./desk-fixtures";

// The board as tapped (owner, 2026-10-09: "I want this to be instant"): each op's expected result.
describe("applyBoardOp", () => {
  const p = standardVisitMidway();
  const lead = p.diagnoses.find((d) => d.rank === "primary")!;

  it("adds a diagnosis at once, pending; a new leading sends the old one to the differential", () => {
    const n = applyBoardOp(p, {
      kind: "add-dx",
      key: "k",
      termId: null,
      display: "Malaria",
      verification: "provisional",
      primary: true,
    });
    const added = n.diagnoses.at(-1)!;
    expect(isPending(added.id)).toBe(true);
    expect(added.rank).toBe("primary");
    expect(n.diagnoses.find((d) => d.id === lead.id)).toMatchObject({
      rank: "secondary",
      verification: "differential",
    });
  });

  it("links, moves and unlinks; removing a diagnosis takes its links with it", () => {
    const added = applyBoardOp(p, {
      kind: "add-linked",
      key: "k",
      parentId: lead.logicalId,
      termId: null,
      display: "DKA",
      relationType: "due_to",
      label: "complication",
    });
    const rel = added.relations!.at(-1)!;
    expect(rel.relatedConditionId).toBe(lead.logicalId);
    expect(added.diagnoses.some((d) => d.logicalId === rel.conditionId)).toBe(true);
    expect(
      applyBoardOp(added, { kind: "move", id: rel.id, position: 9 }).relations!.at(-1)!.position,
    ).toBe(9);
    expect(applyBoardOp(added, { kind: "unlink", id: rel.id }).relations).toHaveLength(
      added.relations!.length - 1,
    );
    const gone = applyBoardOp(added, { kind: "remove-dx", logicalId: lead.logicalId });
    expect(gone.diagnoses.some((d) => d.logicalId === lead.logicalId)).toBe(false);
    expect(gone.relations!.some((r) => r.id === rel.id)).toBe(false);
  });
});
