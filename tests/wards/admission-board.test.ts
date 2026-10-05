import { describe, expect, it } from "vitest";

import { ARRIVING_ATTENTION_MS, arrivingTooLong, waitingFor } from "@/lib/wards/waiting";
import { BOARD_NOW, boardData } from "./fixtures";

/** The board's admission parts (ADRs 0198–0200): the waiting list and the Arriving beds that need attention. */

const row = (id: string, decided: string, over: { name?: string | null } = {}) => ({
  admissionId: id,
  patientUserId: `p-${id}`,
  name: over.name === undefined ? `Patient ${id}` : over.name,
  mrn: `MRN-2026-0000${id}`,
  admittedBy: "Dr Example",
  decidedAt: new Date(decided),
  waitReason: "no_free_bed",
});

describe("the waiting list", () => {
  const rows = [row("2", "2026-09-29T07:00:00Z"), row("1", "2026-09-29T05:00:00Z")];

  it("is oldest first, with the name for the ward's staff", () => {
    const w = waitingFor(rows, "names");
    expect(w.map((x) => x.admissionId)).toEqual(["1", "2"]);
    expect(w[0]).toMatchObject({
      name: "Patient 1",
      mrn: "MRN-2026-00001",
      waitReason: "no_free_bed",
    });
  });

  it("the admin sees the MRN only; the doctor's picker sees nobody", () => {
    expect(waitingFor(rows, "mrn").every((x) => x.name === null && x.mrn)).toBe(true);
    expect(waitingFor(rows, "none")).toEqual([]);
  });
});

describe("needs attention (ADR 0199 §6)", () => {
  it("is a proposed 4 h", () => expect(ARRIVING_ATTENTION_MS).toBe(4 * 60 * 60_000));

  it("lists only Arriving beds held past the threshold, longest first", () => {
    const beds = boardData().beds;
    expect(beds.filter((b) => b.state === "arriving").map((b) => b.label)).toEqual(["B7", "B15"]);
    expect(arrivingTooLong(beds, BOARD_NOW).map((b) => b.label)).toEqual(["B15"]);
    // Ten hours on, both are.
    expect(arrivingTooLong(beds, BOARD_NOW + 10 * 3_600_000).map((b) => b.label)).toEqual([
      "B15",
      "B7",
    ]);
    // An Occupied bed held for days never is.
    expect(
      arrivingTooLong(beds, BOARD_NOW + 30 * 86_400_000).every((b) => b.state === "arriving"),
    ).toBe(true);
  });

  it("the fixture carries an Arriving bed with its admission and a waiting list", () => {
    const d = boardData();
    expect(d.needsAttention.map((b) => b.label)).toEqual(["B15"]);
    expect(d.beds.find((b) => b.label === "B7")).toMatchObject({
      state: "arriving",
      admissionId: expect.any(String),
      assignmentId: expect.any(String),
    });
    expect(d.waiting.map((w) => w.waitReason)).toEqual(["no_free_bed", "floor"]);
    expect(boardData(undefined, "mrn").waiting.every((w) => w.name === null)).toBe(true);
  });
});
