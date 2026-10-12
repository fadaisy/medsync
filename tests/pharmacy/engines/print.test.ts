import type { LogColumnMap, LogSupply } from "@/lib/pharmacy/print/dispensing-log";
import type { LabelInput, PrintKind, SignedLabelSet } from "@/lib/pharmacy/print/label";
import type { SlipInput } from "@/lib/pharmacy/print/slip";
import { describe, expect, it } from "vitest";

import { dispensingLog, LOG_COPY } from "@/lib/pharmacy/print/dispensing-log";
import {
  directionsAsWritten,
  labelFor,
  printFileSafe,
  PROPOSED_LABEL_FIELDS,
} from "@/lib/pharmacy/print/label";
import { REGISTER_COPY, registerSlipFor } from "@/lib/pharmacy/print/register";
import {
  newVerificationCode,
  SLIP_COPY,
  slipFor,
  VERIFICATION_ALPHABET,
  VERIFICATION_CODE_PATTERN,
} from "@/lib/pharmacy/print/slip";

/**
 * Pharmacy Phase 1, Step 3: the print engines (LB-1 to LB-7, DL-1 to DL-3, Law 7, W1, W2). Every
 * medicine, batch, person and number here is an invented fixture.
 */

// Law 7: awkward strings that a careless renderer would trim, reformat or convert.
const AWKWARD = [
  "Fixture syrup A 500mg/5 mL, 2,5 mg twice a day  ",
  "\tTake one\twith water\t",
  "  half a tablet, 2,5 mg, at night   ",
  "1½ × daily — 500mg/5 mL (as written)",
  "Line one\nLine two  ",
];

const bytes = (s: string) => Buffer.from(s, "utf8");

const baseLabel = (directions: string, over: Partial<LabelInput> = {}): LabelInput => ({
  supply: {
    patientName: "Fixture Patient One",
    medicine: "Fixture tablet A 10 unit-strength",
    quantity: 14,
    issueUnit: "tablets",
    batchNumber: "FX-001",
    expiry: "2027-03",
    suppliedAt: "2026-10-12T08:30:00Z",
    pharmacistLine: null,
  },
  line: { directions, structured: null },
  point: { name: "Fixture window" },
  hospital: { name: "Fixture Hospital", district: "Fixture District" },
  signed: null,
  ...over,
});

const slipInput = (over: Partial<SlipInput> = {}): SlipInput => ({
  hospital: { name: "Fixture Hospital", district: "Fixture District" },
  point: { name: "Fixture window", phone: "+256 700 000 001" },
  prescriptionNumber: "RX-FIXTURE-1",
  patient: { name: "Fixture Patient One", medsyncNumber: "MS-2026-00001", sexAndAge: "F, 40 y" },
  prescriber: { name: "Fixture Prescriber", cadre: "Medical officer", councilNumber: "FX-123" },
  lines: [
    {
      outcome: "buying_outside",
      controlled: false,
      medicine: "Fixture tablet A",
      directions: AWKWARD[0]!,
      quantityNotSupplied: null,
    },
  ],
  changedAt: null,
  code: "ABCD2345",
  printedAt: "2026-10-12T08:30:00Z",
  copy: { n: 1, of: 1 },
  ...over,
});

describe("Law 7, LB-2: directions byte for byte on the screen, the label and the slip", () => {
  it.each(AWKWARD)("%j", (d) => {
    expect(bytes(directionsAsWritten(d)).equals(bytes(d))).toBe(true);
    const label = labelFor(baseLabel(d)).find((f) => f.key === "directions")!;
    expect(bytes(label.text).equals(bytes(d))).toBe(true);
    const r = slipFor(
      slipInput({
        lines: [
          {
            outcome: "buying_outside",
            controlled: false,
            medicine: "X",
            directions: d,
            quantityNotSupplied: 3,
          },
        ],
      }),
    );
    if (!r.ok) throw new Error(r.reason);
    expect(bytes(r.slip.lines[0]!.directions).equals(bytes(d))).toBe(true);
  });
});

describe("LB-1 to LB-3: the label", () => {
  it("unsigned: the full proposed field set, in order; no warning lines, no plain words, no instructions", () => {
    const fields = labelFor(
      baseLabel(AWKWARD[0]!, {
        supply: { ...baseLabel("").supply, chosenInstructions: ["Fixture instruction"] },
      }),
    );
    expect(fields.map((f) => f.key)).toEqual(
      PROPOSED_LABEL_FIELDS.filter(
        (k) => !["pharmacist_line", "warning_lines", "additional_instructions"].includes(k),
      ),
    );
  });

  it("the pharmacist's line is marked, as stored", () => {
    const fields = labelFor(
      baseLabel("x", {
        supply: { ...baseLabel("").supply, pharmacistLine: "Fixture  note $& 2,5 mg " },
      }),
    );
    expect(fields.find((f) => f.key === "pharmacist_line")!.text).toBe(
      "From the pharmacist: Fixture  note $& 2,5 mg ",
    );
  });

  it("W2: the supplier is the point, the hospital name and its district; no district, no gap", () => {
    expect(labelFor(baseLabel("x")).find((f) => f.key === "supplier")!.text).toBe(
      "Fixture window, Fixture Hospital, Fixture District",
    );
    expect(
      labelFor(baseLabel("x", { hospital: { name: "Fixture Hospital", district: null } })).find(
        (f) => f.key === "supplier",
      )!.text,
    ).toBe("Fixture window, Fixture Hospital");
  });

  it("one label per supply event: quantity, batch and expiry come from that batch", () => {
    const a = labelFor(baseLabel("x"));
    const b = labelFor(
      baseLabel("x", {
        supply: {
          ...baseLabel("").supply,
          quantity: 6,
          batchNumber: "FX-002",
          expiry: "2027-01-31",
        },
      }),
    );
    expect(a.find((f) => f.key === "batch_expiry")!.text).toBe("Batch FX-001 · Expiry 2027-03");
    expect(b.find((f) => f.key === "batch_expiry")!.text).toBe("Batch FX-002 · Expiry 2027-01-31");
    expect(b.find((f) => f.key === "quantity")!.text).toBe("6 tablets");
  });

  const signed: SignedLabelSet = {
    fields: ["medicine", "patient_name", "directions", "warning_lines", "additional_instructions"],
    warningLines: ["Fixture warning line."],
    additionalInstructions: ["Fixture instruction"],
    plainWords: [{ frequency: "12h", course: "5d", words: "Fixture plain words." }],
  };

  it("signed: the signed order; signed warnings; only instructions on the signed list", () => {
    const fields = labelFor(
      baseLabel("x", {
        signed,
        supply: {
          ...baseLabel("").supply,
          chosenInstructions: ["Fixture instruction", "Typed at the window"],
        },
      }),
    );
    expect(fields.map((f) => [f.key, f.text])).toEqual([
      ["medicine", "Fixture tablet A 10 unit-strength"],
      ["patient_name", "Fixture Patient One"],
      ["directions", "x"],
      ["warning_lines", "Fixture warning line."],
      ["additional_instructions", "Fixture instruction"],
    ]);
  });

  it("plain words only where a signed template covers the structured parts", () => {
    const covered = labelFor(
      baseLabel("x", {
        signed,
        line: { directions: "x", structured: { frequency: "12h", course: "5d" } },
      }),
    );
    expect(covered.map((f) => f.key)).toContain("plain_words");
    expect(covered.find((f) => f.key === "plain_words")!.text).toBe("Fixture plain words.");
    const other = labelFor(
      baseLabel("x", {
        signed,
        line: { directions: "x", structured: { frequency: "8h", course: "5d" } },
      }),
    );
    expect(other.map((f) => f.key)).not.toContain("plain_words");
    const unsigned = labelFor(
      baseLabel("x", { line: { directions: "x", structured: { frequency: "12h", course: "5d" } } }),
    );
    expect(unsigned.map((f) => f.key)).not.toContain("plain_words");
  });
});

describe("LB-4: no PHI in a file name", () => {
  const kinds: PrintKind[] = [
    "label",
    "slip",
    "register_entry",
    "dispensing_log",
    "downtime_sheets",
  ];
  it.each(kinds)("%s has a fixed title", (k) => {
    expect(printFileSafe(k)).toMatch(/^MedSync [a-z ]+$/);
    expect(printFileSafe(k)).not.toMatch(/\d|Fixture/);
  });
});

describe("LB-5, W1: the slip", () => {
  it("prints only buying-outside lines, with the quantity or B-33", () => {
    const r = slipFor(
      slipInput({
        lines: [
          {
            outcome: "buying_outside",
            controlled: false,
            medicine: "A",
            directions: "a",
            quantityNotSupplied: null,
          },
          {
            outcome: "buying_outside",
            controlled: false,
            medicine: "B",
            directions: "b",
            quantityNotSupplied: 7,
          },
          {
            outcome: "owed",
            controlled: false,
            medicine: "C",
            directions: "c",
            quantityNotSupplied: 2,
          },
          {
            outcome: "owed",
            controlled: true,
            medicine: "D",
            directions: "d",
            quantityNotSupplied: 2,
          },
        ],
      }),
    );
    if (!r.ok) throw new Error(r.reason);
    expect(r.slip.lines.map((l) => [l.medicine, l.quantity])).toEqual([
      ["A", "Quantity: as on the prescription"],
      ["B", "Quantity: 7"],
    ]);
    expect(r.slip.title).toBe(SLIP_COPY.title);
    expect(r.slip.verification).toBe(
      "To check this is real, call the hospital pharmacy on +256 700 000 001 and give this code: ABCD2345.",
    );
    expect(r.slip.footer).toBe(
      "Controlled drugs are never printed on this form. Printed 11:30 at Fixture window. Copy 1 of 1.",
    );
    expect(r.slip.changed).toBeNull();
    expect(r.slip.body).toContain("together with your signed prescription");
  });

  it("refuses a controlled buying-outside line", () => {
    const r = slipFor(
      slipInput({
        lines: [
          {
            outcome: "buying_outside",
            controlled: true,
            medicine: "A",
            directions: "a",
            quantityNotSupplied: null,
          },
        ],
      }),
    );
    expect(r).toEqual({ ok: false, reason: "controlled_line" });
  });

  it("no point phone, no slip (W1)", () => {
    expect(slipFor(slipInput({ point: { name: "P", phone: null } }))).toEqual({
      ok: false,
      reason: "no_point_phone",
    });
    expect(slipFor(slipInput({ point: { name: "P", phone: "  " } }))).toEqual({
      ok: false,
      reason: "no_point_phone",
    });
  });

  it("no buying-outside line, or a code outside the alphabet: no slip", () => {
    expect(slipFor(slipInput({ lines: [] }))).toEqual({ ok: false, reason: "no_lines" });
    expect(slipFor(slipInput({ code: "ABCD1234" }))).toEqual({ ok: false, reason: "bad_code" });
  });

  it("says when the prescription changed since it was printed", () => {
    const r = slipFor(slipInput({ changedAt: "2026-10-11T09:00:00Z" }));
    if (!r.ok) throw new Error(r.reason);
    expect(r.slip.changed).toBe(
      "The prescription was changed on 11 Oct 2026. Ask the hospital for a new copy.",
    );
  });
});

describe("LB-6: the verification code", () => {
  const crypto = globalThis.crypto;
  const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

  it("10,000 draws: the alphabet and pattern of 0126, length 8, all distinct", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const c = newVerificationCode(rnd);
      expect(c).toHaveLength(8);
      expect(c).toMatch(VERIFICATION_CODE_PATTERN);
      seen.add(c);
    }
    expect(seen.size).toBe(10_000);
  });

  it("the alphabet is exactly the CHECK's class (no 0, O, 1, I, L)", () => {
    const all = Array.from({ length: 128 }, (_, i) => String.fromCharCode(i)).filter((ch) =>
      /^[A-HJKMNP-Z2-9]$/.test(ch),
    );
    expect([...VERIFICATION_ALPHABET].sort()).toEqual(all.sort());
    expect(VERIFICATION_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("uniform: each character is reached by exactly 8 of the 248 accepted byte values; 248+ are redrawn", () => {
    const counts = new Map<string, number>();
    for (let b = 0; b < 248; b++) {
      const c = newVerificationCode((n) => new Uint8Array(n).fill(b));
      expect(new Set(c).size).toBe(1);
      counts.set(c[0]!, (counts.get(c[0]!) ?? 0) + 1);
    }
    expect(counts.size).toBe(31);
    expect(new Set(counts.values())).toEqual(new Set([8]));
    // Rejected bytes never become characters.
    let calls = 0;
    const mostlyHigh = (n: number) =>
      Uint8Array.from({ length: n }, () => (calls++ % 5 === 4 ? 3 : 250));
    expect(newVerificationCode(mostlyHigh)).toBe(VERIFICATION_ALPHABET[3]!.repeat(8));
  });

  it("carries no patient information: it reads nothing but random bytes", () => {
    expect(newVerificationCode.length).toBe(1);
    expect(() => newVerificationCode(rnd, 7)).toThrow();
    expect(newVerificationCode(rnd, 12)).toMatch(VERIFICATION_CODE_PATTERN);
  });
});

describe("LB-7: the register slip", () => {
  it("carries the heading exactly and the entry's facts", () => {
    const s = registerSlipFor({
      hospital: "Fixture Hospital",
      point: "Fixture window",
      recordedAt: "2026-10-12T08:30:00Z",
      patient: { name: "Fixture Patient One", medsyncNumber: "MS-2026-00001" },
      medicine: "Fixture controlled A",
      quantity: 4,
      issueUnit: "ampoules",
      batchNumber: "FX-009",
      expiry: "2027-05",
      balanceAfter: 11,
      prescriber: "Fixture Prescriber",
      suppliedBy: "Fixture Supplier",
      witness: "Fixture Witness",
      collectedBy: null,
    });
    expect(s.heading).toBe("Copy for the controlled drugs register. This is not the register.");
    expect(REGISTER_COPY.heading).toBe(s.heading);
    expect(Object.fromEntries(s.rows.map((r) => [r.label, r.value]))).toMatchObject({
      Date: "12 Oct 2026",
      Time: "11:30",
      Quantity: "4 ampoules",
      "Batch and expiry": "FX-009 · 2027-05",
      "Balance after": "11",
      Witness: "Fixture Witness",
    });
    expect(s.rows.map((r) => r.label)).not.toContain("Collected by");
  });
});

describe("DL-1 to DL-3: the dispensing log", () => {
  const supply = (id: string, at: string, over: Partial<LogSupply> = {}): LogSupply => ({
    id,
    suppliedAt: at,
    patientName: "Fixture Patient",
    medsyncNumber: "MS-2026-00001",
    medicine: "Fixture tablet A",
    quantity: 10,
    issueUnit: "tablets",
    batchNumber: "FX-001",
    expiry: "2027-03",
    prescription: "RX-FIXTURE-1",
    suppliedBy: "Fixture Supplier",
    downtime: null,
    reversal: null,
    inError: null,
    ...over,
  });
  // One line split across two batches is two supply events, so two rows.
  const day: LogSupply[] = [
    supply("s3", "2026-10-12T11:00:00Z", {
      downtime: { enteredAt: "2026-10-12T12:52:00Z", sheetNumber: "DS-00031" },
    }),
    supply("s1", "2026-10-12T06:00:00Z"),
    supply("s2", "2026-10-12T06:00:00Z", { batchNumber: "FX-002" }),
    supply("s4", "2026-10-12T07:00:00Z", {
      reversal: { at: "2026-10-12T07:30:00Z", byCadre: "Pharmacist", reason: "Fixture reason" },
    }),
    supply("s5", "2026-10-12T08:00:00Z", { inError: { reason: "Fixture error reason" } }),
  ];

  it("DL-3: one row per supply event", () => {
    expect(dispensingLog(day, null).rows).toHaveLength(day.length);
    expect(dispensingLog([], null).rows).toHaveLength(0);
  });

  it("DL-1: unconfirmed map prints the notice and MedSync's order", () => {
    const log = dispensingLog(day, null);
    expect(log.notice).toBe("Columns not yet confirmed against this hospital's dispensing log.");
    expect(log.notice).toBe(LOG_COPY.notConfirmed);
    const draft: LogColumnMap = { confirmed: false, columns: [{ heading: "X", fact: "batch" }] };
    expect(dispensingLog(day, draft).notice).toBe(LOG_COPY.notConfirmed);
    expect(dispensingLog(day, draft).headings[0]).toBe("Time");
  });

  it("DL-1: a confirmed map sets the columns, blank where MedSync cannot fill", () => {
    const map: LogColumnMap = {
      confirmed: true,
      columns: [
        { heading: "Batch No.", fact: "batch" },
        { heading: "Remarks", fact: null },
        { heading: "Qty", fact: "quantity" },
      ],
    };
    const log = dispensingLog(day, map);
    expect(log.notice).toBeNull();
    expect(log.headings).toEqual(["Batch No.", "Remarks", "Qty"]);
    expect(log.rows.find((r) => r.supplyId === "s2")!.cells).toEqual(["FX-002", "", "10 tablets"]);
  });

  it("DL-2: back-entered at the sheet's time and marked; reversed and in error struck with the reason", () => {
    const log = dispensingLog(day, null);
    const s3 = log.rows.find((r) => r.supplyId === "s3")!;
    expect(s3.cells[0]).toBe("14:00");
    expect(s3.notes).toEqual([
      "Entered after downtime · Supplied 14:00 · entered 15:52 · sheet DS-00031",
    ]);
    expect(s3.struck).toBe(false);
    const s4 = log.rows.find((r) => r.supplyId === "s4")!;
    expect(s4.struck).toBe(true);
    expect(s4.notes).toEqual(["Reversed 10:30 by Pharmacist: Fixture reason"]);
    const s5 = log.rows.find((r) => r.supplyId === "s5")!;
    expect(s5.struck).toBe(true);
    expect(s5.notes).toEqual(["Recorded in error. Fixture error reason"]);
    expect(log.rows.map((r) => r.supplyId)).toEqual(["s1", "s2", "s4", "s5", "s3"]);
  });
});
