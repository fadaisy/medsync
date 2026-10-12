import type { Attestation, WitnessList } from "@/lib/pharmacy/controlled";
import type { LaneLine } from "@/lib/pharmacy/lanes";
import type { Movement } from "@/lib/pharmacy/stock/ledger";
import { describe, expect, it } from "vitest";

import {
  attestationsFor,
  attestationStands,
  classLabel,
  commitCount,
  CONTROLLED_COPY,
  CONTROLLED_NEVER,
  controlledSupplyReady,
  handoverRoute,
  isControlledLine,
  pathAllowed,
  PROPOSED_WITNESS_LIST,
  READY_COPY,
  runningBalance,
  witnessAgreementText,
  witnessAllowed,
} from "@/lib/pharmacy/controlled";
import { LANE_REASON_ORDER, laneFor } from "@/lib/pharmacy/lanes";
import { REGISTER_COPY, registerSlipFor } from "@/lib/pharmacy/print/register";
import { slipFor } from "@/lib/pharmacy/print/slip";
import { balances } from "@/lib/pharmacy/stock/ledger";

/**
 * Pharmacy Phase 1, Step 3: controlled drugs (CD-1 to CD-8, PA2-6, D-PH1-27, D-PH1-42; S57–S61,
 * S63–S66). Every medicine, class, batch, person and quantity is an invented fixture.
 */

const T0 = new Date("2026-10-12T10:00:00Z");
const min = (m: number) => new Date(T0.getTime() + m * 60_000);
const SUPPLIER = "fx-user-supplier";
const WITNESS = "fx-user-witness";
const H1 = "fx-h1";

const attestation = (o: Partial<Attestation> = {}): Attestation => ({
  hospitalId: H1,
  actorUserId: SUPPLIER,
  attesterUserId: WITNESS,
  purpose: "witness",
  outcome: "passed",
  attestedAt: min(-5),
  ...o,
});
const stands = (a: Attestation | null, now = T0) =>
  attestationStands({ attestation: a, actorUserId: SUPPLIER, hospitalId: H1, now });

const ready: Parameters<typeof controlledSupplyReady>[0] = {
  actorPermissions: ["pharmacy.view", "pharmacy.dispense", "pharmacy.controlled"],
  everyLineAccepted: true,
  witnessStands: true,
  batchIds: ["fx-batch-1", "fx-batch-2"],
  countedBatchIds: ["fx-batch-1", "fx-batch-2"],
  paperAttested: true,
  registerAttested: true,
  witnessAgreedBalance: 7,
};

describe("CD-1 what is controlled", () => {
  it("CD-1 the prescription's flag or a signed class, either alone", () => {
    expect(isControlledLine({ rxControlled: true, signedClass: null })).toBe(true);
    expect(isControlledLine({ rxControlled: false, signedClass: "fixture class A" })).toBe(true);
    expect(isControlledLine({ rxControlled: false, signedClass: null })).toBe(false);
    expect(isControlledLine({ rxControlled: false, signedClass: "  " })).toBe(false);
  });

  it("CD-1 S61 flagged with no signed class: 'Controlled drug', no class named, the full path", () => {
    const l = { rxControlled: true, signedClass: null };
    expect(classLabel(l.signedClass)).toBe("Controlled drug");
    expect(isControlledLine(l)).toBe(true);
    expect(handoverRoute([{ id: "fx-l1", ...l }]).screen).toBe("controlled");
  });

  it("CD-1 S61 a stocked medicine signed as controlled, not flagged at prescribing, takes the full path", () => {
    const l = { id: "fx-l1", rxControlled: false, signedClass: "fixture class B" };
    expect(classLabel(l.signedClass)).toBe("fixture class B");
    expect(handoverRoute([l])).toEqual({
      screen: "controlled",
      lineIds: ["fx-l1"],
      controlledLineIds: ["fx-l1"],
    });
  });

  it("CD-1 CD-2 S64 one controlled line and one other: one hand-over, both lines, the controlled screen", () => {
    const r = handoverRoute([
      { id: "fx-controlled", rxControlled: true, signedClass: null },
      { id: "fx-other", rxControlled: false, signedClass: null },
    ]);
    expect(r).toEqual({
      screen: "controlled",
      lineIds: ["fx-controlled", "fx-other"],
      controlledLineIds: ["fx-controlled"],
    });
    expect(handoverRoute([{ id: "fx-other", rxControlled: false, signedClass: null }]).screen).toBe(
      "standard",
    );
  });
});

describe("CD-2 the witness (PA2-6, D-PH1-27, D-PH1-42)", () => {
  it("CD-2 0127's guard: a passed witness attestation by another user, for this actor and hospital", () => {
    expect(stands(attestation())).toBe(true);
    expect(stands(null)).toBe(false);
    expect(stands(attestation({ outcome: "failed" }))).toBe(false);
    expect(stands(attestation({ outcome: "locked" }))).toBe(false);
    expect(stands(attestation({ purpose: "signer" }))).toBe(false);
    expect(stands(attestation({ actorUserId: "fx-user-other" }))).toBe(false);
    expect(stands(attestation({ hospitalId: "fx-h2" }))).toBe(false);
    expect(stands(attestation({ attesterUserId: null }))).toBe(false);
  });

  it("CD-2 S58 the supplier as their own witness, or with the supplier's own factor, is refused", () => {
    expect(stands(attestation({ attesterUserId: SUPPLIER }))).toBe(false);
    expect(
      witnessAllowed({
        witnessPermissions: ["pharmacy.dispense"],
        signedWitnessList: PROPOSED_WITNESS_LIST,
        witnessUserId: SUPPLIER,
        actorUserId: SUPPLIER,
      }),
    ).toBe(false);
  });

  it("CD-2 the attestation stands for 30 minutes, not after", () => {
    expect(stands(attestation({ attestedAt: min(-30) }))).toBe(true);
    expect(stands(attestation({ attestedAt: new Date(min(-30).getTime() - 1) }))).toBe(false);
  });

  it("CD-2 S63 a technician cannot supply a controlled line, and can witness if the signed list says so", () => {
    const technician = ["pharmacy.view", "pharmacy.dispense", "pharmacy.stock"] as const;
    const r = controlledSupplyReady({ ...ready, actorPermissions: technician });
    expect(r.ready).toBe(false);
    expect(r.missing.map((m) => m.item)).toEqual(["permission"]);
    const asWitness = (list: WitnessList | null) =>
      witnessAllowed({
        witnessPermissions: technician,
        signedWitnessList: list,
        witnessUserId: WITNESS,
        actorUserId: SUPPLIER,
      });
    expect(asWitness(PROPOSED_WITNESS_LIST)).toBe(true);
    expect(asWitness({ permissions: ["pharmacy.controlled"] })).toBe(false);
    expect(asWitness(null)).toBe(false); // unsigned: nobody may
  });
});

describe("CD-2 Record supply stays off until everything is complete", () => {
  it("CD-2 complete: ready, nothing missing", () => {
    expect(controlledSupplyReady(ready)).toEqual({ ready: true, missing: [] });
  });

  it("CD-2 S57 without the count, either paper attestation, or the witness: refused, each separately, in words", () => {
    const cases: [Partial<typeof ready>, string][] = [
      [{ countedBatchIds: ["fx-batch-1"] }, "count"],
      [{ countedBatchIds: [] }, "count"],
      [{ paperAttested: false }, "paperPrescription"],
      [{ registerAttested: false }, "paperRegister"],
      [{ witnessAgreedBalance: null }, "witnessAgreement"],
      [{ everyLineAccepted: false }, "acceptance"],
    ];
    for (const [over, item] of cases) {
      const r = controlledSupplyReady({ ...ready, ...over });
      expect(r.ready).toBe(false);
      expect(r.missing).toEqual([{ item, words: READY_COPY[item as keyof typeof READY_COPY] }]);
    }
    // No witness: the count cannot have been made with the witness present either.
    expect(
      controlledSupplyReady({ ...ready, witnessStands: false }).missing.map((m) => m.item),
    ).toEqual(["witness", "count"]);
  });

  it("CD-2 a product with no batch counted is never ready", () => {
    expect(controlledSupplyReady({ ...ready, batchIds: [], countedBatchIds: [] }).ready).toBe(
      false,
    );
  });
});

describe("CD-3 the count", () => {
  it("CD-3 S59 committed first and fixed; a difference records both figures and a witnessed correction; supply from the count", () => {
    const r = commitCount({
      typedPerBatch: new Map([
        ["fx-batch-1", 8],
        ["fx-batch-2", 5],
      ]),
      balancesPerBatch: new Map([
        ["fx-batch-1", 10],
        ["fx-batch-2", 5],
      ]),
    });
    if (!r.ok) throw new Error("expected a commit");
    expect(r.count).toEqual([
      { batchId: "fx-batch-1", counted: 8 },
      { batchId: "fx-batch-2", counted: 5 },
    ]);
    expect(r.differences).toEqual([
      { batchId: "fx-batch-1", countedQuantity: 8, recordedBalance: 10 },
    ]);
    expect(r.corrections).toEqual([
      { batchId: "fx-batch-1", kind: "count_correction", quantity: -2, witnessed: true },
    ]);
    expect(r.supplyFrom.get("fx-batch-1")).toBe(8);
    // Cannot be retyped: the committed figures are frozen.
    expect(() => {
      (r.count[0] as { counted: number }).counted = 10;
    }).toThrow(TypeError);
    expect(() =>
      (r.count as { batchId: string; counted: number }[]).push({ batchId: "x", counted: 1 }),
    ).toThrow(TypeError);
  });

  it("CD-3 a second count is a second event; the first stands", () => {
    const balancesPerBatch = new Map([["fx-batch-1", 10]]);
    const first = commitCount({ typedPerBatch: new Map([["fx-batch-1", 9]]), balancesPerBatch });
    const second = commitCount({ typedPerBatch: new Map([["fx-batch-1", 10]]), balancesPerBatch });
    if (!first.ok || !second.ok) throw new Error("expected commits");
    expect(first.count).not.toBe(second.count);
    expect(first.count[0]!.counted).toBe(9);
    expect(second.differences).toEqual([]);
  });

  it("CD-3 every batch in the cupboard is counted, as a whole number not below zero", () => {
    const balancesPerBatch = new Map([
      ["fx-batch-1", 10],
      ["fx-batch-2", 4],
    ]);
    expect(commitCount({ typedPerBatch: new Map([["fx-batch-1", 10]]), balancesPerBatch })).toEqual(
      {
        ok: false,
        reason: "missing_batch",
      },
    );
    for (const bad of [-1, 2.5, Number.NaN])
      expect(
        commitCount({
          typedPerBatch: new Map([
            ["fx-batch-1", bad],
            ["fx-batch-2", 4],
          ]),
          balancesPerBatch,
        }),
      ).toEqual({ ok: false, reason: "not_whole" });
  });

  it("CD-3 the difference words are B-51; the witness's agreement is B-50 with the figure", () => {
    expect(CONTROLLED_COPY.difference).toBe(
      "The count does not match the record. Record the difference; it goes to the pharmacy in charge.",
    );
    expect(witnessAgreementText(7)).toBe(
      "I, the witness, saw the count and agree with the balance of 7.",
    );
  });
});

describe("CD-4 paths a controlled line never takes", () => {
  const controlled = { rxControlled: true, signedClass: null };
  const other = { rxControlled: false, signedClass: null };

  it("CD-4 S60 never buying outside, never the standard lane, never D-PH1-05, never the slip", () => {
    for (const path of CONTROLLED_NEVER) {
      expect(pathAllowed(path, controlled)).toBe(false);
      expect(pathAllowed(path, other)).toBe(true);
    }
  });

  it("CD-4 S60 LN-5: a controlled line is pharmacist first even with every lane reason off", () => {
    const laneLine: LaneLine = {
      id: "fx-l1",
      controlled: true,
      checkAnswers: [],
      confirmedFlags: [],
      regimenId: "fixture-regimen-a",
      edits: [],
      conditionId: "fixture-condition",
      kind: "drug",
      drugId: "fixture-tablet-a",
    };
    const off = { version: 1, reasons: LANE_REASON_ORDER.map((code) => ({ code, on: false })) };
    expect(laneFor([laneLine], off, null).lane).toBe("pharmacist_first");
  });

  it("CD-4 S60 the slip refuses a controlled line", () => {
    const r = slipFor({
      hospital: { name: "Fixture Hospital", district: null },
      point: { name: "Fixture window", phone: "+256700000000" },
      prescriptionNumber: null,
      patient: { name: "Fixture Patient", medsyncNumber: "FX-0001", sexAndAge: "F · 40" },
      prescriber: { name: "Fixture Prescriber", cadre: "Medical officer", councilNumber: null },
      lines: [
        {
          outcome: "buying_outside",
          controlled: true,
          medicine: "Fixture tablet A",
          directions: "as written",
          quantityNotSupplied: null,
        },
      ],
      changedAt: null,
      code: "ABCDEFGH",
      printedAt: T0.toISOString(),
      copy: { n: 1, of: 1 },
    });
    expect(r).toEqual({ ok: false, reason: "controlled_line" });
    expect(CONTROLLED_COPY.noBuyingOutside).toMatch(/cannot be sent to another pharmacy/);
  });
});

describe("CD-6 the Controlled drugs page", () => {
  it("CD-6 the running balance equals the ledger's balance at every row", () => {
    const mv = (
      id: string,
      batchId: string,
      kind: Movement["kind"],
      quantity: number,
      at: number,
    ): Movement => ({
      id,
      batchId,
      pointId: "fx-point",
      kind,
      quantity,
      effectiveAt: min(at),
      recordedAt: min(at),
      downtime: false,
    });
    const entries = [
      mv("m3", "fx-batch-1", "supplied", -3, 30),
      mv("m1", "fx-batch-1", "received", 20, 0),
      mv("m2", "fx-batch-2", "received", 10, 10),
      mv("m4", "fx-batch-2", "count_correction", -1, 40),
      mv("m5", "fx-batch-1", "transfer_out", -5, 50),
    ];
    const rows = runningBalance(entries);
    expect(rows.map((r) => r.id)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
    rows.forEach((row, i) => {
      const bal = balances(rows.slice(0, i + 1));
      expect(row.balance).toBe([...bal.values()].reduce((a, b) => a + b, 0));
      expect(row.batchBalance).toBe(bal.get(row.batchId));
    });
    expect(rows.at(-1)!.balance).toBe(21);
  });
});

describe("CD-7 CD-8 Law 9: the paper still rules", () => {
  it("CD-8 S65 changed since printing: the caution, and the first attestation is that the paper matches", () => {
    const changed = attestationsFor({ changedSincePrinting: true });
    expect(changed.caution).toBe(
      "Changed since printing. The paper the patient carries is out of date.",
    );
    expect(changed.attestations[0]).toBe(
      "The signed prescription is here, matches what is on this screen, and will be kept.",
    );
    expect(attestationsFor({ changedSincePrinting: false }).caution).toBeNull();
  });

  it("CD-7 S66 the register slip prints under its 'this is not the register' heading", () => {
    const slip = registerSlipFor({
      hospital: "Fixture Hospital",
      point: "Fixture window",
      recordedAt: T0.toISOString(),
      patient: { name: "Fixture Patient", medsyncNumber: "FX-0001" },
      medicine: "Fixture injection D",
      quantity: 2,
      issueUnit: "ampoule",
      batchNumber: "FX-B1",
      expiry: "2027-01-31",
      balanceAfter: 7,
      prescriber: null,
      suppliedBy: "Fixture Pharmacist",
      witness: "Fixture Technician",
      collectedBy: null,
    });
    expect(slip.heading).toBe("Copy for the controlled drugs register. This is not the register.");
    expect(slip.heading).toBe(REGISTER_COPY.heading);
  });

  it("CD-7 Law 9: no controlled wording says the paper is no longer needed or that MedSync is the register", () => {
    const texts = [
      ...Object.values(CONTROLLED_COPY),
      ...Object.values(READY_COPY),
      REGISTER_COPY.heading,
    ].filter((v) => typeof v === "string");
    for (const t of texts) {
      expect(t).not.toMatch(/no longer (needed|required)|instead of the (paper|register)/i);
      expect(t).not.toMatch(/\breplaces the (paper|register|prescription)/i);
      expect(t).not.toMatch(/\bis the (controlled drugs )?register\b/i);
    }
    expect(CONTROLLED_COPY.notice).toMatch(/^MedSync's record does not replace the paper\./);
    expect(CONTROLLED_COPY.status).toBe("draft");
  });
});
