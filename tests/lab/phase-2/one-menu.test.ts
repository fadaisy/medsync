/**
 * One menu, payment, labels, receipt, announcements, clinical context and the high-risk warning
 * (OM-*, PY-*, ID-*, SR-*, LV-4, CX-*, HR-*). Fixture hub rows only.
 */
import type { Offering, OpenProblem } from "@/supabase/functions/_shared/services-hub";
import { describe, expect, it } from "vitest";

import {
  announce,
  availabilityFor,
  canCollect,
  canUndo,
  checkLabel,
  currentPayment,
  diagnosisVisible,
  highRiskNow,
  orderable,
  paymentAtPlacement,
  receiveDecision,
  ruleFlagsHighRisk,
  scannedLabel,
} from "@/lib/lab/one-menu";

const offering = (o: Partial<Offering> = {}): Offering => ({
  kind: "lab",
  code: "2160-0",
  provision: "in_house",
  hours: "24h",
  hoursNote: null,
  statedTat: "fixture 2 h",
  referredTo: null,
  confirmedAt: "2026-01-01T00:00:00Z",
  ...o,
});
const down = (o: Partial<OpenProblem> = {}): OpenProblem => ({
  problemId: "p",
  subjectKind: "test",
  subjectRef: "2160-0",
  subjectLabel: "Creatinine",
  state: "unavailable",
  unconfirmed: false,
  reason: "equipment_down",
  note: null,
  since: "2026-10-12T05:10:00Z",
  expectedBackAt: null,
  lastConfirmedAt: "2026-10-12T05:10:00Z",
  reportedBy: null,
  ...o,
});

describe("OM: availability from the hub", () => {
  const av = (o: Parameters<typeof availabilityFor>[0]) => availabilityFor(o);
  it("OM-2 in house, with the hub's hours and stated turnaround (OM-5)", () => {
    expect(av({ offeringCode: "2160-0", offering: offering(), problems: [] })).toMatchObject({
      state: "in_house",
      hours: "24 h",
      turnaround: "fixture 2 h",
      reason: null,
    });
  });
  it("OM-2 (S19) the analyser down: down and referred, with since", () => {
    expect(av({ offeringCode: "2160-0", offering: offering(), problems: [down()] })).toMatchObject({
      state: "down_referred",
      since: "2026-10-12T05:10:00Z",
      reason: "equipment_down", // GATE A P17: the hub's reason travels on the snapshot
    });
    // An expired report nobody confirmed is still down (AV-2: never silently available).
    expect(
      av({ offeringCode: "2160-0", offering: offering(), problems: [down({ unconfirmed: true })] })
        .state,
    ).toBe("down_referred");
    // The whole lab section down.
    const sec = { ...offering(), sectionId: "sec-1" };
    expect(
      av({
        offeringCode: "2160-0",
        offering: sec,
        problems: [down({ subjectKind: "lab_section", subjectRef: "sec-1" })],
      }).state,
    ).toBe("down_referred");
  });
  it("OM-2 referred and not offered; OM-4 (S20) not offered and not linked cannot be ordered", () => {
    expect(
      av({
        offeringCode: "2160-0",
        offering: offering({ provision: "referred", referredTo: "Fixture lab" }),
        problems: [],
      }).state,
    ).toBe("referred");
    const no = av({
      offeringCode: "2160-0",
      offering: offering({ provision: "not_offered" }),
      problems: [],
    });
    expect(no.state).toBe("not_offered");
    expect(orderable(no)).toBe(false);
    const unlinked = av({ offeringCode: null, offering: null, problems: [] });
    expect(unlinked.state).toBe("not_linked"); // S21
    expect(orderable(unlinked)).toBe(false);
  });
  it("OM-3 (S22) the hub read failed, or nothing confirmed: not known today, and orderable", () => {
    const failed = av({ offeringCode: "2160-0", offering: offering(), problems: null });
    expect(failed.state).toBe("unknown");
    expect(orderable(failed)).toBe(true);
    expect(
      av({ offeringCode: "2160-0", offering: offering({ confirmedAt: null }), problems: [] }).state,
    ).toBe("unknown");
  });
});

describe("PY: payment", () => {
  const priorities = ["routine", "urgent", "immediate", "emergency"];
  const sources = [null, "clinician", "triage_recommendation", "resus_handover", "downtime_form"];
  const modes = ["off", "inform", "hold"] as const;
  it("PY-3 property (every priority × source × mode × reason): an Immediate or resus order is always collectable", () => {
    let n = 0;
    for (const priority of priorities)
      for (const intentSource of sources)
        for (const mode of modes)
          for (const reason of [null, "", "x", "Clinician asked to proceed"]) {
            const state = paymentAtPlacement({ priority, intentSource }, mode);
            if (
              priority === "immediate" ||
              priority === "emergency" ||
              intentSource === "resus_handover"
            ) {
              expect(state).toBe("emergency"); // PY-2 (S26, S27)
              expect(canCollect(state, mode, reason)).toBe(true);
              n++;
            }
          }
    expect(n).toBeGreaterThan(0);
  });
  it("PY-1, PY-3 (S28) a routine order: not required when payment is off; inform needs a reason; hold waits", () => {
    expect(paymentAtPlacement({ priority: "routine", intentSource: "clinician" }, "off")).toBe(
      "not_required",
    );
    expect(paymentAtPlacement({ priority: "routine", intentSource: "clinician" }, "inform")).toBe(
      "awaiting",
    );
    expect(canCollect("awaiting", "inform", null)).toBe(false);
    expect(canCollect("awaiting", "inform", "Clinician asked to proceed")).toBe(true);
    expect(canCollect("awaiting", "hold", "Clinician asked to proceed")).toBe(false);
    for (const s of ["paid", "insured", "waived", "not_required"] as const)
      expect(canCollect(s, "hold", null)).toBe(true);
  });
  it("PY-1 the newest event wins; no event is not required", () => {
    expect(currentPayment([])).toBe("not_required");
    expect(
      currentPayment([
        { state: "awaiting", recordedAt: new Date(1) },
        { state: "paid", recordedAt: new Date(2) },
      ]),
    ).toBe("paid");
  });
});

describe("ID: labels and identity at collection", () => {
  const target = { orderId: "o1", patientUserId: "p1" };
  it("ID-1 every outcome", () => {
    expect(checkLabel(null, target)).toEqual({ outcome: "unknown_label" });
    expect(
      checkLabel({ orderId: "o1", patientUserId: "p1", voidedAt: new Date() }, target),
    ).toEqual({ outcome: "voided_label" }); // S33
    expect(checkLabel({ orderId: "o9", patientUserId: "p2", voidedAt: null }, target)).toEqual({
      outcome: "other_patient",
      otherPatientUserId: "p2",
    }); // S32
    expect(checkLabel({ orderId: "o9", patientUserId: "p1", voidedAt: null }, target)).toEqual({
      outcome: "other_order_same_patient",
    });
    expect(checkLabel({ orderId: "o1", patientUserId: "p1", voidedAt: null }, target)).toEqual({
      outcome: "match",
    }); // S31
  });
  it("SR-4 a keyboard-wedge scan: label numbers only, spaces and case ignored", () => {
    expect(scannedLabel(" l00001234\n")).toBe("L00001234");
    expect(scannedLabel("12345")).toBeNull();
  });
});

describe("SR: scan to receive", () => {
  const base = {
    label: { voided: false, hospitalMatches: true },
    specimen: { id: "s" },
    lastEvent: null,
    highRisk: false,
    procedureFollowed: false,
    receiveAnywayReason: null,
  };
  it("SR-1 receive; a second scan says already (S38)", () => {
    expect(receiveDecision(base)).toEqual({ do: "receive" });
    const at = new Date();
    expect(
      receiveDecision({ ...base, lastEvent: { kind: "received", at, cadre: "LAB_TECH" } }),
    ).toEqual({
      do: "already",
      at,
      cadre: "LAB_TECH",
    });
  });
  it("SR-2 (S39, S40) another hospital reads as not found; not collected needs a reason; rejected and voided say so", () => {
    expect(receiveDecision({ ...base, label: { voided: false, hospitalMatches: false } })).toEqual({
      do: "not_found",
    });
    expect(receiveDecision({ ...base, label: null })).toEqual({ do: "not_found" });
    expect(receiveDecision({ ...base, specimen: null })).toEqual({ do: "not_collected" });
    expect(
      receiveDecision({ ...base, specimen: null, receiveAnywayReason: "Fixture reason" }),
    ).toEqual({ do: "receive" });
    expect(
      receiveDecision({ ...base, lastEvent: { kind: "rejected", at: new Date(), cadre: "x" } }),
    ).toEqual({ do: "rejected" });
    expect(receiveDecision({ ...base, label: { voided: true, hospitalMatches: true } })).toEqual({
      do: "voided",
    });
  });
  it("SR-3 (S45) high risk waits for Procedure followed", () => {
    expect(receiveDecision({ ...base, highRisk: true })).toEqual({ do: "procedure_first" });
    expect(receiveDecision({ ...base, highRisk: true, procedureFollowed: true })).toEqual({
      do: "receive",
    });
  });
  it("SR-5 (S41) undo within the window only", () => {
    const t = new Date("2026-10-12T08:00:00Z");
    expect(canUndo(t, new Date(t.getTime() + 4 * 60_000))).toBe(true);
    expect(canUndo(t, new Date(t.getTime() + 6 * 60_000))).toBe(false);
  });
});

describe("LV-4, CX, HR", () => {
  it("LV-4 one announcement per window, summarising the count", () => {
    let s = { lastAt: null as number | null, pending: 2 };
    const a = announce(s, 0);
    expect(a.say).toBe(2);
    s = { ...a.state, pending: 3 };
    expect(announce(s, 5_000).say).toBeNull();
    expect(announce(s, 10_000).say).toBe(3);
  });
  it("CX-2, CX-4 (S44) a restricted diagnosis travels only with tests of its class", () => {
    expect(diagnosisVisible(null, [null])).toBe(true);
    expect(diagnosisVisible("hiv", ["hiv"])).toBe(true);
    expect(diagnosisVisible("hiv", [null, "tb"])).toBe(false);
  });
  it("HR-1 the fever-with-bleeding rules raise it; HR-2 on until a clinician clears it", () => {
    expect(ruleFlagsHighRisk(["FLAG-EX-FEVER-BLEEDING"])).toBe("FLAG-EX-FEVER-BLEEDING");
    expect(ruleFlagsHighRisk(["FLAG-VHF-OUTBREAK", "OTHER"])).toBe("FLAG-VHF-OUTBREAK");
    expect(ruleFlagsHighRisk(["FLAG-SEPSIS"])).toBeNull();
    const flag = {
      kind: "flag" as const,
      source: "manual" as const,
      ruleId: null,
      reason: "fixture",
      recordedAt: new Date(1),
    };
    expect(highRiskNow([flag])).toBe(flag);
    expect(highRiskNow([flag, { ...flag, kind: "clear", recordedAt: new Date(2) }])).toBeNull();
  });
});
