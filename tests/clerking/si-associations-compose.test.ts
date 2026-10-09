/** The note writes relations (dx-relations-design §2.3): the design's order, the higher side,
 *  "With:" for an association, restricted ends dropped per audience with grammatical sentences. */
import type { Board, BoardRow, ImpressionDraft } from "@/lib/clerking/impression/board";
import type { Edge, Known } from "@/lib/clerking/impression/relations";
import { describe, expect, it } from "vitest";

import { composeImpression } from "@/lib/clerking/impression/compose";

const row = (
  logicalId: string,
  dxId: string,
  display: string,
  slot: BoardRow["slot"],
  more: Partial<BoardRow["dx"]> = {},
) =>
  ({
    dx: {
      logicalId,
      versionId: `${logicalId}-v1`,
      termId: `term-${logicalId}`,
      dxId,
      display,
      code: null,
      typed: false,
      rank: slot === "leading" ? "primary" : "secondary",
      verification: slot === "differential" ? "differential" : "provisional",
      restrictedClass: null,
      restricted: false,
      onProblemList: false,
      cosignPending: false,
      ...more,
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

let n = 0;
const edge = (
  conditionId: string,
  relatedConditionId: string,
  relationType: Edge["relationType"] = "due_to",
  label: Edge["label"] = relationType === "due_to" ? "secondary" : null,
  more: Partial<Edge> = {},
): Edge => ({
  id: `e${++n}`,
  logicalId: `l${n}`,
  conditionId,
  relatedConditionId,
  relationType,
  label,
  position: 1,
  qualifiers: [],
  restricted: false,
  ...more,
});
const known = (logicalId: string, display: string, restricted = false): Known => ({
  id: `${logicalId}-v1`,
  logicalId,
  termId: `term-${logicalId}`,
  display,
  code: null,
  restricted,
  since: "2019-03-01T00:00:00.000Z",
});
const empty: ImpressionDraft = {
  order: [],
  likelihood: {},
  reasons: {},
  evidence: {},
  meta: {},
  catalogueVersion: "x",
};
const text = (
  board: Board,
  relations: Edge[],
  more: Partial<Parameters<typeof composeImpression>[0]> = {},
) =>
  composeImpression({
    board,
    draft: empty,
    findings: new Map(),
    unexplained: [],
    audience: "clinical",
    relations,
    ...more,
  });
const B = (leading: BoardRow | null, also: BoardRow[], differential: BoardRow[] = []): Board => ({
  leading,
  differential,
  also,
  deferred: null,
  hidden: 0,
});

const MAL = row("M", "dx.malaria_severe", "Malaria, severe", "leading");
const ANA = row("A", "dx.anaemia", "Anaemia", "also");
const HOOK = row("H", "dx.hookworm_helminth", "Hookworm infection", "also");
const PNEU = row("P", "dx.pneumonia", "Pneumonia", "also");

describe("relations in the note", () => {
  it("writes nothing extra with no relation", () => {
    expect(text(B(MAL, [ANA]), [])).toBe(
      "Malaria, severe (primary; working).\nAlso this visit, co-existing: Anaemia (working).",
    );
  });

  it("a cause higher: the effect is a linked line indented under it", () => {
    expect(text(B(MAL, [ANA]), [edge("A", "M")])).toBe(
      "Malaria, severe (primary; working).\n  Anaemia (working), secondary to malaria, severe.",
    );
  });

  it("several causes read 'secondary to A and to B' (D-REL-12), each arrow written once", () => {
    const t = text(B(MAL, [ANA, HOOK]), [
      edge("A", "M"),
      edge("A", "H", "due_to", "secondary", { position: 2 }),
    ]);
    expect(t).toContain(
      "  Anaemia (working), secondary to malaria, severe and to hookworm infection.",
    );
    expect(t).toContain("Also this visit, co-existing: Hookworm infection (working).");
    expect(t.match(/hookworm/gi)).toHaveLength(2);
  });

  it("an effect higher: a clause on it; precipitants join 'precipitated by'; a known cause says 'known'", () => {
    const dka = row("D", "dx.dka", "Diabetic ketoacidosis", "leading");
    const t = text(
      B(dka, [PNEU]),
      [
        edge("D", "T1", "due_to", "complication"),
        edge("D", "P", "due_to", "precipitated_by", { qualifiers: ["cause.insulin_omission"] }),
      ],
      { background: [known("T1", "Type 1 diabetes")] },
    );
    expect(t.split("\n")[0]).toBe(
      "Diabetic ketoacidosis (primary; working), complication of known type 1 diabetes; precipitated by pneumonia and by missed or stopped insulin.",
    );
    expect(t).toContain("Also this visit, co-existing: Pneumonia (working).");
    expect(t).not.toContain("Known conditions");
  });

  it("an association keeps 'With:'; the clinician's order and the flag are written", () => {
    const dm = row("DM", "dx.dm_type2", "Type 2 diabetes", "leading");
    const htn = row("HT", "dx.hypertension", "Hypertension", "also");
    const ret = row("R", "dx.diabetic_retinopathy", "Diabetic retinopathy", "also");
    const t = composeImpression({
      board: B(dm, [htn, ret]),
      draft: { ...empty, meta: { R: { flag: true } } },
      findings: new Map(),
      unexplained: [],
      audience: "clinical",
      relations: [
        edge("DM", "HT", "associated_with", null, { position: 1 }),
        edge("R", "DM", "due_to", "complication", { position: 2 }),
      ],
    });
    expect(t).toBe(
      [
        "Type 2 diabetes (primary; working).",
        "  With: hypertension (working).",
        "  Diabetic retinopathy (working), complication of type 2 diabetes (flagged).",
      ].join("\n"),
    );
  });

  it("chains indent: AKI under sepsis under pyelonephritis", () => {
    const py = row("PY", "dx.pyelonephritis", "Acute pyelonephritis", "leading");
    const sep = row("S", "dx.sepsis", "Sepsis", "also");
    const aki = row("K", "dx.aki", "Acute kidney injury", "also");
    expect(text(B(py, [aki, sep]), [edge("S", "PY"), edge("K", "S")])).toBe(
      [
        "Acute pyelonephritis (primary; working).",
        "  Sepsis (working), secondary to acute pyelonephritis.",
        "    Acute kidney injury (working), secondary to sepsis.",
      ].join("\n"),
    );
  });

  it("ruled out, then known conditions not already named, last", () => {
    const foot = row("F", "dx.diabetic_foot", "Diabetic foot", "leading");
    const t = text(B(foot, []), [edge("F", "T1", "due_to", "complication")], {
      background: [known("HT", "Hypertension"), known("T1", "Type 1 diabetes")],
      ruledOut: [{ display: "Typhoid fever", reason: "blood culture negative", restricted: false }],
    });
    expect(t.split("\n")).toEqual([
      "Diabetic foot (primary; working), complication of known type 1 diabetes.",
      "Ruled out: typhoid fever (blood culture negative).",
      "Known conditions: hypertension (on record since 2019).",
    ]);
  });

  it("the patient audience drops a restricted end and its clause, leaving grammatical text", () => {
    const hiv = row("V", "dx.hiv", "HIV infection", "also", {
      restricted: true,
      restrictedClass: "hiv",
    });
    const ana = row("A", "dx.anaemia", "Anaemia", "leading");
    const relations = [edge("A", "V", "due_to", "secondary", { restricted: true })];
    const board = B(ana, [hiv]);
    expect(text(board, relations)).toBe(
      "Anaemia (primary; working), secondary to HIV infection.\nAlso this visit, co-existing: HIV infection (working).",
    );
    const patient = text(board, relations, {
      audience: "patient",
      background: [known("K", "HIV infection", true)],
    });
    expect(patient).toBe("Anaemia (primary; working).");
  });
});
