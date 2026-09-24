import type { SurveySignals } from "@/lib/resus/survey/floor";
import { describe, expect, it } from "vitest";

import { arrestSeqForDeclaration } from "@/lib/resus/als/rosc";
import { EMPTY_CONTEXT } from "@/lib/resus/model";
import { ADULT_MIN_AGE_YEARS as ALS_ADULT } from "@/lib/resus/reference/als-catalog";
import { latestContext } from "@/lib/resus/survey/context";
import { computeDoNow } from "@/lib/resus/survey/do-now";
import { computeSurvey, lastVitalsMin } from "@/lib/resus/survey/floor";
import { ADULT_MIN_AGE_YEARS, FRESH_WINDOW_MIN } from "@/lib/resus/survey/vitals-bands";
import { arrestAt } from "@/lib/resus/v2-rules";
import { declare, min, rosc, shock, started } from "./als/fixtures";
import { act, ctxEvent, ev, NOW, vitals } from "./survey-fixtures";

/** Survey fixer group — the rules behind S6, S7, R1 and R2. */

const NORMAL = { hr: 80, systolicBp: 120, diastolicBp: 80, rr: 16, spo2: 98, oxygen: "air" };
const doNow = (signals: Partial<SurveySignals>) =>
  computeDoNow({
    states: [],
    actions: { A: [], B: [], C: [], D: [], E: [] },
    signals: {
      gcsTotal: null,
      gcsFalling: false,
      opioid: false,
      coreTempMissing: false,
      glucoseMissing: false,
      vitalsStale: false,
      lastVitalsMin: 5,
      ...signals,
    },
    vitals: {},
    allergiesRecorded: true,
    firstDrugPending: false,
  }).top;

describe("SV-DN-08 — stale vitals (intervention since the set, or past the fresh window)", () => {
  it("SV-DN-08: a 72 h old set with no intervention → Re-check vitals (the idle-legacy case)", () => {
    const tl = [vitals(72 * 60, NORMAL)];
    const s = computeSurvey(tl, { ageYears: 40, nowMs: NOW });
    expect(s.signals.vitalsStale).toBe(false);
    expect(s.signals.lastVitalsMin).toBe(72 * 60);
    expect(doNow(s.signals)[0]).toMatchObject({
      kind: "vitals_stale",
      label: "Re-check vitals",
      because: `last set older than ${FRESH_WINDOW_MIN} min`,
    });
  });
  it("SV-DN-08: a set inside the fresh window with no intervention → no prompt", () => {
    expect(doNow({ lastVitalsMin: FRESH_WINDOW_MIN })).toEqual([]);
  });
  it("SV-DN-08: an intervention and no vitals at all → Record vitals, never 'since the last set'", () => {
    const tl = [act("C", 2, "c_iv_access", "performed")];
    const s = computeSurvey(tl, { ageYears: 40, nowMs: NOW });
    expect(s.signals.lastVitalsMin).toBeNull();
    expect(doNow(s.signals)[0]).toMatchObject({
      kind: "vitals_stale",
      label: "Record vitals",
      because: "an intervention and no vitals yet",
    });
  });
  it("SV-DN-08: the age counts whole minutes from the newest vitals set", () => {
    expect(lastVitalsMin([vitals(40, NORMAL), vitals(3, NORMAL)], NOW)).toBe(3);
    expect(lastVitalsMin([], NOW)).toBeNull();
  });
});

describe("SV-VIT-14 — one adult-age constant", () => {
  it("SV-VIT-14: vitals-bands re-exports the signed ALS constant (one source)", () => {
    expect(ADULT_MIN_AGE_YEARS).toBe(ALS_ADULT);
  });
});

describe("SV-CTX-01 — context patches fold (two devices never erase each other)", () => {
  const patch = (minsAgo: number, p: Record<string, unknown>) =>
    ev("context", null, minsAgo, { flags: { ...EMPTY_CONTEXT, ...p }, patch: p, label: "Context" });

  it("SV-CTX-01: device B's later toggle keeps device A's earlier pregnancy", () => {
    // A: pregnancy confirmed at 10:00:05. B had not seen it and sent its full view with spinal injury.
    const tl = [
      patch(3, { pregnancy: "confirmed", gestationWeeks: 32 }),
      ev("context", null, 2, {
        flags: { ...EMPTY_CONTEXT, spinalInjury: true },
        patch: { spinalInjury: true },
        label: "Context",
      }),
    ];
    expect(latestContext(tl)).toMatchObject({
      pregnancy: "confirmed",
      gestationWeeks: 32,
      spinalInjury: true,
    });
  });
  it("SV-CTX-01: a queued patch that lands late still applies unless a later row changed that key", () => {
    const tl = [patch(1, { trauma: true }), patch(9, { headInjury: true, trauma: false })];
    expect(latestContext(tl)).toMatchObject({ headInjury: true, trauma: true });
  });
  it("SV-CTX-01: a full-set row (no patch) still replaces the whole context", () => {
    const tl = [patch(5, { trauma: true }), ctxEvent(1, { allergenTrigger: true })];
    expect(latestContext(tl)).toEqual({ ...EMPTY_CONTEXT, allergenTrigger: true });
  });
});

describe("ALS-ROSC-05 — a re-arrest after sustained ROSC and the entries queued behind it", () => {
  // ROSC at +10:00 held for 21 min; the re-arrest is tapped at +31:00, then a shock at +31:10.
  const record = [...started(), rosc(min(10))];

  it("ALS-ROSC-05: the optimistic declaration carries the NEW arrest number, as the server will", () => {
    expect(arrestSeqForDeclaration(record, min(31))).toBe(2);
  });
  it("ALS-ROSC-05: shock queued behind a re-arrest after sustained ROSC lands in the new arrest", () => {
    const withDeclaration = [...record, declare(min(31), 2)];
    const atMs = min(31) + 10_000;
    // The server derives the seq at the shock's bedside time, never from the client's value.
    expect(arrestAt(withDeclaration, atMs)).toEqual({ seq: 2, status: "in_arrest" });
    expect(arrestAt([...withDeclaration, shock(atMs, 2)], atMs)?.seq).toBe(2);
  });
});
