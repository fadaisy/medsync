/**
 * Equipment: down, back in service, maintenance, calibration and temperature (Lab Phase 3 §6.4, EQ-1..EQ-6;
 * GATE A P2, P3, §3.2 0113, §5.5). Pure.
 *
 * The machine record is `devices` (widened); schedules, calibration items and the temperature range are the
 * device's `schedules` JSON (operational, set by the lead). Status reaches ordering only through the hub's own
 * action: this file says which hub problems to report, the action reports them (Law 2).
 */
import { addDays, dayOf, daysBetween, endOfDay } from "@/lib/lab/stock";

/** EQ-1: the device's `schedules` JSON. Intervals and ranges are the lead's operational settings. */
export interface DeviceSchedules {
  /** EQ-4 maintenance tasks and EQ-5 calibration items share one shape. */
  tasks: {
    key: string;
    kind: "maintenance" | "calibration";
    every: { days: number } | { count: number };
    requiredBeforeUse: boolean;
  }[];
  temperature: { min: number; max: number; readingsPerDay: number } | null;
}

/** A `lab_equipment_logs` row. */
export interface EquipmentLog {
  hospitalId: string;
  deviceId: string;
  kind: "maintenance" | "calibration" | "temperature" | "repair" | "error" | "drop";
  taskKey: string | null;
  value: number | null;
  doneAt: Date;
}

/**
 * EQ-2: the tests whose only in-service machine is this one, for which marking it down reports a hub problem
 * (`report_problem`, reason `equipment_down`), so `availabilityFor` turns them `down_referred`.
 */
export function testsLosingService(
  deviceId: string,
  links: readonly { testCode: string; inServiceDeviceIds: string[] }[],
): string[] {
  return links
    .filter((l) => l.inServiceDeviceIds.length === 1 && l.inServiceDeviceIds[0] === deviceId)
    .map((l) => l.testCode);
}

/**
 * EQ-3, EQ-1: back in service needs a repair record after the breakdown and, after that repair, an accepted QC run
 * for every linked quantitative component and a passing control check for every linked kit or stain item.
 */
export function backInServiceErrors(input: {
  since: Date;
  linkedConcepts: readonly string[];
  linkedKitItems: readonly string[];
  logs: readonly Pick<EquipmentLog, "kind" | "doneAt">[];
  runs: readonly {
    conceptId: string;
    runAt: Date;
    decision: "accepted" | "warning" | "rejected";
  }[];
  kitChecks: readonly { itemId: string; at: Date; outcome: "pass" | "fail" }[];
}): string[] {
  const repair = input.logs
    .filter((l) => l.kind === "repair" && l.doneAt >= input.since)
    .sort((a, b) => b.doneAt.getTime() - a.doneAt.getTime())[0];
  if (!repair) return ["no_repair"];
  const after = repair.doneAt;
  return [
    ...input.linkedConcepts
      .filter(
        (c) =>
          !input.runs.some(
            (r) => r.conceptId === c && r.runAt > after && r.decision !== "rejected",
          ),
      )
      .map((c) => `no_accepted_run:${c}`),
    ...input.linkedKitItems
      .filter(
        (i) => !input.kitChecks.some((k) => k.itemId === i && k.at > after && k.outcome === "pass"),
      )
      .map((i) => `no_passing_check:${i}`),
  ];
}

/** EQ-3: downtime recorded on return to service, in whole minutes. */
export const downtimeMinutes = (since: Date, backAt: Date) =>
  Math.max(0, Math.floor((backAt.getTime() - since.getTime()) / 60_000));

/**
 * EQ-4, EQ-5: each scheduled task's state. Days: overdue once the interval has passed since it was last done
 * (hospital-local days), or never done. Count: overdue once `usesSince` reaches the count. Overdue is amber;
 * only a "required before use" task blocks.
 */
export function tasksDue(input: {
  hospitalId: string;
  deviceId: string;
  schedules: DeviceSchedules;
  logs: readonly EquipmentLog[];
  usesSince?: ReadonlyMap<string, number>;
  now: Date;
  timeZone: string;
}): {
  key: string;
  kind: "maintenance" | "calibration";
  overdue: boolean;
  blocks: boolean;
  lastDone: Date | null;
}[] {
  const today = dayOf(input.now, input.timeZone);
  return input.schedules.tasks.map((t) => {
    const lastDone =
      input.logs
        .filter(
          (l) =>
            l.hospitalId === input.hospitalId &&
            l.deviceId === input.deviceId &&
            l.kind === t.kind &&
            l.taskKey === t.key &&
            l.doneAt <= input.now,
        )
        .map((l) => l.doneAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const overdue =
      "days" in t.every
        ? !lastDone || daysBetween(dayOf(lastDone, input.timeZone), today) >= t.every.days
        : (input.usesSince?.get(t.key) ?? 0) >= t.every.count;
    return { key: t.key, kind: t.kind, overdue, blocks: overdue && t.requiredBeforeUse, lastDone };
  });
}

/**
 * EQ-6: a reading outside the item's range opens a nonconformity, notifies the lead and lists the lots stored
 * there with a Quarantine suggestion (never automatic, D-LAB3-12).
 */
export function temperatureReading(
  value: number,
  range: { min: number; max: number },
  storedLotIds: readonly string[],
): { inRange: boolean; openNonconformity: "temperature" | null; suggestQuarantine: string[] } {
  const inRange = value >= range.min && value <= range.max;
  return {
    inRange,
    openNonconformity: inRange ? null : "temperature",
    suggestQuarantine: inRange ? [] : [...storedLotIds],
  };
}

/**
 * EQ-6: "Reading not recorded". The hospital-local day is split into `readingsPerDay` equal windows; every window
 * that has ended by `now` with no temperature reading in it is missing. Returns the windows' end times.
 */
export function missingReadings(input: {
  hospitalId: string;
  deviceId: string;
  readingsPerDay: number;
  logs: readonly EquipmentLog[];
  day: string;
  now: Date;
  timeZone: string;
}): Date[] {
  const start = endOfDay(addDays(input.day, -1), input.timeZone).getTime();
  const span = (endOfDay(input.day, input.timeZone).getTime() - start) / input.readingsPerDay;
  const readings = input.logs.filter(
    (l) =>
      l.hospitalId === input.hospitalId &&
      l.deviceId === input.deviceId &&
      l.kind === "temperature",
  );
  const out: Date[] = [];
  for (let i = 0; i < input.readingsPerDay; i++) {
    const from = start + i * span;
    const to = from + span;
    if (to > input.now.getTime()) break;
    if (!readings.some((r) => r.doneAt.getTime() >= from && r.doneAt.getTime() < to))
      out.push(new Date(to));
  }
  return out;
}
