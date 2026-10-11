import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BannedTerms } from "@/lib/lab/criticals/messages";
import { describe, expect, it } from "vitest";

import { CRITICALS_COPY } from "@/content/lab-criticals";
import { flaggingActiveFrom } from "@/lib/lab/critical-flagging";
import {
  ALERT_POLL_MS,
  bannedTermScan,
  realtimePayload,
  renderSms,
  smsDecision,
} from "@/lib/lab/criticals/messages";
import { canReverse, canSwitch, cutoverReadiness, legacyWritesAllowed } from "@/lib/lab/cutover";
import {
  checkFormTimes,
  downtimeAlertStart,
  downtimeTimes,
  evaluationTime,
  formNumberMove,
  nextFormNumbers,
  periodErrors,
} from "@/lib/lab/downtime";
import { evaluateCritical } from "@/lib/lab/flags";
import { resolveRange } from "@/lib/lab/ranges";
import {
  CONCEPT,
  fixtureLimits,
  fixtureRanges,
  H_A,
  H_B,
  measure,
  minutes,
  T0,
  TEST,
  UNIT,
} from "./_fixtures";

const migration = (n: string) =>
  readFileSync(join(process.cwd(), "supabase/migrations", n), "utf8");

/** Every catalogue test name, from the seeds (0072, 0092); every unit from 0103's curated list. */
const TERMS: BannedTerms = {
  names: ["Fixture Patient", "Akello", "Okello Fixture"],
  testNames: [
    ...new Set(
      ["0072_emr_reference_seed.sql", "0092_cfc_v1_5_ncd_diabetes.sql"].flatMap((f) =>
        [...migration(f).matchAll(/'test\.[a-z0-9_]+', '([^']+)', 'lab'/g)].map((m) => m[1]!),
      ),
    ),
  ],
  units: [
    ...new Set(
      [
        ...migration("0103_lab_measures.sql").matchAll(/\('([^']+)', '([^']+)', '[^']+'\)/g),
      ].flatMap((m) => [m[1]!, m[2]!]),
    ),
  ],
};
const APPROVED = (body: string) => ({ body, status: "approved" });
const PLACES = ["Ward 4A", "Medical Ward", "Casualty", "Paediatrics"];

describe("messages (MS)", () => {
  it("the scan's term lists are real: the seeds give the catalogue and the units", () => {
    expect(TERMS.testNames.length).toBeGreaterThan(20);
    expect(TERMS.units).toEqual(expect.arrayContaining(["mmol/L", "µmol/L"]));
  });

  it("MS-1 an SMS takes the place and the lab's number, and nothing else", () => {
    const r = renderSms(
      APPROVED(CRITICALS_COPY.smsDraft.level0),
      { place: "Ward 4A", labNumber: "0414 000 000" },
      TERMS,
    );
    expect(r).toEqual({
      ok: true,
      text: "MedSync: a critical lab result on Ward 4A needs your acknowledgement. Open MedSync, or call the lab on 0414 000 000.",
    });
    expect(
      renderSms(APPROVED("Result {value} for {place}"), { place: "x", labNumber: "1" }, TERMS),
    ).toEqual({
      ok: false,
      reason: "unknown_field",
      detail: ["value"],
    });
    expect(
      renderSms(
        APPROVED(CRITICALS_COPY.smsDraft.level0),
        { place: "Ward 4A", labNumber: " " },
        TERMS,
      ),
    ).toMatchObject({ reason: "no_lab_number" });
  });

  it("MS-2 every draft template, rendered for every fixture place, passes the banned-term scan", () => {
    for (const body of Object.values(CRITICALS_COPY.smsDraft)) {
      expect(bannedTermScan(body, TERMS), body).toEqual([]);
      for (const place of PLACES) {
        const r = renderSms(APPROVED(body), { place, labNumber: "0414 000 000" }, TERMS);
        expect(r.ok, `${place}: ${JSON.stringify(r)}`).toBe(true);
      }
    }
  });

  it("MS-2 the scan FAILS on a fixture that names the patient, the test, a value, an identifier or a restricted class", () => {
    const bad = "MedSync: Akello on Ward 4A, Potassium 6.9 mmol/L, MRN 20261011, HIV clinic.";
    const hits = bannedTermScan(bad, { ...TERMS, testNames: [...TERMS.testNames, "Potassium"] });
    expect(hits).toEqual(
      expect.arrayContaining([
        "name:Akello",
        "test:Potassium",
        "value:mmol/L",
        "identifier",
        "restricted:hiv",
      ]),
    );
    // A place name can leak a class: the message is refused, not sent.
    expect(
      renderSms(
        APPROVED(CRITICALS_COPY.smsDraft.level0),
        { place: "TB Ward", labNumber: "0414 000 000" },
        TERMS,
      ),
    ).toMatchObject({
      ok: false,
      reason: "banned_term",
    });
    // Whole words only: "still" is not "sti", and the lab's own number is allowed.
    expect(bannedTermScan("still waiting, call 0414 123456", TERMS, ["0414 123456"])).toEqual([]);
  });

  it("MS-3 SMS only when live, from an approved template, to a number on file, once per recipient per level", () => {
    const ok = {
      smsLive: true,
      templateApproved: true,
      staffPhone: "+256700000000",
      restricted: false,
      alreadySent: false,
    };
    expect(smsDecision(ok)).toEqual({ send: true });
    expect(smsDecision({ ...ok, smsLive: false })).toEqual({
      send: false,
      outcome: "off",
      reason: "sms_off",
    });
    expect(smsDecision({ ...ok, templateApproved: false })).toMatchObject({
      send: false,
      outcome: "skipped",
    });
    expect(smsDecision({ ...ok, staffPhone: null })).toMatchObject({ reason: "no_number" });
    expect(smsDecision({ ...ok, alreadySent: true })).toMatchObject({ reason: "already_sent" });
    expect(
      renderSms(
        { body: CRITICALS_COPY.smsDraft.level0, status: "pending_review" },
        { place: "x", labNumber: "1" },
        TERMS,
      ),
    ).toEqual({
      ok: false,
      reason: "not_approved",
    });
  });

  it("MS-4 the realtime payload is the alert id, the kind and the time, and nothing else; polling is 15 s", () => {
    expect(Object.keys(realtimePayload("a1", "created", T0)).sort()).toEqual([
      "alertId",
      "at",
      "kind",
    ]);
    expect(ALERT_POLL_MS).toBe(15_000);
  });
});

describe("downtime (DT)", () => {
  const periods = [{ startsAt: minutes(-120), endsAt: minutes(-30) }];

  it("DT-1 a period is a record: start before end, in the past, a reason", () => {
    expect(
      periodErrors({ startsAt: minutes(-60), endsAt: minutes(-1), reason: "power", now: T0 }),
    ).toEqual([]);
    expect(
      periodErrors({ startsAt: minutes(-1), endsAt: minutes(-60), reason: "power", now: T0 }),
    ).toEqual(["order"]);
    expect(
      periodErrors({ startsAt: minutes(-1), endsAt: minutes(5), reason: "rain", now: T0 }),
    ).toEqual(["future", "reason"]);
  });

  it("DT-2 numbers are reserved in runs after the highest, and move once from unused", () => {
    expect(nextFormNumbers(null, 3)).toEqual([1, 2, 3]);
    expect(nextFormNumbers(40, 2)).toEqual([41, 42]);
    expect(() => nextFormNumbers(0, 0)).toThrow();
    expect(formNumberMove("unused")).toEqual({ ok: true });
    expect(formNumberMove("entered")).toEqual({ ok: false, reason: "already_entered" });
    expect(formNumberMove("voided")).toEqual({ ok: false, reason: "already_voided" });
    expect(formNumberMove(null)).toEqual({ ok: false, reason: "not_reserved" });
  });

  it("DT-3 the form's times are kept; the server's entry time is beside them", () => {
    const t = downtimeTimes({
      collectedAt: minutes(-100),
      resultedAt: minutes(-70),
      enteredAt: T0,
    });
    expect(t).toEqual({ turnaroundMinutes: 30, releasedOn: minutes(-70), newForReviewAt: T0 });
  });

  it("DT-4 no future time, result not before collection, inside a period or a reason", () => {
    const ok = { now: T0, periods, outsidePeriodReason: null };
    expect(checkFormTimes({ collectedAt: minutes(-100), resultedAt: minutes(-70) }, ok)).toEqual({
      ok: true,
      insidePeriod: true,
    });
    expect(checkFormTimes({ collectedAt: minutes(-100), resultedAt: minutes(5) }, ok)).toEqual({
      ok: false,
      errors: ["future", "outside_period_reason"],
    });
    expect(
      checkFormTimes({ collectedAt: minutes(-70), resultedAt: minutes(-100) }, ok),
    ).toMatchObject({ errors: ["result_before_collection"] });
    expect(checkFormTimes({ collectedAt: minutes(-20), resultedAt: minutes(-10) }, ok)).toEqual({
      ok: false,
      errors: ["outside_period_reason"],
    });
    expect(
      checkFormTimes(
        { collectedAt: minutes(-20), resultedAt: minutes(-10) },
        { ...ok, outsidePeriodReason: "Form found late" },
      ),
    ).toEqual({
      ok: true,
      insidePeriod: false,
    });
  });

  it("DT-5 ranges and limits are read as at the form's collection time, not the entry time", () => {
    const at = evaluationTime({ collectedAt: minutes(-100), resultedAt: minutes(-70) });
    expect(at).toEqual(minutes(-100));
    // v1 was in force at collection; v2 replaced it before entry.
    const v1 = fixtureRanges({ supersededAt: minutes(-50) });
    const v2 = fixtureRanges({
      id: "rv-2",
      version: 2,
      inForceFrom: minutes(-50),
      bands: [{ id: "v2", sex: "any", ageFromDays: null, ageToDays: null, low: "1", high: "2" }],
    });
    const r = resolveRange(
      { measure, hospitalId: H_A, sex: "female", ageDaysAtCollection: 11_000, at },
      [v1, v2],
    );
    expect(r.kind === "band" && r.band.id).toBe("adult-f");
    const l1 = fixtureLimits({ supersededAt: minutes(-50) });
    const l2 = fixtureLimits({ id: "clv-2", version: 2, inForceFrom: minutes(-50), limits: [] });
    const q = {
      value: "1",
      resultType: "number" as const,
      testId: TEST,
      conceptId: CONCEPT,
      unitUcum: UNIT,
      hospitalId: H_A,
      ageDays: 11_000,
    };
    expect(evaluateCritical({ ...q, at }, [l1, l2])).toMatchObject({
      kind: "critical",
      versionId: "clv-a-1",
    });
    expect(evaluateCritical({ ...q, at: T0 }, [l1, l2])).toMatchObject({
      kind: "none",
      reason: "no_limit_for_test",
    });
  });

  it("DT-6 a paper critical phoned with read-back is created acknowledged; otherwise it opens live", () => {
    const call = { to: "dr-1", at: minutes(-65), readBack: true, toMayAcknowledge: true };
    expect(downtimeAlertStart({ critical: true, paperCall: call })).toEqual({
      kind: "acknowledged_by_phone",
      by: "dr-1",
      at: minutes(-65),
    });
    expect(downtimeAlertStart({ critical: true, paperCall: { ...call, readBack: false } })).toEqual(
      { kind: "live" },
    );
    expect(
      downtimeAlertStart({ critical: true, paperCall: { ...call, toMayAcknowledge: false } }),
    ).toEqual({ kind: "live" });
    expect(downtimeAlertStart({ critical: true, paperCall: null })).toEqual({ kind: "live" });
    expect(downtimeAlertStart({ critical: false, paperCall: call })).toEqual({ kind: "none" });
  });

  it("DT-7 turnaround and Released today use the form's times; review sees it new at entry", () => {
    const t = downtimeTimes({
      collectedAt: minutes(-600),
      resultedAt: minutes(-540),
      enteredAt: T0,
    });
    expect(t.turnaroundMinutes).toBe(60);
    expect(t.releasedOn).toEqual(minutes(-540));
    expect(t.newForReviewAt).toEqual(T0);
  });

  it("DT-8 a drill is a record only: the downtime engine touches no patient record", () => {
    const src = readFileSync(join(process.cwd(), "lib/lab/downtime.ts"), "utf8");
    expect(src).not.toMatch(/from "@\/(db|lib\/emr)/);
  });
});

describe("cut-over (CO)", () => {
  const ready = {
    openLegacyItems: 0,
    testsWithoutUnit: [],
    noticeSigned: true,
    alertWordingSigned: true,
    responseTimesSigned: true,
    departmentsWithoutLevel1: [],
    drills: 1,
    briefings: 1,
  };

  it("CO-1 four conditions, each with its evidence", () => {
    const r = cutoverReadiness({
      ...ready,
      openLegacyItems: 3,
      testsWithoutUnit: ["test.k"],
      alertWordingSigned: false,
      departmentsWithoutLevel1: ["ward-4"],
      drills: 0,
    });
    expect(r.ready).toBe(false);
    expect(r.conditions).toEqual([
      { key: "legacy_clear", met: false, evidence: ["open_legacy:3"] },
      {
        key: "setup_complete",
        met: false,
        evidence: ["no_unit:test.k", "alert_wording_unsigned", "no_level1:ward-4"],
      },
      { key: "drill_recorded", met: false, evidence: ["drills:0"] },
      { key: "briefing_recorded", met: true, evidence: ["briefings:1"] },
    ]);
  });

  it("CO-2 the switch needs all four and a second approver", () => {
    const r = cutoverReadiness(ready);
    expect(canSwitch(r, "lead", "cso")).toEqual({ ok: true });
    expect(canSwitch(r, "lead", "lead")).toEqual({ ok: false, reason: "same_person" });
    expect(canSwitch(cutoverReadiness({ ...ready, briefings: 0 }), "lead", "cso")).toEqual({
      ok: false,
      reason: "not_ready",
    });
  });

  it("CO-3 no legacy items meets the first condition at once", () => {
    expect(cutoverReadiness(ready).conditions[0]).toEqual({
      key: "legacy_clear",
      met: true,
      evidence: ["open_legacy:0"],
    });
  });

  it("CO-4 after the switch no legacy write is allowed; before it, or after a reversal, they are", () => {
    expect(legacyWritesAllowed(null)).toBe(true);
    expect(legacyWritesAllowed({ switchedAt: null, reversedAt: null })).toBe(true);
    expect(legacyWritesAllowed({ switchedAt: T0, reversedAt: null })).toBe(false);
    expect(legacyWritesAllowed({ switchedAt: T0, reversedAt: minutes(5) })).toBe(true);
  });

  it("CO-5 reversal: two different superadmins and a reason", () => {
    const i = {
      reversedBy: "sa-1",
      reversedByIsSuperadmin: true,
      approvedBy: "sa-2",
      approvedByIsSuperadmin: true,
      reason: "Lab cannot run the new path",
    };
    expect(canReverse(i)).toEqual({ ok: true });
    expect(canReverse({ ...i, approvedBy: "sa-1" })).toEqual({ ok: false, reason: "same_person" });
    expect(canReverse({ ...i, approvedByIsSuperadmin: false })).toEqual({
      ok: false,
      reason: "not_superadmin",
    });
    expect(canReverse({ ...i, reason: "because" })).toEqual({
      ok: false,
      reason: "reason_required",
    });
  });
});

describe("flagging state (CF)", () => {
  const times = {
    hospitalId: H_A,
    status: "signed" as const,
    inForceFrom: minutes(-60),
    supersededAt: null,
  };

  it("CF-2 true only with a signed limit in force and signed response times, for this hospital", () => {
    const base = {
      hospitalId: H_A,
      at: T0,
      limitVersions: [fixtureLimits()],
      responseVersions: [times],
    };
    expect(flaggingActiveFrom(base)).toBe(true);
    expect(flaggingActiveFrom({ ...base, responseVersions: [] })).toBe(false);
    expect(
      flaggingActiveFrom({ ...base, limitVersions: [fixtureLimits({ status: "draft" })] }),
    ).toBe(false);
    expect(flaggingActiveFrom({ ...base, limitVersions: [fixtureLimits({ limits: [] })] })).toBe(
      false,
    );
    expect(flaggingActiveFrom({ ...base, hospitalId: H_B })).toBe(false);
  });
});

describe("Law 8: the record keeps what was true", () => {
  it("a released result's snapshot does not move when the range and the limit change afterwards", () => {
    const releasedAt = T0;
    const v1 = fixtureRanges();
    const l1 = fixtureLimits();
    const r = resolveRange(
      { measure, hospitalId: H_A, sex: "female", ageDaysAtCollection: 11_000, at: releasedAt },
      [v1],
    );
    const c = evaluateCritical(
      {
        value: "4",
        resultType: "number",
        testId: TEST,
        conceptId: CONCEPT,
        unitUcum: UNIT,
        hospitalId: H_A,
        ageDays: 11_000,
        at: releasedAt,
      },
      [l1],
    );
    const snapshot = Object.freeze({
      band: r.kind === "band" ? r.band.id : null,
      low: r.kind === "band" ? r.band.low : null,
      crit: c,
    });
    const copy = structuredClone(snapshot);

    // Later: both sets are replaced.
    const v2 = fixtureRanges({ id: "rv-2", version: 2, inForceFrom: minutes(10), bands: [] });
    const l2 = fixtureLimits({ id: "clv-2", version: 2, inForceFrom: minutes(10), limits: [] });
    resolveRange(
      { measure, hospitalId: H_A, sex: "female", ageDaysAtCollection: 11_000, at: minutes(20) },
      [{ ...v1, supersededAt: minutes(10) }, v2],
    );
    evaluateCritical(
      {
        value: "4",
        resultType: "number",
        testId: TEST,
        conceptId: CONCEPT,
        unitUcum: UNIT,
        hospitalId: H_A,
        ageDays: 11_000,
        at: minutes(20),
      },
      [l2],
    );

    expect(snapshot).toEqual(copy);
    // And replaying as at release still gives the same answer: nothing rewrites history.
    const again = resolveRange(
      { measure, hospitalId: H_A, sex: "female", ageDaysAtCollection: 11_000, at: releasedAt },
      [{ ...v1, supersededAt: minutes(10) }, v2],
    );
    expect(again.kind === "band" && again.band.id).toBe(snapshot.band);
    // The DB half (snapshots append-only, signed sets frozen) is tests/emr-db/lab-safety-data.test.ts.
  });
});
