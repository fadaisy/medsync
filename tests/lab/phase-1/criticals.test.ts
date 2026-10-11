import type { Acknowledger, AlertEvent, AlertState } from "@/lib/lab/criticals/alerts";
import type { MarkInput, ReleaseComponent, ReleaseContext } from "@/lib/lab/criticals/marks";
import type { LadderInput, StaffNow } from "@/lib/lab/criticals/recipients";
import type { CriticalEvaluation } from "@/lib/lab/flags";
import { describe, expect, it } from "vitest";

import {
  applyEvent,
  batchAcknowledgeable,
  correctionRecipients,
  decideAcknowledge,
  foldAlert,
  logCall,
  mayAcknowledge,
} from "@/lib/lab/criticals/alerts";
import { planRelease } from "@/lib/lab/criticals/marks";
import { resolveFrom, resolveLevel } from "@/lib/lab/criticals/recipients";
import { H_A, H_B, minutes, T0 } from "./_fixtures";

const AUTO_LOW: CriticalEvaluation = {
  kind: "critical",
  direction: "low",
  limitId: "lim-1",
  versionId: "clv-1",
  version: 3,
};
const ctx = (over: Partial<ReleaseContext> = {}): ReleaseContext => ({
  actorId: "tech-1",
  secondCheck: false,
  mayRelease: () => true,
  ...over,
});
const mark = (conceptId: string, over: Partial<MarkInput> = {}): MarkInput => ({
  conceptId,
  check: { kind: "checked_not_repeated" },
  sampleChecked: true,
  ...over,
});
const comps: ReleaseComponent[] = [
  { conceptId: "obs.k", evaluation: AUTO_LOW },
  { conceptId: "obs.urea", evaluation: { kind: "none", reason: "within" } },
  { conceptId: "obs.na", evaluation: null },
];

describe("critical marks (CM)", () => {
  it("CM-1 an auto mark stores the limit id, version and direction; a manual mark stores none", () => {
    const p = planRelease(comps, [mark("obs.k"), mark("obs.na")], ctx());
    expect(p.ok && p.marks).toEqual([
      expect.objectContaining({
        conceptId: "obs.k",
        source: "auto",
        limitId: "lim-1",
        limitVersion: 3,
        direction: "low",
        actorId: "tech-1",
      }),
      expect.objectContaining({
        conceptId: "obs.na",
        source: "manual",
        limitId: null,
        limitVersion: null,
        direction: null,
      }),
    ]);
  });

  it("CM-1 a mark belongs to a component of this report", () => {
    expect(planRelease(comps, [mark("obs.k"), mark("obs.elsewhere")], ctx())).toEqual({
      ok: false,
      errors: ["unknown_component:obs.elsewhere"],
    });
    expect(planRelease(comps, [mark("obs.k"), mark("obs.na"), mark("obs.na")], ctx())).toEqual({
      ok: false,
      errors: ["duplicate_mark:obs.na"],
    });
  });

  it("CM-2 marks exist only in a release plan: a refused plan writes none", () => {
    const refused = planRelease(comps, [], ctx());
    expect(refused).toEqual({ ok: false, errors: ["check_required:obs.k"] });
    expect("marks" in refused).toBe(false);
  });

  it("CM-3 every check kind and its required detail", () => {
    expect(
      planRelease(
        comps,
        [mark("obs.k", { check: { kind: "repeated", repeatValue: "2.1" } })],
        ctx(),
      ).ok,
    ).toBe(true);
    expect(
      planRelease(
        comps,
        [mark("obs.k", { check: { kind: "repeated", repeatValue: "about 2" } })],
        ctx(),
      ),
    ).toEqual({
      ok: false,
      errors: ["repeat_value:obs.k"],
    });
    expect(
      planRelease(
        comps,
        [mark("obs.k", { check: { kind: "could_not_check", reason: "analyser_down" } })],
        ctx(),
      ).ok,
    ).toBe(true);
    expect(
      planRelease(
        comps,
        [mark("obs.k", { check: { kind: "could_not_check", reason: "other", text: "" } })],
        ctx(),
      ),
    ).toEqual({
      ok: false,
      errors: ["could_not_check_text:obs.k"],
    });
  });

  it("CM-4 an auto mark cannot be dropped; correcting the value so it is not critical is the only way", () => {
    expect(planRelease(comps, [mark("obs.na")], ctx())).toEqual({
      ok: false,
      errors: ["check_required:obs.k"],
    });
    const corrected = comps.map((c) =>
      c.conceptId === "obs.k"
        ? { ...c, evaluation: { kind: "none" as const, reason: "within" as const } }
        : c,
    );
    expect(planRelease(corrected, [], ctx())).toEqual({ ok: true, marks: [], createsAlert: false });
  });

  it("CM-5 with the second check on: a different releaser confirms, or a solo reason is given", () => {
    const on = ctx({ secondCheck: true, mayRelease: (u) => u !== "porter" });
    expect(planRelease(comps, [mark("obs.k")], on)).toEqual({
      ok: false,
      errors: ["second_check:obs.k"],
    });
    expect(planRelease(comps, [mark("obs.k", { secondCheckerId: "tech-1" })], on)).toEqual({
      ok: false,
      errors: ["second_checker:obs.k"],
    });
    expect(planRelease(comps, [mark("obs.k", { secondCheckerId: "porter" })], on)).toEqual({
      ok: false,
      errors: ["second_checker:obs.k"],
    });
    expect(planRelease(comps, [mark("obs.k", { secondCheckerId: "tech-2" })], on).ok).toBe(true);
    expect(
      planRelease(comps, [mark("obs.k", { soloReason: "Night shift, one on duty" })], on).ok,
    ).toBe(true);
  });
});

const created = (over: Partial<Extract<AlertEvent, { kind: "created" }>> = {}): AlertEvent => ({
  kind: "created",
  at: T0,
  level: 0,
  subState: "sent",
  dueAt: minutes(30),
  ...over,
});
const doctor: Acknowledger = {
  userId: "dr-1",
  hospitalId: H_A,
  cadreCode: "MEDICAL_OFFICER",
  active: true,
};
const nurse: Acknowledger = { userId: "rn-1", hospitalId: H_A, cadreCode: "NURSE", active: true };

describe("critical alerts (CA)", () => {
  it("CA-1 several marked components on one report make one alert", () => {
    const p = planRelease(
      [
        { conceptId: "obs.k", evaluation: AUTO_LOW },
        { conceptId: "obs.urea", evaluation: { ...AUTO_LOW, limitId: "lim-2" } },
      ],
      [mark("obs.k"), mark("obs.urea")],
      ctx(),
    );
    expect(p).toMatchObject({ ok: true, createsAlert: true });
    expect(p.ok && p.marks).toHaveLength(2);
  });

  it("CA-2 the only states are open (sent / not_sent / escalated) and acknowledged", () => {
    const s = foldAlert([created()]);
    expect(s).toEqual({ state: "open", subState: "sent", level: 0, dueAt: minutes(30) });
    expect(foldAlert([created({ subState: "not_sent", level: 2, dueAt: null })])).toMatchObject({
      subState: "not_sent",
      level: 2,
    });
    expect(foldAlert([])).toBeNull();
    expect(foldAlert([{ kind: "seen", at: T0, recipientId: "x" }])).toBeNull();
  });

  it("CA-3 a delivery failure is an event, not a state: the alert stays open and sent", () => {
    const s = foldAlert([
      created(),
      {
        kind: "notified",
        at: T0,
        level: 0,
        recipientId: "dr-1",
        channel: "sms",
        outcome: "failed",
      },
    ]);
    expect(s).toMatchObject({ state: "open", subState: "sent" });
  });

  it("CA-4 events only add: replaying a prefix never changes an earlier answer", () => {
    const evs: AlertEvent[] = [created(), { kind: "seen", at: minutes(1), recipientId: "dr-1" }];
    const before = foldAlert(evs);
    foldAlert([
      ...evs,
      {
        kind: "acknowledged",
        at: minutes(2),
        by: "dr-1",
        via: "app",
        loggedBy: null,
        response: null,
      },
    ]);
    expect(foldAlert(evs)).toEqual(before);
  });

  it("CA-5 seen is not acknowledged", () => {
    expect(
      foldAlert([created(), { kind: "seen", at: minutes(1), recipientId: "dr-1" }]),
    ).toMatchObject({ state: "open", subState: "sent" });
  });

  it("CA-6 a clinician who may order at the hospital acknowledges; a nurse or another hospital may not; the first wins", () => {
    const open = foldAlert([created()])!;
    expect(mayAcknowledge(doctor, H_A)).toBe(true);
    expect(mayAcknowledge({ ...doctor, userId: "dr-x", cadreCode: "CONSULTANT" }, H_A)).toBe(true); // not a recipient: allowed
    expect(mayAcknowledge(nurse, H_A)).toBe(false);
    expect(mayAcknowledge(doctor, H_B)).toBe(false);
    expect(mayAcknowledge({ ...doctor, active: false }, H_A)).toBe(false);
    expect(decideAcknowledge(open, nurse, H_A, { at: T0, response: null })).toEqual({
      kind: "refused",
      reason: "may_not_acknowledge",
    });
    const first = decideAcknowledge(open, doctor, H_A, { at: minutes(5), response: "reviewing" });
    expect(first.kind).toBe("acknowledge");
    const acked = applyEvent(open, (first as Extract<typeof first, { kind: "acknowledge" }>).event);
    const again = decideAcknowledge(acked, { ...doctor, userId: "dr-2" }, H_A, {
      at: minutes(6),
      response: "already_aware",
    });
    expect(again).toEqual({ kind: "already", state: acked });
    expect(
      applyEvent(acked, {
        kind: "acknowledged",
        at: minutes(7),
        by: "dr-2",
        via: "app",
        loggedBy: null,
        response: null,
      }),
    ).toBe(acked);
  });

  it("CA-7 an acknowledgement records actor, time, response (or none) and channel", () => {
    const d = decideAcknowledge(foldAlert([created()])!, doctor, H_A, {
      at: minutes(4),
      response: null,
    });
    expect(d).toEqual({
      kind: "acknowledge",
      event: {
        kind: "acknowledged",
        at: minutes(4),
        by: "dr-1",
        via: "app",
        loggedBy: null,
        response: null,
      },
    });
  });

  it("CA-8 a double tap: the second acknowledgement is the first, unchanged (the client key does the same in the DB)", () => {
    const open = foldAlert([created()])!;
    const d = decideAcknowledge(open, doctor, H_A, { at: minutes(4), response: null });
    const once = applyEvent(open, (d as Extract<typeof d, { kind: "acknowledge" }>).event);
    const twice = applyEvent(once, (d as Extract<typeof d, { kind: "acknowledge" }>).event);
    expect(twice).toBe(once);
  });

  it("CA-9 a call with read-back to an orderer acknowledges by phone; a dispute by them reopens at the level", () => {
    const open: AlertState = { state: "open", subState: "escalated", level: 1, dueAt: minutes(60) };
    const evs = logCall(open, {
      at: minutes(10),
      labUserId: "tech-1",
      to: doctor,
      readBack: true,
      alertHospitalId: H_A,
    });
    expect(evs.map((e) => e.kind)).toEqual(["call_logged", "acknowledged"]);
    const acked = evs.reduce(applyEvent, open);
    expect(acked).toMatchObject({
      state: "acknowledged",
      via: "phone",
      by: "dr-1",
      loggedBy: "tech-1",
      level: 1,
    });
    // Someone else cannot dispute it.
    expect(
      applyEvent(acked, { kind: "disputed", at: minutes(12), by: "dr-2", dueAt: minutes(40) }),
    ).toBe(acked);
    expect(
      applyEvent(acked, { kind: "disputed", at: minutes(12), by: "dr-1", dueAt: minutes(40) }),
    ).toEqual({
      state: "open",
      subState: "escalated",
      level: 1,
      dueAt: minutes(40),
    });
    // A call to a nurse, or without read-back, changes nothing.
    expect(
      logCall(open, {
        at: minutes(10),
        labUserId: "tech-1",
        to: nurse,
        readBack: true,
        alertHospitalId: H_A,
      }).map((e) => e.kind),
    ).toEqual(["call_logged"]);
    expect(
      logCall(open, {
        at: minutes(10),
        labUserId: "tech-1",
        to: doctor,
        readBack: false,
        alertHospitalId: H_A,
      }),
    ).toHaveLength(1);
    // An app acknowledgement cannot be disputed.
    const app = applyEvent(open, {
      kind: "acknowledged",
      at: T0,
      by: "dr-1",
      via: "app",
      loggedBy: null,
      response: null,
    });
    expect(applyEvent(app, { kind: "disputed", at: minutes(1), by: "dr-1", dueAt: null })).toBe(
      app,
    );
    // A phone acknowledgement must name who logged it.
    expect(
      applyEvent(open, {
        kind: "acknowledged",
        at: T0,
        by: "dr-1",
        via: "phone",
        loggedBy: null,
        response: null,
      }),
    ).toBe(open);
  });

  it("CA-10 a correction goes to every recipient so far and to the acknowledger", () => {
    const evs: AlertEvent[] = [
      created(),
      {
        kind: "notified",
        at: T0,
        level: 0,
        recipientId: "dr-1",
        channel: "app",
        outcome: "queued",
      },
      { kind: "notified", at: T0, level: 0, recipientId: "dr-1", channel: "sms", outcome: "off" },
      {
        kind: "escalated",
        at: minutes(30),
        level: 1,
        dueAt: null,
        recipients: ["hod-1"],
        emptyLevels: [],
      },
      {
        kind: "notified",
        at: minutes(30),
        level: 1,
        recipientId: "hod-1",
        channel: "app",
        outcome: "queued",
      },
      {
        kind: "acknowledged",
        at: minutes(31),
        by: "dr-9",
        via: "app",
        loggedBy: null,
        response: null,
      },
    ];
    expect(correctionRecipients(evs).sort()).toEqual(["dr-1", "dr-9", "hod-1"]);
    expect(
      foldAlert([...evs, { kind: "corrected", at: minutes(40), correctionAlertId: "a2" }]),
    ).toMatchObject({ state: "acknowledged" });
  });

  it("CA-11 nothing about the patient's status reaches the release plan: a discharged or deceased patient's critical alerts", () => {
    // planRelease takes the components and the marks only; there is no input that could suppress.
    expect(planRelease.length).toBe(3);
    expect(planRelease(comps, [mark("obs.k")], ctx())).toMatchObject({
      ok: true,
      createsAlert: true,
    });
  });

  it("CA-12 a report with an open critical is excluded from batch acknowledgement", () => {
    expect(batchAcknowledgeable(["r1", "r2", "r3"], new Set(["r2"]))).toEqual(["r1", "r3"]);
  });

  it("CA-13 a repeat critical for the same patient and test alerts again: no history input exists", () => {
    const first = planRelease(comps, [mark("obs.k")], ctx());
    const second = planRelease(comps, [mark("obs.k")], ctx());
    expect([first, second].every((p) => p.ok && p.createsAlert)).toBe(true);
  });
});

describe("recipients (RC)", () => {
  const staff: Record<string, StaffNow> = {
    "dr-order": { active: true, affiliatedHere: true, mayOpenChart: true },
    "dr-owner": { active: true, affiliatedHere: true, mayOpenChart: false },
    "hod-w4": { active: true, affiliatedHere: true, mayOpenChart: false },
    "hod-gone": { active: true, affiliatedHere: false, mayOpenChart: true },
    "hod-off": { active: false, affiliatedHere: true, mayOpenChart: true },
    "hosp-1": { active: true, affiliatedHere: true, mayOpenChart: true },
    "b-hod": { active: true, affiliatedHere: true, mayOpenChart: true },
  };
  const input = (over: Partial<LadderInput> = {}): LadderInput => ({
    hospitalId: H_A,
    orderedBy: "dr-order",
    responsibleClinician: "dr-owner",
    orderDepartmentId: "ward-4",
    restricted: false,
    staff: (u) => staff[u],
    contacts: [
      { hospitalId: H_A, level: 1, departmentId: "ward-4", userId: "hod-w4", position: 2 },
      { hospitalId: H_A, level: 1, departmentId: "ward-4", userId: "hod-gone", position: 1 },
      { hospitalId: H_A, level: 1, departmentId: "ward-5", userId: "hod-off", position: 1 },
      { hospitalId: H_A, level: 2, departmentId: null, userId: "hosp-1", position: 1 },
      { hospitalId: H_B, level: 1, departmentId: "ward-4", userId: "b-hod", position: 1 },
      { hospitalId: H_B, level: 2, departmentId: null, userId: "b-hod", position: 1 },
    ],
    ...over,
  });

  it("RC-1 level 0: the orderer and, if different, the responsible clinician", () => {
    expect(resolveLevel(0, input()).recipients).toEqual(["dr-order", "dr-owner"]);
    expect(resolveLevel(0, input({ responsibleClinician: "dr-order" })).recipients).toEqual([
      "dr-order",
    ]);
    expect(resolveLevel(0, input({ orderedBy: null })).recipients).toEqual(["dr-owner"]);
  });

  it("RC-2 level 1: the ordering department's contacts, in order, at this hospital only", () => {
    const r = resolveLevel(1, input());
    expect(r.recipients).toEqual(["hod-w4"]);
    expect(r.skipped).toEqual([{ userId: "hod-gone", reason: "left" }]);
    expect(resolveLevel(1, input({ orderDepartmentId: null })).recipients).toEqual([]);
  });

  it("RC-3 level 2: the hospital's contacts (two-hospital fixture)", () => {
    expect(resolveLevel(2, input()).recipients).toEqual(["hosp-1"]);
    expect(resolveLevel(2, input({ hospitalId: H_B })).recipients).toEqual(["b-hod"]);
  });

  it("RC-4 deactivated, departed, unknown, or (restricted report) no access: skipped and listed", () => {
    expect(resolveLevel(1, input({ orderDepartmentId: "ward-5" })).skipped).toEqual([
      { userId: "hod-off", reason: "inactive" },
    ]);
    expect(resolveLevel(0, input({ orderedBy: "ghost" })).skipped).toEqual([
      { userId: "ghost", reason: "unknown" },
    ]);
    const r = resolveLevel(0, input({ restricted: true }));
    expect(r.recipients).toEqual(["dr-order"]);
    expect(r.skipped).toEqual([{ userId: "dr-owner", reason: "no_access" }]);
  });

  it("RC-5 an empty level is named and passed at once; every level empty is reached-nobody", () => {
    const noWard = input({ orderDepartmentId: "ward-9" });
    expect(resolveFrom(1, noWard)).toMatchObject({
      level: 2,
      recipients: ["hosp-1"],
      emptyLevels: [1],
      reachedNobody: false,
    });
    const nobody = input({
      orderedBy: null,
      responsibleClinician: null,
      orderDepartmentId: "ward-9",
      contacts: [],
    });
    expect(resolveFrom(0, nobody)).toEqual({
      level: 2,
      recipients: [],
      skipped: [],
      emptyLevels: [0, 1, 2],
      reachedNobody: true,
    });
  });

  it("RC-6 recipients are resolved from the contacts given now; a later change does not alter a stored result", () => {
    const i = input();
    const before = resolveFrom(1, i);
    const after = resolveFrom(1, { ...i, contacts: [] });
    expect(before.recipients).toEqual(["hod-w4"]);
    expect(after.recipients).toEqual([]);
    expect(before.recipients).toEqual(["hod-w4"]); // the stored value is a copy
  });

  it("RC-7 the informed nurse in charge is not resolved in this slice (D-LAB1-05): no nurse is ever a recipient by cadre", () => {
    expect(resolveFrom(0, input()).recipients).not.toContain("rn-1");
  });
});
