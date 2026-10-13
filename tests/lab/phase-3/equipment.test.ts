import type { DeviceSchedules, EquipmentLog } from "@/lib/lab/equipment";
import { describe, expect, it } from "vitest";

import {
  backInServiceErrors,
  downtimeMinutes,
  missingReadings,
  tasksDue,
  temperatureReading,
  testsLosingService,
} from "@/lib/lab/equipment";
import { H1, H2, kla, TZ } from "./_fixtures";

/** FIXTURE schedules and range: intervals and temperatures are invented. */
const schedules: DeviceSchedules = {
  tasks: [
    { key: "daily-clean", kind: "maintenance", every: { days: 1 }, requiredBeforeUse: true },
    { key: "weekly-check", kind: "maintenance", every: { days: 7 }, requiredBeforeUse: false },
    { key: "probe-change", kind: "maintenance", every: { count: 500 }, requiredBeforeUse: false },
    { key: "pipette-cal", kind: "calibration", every: { days: 180 }, requiredBeforeUse: false },
  ],
  temperature: { min: 2, max: 8, readingsPerDay: 2 },
};
const log = (
  kind: EquipmentLog["kind"],
  doneAt: string,
  o: Partial<EquipmentLog> = {},
): EquipmentLog => ({
  hospitalId: H1,
  deviceId: "analyser-1",
  kind,
  taskKey: null,
  value: null,
  doneAt: kla(doneAt),
  ...o,
});

describe("equipment (§6.4)", () => {
  const since = kla("2026-10-10 09:00");
  const base = {
    since,
    linkedConcepts: ["obs.sodium", "obs.potassium"],
    linkedKitItems: [] as string[],
    logs: [log("repair", "2026-10-11 15:00")],
    runs: [
      { conceptId: "obs.sodium", runAt: kla("2026-10-11 16:00"), decision: "accepted" as const },
      { conceptId: "obs.potassium", runAt: kla("2026-10-11 16:00"), decision: "warning" as const },
    ],
    kitChecks: [] as { itemId: string; at: Date; outcome: "pass" | "fail" }[],
  };

  it("EQ-1 the register's linked components and kits decide what back in service needs", () => {
    expect(backInServiceErrors({ ...base, linkedConcepts: ["obs.urea"] })).toEqual([
      "no_accepted_run:obs.urea",
    ]);
    expect(backInServiceErrors({ ...base, linkedKitItems: ["stain-item"] })).toEqual([
      "no_passing_check:stain-item",
    ]);
    expect(
      backInServiceErrors({
        ...base,
        linkedKitItems: ["stain-item"],
        kitChecks: [{ itemId: "stain-item", at: kla("2026-10-11 17:00"), outcome: "pass" }],
      }),
    ).toEqual([]);
  });

  it("EQ-2 marking down reports a hub problem for tests whose only in-service machine this is", () => {
    expect(
      testsLosingService("analyser-1", [
        { testCode: "test.urea_electrolytes", inServiceDeviceIds: ["analyser-1"] },
        { testCode: "test.lft", inServiceDeviceIds: ["analyser-1", "analyser-2"] },
        { testCode: "test.fbc", inServiceDeviceIds: ["haem-1"] },
      ]),
    ).toEqual(["test.urea_electrolytes"]);
  });

  it("EQ-3 back in service needs a repair and an accepted run after it for every linked component", () => {
    expect(backInServiceErrors(base)).toEqual([]);
    expect(backInServiceErrors({ ...base, logs: [log("repair", "2026-10-09 15:00")] })).toEqual([
      "no_repair",
    ]);
    expect(
      backInServiceErrors({
        ...base,
        runs: [
          { conceptId: "obs.sodium", runAt: kla("2026-10-11 14:00"), decision: "accepted" },
          { conceptId: "obs.potassium", runAt: kla("2026-10-11 16:00"), decision: "rejected" },
        ],
      }),
    ).toEqual(["no_accepted_run:obs.sodium", "no_accepted_run:obs.potassium"]);
    expect(downtimeMinutes(since, kla("2026-10-11 17:30"))).toBe(1950);
  });

  it("EQ-4 maintenance tasks are overdue by days or count; only 'required before use' blocks", () => {
    const now = kla("2026-10-13 10:00");
    const logs = [
      log("maintenance", "2026-10-12 08:00", { taskKey: "daily-clean" }),
      log("maintenance", "2026-10-08 08:00", { taskKey: "weekly-check" }),
      log("maintenance", "2026-10-13 08:00", { taskKey: "weekly-check", hospitalId: H2 }),
      log("calibration", "2026-06-01 08:00", { taskKey: "pipette-cal" }),
    ];
    const out = tasksDue({
      hospitalId: H1,
      deviceId: "analyser-1",
      schedules,
      logs,
      usesSince: new Map([["probe-change", 500]]),
      now,
      timeZone: TZ,
    });
    expect(out.map((t) => [t.key, t.overdue, t.blocks])).toEqual([
      ["daily-clean", true, true],
      ["weekly-check", false, false],
      ["probe-change", true, false],
      ["pipette-cal", false, false],
    ]);
  });

  it("EQ-5 calibration items fall due from their schedule", () => {
    const logs = [log("calibration", "2026-04-15 08:00", { taskKey: "pipette-cal" })];
    const out = tasksDue({
      hospitalId: H1,
      deviceId: "analyser-1",
      schedules,
      logs,
      now: kla("2026-10-13 10:00"),
      timeZone: TZ,
    });
    expect(out.find((t) => t.key === "pipette-cal")).toMatchObject({
      kind: "calibration",
      overdue: true,
      blocks: false,
    });
  });

  it("EQ-6 an out-of-range reading opens a nonconformity and suggests quarantine; missing readings are listed", () => {
    expect(temperatureReading(5, { min: 2, max: 8 }, ["lot-1"])).toEqual({
      inRange: true,
      openNonconformity: null,
      suggestQuarantine: [],
    });
    expect(temperatureReading(8, { min: 2, max: 8 }, ["lot-1"]).inRange).toBe(true);
    expect(temperatureReading(9.5, { min: 2, max: 8 }, ["lot-1", "lot-2"])).toEqual({
      inRange: false,
      openNonconformity: "temperature",
      suggestQuarantine: ["lot-1", "lot-2"],
    });
    const q = {
      hospitalId: H1,
      deviceId: "fridge-1",
      readingsPerDay: 2,
      day: "2026-10-13",
      timeZone: TZ,
    };
    const logs = [
      log("temperature", "2026-10-13 07:00", { deviceId: "fridge-1", value: 5 }),
      log("temperature", "2026-10-13 15:00", { deviceId: "fridge-1", value: 5, hospitalId: H2 }),
    ];
    expect(missingReadings({ ...q, logs, now: kla("2026-10-13 23:00") })).toEqual([]);
    expect(missingReadings({ ...q, logs, now: kla("2026-10-14 00:30") })).toEqual([
      kla("2026-10-14 00:00"),
    ]);
    expect(missingReadings({ ...q, hospitalId: H2, logs, now: kla("2026-10-14 00:30") })).toEqual([
      kla("2026-10-13 12:00"),
    ]);
  });
});
