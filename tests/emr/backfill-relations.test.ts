/**
 * D-REL-17: today's note-level links (impression meta[parent].with) as relation proposals. Pure.
 */
import { describe, expect, it } from "vitest";

import { proposeRelations } from "@/scripts/emr/backfill-relations";

const DM = "00000000-0000-4000-8000-0000000000d2";
const DKA = "00000000-0000-4000-8000-000000000dca";
const HTN = "00000000-0000-4000-8000-000000000001";
const DIFF = "00000000-0000-4000-8000-0000000000ff";
const visit = [
  { logicalId: DM, dxId: "dx.dm_type2", verification: "confirmed" },
  { logicalId: DKA, dxId: "dx.dka", verification: "provisional" },
  { logicalId: HTN, dxId: "dx.hypertension", verification: "confirmed" },
  { logicalId: DIFF, dxId: "dx.dyslipidaemia", verification: "differential" },
];

describe("proposeRelations (D-REL-17)", () => {
  it("a signed complication is due_to / complication, from the child to the parent", () => {
    expect(proposeRelations({ [DM]: { with: ["dx.dka"] } }, visit)).toEqual([
      {
        kind: "due_to",
        conditionId: DKA,
        relatedConditionId: DM,
        label: "complication",
        catalogueRef: expect.stringMatching(/^MS-EMR-DX-ASSOC-001@.+:dx\.dm_type2>dx\.dka$/),
      },
    ]);
  });

  it("goes_with is associated_with, stored lower id first", () => {
    const [p] = proposeRelations({ [DM]: { with: ["dx.hypertension"] } }, visit);
    expect(p).toMatchObject({ kind: "associated_with", conditionId: HTN, relatedConditionId: DM });
  });

  it("asks for an uncatalogued pair, a differential end or a link no longer on the visit", () => {
    const out = proposeRelations(
      { [HTN]: { with: ["dx.dka"] }, [DM]: { with: ["dx.dyslipidaemia", "dx.obesity"] } },
      visit,
    );
    expect(out.map((p) => p.kind)).toEqual(["ask", "ask", "ask"]);
  });

  it("skips a pair already related in the record, and a draft (unsigned) typing offers nothing", () => {
    expect(
      proposeRelations({ [DM]: { with: ["dx.dka"] } }, visit, new Set([`due_to|${DKA}|${DM}`])),
    ).toEqual([]);
    expect(
      proposeRelations({ [DM]: { with: ["dx.dka"] } }, visit, new Set(), {
        id: "x",
        version: "1",
        status: "draft",
        associations: { "dx.dm_type2": { complications: ["dx.dka"] } },
      }),
    ).toEqual([]);
  });
});
