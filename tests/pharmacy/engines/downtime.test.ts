import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LineStatus, PharmacyLineEvent } from "@/lib/pharmacy/lines";
import { describe, expect, it } from "vitest";

import {
  awaitingRegisterConfirmation,
  controlledBackEntry,
  DOWNTIME_COPY,
  DOWNTIME_DRAFT_COPY,
  downtimeTag,
  lookBackReasons,
  mayRecordPeriod,
  notSuppliedMove,
  paperPrescriptionValid,
  pharmacyDrill,
  pharmacySheetLabel,
  rowRefusal,
  staleUnusedSheets,
  transcribedText,
} from "@/lib/pharmacy/downtime";
import { applyMove, lineStatus } from "@/lib/pharmacy/lines";
import { admits, balances, needsCount } from "@/lib/pharmacy/stock/ledger";

/**
 * Pharmacy Phase 1, Step 3: downtime back-entry (DT-2 to DT-11, H6; S67–S77, pure parts). Every
 * patient, medicine, batch, person and time here is an invented fixture. Times are Kampala (UTC+3).
 */

const at = (hhmm: string, day = "2026-10-12") => new Date(`${day}T${hhmm}:00+03:00`);
const NOW = at("14:52");
const PERIODS = [{ startsAt: at("12:00"), endsAt: at("14:30") }];

const row = {
  sheetState: "to_enter" as const,
  suppliedAt: at("13:40"),
  now: NOW,
  periods: PERIODS,
  patientRegistered: true,
  rowAlreadyEntered: false,
  quantity: 10 as number | null,
};

const BATCH = { expiry: "2027-03-31", expiryMonthOnly: false };
const clean = {
  identityOnSheet: "checked" as const,
  pharmacistFirst: true,
  pharmacistInitials: "FX",
  cosignAwaitingAtTime: false,
  cancelledAtTime: false,
  versionChangedBefore: false,
  batch: BATCH,
  suppliedAt: at("13:40"),
  productOfMedicine: true,
  alreadySupplied: false,
};

describe("DT-2 sheets", () => {
  it("DT-2 S67 a pharmacy sheet prints its number as DS-00031", () => {
    expect(pharmacySheetLabel(31)).toBe("DS-00031");
    expect(pharmacySheetLabel(123456)).toBe("DS-123456");
  });

  it("DT-2 S69 a complete sheet takes no rows; nor does an unused or voided one", () => {
    for (const sheetState of ["complete", "unused", "voided"] as const)
      expect(rowRefusal({ ...row, sheetState })?.refusal).toBe("sheet_not_to_enter");
    expect(rowRefusal(row)).toBeNull();
  });

  it("DT-2 H6 S69 sheets still unused more than 7 days after reserving are listed for the in-charge", () => {
    const sheets = [
      { number: 31, state: "unused", reservedAt: at("09:00", "2026-10-01") },
      { number: 32, state: "unused", reservedAt: at("09:00", "2026-10-05") },
      { number: 33, state: "to_enter", reservedAt: at("09:00", "2026-10-01") },
      { number: 34, state: "voided", reservedAt: at("09:00", "2026-10-01") },
      { number: 35, state: "unused", reservedAt: at("09:00", "2026-10-04") },
    ];
    expect(staleUnusedSheets(sheets, "2026-10-12").map((s) => s.number)).toEqual([31, 35]);
  });
});

describe("DT-4 the only refusals", () => {
  it("DT-4 S72 a time in the future is refused", () => {
    expect(
      rowRefusal({
        ...row,
        suppliedAt: at("15:00"),
        periods: [{ startsAt: at("12:00"), endsAt: at("16:00") }],
      }),
    ).toEqual({
      refusal: "future",
      words: DOWNTIME_DRAFT_COPY.future,
    });
  });

  it("DT-4 S72 a time outside every recorded downtime is refused until the period is recorded; a technician cannot record one", () => {
    expect(rowRefusal({ ...row, suppliedAt: at("11:00") })).toEqual({
      refusal: "no_period",
      words: "Ask the pharmacy in charge to record this downtime first.",
    });
    expect(
      rowRefusal({
        ...row,
        suppliedAt: at("11:00"),
        periods: [...PERIODS, { startsAt: at("10:30"), endsAt: at("11:30") }],
      }),
    ).toBeNull();
    expect(mayRecordPeriod(["pharmacy.view", "pharmacy.dispense", "pharmacy.stock"])).toBe(false);
    expect(mayRecordPeriod(["pharmacy.view", "pharmacy.manage"])).toBe(true);
  });

  it("DT-4 S73 a patient who is not registered is refused, with the reception words", () => {
    expect(rowRefusal({ ...row, patientRegistered: false })).toEqual({
      refusal: "not_registered",
      words: "Register this patient at reception first.",
    });
  });

  it("DT-4 S69 a row is entered once", () => {
    expect(rowRefusal({ ...row, rowAlreadyEntered: true })?.refusal).toBe("row_entered");
  });

  it("DT-4 a quantity must be a whole number above zero; a 'not supplied' row has none", () => {
    for (const quantity of [0, -1, 2.5, Number.NaN])
      expect(rowRefusal({ ...row, quantity })?.refusal).toBe("quantity");
    expect(rowRefusal({ ...row, quantity: null })).toBeNull();
  });
});

describe("DT-10 never refuse, flag for look-back", () => {
  it("DT-10 a clean row has no reason", () => {
    expect(lookBackReasons(clean)).toEqual([]);
  });

  it("DT-10 S74 each reason is flagged on its own, with its words", () => {
    const cases: [Partial<typeof clean>, string][] = [
      [{ identityOnSheet: "not_checked" as never }, "identity_not_checked"],
      [{ identityOnSheet: "not_recorded" as never }, "identity_not_checked"],
      [{ pharmacistInitials: null as never }, "no_pharmacist_initials"],
      [{ pharmacistInitials: "  " }, "no_pharmacist_initials"],
      [{ cosignAwaitingAtTime: true }, "awaiting_cosign"],
      [{ cancelledAtTime: true }, "cancelled"],
      [{ versionChangedBefore: true }, "version_changed"],
      [{ batch: { expiry: "2026-10-11", expiryMonthOnly: false } }, "batch_expired"],
      [{ productOfMedicine: false }, "other_medicine"],
      [{ alreadySupplied: true }, "possible_double_supply"],
    ];
    for (const [over, reason] of cases) {
      const r = lookBackReasons({ ...clean, ...over });
      expect(r.map((x) => x.reason)).toEqual([reason]);
      expect(r[0]!.words).toBe(DOWNTIME_DRAFT_COPY[reason as keyof typeof DOWNTIME_DRAFT_COPY]);
    }
  });

  it("DT-10 the batch's expiry is judged at the sheet's time, not at entry", () => {
    const b = { expiry: "2026-10-12", expiryMonthOnly: false };
    expect(lookBackReasons({ ...clean, batch: b, suppliedAt: at("13:40") })).toEqual([]);
    expect(
      lookBackReasons({ ...clean, batch: b, suppliedAt: at("00:30", "2026-10-13") }).map(
        (r) => r.reason,
      ),
    ).toEqual(["batch_expired"]);
  });

  it("DT-10 S74 a standard-lane line still awaiting review is recorded with no reason", () => {
    expect(lookBackReasons({ ...clean, pharmacistFirst: false, pharmacistInitials: null })).toEqual(
      [],
    );
  });

  it("DT-7 S71 a downtime movement may take a batch below zero; the medicine then needs a count", () => {
    const batch = {
      id: "fx-batch-1",
      pointId: "fx-point",
      productId: "fx-product",
      medicineId: "fx-medicine",
      batchNumber: "FX-B1",
      ...BATCH,
    };
    expect(
      admits({ kind: "supplied", quantity: -5, downtime: true }, batch, 2, "2026-10-12"),
    ).toEqual({ ok: true });
    const bal = balances([
      {
        id: "m1",
        batchId: "fx-batch-1",
        pointId: "fx-point",
        kind: "received",
        quantity: 2,
        effectiveAt: at("09:00"),
        recordedAt: at("09:00"),
        downtime: false,
      },
      {
        id: "m2",
        batchId: "fx-batch-1",
        pointId: "fx-point",
        kind: "supplied",
        quantity: -5,
        effectiveAt: at("13:40"),
        recordedAt: NOW,
        downtime: true,
      },
    ]);
    expect(needsCount(bal)).toBe(true);
  });
});

describe("DT-3 Law 13 true times", () => {
  it("DT-3 S68 the tag shows the sheet's time, the entry time and the sheet", () => {
    expect(downtimeTag({ suppliedAt: at("13:40"), enteredAt: NOW, sheet: 31 })).toBe(
      "Entered after downtime · Supplied 13:40 · entered 14:52 · sheet DS-00031",
    );
  });

  it("DT-3 S68 a back-entered supply lands on the line as supplied", () => {
    const ev: PharmacyLineEvent = {
      id: "fx-ev-1",
      kind: "supplied",
      occurredAt: NOW,
      effectiveAt: at("13:40"),
      lane: null,
      quantitySupplied: 10,
      quantityNotSupplied: null,
      reasonCode: null,
      handoverId: "fx-handover-1",
      actorCadre: "PHARMACY_TECH",
      enteredAfterDowntime: true,
    };
    const line = {
      id: "fx-line-1",
      state: "active" as const,
      cosign: "none" as const,
      createdAt: at("08:00"),
    };
    expect(lineStatus(line, [ev], [], "pharmacist_first")).toEqual({
      kind: "closed",
      outcome: "supplied",
    });
  });
});

describe("DT-5 a paper prescription", () => {
  const paper = {
    prescriberName: "Fixture Prescriber",
    prescriberCadre: "Medical officer",
    writtenOn: "2026-10-12",
    lines: [
      {
        medicineId: null,
        medicineAsWritten: "Fixture tablet A 500mg",
        directionsAsWritten: "  1 tab 2,5 times\tdaily  ",
        quantityAsWritten: "x 10",
      },
    ],
  };

  it("DT-5 S70 stored as its own record, never a prescriptions row; text kept exactly as written", () => {
    const r = paperPrescriptionValid(paper, "2026-10-12");
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.table).toBe("paper_prescriptions");
    expect(r.record.lines[0]!.directionsAsWritten).toBe("  1 tab 2,5 times\tdaily  ");
    expect(transcribedText("Pharmacy technician")).toBe(
      "Transcribed from a paper prescription by Pharmacy technician",
    );
  });

  it("DT-5 0128's checks: names, date not in the future, at least one line, lengths", () => {
    const r = paperPrescriptionValid(
      {
        ...paper,
        prescriberName: " ",
        writtenOn: "2026-10-13",
        lines: [
          {
            ...paper.lines[0]!,
            medicineAsWritten: "A",
            directionsAsWritten: "",
            quantityAsWritten: "x".repeat(81),
          },
        ],
      },
      "2026-10-12",
    );
    expect(r).toEqual({
      ok: false,
      errors: [
        "prescriber_name",
        "written_on",
        "line_1_medicine",
        "line_1_directions",
        "line_1_quantity",
      ],
    });
    expect(paperPrescriptionValid({ ...paper, lines: [] }, "2026-10-12")).toEqual({
      ok: false,
      errors: ["lines"],
    });
  });

  it("DT-5 the engine names no prescriptions table", () => {
    const src = readFileSync(join(process.cwd(), "lib/pharmacy/downtime.ts"), "utf8");
    expect(src).not.toMatch(/["']prescriptions["']|from "@\/(db|lib\/emr)/);
  });
});

describe("DT-8 a controlled supply on the sheet", () => {
  it("DT-8 the witness's name as written and the register tick are both required", () => {
    expect(
      controlledBackEntry({ witnessNameAsWritten: "F. Witness", registerAttested: true }),
    ).toEqual({
      ok: true,
      entry: {
        kind: "back_entered_supply",
        witnessNameAsWritten: "F. Witness",
        registerAttested: true,
      },
    });
    expect(controlledBackEntry({ witnessNameAsWritten: " ", registerAttested: true })).toEqual({
      ok: false,
      reason: "witness_name",
    });
    expect(
      controlledBackEntry({ witnessNameAsWritten: "F. Witness", registerAttested: false }),
    ).toEqual({
      ok: false,
      reason: "register",
    });
  });

  it("DT-8 S75 listed until confirmed against the register", () => {
    const entries = [
      { id: "e1", kind: "back_entered_supply" as const, confirmsEntryId: null },
      { id: "e2", kind: "back_entered_supply" as const, confirmsEntryId: null },
      { id: "e3", kind: "back_entry_confirmed" as const, confirmsEntryId: "e1" },
    ];
    expect(awaitingRegisterConfirmation(entries).map((e) => e.id)).toEqual(["e2"]);
  });
});

describe("DT-9 a 'not supplied' row", () => {
  it("DT-9 S76 becomes owed or buying outside through LO-4's downtime moves, from any stage", () => {
    const toReview: LineStatus = { kind: "stage", stage: "to_review" };
    expect(applyMove(toReview, { kind: notSuppliedMove("owed") })).toEqual({
      ok: true,
      status: { kind: "open", outcome: "owed", supplied: 0, notSupplied: null },
    });
    expect(
      applyMove(
        { kind: "stage", stage: "awaiting_cosign" },
        { kind: notSuppliedMove("buying_outside") },
      ),
    ).toEqual({
      ok: true,
      status: { kind: "open", outcome: "buying_outside", supplied: 0, notSupplied: null },
    });
  });

  it("DT-9 S76 the row's event keeps the sheet's time", () => {
    const ev: PharmacyLineEvent = {
      id: "fx-ev-2",
      kind: "owed",
      occurredAt: NOW,
      effectiveAt: at("13:40"),
      lane: null,
      quantitySupplied: null,
      quantityNotSupplied: null,
      reasonCode: "out_of_stock_here",
      handoverId: null,
      actorCadre: "PHARMACY_TECH",
      enteredAfterDowntime: true,
    };
    const line = {
      id: "fx-line-2",
      state: "active" as const,
      cosign: "none" as const,
      createdAt: at("08:00"),
    };
    expect(lineStatus(line, [ev], [], "standard")).toMatchObject({ kind: "open", outcome: "owed" });
    expect(ev.effectiveAt).toEqual(at("13:40"));
  });
});

describe("DT-11 drills", () => {
  it("DT-11 S77 a drill writes a drill record and nothing else", () => {
    const d = pharmacyDrill({
      heldOn: "2026-10-12",
      participants: "Fixture team",
      whatWasDone: "Printed sheets and entered two rows",
      problems: null,
      dispensingPointId: "fx-point",
    });
    expect(Object.keys(d).sort()).toEqual(
      [
        "dispensingPointId",
        "heldOn",
        "participants",
        "problems",
        "whatWasDone",
        "workspace",
      ].sort(),
    );
    expect(d.workspace).toBe("pharmacy");
  });
});

describe("Appendix B copy", () => {
  it("B-73 B-76 B-78 as written, signed; the sheet footer keeps the register", () => {
    expect(DOWNTIME_COPY.status).toBe("signed");
    expect(DOWNTIME_COPY.sheetFooter).toMatch(
      /Controlled drugs also go in the register as usual\.$/,
    );
  });
});
