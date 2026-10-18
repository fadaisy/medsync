import type { LookBackItem, ReleasedResult } from "@/lib/lab/lookback";
import type { NcEvent } from "@/lib/lab/nonconformity";
import type { RuleBreak } from "@/lib/lab/qc-rules";
import { describe, expect, it } from "vitest";

import {
  biasEstimate,
  decideLookBack,
  eqaLookBack,
  lookBack,
  lookBackProgress,
  sortLookBack,
} from "@/lib/lab/lookback";
import {
  AUTOMATIC_SOURCES,
  closeErrors,
  foldNc,
  ncNumber,
  openAutomatic,
  overdueActions,
  resumptionErrors,
} from "@/lib/lab/nonconformity";
import { H1, H2, kla, TZ } from "./_fixtures";

const res = (
  id: string,
  releasedAt: string,
  value: string,
  o: Partial<ReleasedResult> = {},
): ReleasedResult => ({
  hospitalId: H1,
  deviceId: "analyser-1",
  conceptId: "obs.potassium",
  reportId: `rep-${id}`,
  observationId: `obs-${id}`,
  patientUserId: `patient-${id}`,
  releasedAt: kla(releasedAt),
  value,
  override: false,
  ...o,
});

describe("look-back (§6.6 LB)", () => {
  const runs = [
    { id: "r1", runAt: kla("2026-10-12 07:00"), decision: "accepted" as const },
    { id: "r2", runAt: kla("2026-10-13 07:00"), decision: "accepted" as const },
    { id: "r3", runAt: kla("2026-10-13 13:00"), decision: "rejected" as const },
  ];
  const results = [
    res("before", "2026-10-13 06:00", "4.1"),
    res("in1", "2026-10-13 08:00", "4.2"),
    res("in2", "2026-10-13 12:59", "5.10"),
    res("after", "2026-10-13 14:00", "4.0"),
    res("override", "2026-10-13 15:00", "4.4", { override: true }),
    res("other-device", "2026-10-13 09:00", "4.0", { deviceId: "analyser-2" }),
    res("other-concept", "2026-10-13 09:00", "140", { conceptId: "obs.sodium" }),
    res("other-hospital", "2026-10-13 09:00", "4.0", { hospitalId: H2 }),
  ];
  const q = {
    hospitalId: H1,
    deviceId: "analyser-1",
    conceptId: "obs.potassium",
    runs,
    rejectedRunId: "r3",
    results,
  };

  it("LB-1 lists results released from the last accepted run to the rejected run on that analyser, plus overrides", () => {
    expect(lookBack(q).map((r) => r.reportId)).toEqual(["rep-in1", "rep-in2", "rep-override"]);
    expect(lookBack({ ...q, hospitalId: H2 }).map((r) => r.reportId)).toEqual([
      "rep-other-hospital",
    ]);
    // No earlier accepted run: everything up to the rejected run.
    expect(lookBack({ ...q, runs: [runs[2]!] }).map((r) => r.reportId)).toEqual([
      "rep-before",
      "rep-in1",
      "rep-in2",
      "rep-override",
    ]);
  });

  const breaks: RuleBreak[] = [
    { rule: "1-2s", kind: "warning", scope: "point", points: [{ runId: "r3", level: 1, z: 2.3 }] },
    {
      rule: "2-2s",
      kind: "reject",
      scope: "across_runs",
      points: [
        { runId: "r2", level: 1, z: 2.1 },
        { runId: "r3", level: 1, z: 2.3 },
      ],
    },
  ];

  it("LB-2 the bias is the failed level's mean z × SD, labelled estimate (GATE A §5.3 worked example)", () => {
    const bias = biasEstimate(breaks, new Map([[1, 0.1]]));
    expect(bias?.label).toBe("estimate");
    expect(bias?.level).toBe(1);
    expect(bias?.value).toBeCloseTo(0.22);
    expect(biasEstimate(breaks, new Map())).toBeNull();
    expect(biasEstimate([breaks[0]!], new Map([[1, 0.1]]))).toBeNull(); // warnings estimate nothing
  });

  it("LB-2 sorting: flag might change, then critical nearby, then unchanged; it decides nothing", () => {
    const bias = biasEstimate(breaks, new Map([[1, 0.1]]))!;
    const limits = { band: { low: "3.50", high: "5.00" }, critical: ["2.50", "6.00"] }; // FIXTURE limits
    const items = [
      res("unchanged", "2026-10-13 08:00", "4.20"),
      res("near-critical", "2026-10-13 08:30", "5.90"), // above 5.00 either way; within 0.22 of 6.00
      res("flag", "2026-10-13 09:00", "5.10"), // 5.10 − 0.22 = 4.88 crosses 5.00
      res("crossing-critical", "2026-10-13 07:00", "6.10"), // 5.88 is below 6.00
    ];
    const sorted = sortLookBack(items, bias, limits);
    expect(sorted.map((r) => [r.reportId, r.sort])).toEqual([
      ["rep-flag", "flag_might_change"],
      ["rep-crossing-critical", "critical_nearby"],
      ["rep-near-critical", "critical_nearby"],
      ["rep-unchanged", "unchanged"],
    ]);
    expect(sorted.find((r) => r.reportId === "rep-flag")!.value).toBe("5.10");
    expect(sortLookBack(items, null, limits).every((r) => r.sort === "unchanged")).toBe(true);
  });

  it("LB-3 one decision per result, with actor and time, set once", () => {
    const item: LookBackItem = { id: "lb1", decision: null, decidedBy: null, decidedAt: null };
    const at = kla("2026-10-13 16:00");
    const done = decideLookBack(item, { decision: "repeat", actorId: "tech-1", at });
    expect(done).toEqual({
      ok: true,
      item: { id: "lb1", decision: "repeat", decidedBy: "tech-1", decidedAt: at },
    });
    if (!done.ok) throw new Error();
    expect(decideLookBack(done.item, { decision: "amend", actorId: "tech-2", at })).toEqual({
      ok: false,
      error: "already_decided",
    });
  });

  it("LB-4 'n of m reviewed'; complete only when every result is decided", () => {
    expect(lookBackProgress([{ decision: "stands" }, { decision: null }])).toEqual({
      decided: 1,
      total: 2,
      complete: false,
    });
    expect(lookBackProgress([{ decision: "stands" }, { decision: "amend" }])).toEqual({
      decided: 2,
      total: 2,
      complete: true,
    });
  });

  it("EA-4 an EQA look-back covers receipt to scoring, every in-house result of the component", () => {
    const out = eqaLookBack({
      hospitalId: H1,
      conceptId: "obs.potassium",
      from: kla("2026-10-13 07:30"),
      to: kla("2026-10-13 14:00"),
      results,
    });
    expect(out.map((r) => r.reportId)).toEqual([
      "rep-in1",
      "rep-in2",
      "rep-after",
      "rep-other-device",
    ]);
  });
});

describe("nonconformities (§6.8)", () => {
  it("NC-1 automatic sources are opened by MedSync with the lead as owner; only a QC reject halts", () => {
    expect(AUTOMATIC_SOURCES).toEqual([
      "qc_reject",
      "kit_qc_fail",
      "eqa_unacceptable",
      "temperature",
      "lot_rejected",
      // Lab Phase 4 (RF-10, MF-3): a referred specimen lost, a manifest received with a discrepancy.
      "referral",
      "manifest",
      // Lab Phase 5 (DL-6): a delta outcome of "mislabelled".
      "delta",
    ]);
    expect(openAutomatic("referral", "lead-1").testingHalted).toBe(false);
    expect(openAutomatic("qc_reject", "lead-1")).toEqual({
      source: "qc_reject",
      owner: "lead-1",
      openedBy: null,
      testingHalted: true,
      state: "open",
    });
    expect(openAutomatic("temperature", "lead-1").testingHalted).toBe(false);
    expect(() => openAutomatic("complaint", "lead-1")).toThrow();
  });

  const events: NcEvent[] = [
    { kind: "action_added", actionId: "a1", what: "Recalibrate", who: "tech-1", by: "2026-10-14" },
    {
      kind: "action_added",
      actionId: "a2",
      what: "Check reagent",
      who: "tech-2",
      by: "2026-10-12",
    },
    { kind: "linked" },
    { kind: "action_updated", actionId: "a1", state: "done" },
  ];

  it("NC-2 numbers and actions as events", () => {
    expect(ncNumber(2026, 7)).toBe("NC-2026-007");
    expect(foldNc(events).actions.map((a) => [a.id, a.state])).toEqual([
      ["a1", "done"],
      ["a2", "open"],
    ]);
  });

  it("NC-3 resumption needs a passing run after the reject, the look-back finished and the lead", () => {
    expect(
      resumptionErrors({
        actorIsLead: false,
        passingRunAfterReject: false,
        lookBack: [{ decision: null }],
      }),
    ).toEqual(["not_lead", "no_passing_run", "lookback_undecided"]);
    expect(
      resumptionErrors({
        actorIsLead: true,
        passingRunAfterReject: true,
        lookBack: [{ decision: "stands" }],
      }),
    ).toEqual([]);
  });

  it("NC-4 closing needs cause, look-back decided, actions done or cancelled with reason, effectiveness met, lead", () => {
    const base = {
      actorIsLead: true,
      causeCategory: "Calibration",
      effectivenessMet: true,
      events,
      lookBack: [{ decision: "stands" as const }],
    };
    expect(closeErrors(base)).toEqual(["actions_open"]);
    const cancelledNoReason: NcEvent[] = [
      ...events,
      { kind: "action_updated", actionId: "a2", state: "cancelled" },
    ];
    expect(closeErrors({ ...base, events: cancelledNoReason })).toEqual(["cancel_without_reason"]);
    const ok: NcEvent[] = [
      ...events,
      { kind: "action_updated", actionId: "a2", state: "cancelled", reason: "Not needed: fixture" },
    ];
    expect(closeErrors({ ...base, events: ok })).toEqual([]);
    expect(
      closeErrors({
        actorIsLead: false,
        causeCategory: " ",
        effectivenessMet: null,
        events: ok,
        lookBack: [{ decision: null }],
      }),
    ).toEqual(["not_lead", "no_cause", "lookback_undecided", "effectiveness_not_met"]);
    expect(closeErrors({ ...base, events: [...ok, { kind: "closed" }] })).toEqual([
      "already_closed",
    ]);
  });

  it("NC-5 overdue actions are listed; nothing auto-closes", () => {
    expect(overdueActions(events, kla("2026-10-13 10:00"), TZ).map((a) => a.id)).toEqual(["a2"]);
    expect(overdueActions(events, kla("2026-10-12 23:59"), TZ)).toEqual([]);
    expect(foldNc([...events, { kind: "resumed" }]).closed).toBe(false);
  });
});
