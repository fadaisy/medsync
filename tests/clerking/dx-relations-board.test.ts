/** The board's places and drops (dx-relations-design §2.3, §4.1–4.4), pure. */
import type { Board, BoardRow } from "@/lib/clerking/impression/board";
import type { DropContext, Edge, Known } from "@/lib/clerking/impression/relations";
import { describe, expect, it } from "vitest";

import {
  causeRemovedBlocks,
  dropOutcome,
  isFlagged,
  places,
  withFlagOn,
} from "@/lib/clerking/impression/relations";

const row = (logicalId: string, dxId: string | null, slot: BoardRow["slot"]) =>
  ({
    dx: { logicalId, dxId, display: logicalId, termId: null, restricted: false },
    slot,
  }) as unknown as BoardRow;
let n = 0;
const edge = (
  c: string,
  r: string,
  relationType: Edge["relationType"] = "due_to",
  position = 1,
): Edge => ({
  id: `e${++n}`,
  logicalId: `l${n}`,
  conditionId: c,
  relatedConditionId: r,
  relationType,
  label: relationType === "due_to" ? "secondary" : null,
  position,
  qualifiers: [],
  restricted: false,
});
const known = (logicalId: string, dxId: string | null = null): Known & { dxId: string | null } => ({
  id: logicalId,
  logicalId,
  termId: null,
  display: logicalId,
  code: null,
  restricted: false,
  since: "2020-01-01",
  dxId,
});
const board = (lead: BoardRow | null, also: BoardRow[], diff: BoardRow[] = []): Board => ({
  leading: lead,
  also,
  differential: diff,
  deferred: null,
  hidden: 0,
});
const ctx = (b: Board, edges: Edge[], k: ReturnType<typeof known>[] = []): DropContext => ({
  places: places(b, edges, k),
  board: b,
  edges,
  known: k,
  knownDx: (x) => (x as ReturnType<typeof known>).dxId,
});

describe("places", () => {
  it("hangs an effect under its cause; a cause lower than its effect stays co-existing", () => {
    const b = board(row("Mal", "dx.malaria_severe", "leading"), [
      row("Ana", "dx.anaemia", "also"),
      row("Pn", "dx.pneumonia", "also"),
    ]);
    const p = places(b, [edge("Ana", "Mal"), edge("Mal", "Pn", "due_to")], []);
    expect(p.leading!.children.map((c) => c.row.dx.logicalId)).toEqual(["Ana"]);
    expect(p.leading!.clauses.map((c) => c.otherId)).toEqual(["Pn"]);
    expect(p.coexisting.map((c) => c.row.dx.logicalId)).toEqual(["Pn"]);
    expect(p.coexisting[0]!.clauses).toEqual([]);
  });

  it("between two co-existing diagnoses the cause leads, whatever the board order", () => {
    const p = places(
      board(null, [row("Ana", "dx.anaemia", "also"), row("Mal", "dx.malaria_severe", "also")]),
      [edge("Ana", "Mal")],
      [],
    );
    expect(p.coexisting.map((c) => c.row.dx.logicalId)).toEqual(["Mal"]);
    expect(p.cardOf.get("Ana")!.parentId).toBe("Mal");
  });

  it("an end the viewer cannot read drops out with its relation; the other end stands alone", () => {
    const b = board(row("Ana", "dx.anaemia", "leading"), [row("Hiv", "dx.hiv", "also")]);
    const p = places(b, [edge("Ana", "Hiv")], [], { row: (r) => r.dx.logicalId !== "Hiv" });
    expect(p.leading!.clauses).toEqual([]);
    expect(p.coexisting).toEqual([]);
  });

  it("the background: active this visit (episode_of), named by a relation, or neither", () => {
    const b = board(row("Ht", null, "leading"), [row("Dka", "dx.dka", "also")]);
    const p = places(
      b,
      [edge("Ht", "kHt", "episode_of"), edge("Dka", "kT1")],
      [known("kHt"), known("kT1"), known("kAsthma")],
    );
    expect(p.background.map((x) => [x.item.logicalId, x.active, x.named])).toEqual([
      ["kHt", true, true],
      ["kT1", false, true],
      ["kAsthma", false, false],
    ]);
    expect(p.leading!.episodeOf?.logicalId).toBe("kHt");
    expect(p.cardOf.get("Dka")!.clauses[0]!.known).toBe(true);
  });
});

describe("what a drop means", () => {
  const mal = row("Mal", "dx.malaria_severe", "leading");
  const ana = row("Ana", "dx.anaemia", "also");
  const sep = row("Sep", "dx.sepsis", "differential");

  it("catalogued and unambiguous: applied at once", () => {
    const o = dropOutcome(
      ctx(board(mal, [ana]), []),
      { kind: "dx", id: "Ana" },
      { kind: "dx", id: "Mal" },
    );
    expect(o).toMatchObject({ kind: "relate", apply: { type: "due_to", label: "secondary" } });
  });

  it("listed the other way round: the chooser, with the reverse offered", () => {
    const o = dropOutcome(
      ctx(board(null, [ana, { ...mal, slot: "also" } as BoardRow]), []),
      { kind: "dx", id: "Mal" },
      { kind: "dx", id: "Ana" },
    );
    expect(o).toMatchObject({ kind: "relate", apply: null, reversed: { label: "secondary" } });
  });

  it("direction-ambiguous: offered as a hint, never applied", () => {
    const hf = row("Hf", "dx.heart_failure", "also");
    const af = row("Af", "dx.af", "also");
    const o = dropOutcome(
      ctx(board(null, [hf, af]), []),
      { kind: "dx", id: "Hf" },
      { kind: "dx", id: "Af" },
    );
    expect(o).toMatchObject({ kind: "relate", apply: null, hint: { ambiguous: true } });
  });

  it("refuses a differential, itself, a duplicate, a loop and a fifth level, in words", () => {
    const c = ctx(board(mal, [ana], [sep]), [edge("Ana", "Mal")]);
    expect(dropOutcome(c, { kind: "dx", id: "Ana" }, { kind: "dx", id: "Sep" })).toEqual({
      kind: "refuse",
      message: "Drop refused: Sep is a differential. Promote it first.",
    });
    expect(dropOutcome(c, { kind: "dx", id: "Ana" }, { kind: "dx", id: "Ana" })).toMatchObject({
      kind: "refuse",
      message: "Drop refused: a diagnosis cannot be linked to itself.",
    });
    expect(dropOutcome(c, { kind: "dx", id: "Mal" }, { kind: "dx", id: "Ana" })).toMatchObject({
      message: "Drop refused: Mal and Ana are already linked.",
    });
    const rows = ["A", "B", "C", "D", "E"].map((id) => row(id, null, "also"));
    const chain = [edge("A", "B"), edge("B", "C"), edge("C", "D")];
    const deep = ctx(board(null, rows), chain);
    expect(dropOutcome(deep, { kind: "dx", id: "D" }, { kind: "dx", id: "A" })).toMatchObject({
      message: "Link to A refused: it would make a loop.",
    });
    expect(dropOutcome(deep, { kind: "dx", id: "D" }, { kind: "dx", id: "E" })).toMatchObject({
      message: "Link to E refused: a chain of causes is limited to 4 levels.",
    });
  });

  it("onto the co-existing header unlinks; among siblings reorders; a chip becomes active", () => {
    const htn = row("Htn", "dx.hypertension", "also");
    const e1 = edge("Ana", "Mal", "due_to", 1);
    const e2 = edge("Htn", "Mal", "associated_with", 2);
    const k = known("kT1", "dx.dm_type1");
    const c = ctx(board(mal, [ana, htn]), [e1, e2], [k]);
    expect(dropOutcome(c, { kind: "dx", id: "Ana" }, { kind: "coexisting" })).toEqual({
      kind: "unlink",
      edge: e1,
    });
    expect(dropOutcome(c, { kind: "dx", id: "Htn" }, { kind: "dx", id: "Ana" })).toEqual({
      kind: "reorder",
      order: [e2, e1],
    });
    expect(dropOutcome(c, { kind: "known", id: "kT1" }, { kind: "coexisting" })).toMatchObject({
      kind: "active",
      rank: "secondary",
    });
    const none = ctx(board(null, [ana]), [], [k]);
    expect(dropOutcome(none, { kind: "known", id: "kT1" }, { kind: "leading" })).toMatchObject({
      kind: "active",
      rank: "primary",
    });
  });

  it("onto a known condition: the catalogue reads its term (DKA onto known type 1 diabetes)", () => {
    const dka = row("Dka", "dx.dka", "leading");
    const c = ctx(board(dka, []), [], [known("kT1", "dx.dm_type1")]);
    expect(dropOutcome(c, { kind: "dx", id: "Dka" }, { kind: "known", id: "kT1" })).toMatchObject({
      kind: "relate",
      apply: { type: "due_to", label: "complication" },
    });
  });
});

describe("signing and flags", () => {
  it("each unacknowledged 'Cause removed' holds signing, by name", () => {
    const items = [{ logicalId: "r1", conditionId: "Ana", causeDisplay: "Malaria" }];
    expect(causeRemovedBlocks(items, {}, () => "Anaemia")).toEqual([
      "Anaemia: its cause (Malaria) was removed; review it",
    ]);
    expect(causeRemovedBlocks(items, { reviewed: ["r1"] }, () => "Anaemia")).toEqual([]);
  });

  it("a flag is the diagnosis's own; an earlier draft's parent list still reads", () => {
    const r = { dx: { logicalId: "R", dxId: "dx.diabetic_retinopathy" } } as BoardRow;
    const old = { meta: { P: { flagged: ["dx.diabetic_retinopathy"] } } } as never;
    expect(isFlagged(old, r)).toBe(true);
    const off = withFlagOn(old, r);
    expect(isFlagged(off, r)).toBe(false);
    expect(isFlagged(withFlagOn(off, r), r)).toBe(true);
  });
});
