import type { MovementKind } from "@/db/schema/pharmacy-dispensing";
import type { Direction, Place } from "@/lib/pharmacy/stores/locations";
import { describe, expect, it } from "vitest";

import { MOVEMENT_KINDS } from "@/db/schema/pharmacy-dispensing";
import { LOCATION_KINDS } from "@/db/schema/pharmacy-stores";
import {
  admitsAt,
  allows,
  isInternalTransfer,
  isIssueOnlyWard,
  issueAllowed,
  mayBeCounted,
  needsOwnGoLive,
  placeOf,
} from "@/lib/pharmacy/stores/locations";

/** LC-3, written out as the prompt's table: per place, each kind and the directions it may take. */
type Cell = readonly Direction[];
const N: Cell = [];
const IN: Cell = ["in"];
const OUT: Cell = ["out"];
const BOTH: Cell = ["in", "out"];
const PLACES: readonly Place[] = [
  "store",
  "dispensing_point",
  "ward_stocked",
  "ward_issue_only",
  "cart",
  "quarantine",
];
const row = (...cells: Cell[]) => cells;
// Each spec row expands to its kinds; a pair row puts the out-leg kind under "out" and the in-leg under "in".
const TABLE: Record<MovementKind, Cell[]> = {
  received: row(IN, IN, N, N, N, IN),
  // Decided 21 Oct 2026 (EC-3 over LC-3): a cart issues out only to another cart (`cart_move`, issueAllowed).
  issued: row(OUT, OUT, N, N, OUT, N),
  received_from_issue: row(IN, IN, IN, IN, IN, N),
  returned_out: row(N, OUT, OUT, N, OUT, N),
  returned_in: row(IN, IN, N, N, N, N),
  lent: row(OUT, OUT, N, N, N, N),
  borrowed: row(IN, IN, N, N, N, N),
  loan_returned_out: row(OUT, OUT, N, N, N, N),
  loan_returned_in: row(IN, IN, N, N, N, N),
  supplied: row(N, OUT, N, N, N, N),
  reversed: row(N, IN, N, N, N, N),
  ward_used: row(N, N, OUT, N, N, N),
  cart_used: row(N, N, N, N, OUT, N),
  quarantined_out: row(OUT, OUT, OUT, N, OUT, N),
  quarantined_in: row(N, N, N, N, N, IN),
  written_off: row(N, N, N, N, N, OUT),
  returned_to_supplier: row(N, N, N, N, N, OUT),
  adjusted: row(BOTH, BOTH, BOTH, N, BOTH, N),
  count_correction: row(BOTH, BOTH, N, N, N, BOTH),
  transfer_out: row(OUT, OUT, N, N, N, N),
  transfer_in: row(IN, IN, N, N, N, N),
};

const kindModel = (p: Place) =>
  p === "ward_stocked"
    ? (["ward", "stocked"] as const)
    : p === "ward_issue_only"
      ? (["ward", "issue_only"] as const)
      : ([p, null] as const);

describe("LC-1 location kinds", () => {
  it("has the five kinds of 0180, and each non-ward kind is its own column", () => {
    expect(LOCATION_KINDS).toEqual(["store", "dispensing_point", "ward", "cart", "quarantine"]);
    for (const k of LOCATION_KINDS.filter((k) => k !== "ward")) expect(placeOf(k, null)).toBe(k);
  });
});

describe("LC-2 external is a counterparty, not a location", () => {
  it("is not a location kind, so it has no LC-3 column", () => {
    expect((LOCATION_KINDS as readonly string[]).includes("external")).toBe(false);
  });
});

describe("LC-3 the movement × kind table", () => {
  it("covers every movement kind", () => {
    expect(Object.keys(TABLE).sort()).toEqual([...MOVEMENT_KINDS].sort());
  });
  it("matches the prompt's table cell for cell, both directions", () => {
    for (const kind of MOVEMENT_KINDS)
      PLACES.forEach((place, i) => {
        const [k, model] = kindModel(place);
        for (const d of ["in", "out"] as const)
          expect(allows(k, model, kind, d), `${kind} ${place} ${d}`).toBe(
            (TABLE[kind][i] ?? N).includes(d),
          );
      });
  });
  it("a ward with no supply model set takes nothing (D-PH2-05: nothing defaults)", () => {
    for (const kind of MOVEMENT_KINDS) expect(allows("ward", null, kind, "in")).toBe(false);
  });
});

describe("LC-4 issue-only ward", () => {
  it("receives issues only, is never counted, needs no go-live of its own", () => {
    expect(isIssueOnlyWard("ward", "issue_only")).toBe(true);
    expect(mayBeCounted("ward", "issue_only")).toBe(false);
    expect(mayBeCounted("ward", "stocked")).toBe(true);
    expect(needsOwnGoLive("ward", "issue_only")).toBe(false);
    expect(needsOwnGoLive("ward", "stocked")).toBe(true);
  });
  it("Law 7: takes an issue while not live; any other location does not", () => {
    expect(
      admitsAt({ kind: "ward", model: "issue_only", live: false }, "received_from_issue", "in"),
    ).toEqual({ ok: true });
    expect(
      admitsAt({ kind: "ward", model: "stocked", live: false }, "received_from_issue", "in"),
    ).toEqual({
      ok: false,
      reason: "not_live",
    });
    expect(admitsAt({ kind: "store", model: null, live: true }, "supplied", "out")).toEqual({
      ok: false,
      reason: "not_allowed",
    });
  });
});

describe("LC-5 internal transfers", () => {
  it("issues among store, points and quarantine and Phase 1 transfers are internal; issues to wards are not", () => {
    expect(isInternalTransfer("issued", "store", "dispensing_point")).toBe(true);
    expect(isInternalTransfer("received_from_issue", "store", "dispensing_point")).toBe(true);
    expect(isInternalTransfer("transfer_out", "dispensing_point", "dispensing_point")).toBe(true);
    expect(isInternalTransfer("issued", "store", "ward")).toBe(false);
    expect(isInternalTransfer("issued", "dispensing_point", "cart")).toBe(false);
    expect(isInternalTransfer("supplied", "dispensing_point", "dispensing_point")).toBe(false);
  });
});

describe("EC-3 with LC-3: a cart issues out only to another cart", () => {
  it("issueAllowed", () => {
    expect(issueAllowed("cart", "cart")).toBe(true);
    expect(issueAllowed("cart", "ward")).toBe(false);
    expect(issueAllowed("cart", "store")).toBe(false);
    expect(issueAllowed("store", "ward")).toBe(true);
  });
});
