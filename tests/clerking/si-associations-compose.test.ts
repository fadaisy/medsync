/** The note names a linked association: "With: …" on the parent, "with …" on the associated line. */
import type { Board, BoardRow, ImpressionDraft } from "@/lib/clerking/impression/board";
import { describe, expect, it } from "vitest";

import { withLink } from "@/lib/clerking/impression/associations";
import { composeImpression } from "@/lib/clerking/impression/compose";

const row = (logicalId: string, dxId: string, display: string, slot: BoardRow["slot"]) =>
  ({
    dx: {
      logicalId,
      versionId: `${logicalId}-v1`,
      termId: null,
      dxId,
      display,
      code: null,
      typed: false,
      rank: slot === "leading" ? "primary" : "secondary",
      verification: "provisional",
      restrictedClass: null,
      restricted: false,
      onProblemList: false,
      cosignPending: false,
    },
    slot,
    profile: null,
    awaitingSignoff: false,
    mustNotMiss: false,
    timeCritical: false,
    pinned: false,
    likelihood: null,
    reason: "",
    reasonMissing: false,
  }) as unknown as BoardRow;

const lead = row("L", "dx.dm_type2", "Type 2 diabetes", "leading");
const retina = row("R", "dx.diabetic_retinopathy", "Diabetic retinopathy", "also");
const board: Board = { leading: lead, differential: [], also: [retina], deferred: null, hidden: 0 };
const empty: ImpressionDraft = {
  order: [],
  likelihood: {},
  reasons: {},
  evidence: {},
  meta: {},
  catalogueVersion: "x",
};
const text = (draft: ImpressionDraft) =>
  composeImpression({ board, draft, findings: new Map(), unexplained: [], audience: "clinical" });

describe("associations in the note", () => {
  it("writes nothing extra until linked", () => {
    expect(text(empty)).not.toContain("With:");
  });
  it("names the linked complication on the parent and the parent on the complication", () => {
    const t = text(withLink(empty, "L", "dx.diabetic_retinopathy"));
    expect(t).toMatch(/Type 2 diabetes \(primary; working\)\. With: diabetic retinopathy\./);
    expect(t).toMatch(/Diabetic retinopathy, working, with type 2 diabetes\./);
  });
  it("links once, however often it is added", () => {
    const d = withLink(withLink(empty, "L", "dx.hypertension"), "L", "dx.hypertension");
    expect(d.meta.L!.with).toEqual(["dx.hypertension"]);
  });
});
