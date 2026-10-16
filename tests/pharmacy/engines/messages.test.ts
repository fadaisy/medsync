import type { MessageChannel, MessageKind } from "@/lib/pharmacy/messages";
import { describe, expect, it } from "vitest";

import {
  bannedTermsScan,
  gsm7Length,
  MESSAGE_COPY,
  notGivenWording,
  PATIENT_COPY,
  patientListEntry,
  refillDate,
  refillStatus,
  renderMessage,
  SMS_LIMIT,
} from "@/lib/pharmacy/messages";
import { RX_COURSES } from "@/lib/prescribing/reference/formulary-types";
import { FORMULARY_DRUGS } from "@/lib/prescribing/reference/general-formulary";

/**
 * Pharmacy Phase 1, Step 3: the patient's list, the refill date and messages (ML-1 to ML-6, MS-1, MS-2,
 * Law 12, W1, W7). Fixtures are invented; catalogue names are read from the catalogue, never typed.
 */

const EXTRAS = {
  products: ["Fixturol 10 tablets"],
  places: ["Fixture Diabetes Clinic", "Fixture window", "Fixture Ward Seven"],
  patientNames: ["Fixture Patient One"],
};
const SAFE = { messageName: "Fixture Hospital", phone: "+256 700 000 001" };

describe("ML-3: the refill date", () => {
  const expected: Record<(typeof RX_COURSES)[number], string | null> = {
    single: null,
    "3d": "2026-10-15",
    "5d": "2026-10-17",
    "7d": "2026-10-19",
    "14d": "2026-10-26",
    until_review: null,
  };
  it.each(RX_COURSES)("course %s, supplied in full", (course) => {
    expect(
      refillDate({
        suppliedOn: "2026-10-12",
        daysCovered: null,
        courseCode: course,
        suppliedInFull: true,
      }),
    ).toBe(expected[course]);
  });

  it("a course not supplied in full, or no course: no date, nothing estimated", () => {
    for (const course of RX_COURSES)
      expect(
        refillDate({
          suppliedOn: "2026-10-12",
          daysCovered: null,
          courseCode: course,
          suppliedInFull: false,
        }),
      ).toBeNull();
    expect(
      refillDate({
        suppliedOn: "2026-10-12",
        daysCovered: null,
        courseCode: null,
        suppliedInFull: true,
      }),
    ).toBeNull();
  });

  it("days covered, as the dispenser recorded, wins; across a month end", () => {
    expect(
      refillDate({
        suppliedOn: "2026-10-30",
        daysCovered: 3,
        courseCode: "14d",
        suppliedInFull: true,
      }),
    ).toBe("2026-11-02");
    expect(
      refillDate({
        suppliedOn: "2026-10-12",
        daysCovered: 0,
        courseCode: null,
        suppliedInFull: true,
      }),
    ).toBeNull();
  });
});

describe("ML-5: refill status, from supply events only", () => {
  const s = (medicineId: string, suppliedOn: string, over = {}) => ({
    medicineId,
    suppliedOn,
    daysCovered: null,
    courseCode: "7d" as const,
    suppliedInFull: true,
    withdrawn: false,
    ...over,
  });
  // 2026-10-19 09:00 in Kampala.
  const now = new Date("2026-10-19T06:00:00Z");

  it("not due, due, overdue against the hospital-local day", () => {
    const out = refillStatus(
      [
        s("fx-a", "2026-10-13"),
        s("fx-b", "2026-10-12"),
        s("fx-c", "2026-10-11"),
        s("fx-d", "2026-10-12", { courseCode: "single" }),
      ],
      now,
    );
    expect(Object.fromEntries(out.map((r) => [r.medicineId, r.status]))).toEqual({
      "fx-a": "not_due",
      "fx-b": "due",
      "fx-c": "overdue",
    });
  });

  it("the latest standing supply counts; a withdrawn one does not", () => {
    const out = refillStatus(
      [
        s("fx-a", "2026-10-01"),
        s("fx-a", "2026-10-15"),
        s("fx-a", "2026-10-18", { withdrawn: true }),
      ],
      now,
    );
    expect(out).toEqual([{ medicineId: "fx-a", refillOn: "2026-10-22", status: "not_due" }]);
  });
});

describe("ML-1, ML-6, W7: one list entry per line", () => {
  const group = {
    medicine: "Fixture tablet A",
    directions: "  500mg/5 mL, 2,5 mg\tas written  ",
    hospitalName: "Fixture Hospital",
    refillOn: "2026-10-19",
    supplies: [
      {
        id: "sup-2",
        quantity: 6,
        issueUnit: "tablets",
        suppliedAt: "2026-10-12T09:00:00Z",
        pharmacistLine: null,
        withdrawn: false,
      },
      {
        id: "sup-1",
        quantity: 8,
        issueUnit: "tablets",
        suppliedAt: "2026-10-12T08:00:00Z",
        pharmacistLine: "Fixture note",
        withdrawn: false,
      },
    ],
  };

  it("two batches, one entry: the total given, the source named, the directions byte for byte", () => {
    const e = patientListEntry(group)!;
    expect(e.given).toBe("14 tablets given today");
    expect(e.row.notes).toBe("From Fixture Hospital pharmacy, 12 Oct 2026.");
    expect(e.row.source_supply_id).toBe("sup-1");
    expect(Buffer.from(e.row.instructions).equals(Buffer.from(group.directions))).toBe(true);
    expect(e.pharmacistLine).toBe("From the pharmacist: Fixture note");
    expect(e.refill).toBe("Next supply due around 19 Oct 2026");
  });

  it("a withdrawn supply drops its share; all withdrawn, no entry", () => {
    const one = patientListEntry({
      ...group,
      supplies: [{ ...group.supplies[0]!, withdrawn: true }, group.supplies[1]!],
    })!;
    expect(one.given).toBe("8 tablets given today");
    expect(
      patientListEntry({
        ...group,
        supplies: group.supplies.map((x) => ({ ...x, withdrawn: true })),
      }),
    ).toBeNull();
  });

  it("no refill date, no refill line", () => {
    expect(patientListEntry({ ...group, refillOn: null })!.refill).toBeNull();
  });
});

describe("ML-2: not given today", () => {
  it("each outcome in the signed patient wording", () => {
    expect(notGivenWording("owed", "+256 700 000 001")).toEqual({
      lead: "Not given today",
      text: "The hospital pharmacy had none today. Ask at the pharmacy, or call +256 700 000 001, to find out when it has arrived.",
    });
    expect(notGivenWording("buying_outside", "x").text).toBe(PATIENT_COPY.buyingOutside);
    expect(notGivenWording("declined", "x").text).toBe(
      "The pharmacy did not give this medicine. Speak to your doctor or the pharmacy.",
    );
  });
});

describe("MS-1: the renderer takes the kind, the message name and the phone, nothing else", () => {
  const kinds: MessageKind[] = ["owed", "buying_outside", "in_stock"];
  const channels: MessageChannel[] = ["sms", "in_app"];

  it("fills the templates exactly", () => {
    expect(renderMessage("owed", SAFE)).toEqual({
      ok: true,
      text: "MedSync: one of your medicines was not available at Fixture Hospital today. Call the pharmacy on +256 700 000 001 to ask when it has arrived.",
      fitsOneSms: true,
    });
    expect(renderMessage("in_stock", SAFE, "in_app")).toMatchObject({
      text: "A medicine the pharmacy owed you is in stock at Fixture Hospital today.",
    });
    expect(renderMessage("owed", SAFE, "in_app")).toMatchObject({
      text: MESSAGE_COPY.inAppNotAvailable,
    });
  });

  it("W1: no point phone, no owed or buying-outside SMS; in stock needs none", () => {
    expect(renderMessage("owed", { ...SAFE, phone: null })).toEqual({
      ok: false,
      reason: "no_point_phone",
    });
    expect(renderMessage("buying_outside", { ...SAFE, phone: " " })).toEqual({
      ok: false,
      reason: "no_point_phone",
    });
    expect(renderMessage("in_stock", { ...SAFE, phone: null }).ok).toBe(true);
    expect(renderMessage("in_stock", { messageName: " ", phone: null })).toEqual({
      ok: false,
      reason: "no_message_name",
    });
  });

  it("S95: a restricted-class medicine produces the same text as any other", () => {
    const controlled = FORMULARY_DRUGS.find((d) => d.flags.controlled)!;
    const plain = FORMULARY_DRUGS.find((d) => !d.flags.controlled)!;
    // The supply context differs; the renderer is only ever handed the two allowed inputs.
    const ctx = (drug: typeof controlled) => ({ drug, ...SAFE });
    const render = ({ messageName, phone }: ReturnType<typeof ctx>) =>
      renderMessage("owed", { messageName, phone });
    expect(render(ctx(controlled))).toEqual(render(ctx(plain)));
    expect(renderMessage.length).toBeLessThanOrEqual(3);
  });

  it("every rendered SMS is GSM-7; the 160 limit is checked, not assumed", () => {
    for (const k of kinds) {
      const r = renderMessage(k, SAFE);
      if (!r.ok) throw new Error(r.reason);
      expect(gsm7Length(r.text)).not.toBeNull();
      expect(gsm7Length(r.text)!).toBeLessThanOrEqual(SMS_LIMIT);
      expect(r.fitsOneSms).toBe(true);
    }
    // B-68 leaves 44 characters for the message name and the phone together.
    const long = renderMessage("buying_outside", {
      messageName: "Fixture Regional Referral Hospital",
      phone: SAFE.phone,
    });
    expect(long).toMatchObject({ ok: true, fitsOneSms: false });
    expect(
      renderMessage("owed", { messageName: "Fixture Hospital ✓", phone: SAFE.phone }),
    ).toMatchObject({ fitsOneSms: false });
    expect(gsm7Length("x".repeat(161))).toBe(161);
    expect(gsm7Length("€")).toBe(2);
    expect(gsm7Length("✓")).toBeNull();
  });

  it("MS-2: every template and every rendered fixture passes the banned-term scan", () => {
    for (const t of Object.values(MESSAGE_COPY))
      if (typeof t === "string") expect(bannedTermsScan(t, EXTRAS), t).toEqual([]);
    for (const k of kinds)
      for (const c of channels) {
        const r = renderMessage(k, SAFE, c);
        if (!r.ok) throw new Error(r.reason);
        expect(bannedTermsScan(r.text, EXTRAS), r.text).toEqual([]);
      }
  });
});

describe("MS-2: the banned-term scan fails what it must", () => {
  const catalogueName = FORMULARY_DRUGS[0]!.generic;
  const synonym = FORMULARY_DRUGS.find((d) => /\(/.test(d.generic))!;
  const bracketed = /\(([^)]+)\)/.exec(synonym.generic)![1]!;
  const combo = FORMULARY_DRUGS.find((d) => d.generic.includes("–"))!.generic.split("–")[1]!;
  const must: [string, string][] = [
    ["a medicine name", `Your ${catalogueName} is ready.`],
    ["a medicine name, upper case", `YOUR ${catalogueName.toUpperCase()} IS READY`],
    ["a synonym", `Your ${bracketed} is ready.`],
    ["a part of a combination", `Your ${combo} is ready.`],
    ["a clinic name", "Come to Fixture Diabetes Clinic today."],
    ["a dispensing point name", "Collect at Fixture window."],
    ["a product name", "Fixturol 10 tablets is in."],
    ["a patient name", "Hello Fixture Patient One."],
    ["a MedSync number", "Your number MS-2026-00001."],
    ["a dose", "Take 500 mg today."],
    ["a dose, no space", "Take 500mg today."],
    ["a decimal comma dose", "Take 2,5 mg today."],
    ["a restricted class", "Your controlled medicine is ready."],
    ["a condition", "Your sugar medicine is ready."],
  ];
  it.each(must)("%s", (_, text) => {
    expect(bannedTermsScan(text, EXTRAS)).not.toEqual([]);
  });

  it("plain words and a phone number pass", () => {
    expect(bannedTermsScan("Call the pharmacy on +256 700 000 001 today.", EXTRAS)).toEqual([]);
  });
});
