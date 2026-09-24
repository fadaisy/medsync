import { describe, expect, it } from "vitest";

import {
  deathOutcome,
  news2Response,
} from "@/app/nurse/resus/[episodeId]/_components/v2/close-out-model";
import { news2Reading } from "@/app/nurse/resus/[episodeId]/_components/v2/close-out-sbar";
import { news2FromVitals } from "@/lib/resus/closeout/level-of-care";
import { closeOutcomeProblem, cprNotAttemptedProblem } from "@/lib/resus/v2-rules-closeout";
import { buildResusVitals } from "@/lib/resus/vitals";
import { arrest, decision, ev, NORMAL_VITALS, rosc, vitals } from "./closeout/fixtures";

/**
 * The after-arrest fixer group: the boarding banner / SBAR NEWS2 reading (one
 * vital set, CO-BRD-02, CO-R11/12) and the died outcome code (the latest
 * observation start, not any CPR-not-attempted in the episode).
 */

describe("CO-BRD-02 / CO-R11 — NEWS2 is scored on one vital set", () => {
  const older = vitals(60, NORMAL_VITALS);
  const newer = vitals(5, { spo2: 72 });

  it("CO-BRD-02: a newer partial set gives no NEWS2 — never a per-field mix (not CO-NEWS-03)", () => {
    // The mix the banner used to score: the newest value per field across both sets.
    const mixed = news2FromVitals(buildResusVitals([older, newer]).latest, 50);
    expect(news2Response(mixed)?.id).toBe("CO-NEWS-03");

    const r = news2Reading([older, newer], 50);
    expect(r?.set).toEqual({ spo2: 72 });
    expect(r?.news2).toBeNull();
    expect(news2Response(r?.news2 ?? null)).toBeNull();
  });

  it("CO-R11: the SBAR 'Last vitals' time is the scored set's time", () => {
    expect(news2Reading([older, newer], 50)?.atIso).toBe(newer.recordedAt);
    const complete = news2Reading([older], 50);
    expect(complete?.atIso).toBe(older.recordedAt);
    expect(news2Response(complete?.news2 ?? null)?.id).toBe("CO-NEWS-05");
  });

  it("CO-R12: a triage carry-in is not a resus set; a child gets no NEWS2", () => {
    const carried = ev("vital", "C", 2, {
      label: "Vitals (triage)",
      snapshot: { ...NORMAL_VITALS, spo2: 80 },
      carriedFromTriage: true,
    });
    const r = news2Reading([older, carried], 50);
    expect(r?.atIso).toBe(older.recordedAt);
    expect(r?.news2?.total).toBe(0);
    expect(news2Reading([carried], 50)).toBeNull();
    expect(news2Reading([older], 10)?.news2).toBeNull();
  });
});

describe("deathOutcome — the latest observation start decides", () => {
  const notAttempted = decision(30, {
    decision: "cpr_not_attempted",
    reason: "irreversible_death",
  });
  const stop = (minsAgo: number) =>
    ev("resuscitation_stopped", "arrest", minsAgo, { arrestSeq: 1, label: "Stopped" });

  it("CPR not attempted and nothing after → died, CPR not attempted", () => {
    expect(deathOutcome([notAttempted])).toBe("died_cpr_not_attempted");
  });

  it("CPR not attempted, then signs of life, CPR and a stop → died after CPR", () => {
    expect(deathOutcome([notAttempted, arrest(25), stop(5)])).toBe("died_after_cpr");
  });

  it("an arrest stopped with no CPR-not-attempted → died after CPR", () => {
    expect(deathOutcome([arrest(25), stop(5)])).toBe("died_after_cpr");
  });
});

describe("ALS-REC-07: CPR not attempted is refused while an arrest is running", () => {
  const cpr = (minsAgo: number) => ev("cpr_started", "arrest", minsAgo, { arrestSeq: 1 });

  it("an arrest with CPR running → refused; after ROSC or with no arrest → allowed", () => {
    expect(cprNotAttemptedProblem([arrest(10), cpr(10)])).toBe(
      "CPR has started — use Stop resuscitation.",
    );
    expect(cprNotAttemptedProblem([arrest(10), rosc(5)])).toBeNull();
    expect(cprNotAttemptedProblem([])).toBeNull();
  });
});

describe("LC-02 — the died outcome follows the latest observation start (server side)", () => {
  const stop = ev("resuscitation_stopped", "arrest", 10, { arrestSeq: 1, label: "Stopped" });
  const dead = ev("death_confirmed", "arrest", 4, { label: "Death confirmed" });

  it("died, CPR not attempted is refused after a stop; died after CPR is not", () => {
    const record = [arrest(25), stop, dead];
    expect(closeOutcomeProblem("died_cpr_not_attempted", "mortuary", record)).toBe(
      "CPR was attempted — the outcome is died after CPR.",
    );
    expect(closeOutcomeProblem("died_after_cpr", "mortuary", record)).toBeNull();
  });
});
