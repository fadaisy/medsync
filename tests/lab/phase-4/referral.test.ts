import type { ReferralEvent, ReferralEventKind, ReferralState } from "@/lib/exchange/types";
import { describe, expect, it } from "vitest";

import { REFERRAL_STATES } from "@/lib/exchange/types";
import {
  cancelEffect,
  canMove,
  destinationCheck,
  expectedBy,
  markLostErrors,
  outbreakReferralErrors,
  overdue,
  projectReferral,
  recollectAllowed,
  referrable,
  referralNumber,
  routineAllowed,
  stateForTask,
  taskStatusFor,
  TRANSITIONS,
} from "@/lib/lab/referral";

/** Lab Phase 4 Step 3: the referral engine (RF-1..RF-12, EX-7). Every date, partner and number is a FIXTURE. */
const at = (iso: string) => new Date(iso);
let seq = 0;
const ev = (kind: ReferralEventKind, iso: string, s = ++seq): ReferralEvent => ({
  kind,
  eventAt: at(iso),
  seq: s,
  source: "person",
});

/** gate-a §5.1, cell for cell: the only allowed moves. */
const ALLOWED: Record<ReferralState, ReferralState[]> = {
  draft: ["packed", "cancelled"],
  packed: ["handed_over", "cancelled"],
  handed_over: [
    "at_hub",
    "received_by_lab",
    "accepted",
    "rejected",
    "in_progress",
    "completed",
    "failed",
    "lost",
    "cancelled",
  ],
  at_hub: [
    "received_by_lab",
    "accepted",
    "rejected",
    "in_progress",
    "completed",
    "failed",
    "lost",
    "cancelled",
  ],
  received_by_lab: [
    "accepted",
    "rejected",
    "in_progress",
    "on_hold",
    "completed",
    "failed",
    "lost",
    "cancelled",
  ],
  accepted: ["in_progress", "on_hold", "completed", "failed", "lost", "cancelled"],
  in_progress: ["on_hold", "completed", "failed", "lost", "cancelled"],
  on_hold: ["in_progress", "completed", "failed", "lost", "cancelled"],
  rejected: [],
  completed: [],
  failed: [],
  lost: [],
  cancelled: [],
};

describe("RF-3 the transition table, edge by edge", () => {
  for (const from of REFERRAL_STATES)
    for (const to of REFERRAL_STATES) {
      const allowed = ALLOWED[from].includes(to);
      it(`RF-3 ${from} → ${to}: ${allowed ? "allowed" : "refused"}`, () => {
        expect(canMove(from, to)).toBe(allowed);
      });
    }

  it("RF-3 the table in code is the table in the proposal", () => {
    for (const s of REFERRAL_STATES)
      expect([...TRANSITIONS[s]].sort()).toEqual([...ALLOWED[s]].sort());
  });

  it("RF-3 every state maps to a Task status and back (FX-2)", () => {
    for (const s of REFERRAL_STATES) {
      const t = taskStatusFor(s);
      if (s === "draft") expect(stateForTask(t.status, t.businessStatus)).toBeNull();
      else expect(stateForTask(t.status, t.businessStatus), s).toBe(s);
    }
    expect(taskStatusFor("lost")).toEqual({ status: "failed", businessStatus: "lost" });
    expect(stateForTask("ready")).toBeNull();
    expect(stateForTask("entered-in-error")).toBeNull();
  });
});

describe("RF-4 and EX-7: the state is projected from events", () => {
  it("RF-4 a referral moves through its events and records when it was sent and completed", () => {
    const p = projectReferral([
      ev("created", "2026-10-12T07:00:00Z"),
      ev("packed", "2026-10-12T08:00:00Z"),
      ev("handed_over", "2026-10-12T09:00:00Z"),
      ev("completed", "2026-10-14T09:00:00Z"),
    ]);
    expect(p).toMatchObject({
      state: "completed",
      sentAt: at("2026-10-12T09:00:00Z"),
      completedAt: at("2026-10-14T09:00:00Z"),
    });
    expect(p.applied).toEqual([true, true, true, true]);
  });

  it("EX-7 worked example 4: a late status earlier than the last applied is stored, shown, not applied", () => {
    const events = [
      ev("packed", "2026-10-12T08:00:00Z"),
      ev("handed_over", "2026-10-12T09:00:00Z"),
      ev("completed", "2026-10-14T06:00:00Z", 41),
      ev("in_progress", "2026-10-13T15:00:00Z", 42),
    ];
    const p = projectReferral(events);
    expect(p.state).toBe("completed");
    expect(p.applied).toEqual([true, true, true, false]);
  });

  it("EX-7 ties in event time are broken by sequence", () => {
    const p = projectReferral([
      ev("handed_over", "2026-10-12T09:00:00Z", 2),
      ev("packed", "2026-10-12T09:00:00Z", 1),
      ev("at_hub", "2026-10-12T09:00:00Z", 3),
    ]);
    expect(p.state).toBe("at_hub");
    expect(p.applied).toEqual([true, true, true]);
  });

  it("RF-4 a move the table refuses is not applied (no going back)", () => {
    const p = projectReferral([
      ev("packed", "2026-10-12T08:00:00Z"),
      ev("handed_over", "2026-10-12T09:00:00Z"),
      ev("packed", "2026-10-12T10:00:00Z"),
    ]);
    expect(p.state).toBe("handed_over");
    expect(p.applied).toEqual([true, true, false]);
  });

  it("RF-4 notes, calls and a cancel request never move the state", () => {
    const p = projectReferral([
      ev("packed", "2026-10-12T08:00:00Z"),
      ev("handed_over", "2026-10-12T09:00:00Z"),
      ev("note", "2026-10-12T10:00:00Z"),
      ev("call", "2026-10-12T11:00:00Z"),
      ev("cancel_requested", "2026-10-12T12:00:00Z"),
    ]);
    expect(p).toMatchObject({ state: "handed_over", cancelRequested: true });
  });
});

describe("RF-5 expected and overdue", () => {
  it("S12: 2 days, handed over Monday 10:00 → expected Wednesday 10:00; Thursday 11:00 → Overdue 1 day", () => {
    const sent = at("2026-10-12T07:00:00Z"); // Monday 10:00 in Kampala
    const exp = expectedBy(sent, { value: 2, unit: "days" })!;
    expect(exp).toEqual(at("2026-10-14T07:00:00Z")); // Wednesday 10:00
    expect(overdue(at("2026-10-15T08:00:00Z"), exp, "handed_over")).toEqual({
      overdue: true,
      days: 1,
      since: exp,
    });
    expect(overdue(at("2026-10-14T06:59:00Z"), exp, "handed_over")).toEqual({ overdue: false });
  });

  it("RF-5 hours are elapsed time", () => {
    expect(expectedBy(at("2026-10-12T07:00:00Z"), { value: 36, unit: "hours" })).toEqual(
      at("2026-10-13T19:00:00Z"),
    );
  });

  it("RF-5 working days skip the weekend and a listed holiday, at the same clock time", () => {
    // Friday 16 Oct 10:00 + 2 working days, Monday 19 Oct a FIXTURE holiday → Wednesday 21 Oct 10:00.
    const sent = at("2026-10-16T07:00:00Z");
    expect(expectedBy(sent, { value: 2, unit: "working_days" })).toEqual(
      at("2026-10-20T07:00:00Z"),
    );
    expect(
      expectedBy(sent, { value: 2, unit: "working_days" }, { holidays: ["2026-10-19"] }),
    ).toEqual(at("2026-10-21T07:00:00Z"));
  });

  it("S13: no stated turnaround → not stated, never overdue", () => {
    expect(expectedBy(at("2026-10-12T07:00:00Z"), null)).toBeNull();
    expect(expectedBy(at("2026-10-12T07:00:00Z"), { value: 0, unit: "days" })).toBeNull();
    expect(overdue(at("2027-01-01T00:00:00Z"), null, "handed_over")).toEqual({ overdue: false });
  });

  it("RF-5 a terminal referral is never overdue", () => {
    const exp = at("2026-10-14T07:00:00Z");
    for (const s of ["completed", "failed", "lost", "cancelled", "rejected"] as const)
      expect(overdue(at("2026-11-01T00:00:00Z"), exp, s)).toEqual({ overdue: false });
  });
});

describe("RF-1, RF-2, RF-7..RF-10", () => {
  it("RF-1 only a specimen on To refer becomes a referral", () => {
    expect(referrable({ availability: "referred", nationalProgrammeTest: false })).toBe(true);
    expect(referrable({ availability: "down_referred", nationalProgrammeTest: false })).toBe(true);
    expect(referrable({ availability: "in_house", nationalProgrammeTest: true })).toBe(true);
    expect(referrable({ availability: "in_house", nationalProgrammeTest: false })).toBe(false);
    expect(referrable({ availability: "unknown", nationalProgrammeTest: false })).toBe(false);
  });

  it("RF-2 one referral per specimen per destination; a second destination needs an aliquot", () => {
    expect(destinationCheck([], "p1")).toBe("ok");
    expect(destinationCheck([{ partnerId: "p1", state: "handed_over" }], "p1")).toBe(
      "already_referred_there",
    );
    expect(destinationCheck([{ partnerId: "p1", state: "handed_over" }], "p2")).toBe(
      "needs_aliquot",
    );
    expect(destinationCheck([{ partnerId: "p1", state: "cancelled" }], "p2")).toBe("ok");
  });

  it("RF-7 a high-risk specimen never goes routine; an outbreak referral records who was informed", () => {
    expect(routineAllowed(true)).toBe(false);
    expect(routineAllowed(false)).toBe(true);
    expect(outbreakReferralErrors({ partnerKind: "private_lab", informed: null })).toEqual([
      "partner_not_outbreak",
      "ipc_lead_not_recorded",
      "surveillance_focal_not_recorded",
    ]);
    expect(
      outbreakReferralErrors({
        partnerKind: "outbreak",
        informed: { ipcLead: "IPC lead (fixture)", surveillanceFocal: "DSFP (fixture)" },
      }),
    ).toEqual([]);
  });

  it("RF-8 worked example 3: cancel before handover cancels; after, it is requested; terminal is too late", () => {
    expect(cancelEffect("draft")).toBe("cancel_now");
    expect(cancelEffect("packed")).toBe("cancel_now");
    expect(cancelEffect("handed_over")).toBe("request_cancel");
    expect(cancelEffect("in_progress")).toBe("request_cancel");
    expect(cancelEffect("completed")).toBe("too_late");
  });

  it("RF-9 worked example 2: after a rejection, Recollect needs a new specimen received", () => {
    const p = projectReferral([
      ev("packed", "2026-10-10T08:00:00Z"),
      ev("handed_over", "2026-10-10T09:00:00Z"),
      ev("rejected", "2026-10-11T09:00:00Z"),
    ]);
    expect(p.state).toBe("rejected");
    expect(canMove("rejected", "packed")).toBe(false);
    expect(
      recollectAllowed({
        rejectedSpecimenId: "s1",
        newSpecimenId: null,
        newSpecimenReceived: false,
      }),
    ).toBe(false);
    expect(
      recollectAllowed({
        rejectedSpecimenId: "s1",
        newSpecimenId: "s1",
        newSpecimenReceived: true,
      }),
    ).toBe(false);
    expect(
      recollectAllowed({
        rejectedSpecimenId: "s1",
        newSpecimenId: "s2",
        newSpecimenReceived: false,
      }),
    ).toBe(false);
    expect(
      recollectAllowed({
        rejectedSpecimenId: "s1",
        newSpecimenId: "s2",
        newSpecimenReceived: true,
      }),
    ).toBe(true);
  });

  it("RF-10 worked example 1: Lost needs the last known event, a call note, lab.refer and a specimen that left", () => {
    expect(
      markLostErrors({
        state: "at_hub",
        lastKnownEvent: true,
        callNote: "Hub coordinator, not seen",
        hasPermission: true,
      }),
    ).toEqual([]);
    expect(
      markLostErrors({
        state: "packed",
        lastKnownEvent: true,
        callNote: "x call",
        hasPermission: true,
      }),
    ).toEqual(["not_in_transit"]);
    expect(
      markLostErrors({
        state: "at_hub",
        lastKnownEvent: false,
        callNote: "",
        hasPermission: false,
      }),
    ).toEqual(["permission", "no_last_known_event", "no_call_note"]);
    const p = projectReferral([
      ev("packed", "2026-09-28T07:00:00Z"),
      ev("handed_over", "2026-09-28T07:05:00Z"),
      ev("at_hub", "2026-09-29T08:20:00Z"),
      ev("lost", "2026-10-09T06:40:00Z"),
    ]);
    expect(p.state).toBe("lost");
    expect(canMove("lost", "completed")).toBe(false);
  });

  it("RF numbers: RF-2026-0294", () => {
    expect(referralNumber(2026, 294)).toBe("RF-2026-0294");
    expect(referralNumber(2026, 12345)).toBe("RF-2026-12345");
  });
});
