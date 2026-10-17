import type { Action, AlertEntry, SignedEntry } from "@/lib/ipc/lab-alerts";
import { describe, expect, it } from "vitest";

import {
  activeFlags,
  AlertEntryPayload,
  alertState,
  closeErrors,
  correctionCloses,
  episodeKey,
  epiWeekStart,
  escalationDue,
  idsrCounts,
  idsrOnly,
  isClosed,
  matchReferral,
  matchResult,
  onMenu,
} from "@/lib/ipc/lab-alerts";

/** FIXTURE entries shaped like gate-a §8; the IPC lead and the focal person sign the real ones. */
const rrTb: AlertEntry = {
  condition: "Rifampicin-resistant TB",
  trigger: {
    kind: "result",
    testCode: "test.tb_xpert",
    concept: "obs.tb_xpert",
    answers: ["mtb_detected_rif_detected"],
  },
  scope: "every_ward",
  precaution: { type: "airborne", stopLine: "Fixture stop line", source: "Fixture source" },
  ipcAlert: true,
  route: {
    kind: "weekly_item",
    idsrItem: "Rifampicin resistant TB cases (DR)",
    reference: "HMIS 033b row 15",
  },
  confirmationNeeded: false,
  source: "Fixture",
};
const vhf: AlertEntry = {
  ...rrTb,
  condition: "Suspected VHF",
  trigger: { kind: "outbreak_referral" },
  precaution: { type: "isolation", stopLine: "Fixture", source: "Fixture" },
  route: {
    kind: "notify_now",
    idsrItem: "Acute haemorrhagic fever syndrome",
    reference: "IDSR Table 2 #1",
  },
};
const measlesIdsrOnly: AlertEntry = {
  ...rrTb,
  condition: "Measles",
  trigger: {
    kind: "result",
    testCode: "test.measles_igm",
    concept: "obs.measles_igm",
    answers: ["positive"],
  },
  ipcAlert: false,
  route: { kind: "notify_now", idsrItem: "Measles", reference: "IDSR Table 2 #16" },
};
const list: SignedEntry[] = [
  { key: "rr_tb", configId: "c1", entry: rrTb },
  { key: "vhf", configId: "c2", entry: vhf },
  { key: "measles", configId: "c3", entry: measlesIdsrOnly },
];
const xpert = (answer: string) => ({
  testCode: "test.tb_xpert",
  components: [{ concept: "obs.tb_xpert", answer }],
});

describe("IC-1 the entry, IC-2 what raises an alert", () => {
  it("an IDSR route names its item and table", () => {
    expect(AlertEntryPayload.safeParse(rrTb).success).toBe(true);
    expect(
      AlertEntryPayload.safeParse({
        ...rrTb,
        route: { kind: "notify_now", idsrItem: null, reference: null },
      }).success,
    ).toBe(false);
  });
  it("RR-TB matches its answer only; MTB not detected matches nothing", () => {
    expect(matchResult(list, xpert("mtb_detected_rif_detected")).map((s) => s.key)).toEqual([
      "rr_tb",
    ]);
    expect(matchResult(list, xpert("mtb_not_detected"))).toEqual([]);
  });
  it("an outbreak referral raises at referral; an IDSR-only entry raises for the focal person", () => {
    expect(matchReferral(list).map((s) => s.key)).toEqual(["vhf"]);
    expect(
      matchResult(list, {
        testCode: "test.measles_igm",
        components: [{ concept: "obs.measles_igm", answer: "positive" }],
      }).map((s) => s.key),
    ).toEqual(["measles"]);
    expect(idsrOnly(measlesIdsrOnly)).toBe(true);
    expect(idsrOnly(rrTb)).toBe(false);
  });
  it("an amendment that removes the answer closes the alert; off-menu entries never fire", () => {
    expect(correctionCloses(rrTb, xpert("mtb_detected_rif_not_detected"))).toBe(true);
    expect(correctionCloses(rrTb, xpert("mtb_detected_rif_detected"))).toBe(false);
    expect(onMenu(measlesIdsrOnly, ["test.tb_xpert"])).toBe(false);
    expect(onMenu(vhf, [])).toBe(true);
  });
});

describe("IC-3 episodes, IC-6 state and closing, IC-7 escalation", () => {
  it("admission, else visit, else referral", () => {
    expect(episodeKey({ admissionId: "a", encounterId: "e" })).toBe("admission:a");
    expect(episodeKey({ admissionId: null, encounterId: "e" })).toBe("encounter:e");
    expect(episodeKey({ admissionId: null, encounterId: null, referralId: "r" })).toBe(
      "referral:r",
    );
  });
  const t = (m: number) => new Date(Date.UTC(2026, 9, 17, 8, m));
  it("new → escalated → precautions started; notification alone never closes an IPC alert", () => {
    expect(alertState(rrTb, [])).toEqual({ state: "new" });
    const acts: Action[] = [{ kind: "escalated", at: t(61) }];
    expect(alertState(rrTb, acts)).toEqual({ state: "escalated" });
    expect(alertState(rrTb, [...acts, { kind: "notified", at: t(62) }]).state).toBe("escalated");
    const done = alertState(rrTb, [...acts, { kind: "precautions_started", at: t(70) }]);
    expect(done.state).toBe("precautions_started");
    expect(isClosed(done)).toBe(true);
  });
  it("an IDSR-only alert closes on notification; a corrected result closes it", () => {
    expect(alertState(measlesIdsrOnly, [{ kind: "notified", at: t(5) }]).state).toBe("notified");
    expect(alertState(rrTb, [{ kind: "result_corrected", at: t(5) }]).state).toBe(
      "result_corrected",
    );
  });
  it("closing needs its details", () => {
    expect(closeErrors("not_needed", {})).toEqual(["reason_required"]);
    expect(closeErrors("precautions_started", { type: "airborne" })).toEqual([
      "type_and_place_required",
    ]);
    expect(closeErrors("precautions_started", { type: "airborne", where: "side_room" })).toEqual(
      [],
    );
    expect(closeErrors("notified", { to: "DSFP" })).toEqual(["whom_and_how_required"]);
  });
  it("escalates after the operational window with no action; a view does not count", () => {
    expect(escalationDue(t(0), [], t(59))).toBe(false);
    expect(escalationDue(t(0), [], t(60))).toBe(true);
    expect(escalationDue(t(0), [{ kind: "viewed", at: t(1) }], t(60))).toBe(true);
    expect(escalationDue(t(0), [{ kind: "already_in_precautions", at: t(1) }], t(90))).toBe(false);
  });
});

describe("IC-8 the flag, IC-10 IDSR weeks", () => {
  it("a flag is in force until IPC clears it; history kept", () => {
    const at = (d: number) => new Date(Date.UTC(2026, 9, d));
    const ev = [
      {
        entryKey: "rr_tb",
        condition: "RR-TB",
        precaution: "airborne",
        kind: "set" as const,
        at: at(1),
      },
      {
        entryKey: "mrsa",
        condition: "MRSA",
        precaution: "contact",
        kind: "set" as const,
        at: at(2),
      },
      {
        entryKey: "mrsa",
        condition: "MRSA",
        precaution: "contact",
        kind: "clear" as const,
        at: at(3),
      },
    ];
    expect(activeFlags(ev).map((f) => f.entryKey)).toEqual(["rr_tb"]);
  });
  it("epi-weeks run Monday to Sunday in Kampala; counts only IDSR routes in that week", () => {
    expect(epiWeekStart(new Date("2026-10-19T08:00:00Z"))).toBe("2026-10-19"); // Monday
    expect(epiWeekStart(new Date("2026-10-25T20:00:00Z"))).toBe("2026-10-19"); // Sunday 23:00 EAT
    expect(epiWeekStart(new Date("2026-10-25T21:30:00Z"))).toBe("2026-10-26"); // Monday 00:30 EAT
    const rows = [
      {
        idsrItem: "Measles",
        route: "notify_now" as const,
        releasedAt: new Date("2026-10-20T08:00:00Z"),
        createdAt: new Date("2026-10-20T08:00:00Z"),
      },
      {
        idsrItem: "Measles",
        route: "notify_now" as const,
        releasedAt: new Date("2026-10-21T08:00:00Z"),
        createdAt: new Date("2026-10-21T08:00:00Z"),
      },
      {
        idsrItem: "Measles",
        route: "notify_now" as const,
        releasedAt: new Date("2026-10-27T08:00:00Z"),
        createdAt: new Date("2026-10-27T08:00:00Z"),
      },
      {
        idsrItem: null,
        route: "none" as const,
        releasedAt: null,
        createdAt: new Date("2026-10-20T08:00:00Z"),
      },
    ];
    expect(idsrCounts(rows, "2026-10-19")).toEqual([{ item: "Measles", n: 2 }]);
  });
});
