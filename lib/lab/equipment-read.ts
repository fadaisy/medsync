import "server-only";

import type { DeviceSchedules, EquipmentLog } from "./equipment";
import type { EmrTx } from "@/lib/emr/db";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";

import {
  devices,
  hospitalDepartments,
  labBreakdowns,
  labEquipmentLogs,
  labQcRuns,
  labStockItems,
  labStockLots,
  testCatalogue,
} from "@/db/schema";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { missingReadings, tasksDue } from "./equipment";
import { EQUIPMENT_KINDS } from "./equipment-store";
import { menuToday } from "./one-menu-read";
import { analyteName } from "./qc-store";
import { dayOf } from "./stock";

/**
 * Equipment, read (Lab Phase 3 §5.7, EQ-1..EQ-6). One read per page: every machine with its state, open
 * breakdown and what doctors see now (the hub's own availability, through Phase 2's `menuToday`), maintenance
 * and calibration due (overdue informs; only "required before use" blocks), the latest temperature against its
 * range, and the readings not recorded today.
 */
const TZ = DEFAULT_TIME_ZONE;

export async function loadEquipment(tx: EmrTx, hospitalId: string, now: Date) {
  const devs = await tx
    .select({ d: devices, section: hospitalDepartments.name })
    .from(devices)
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, devices.sectionId))
    .where(and(eq(devices.hospitalId, hospitalId), inArray(devices.kind, [...EQUIPMENT_KINDS])))
    .orderBy(devices.model);
  const ids = devs.map((x) => x.d.id);
  if (!ids.length) return [];
  const [logs, open, runs, stored, tests, today] = await Promise.all([
    tx.select().from(labEquipmentLogs).where(inArray(labEquipmentLogs.deviceId, ids)),
    tx
      .select()
      .from(labBreakdowns)
      .where(and(inArray(labBreakdowns.deviceId, ids), isNull(labBreakdowns.backAt))),
    tx
      .select({
        deviceId: labQcRuns.deviceId,
        conceptId: labQcRuns.conceptId,
        runAt: labQcRuns.runAt,
        decision: labQcRuns.decision,
      })
      .from(labQcRuns)
      .where(inArray(labQcRuns.deviceId, ids)),
    tx
      .select({
        id: labStockLots.id,
        lot: labStockLots.lot,
        item: labStockItems.name,
        deviceId: labStockItems.storageDeviceId,
      })
      .from(labStockLots)
      .innerJoin(labStockItems, eq(labStockItems.id, labStockLots.itemId))
      .where(
        and(
          inArray(labStockItems.storageDeviceId, ids),
          notInArray(labStockLots.state, ["finished", "rejected", "quarantined"]),
        ),
      ),
    tx
      .select({ code: testCatalogue.code, display: testCatalogue.display })
      .from(testCatalogue)
      .where(isNull(testCatalogue.hospitalId)),
    menuToday(tx, hospitalId, now),
  ]);
  const testName = new Map(tests.map((t) => [t.code, t.display]));
  const day = dayOf(now, TZ);
  return devs.map(({ d, section }) => {
    const mine: EquipmentLog[] = logs
      .filter((l) => l.deviceId === d.id)
      .map((l) => ({
        hospitalId: l.hospitalId,
        deviceId: l.deviceId,
        kind: l.kind as EquipmentLog["kind"],
        taskKey: l.taskKey,
        value: l.value === null ? null : Number(l.value),
        doneAt: l.doneAt,
      }));
    const sched = d.schedules as Partial<DeviceSchedules>;
    const schedules: DeviceSchedules = {
      tasks: sched.tasks ?? [],
      temperature: sched.temperature ?? null,
    };
    const b = open.find((x) => x.deviceId === d.id) ?? null;
    const repair = b
      ? (mine
          .filter((l) => l.kind === "repair" && l.doneAt >= b.since)
          .sort((x, y) => y.doneAt.getTime() - x.doneAt.getTime())[0] ?? null)
      : null;
    const temps = logs
      .filter((l) => l.deviceId === d.id && l.kind === "temperature")
      .sort((x, y) => y.doneAt.getTime() - x.doneAt.getTime());
    return {
      id: d.id,
      kind: d.kind,
      model: d.model,
      serial: d.serial,
      section,
      sectionId: d.sectionId,
      state: d.state,
      details: d.details as Record<string, string | null>,
      linkedConcepts: d.linkedConcepts,
      linkedTests: d.linkedTests,
      schedules,
      breakdown: b
        ? {
            since: b.since,
            cause: b.cause,
            reportedTo: b.reportedTo,
            ticket: b.ticket,
            specimensToRefer: b.specimensToRefer,
            repairAt: repair?.doneAt ?? null,
            qc: d.linkedConcepts.map((c) => ({
              concept: c,
              name: analyteName(c),
              passed:
                !!repair &&
                runs.some(
                  (r) =>
                    r.deviceId === d.id &&
                    r.conceptId === c &&
                    r.runAt > repair.doneAt &&
                    r.decision !== "rejected",
                ),
            })),
          }
        : null,
      // EQ-2: what doctors see now for each linked test (the hub's availability, Phase 2 OM-2).
      doctorsSee: d.linkedTests.map((t) => {
        const a = today(t);
        return { test: testName.get(t) ?? t, state: a.state, words: a.words };
      }),
      tasks: tasksDue({ hospitalId, deviceId: d.id, schedules, logs: mine, now, timeZone: TZ }),
      temperature: schedules.temperature
        ? {
            range: schedules.temperature,
            latest: temps[0]
              ? {
                  value: Number(temps[0].value),
                  unit: temps[0].unit ?? "",
                  at: temps[0].doneAt,
                  inRange: temps[0].inRange,
                }
              : null,
            missing: missingReadings({
              hospitalId,
              deviceId: d.id,
              readingsPerDay: schedules.temperature.readingsPerDay,
              logs: mine,
              day,
              now,
              timeZone: TZ,
            }),
          }
        : null,
      stored: stored
        .filter((s) => s.deviceId === d.id)
        .map((s) => ({ id: s.id, lot: s.lot, item: s.item })),
    };
  });
}

export type EquipmentRow = Awaited<ReturnType<typeof loadEquipment>>[number];
