import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { resusAfterDeathTasks, resusBayProfiles, resusDebriefs } from "@/db/schema/resus";
import {
  bedsideTimeProblem,
  deltaFloor,
  deriveHeader,
  isLateEntry,
  mirroredKinds,
  observationRows,
  replayOf,
} from "@/lib/resus/v2-rules";
import { decision, declare, ev, MIN, min, rosc, started, T0 } from "./als/fixtures";

/**
 * Resus Desk v2 write rules — the write core (lib/resus/v2-rules.ts, used by
 * commitResusEvents): bedside-time bounds, the derived header, idempotent
 * retries, the delta overlap and the longitudinal vitals mirror.
 */

describe("bedside time (Law 6)", () => {
  const start = T0;

  it("Law 6: a bedside time in the future is refused, beyond the device-clock tolerance", () => {
    expect(bedsideTimeProblem(min(15), min(10), start)).toMatch(/future/);
    expect(bedsideTimeProblem(min(10) + 30_000, min(10), start)).toBeNull();
  });

  it("Law 6: a bedside time before the resus started is refused", () => {
    expect(bedsideTimeProblem(start - 10 * MIN, min(10), start)).toMatch(/before this resus/);
    expect(bedsideTimeProblem(Number.NaN, min(10), start)).toMatch(/Invalid/);
  });

  it("Law 6: an entry is labelled when its bedside time differs from the write either way", () => {
    expect(isLateEntry(min(5), min(10))).toBe(true);
    expect(isLateEntry(min(10) + 5 * MIN, min(10))).toBe(true);
    expect(isLateEntry(min(10) - 30_000, min(10))).toBe(false);
  });
});

describe("the header the timeline implies (GATE A §1, E4 / LC-09)", () => {
  it("LC-09: an undone ROSC puts the stored phase back to arrest", () => {
    const r = rosc(min(10));
    const undo = { ...ev("note", min(11), { noteKind: "correction" }), supersedesEventId: r.id };
    expect(deriveHeader([...started(), r]).phase).toBe("post_rosc");
    expect(deriveHeader([...started(), r, undo])).toMatchObject({
      phase: "arrest",
      currentArrestSeq: 1,
    });
  });

  it("LC-09: a stale ROSC (bedside time before a re-arrest) leaves the patient in arrest", () => {
    const tl = [...started(), rosc(min(5)), declare(min(8)), rosc(min(6))];
    expect(deriveHeader(tl).phase).toBe("arrest");
  });

  it("LC-09: phase decisions and the arrest sequence follow the record", () => {
    const tl = [
      ...started(),
      rosc(min(5)),
      decision(min(30), { decision: "phase", phase: "boarding" }),
    ];
    expect(deriveHeader(tl)).toMatchObject({ phase: "boarding", currentArrestSeq: 1 });
    expect(deriveHeader(tl).arrestDetectedAt?.getTime()).toBe(T0);
    expect(deriveHeader([])).toEqual({ phase: "survey", currentArrestSeq: 0 });
  });
});

describe("an idempotent retry is all or nothing (GATE A §9)", () => {
  const stored = [{ id: "row-1", clientEventId: "c-primary", createdAt: "2026-09-23T10:00:00Z" }];

  it("GATE-A-9: a retry whose primary landed writes no second companion row", () => {
    // The companion (e.g. the AMPLE allergy note) carries a fresh id on each attempt.
    const retry = [{ clientEventId: "c-primary" }, { clientEventId: "c-companion-2" }];
    expect(replayOf(retry, stored)).toEqual([
      {
        eventId: "row-1",
        clientEventId: "c-primary",
        createdAt: "2026-09-23T10:00:00Z",
        duplicate: true,
      },
    ]);
  });

  it("GATE-A-9: a new batch is not a replay", () => {
    expect(replayOf([{ clientEventId: "c-new" }], stored)).toBeNull();
    expect(replayOf([], stored)).toBeNull();
  });
});

describe("the delta cursor overlaps (GATE A §9, E2)", () => {
  it("E2: a row whose transaction began before the cursor but committed after it is re-read", () => {
    const cursor = "2026-09-23T10:00:10.000Z";
    const lateCommitCreatedAt = new Date("2026-09-23T10:00:08.000Z");
    expect(lateCommitCreatedAt > deltaFloor(cursor)).toBe(true);
  });
});

describe("the longitudinal vitals mirror (SV-VIT-16)", () => {
  const base = { hospitalId: "h", patientUserId: "p", recordedByUserId: "u" };
  const at = new Date(min(3));

  it("SV-VIT-16: mirrored rows carry the bedside time, BP in one row, GCS out of 15", () => {
    const rows = observationRows({ hr: 120, systolicBp: 80, diastolicBp: 40, gcs: 9 }, base, at);
    expect(rows.every((r) => r.recordedAt.getTime() === at.getTime())).toBe(true);
    expect(rows.map((r) => [r.observationKind, r.numericValue1, r.numericValue2, r.unit])).toEqual([
      ["hr", "120", null, "/min"],
      ["bp", "80", "40", "mmHg"],
      ["gcs", "9", null, "/15"],
    ]);
  });

  it("SV-VIT-16: an artefact mark retracts the mirrored kinds of its fields", () => {
    expect(mirroredKinds(["systolicBp", "diastolicBp", "consciousness", "urineOutput"])).toEqual([
      "bp",
      "urine_output",
    ]);
  });
});

describe("the Drizzle schema carries the 0068 CHECKs", () => {
  const names = (t: Parameters<typeof getTableConfig>[0]) =>
    getTableConfig(t).checks.map((c) => c.name);

  it("0068: the energy bound, attendee count and task id checks are declared", () => {
    expect(names(resusBayProfiles)).toContain("rbp_energy_positive");
    expect(names(resusDebriefs)).toContain("rdb_attendees_check");
    expect(names(resusAfterDeathTasks)).toContain("radt_task_check");
  });
});
