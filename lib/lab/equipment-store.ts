import "server-only";

import type { DeviceSchedules } from "./equipment";
import type { EmrTx } from "@/lib/emr/db";
import { and, count, desc, eq, inArray, isNull, notExists, notInArray } from "drizzle-orm";

import { fill, LAB3 } from "@/content/lab-phase-3";
import {
  devices,
  diagnosticReports,
  encounterOrders,
  labBreakdowns,
  labEquipmentLogs,
  labQcRuns,
  labStockItems,
  labStockLots,
  labTestServices,
  specimenEvents,
  specimens,
  testCatalogue,
} from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import {
  backInServiceErrors,
  downtimeMinutes,
  temperatureReading,
  testsLosingService,
} from "./equipment";
import { openAutomaticNc } from "./nc-store";

/**
 * Equipment on the database (Lab Phase 3 Step 5, §6.4; GATE A P2, P3, §5.5). The machine record is `devices`
 * (widened by 0113); up and down reach ordering only through the hub's own action (Law 2): `markDown` calls
 * `ha-services-hub` `report_problem` and `markBackInService` its `resolve_problem`, through the caller passed in
 * (the action passes `callEdge` with the user's session, so the hub's own head check applies; tests pass a fake
 * that writes what the hub writes). Logs are append-only; a breakdown is closed once.
 */

type Actor = { userId: string; hospitalId: string };
export type HubCall = (
  body: Record<string, unknown>,
) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;

const invalid = (m: string) => new EmrWriteError("invalid", m);

/** 0113: the lab equipment kinds (the rest of `devices` is bedside, 0110). */
export const EQUIPMENT_KINDS = [
  "analyser",
  "centrifuge",
  "fridge",
  "freezer",
  "incubator",
  "water_bath",
  "microscope",
  "pipette",
  "thermometer",
  "timer",
  "safety_cabinet",
  "other",
] as const;

async function deviceOf(tx: EmrTx, a: Actor, deviceId: string) {
  const [d] = await tx
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.hospitalId, a.hospitalId)));
  if (!d) throw new EmrWriteError("not_found", "That equipment is not at this hospital.");
  return d;
}

/* ─── The register (EQ-1) ──────────────────────────────────────────── */

export interface EquipmentInput {
  id?: string;
  kind: (typeof EQUIPMENT_KINDS)[number];
  model: string;
  serial: string | null;
  sectionId: string | null;
  details: {
    location?: string | null;
    provider?: string | null;
    contact?: string | null;
    installedOn?: string | null;
  };
  linkedConcepts: string[];
  linkedTests: string[];
}

export async function saveEquipment(tx: EmrTx, a: Actor, input: EquipmentInput, now: Date) {
  const v = {
    kind: input.kind,
    model: input.model,
    serial: input.serial,
    sectionId: input.sectionId,
    details: input.details,
    linkedConcepts: input.linkedConcepts,
    linkedTests: input.linkedTests,
    updatedAt: now,
  };
  if (input.id) {
    await deviceOf(tx, a, input.id);
    await tx.update(devices).set(v).where(eq(devices.id, input.id));
    return input.id;
  }
  const [d] = await tx
    .insert(devices)
    // 0110's devices_verified: a machine in service names who put it there; registering it is that act.
    .values({
      hospitalId: a.hospitalId,
      ...v,
      state: "in_use",
      verifiedBy: a.userId,
      verifiedAt: now,
      verificationNote: "Registered in service by the laboratory lead.",
    })
    .returning({ id: devices.id });
  return d!.id;
}

/** EQ-4, EQ-5, EQ-6: tasks, calibration items and the temperature range (operational, the lead's). */
export async function saveSchedule(
  tx: EmrTx,
  a: Actor,
  input: { deviceId: string; schedules: DeviceSchedules },
  now: Date,
) {
  await deviceOf(tx, a, input.deviceId);
  await tx
    .update(devices)
    .set({ schedules: input.schedules, updatedAt: now })
    .where(eq(devices.id, input.deviceId));
}

/* ─── Down and back (EQ-2, EQ-3) ───────────────────────────────────── */

/**
 * EQ-2, S11: the hub tests whose only in-service machine is this one, as the hub's subjects (the offering code
 * each test is linked to, Phase 2's lab_test_services). A test with no link has nothing in the hub to set.
 */
async function hubSubjects(tx: EmrTx, a: Actor, device: typeof devices.$inferSelect) {
  if (!device.linkedTests.length) return { tests: [] as string[], codes: [] as string[] };
  const peers = await tx
    .select({ id: devices.id, tests: devices.linkedTests })
    .from(devices)
    .where(
      and(
        eq(devices.hospitalId, a.hospitalId),
        eq(devices.state, "in_use"),
        inArray(devices.kind, [...EQUIPMENT_KINDS]),
      ),
    );
  const tests = testsLosingService(
    device.id,
    device.linkedTests.map((t) => ({
      testCode: t,
      inServiceDeviceIds: peers.filter((p) => p.tests.includes(t)).map((p) => p.id),
    })),
  );
  const links = tests.length
    ? await tx
        .select({ code: labTestServices.offeringCode })
        .from(labTestServices)
        .where(
          and(
            eq(labTestServices.hospitalId, a.hospitalId),
            inArray(labTestServices.testCode, tests),
          ),
        )
    : [];
  return { tests, codes: [...new Set(links.map((l) => l.code))] };
}

/** "Specimens moved to To refer": received, not yet released, for the tests that lost service. */
async function specimensToRefer(tx: EmrTx, a: Actor, tests: readonly string[]) {
  if (!tests.length) return 0;
  const [{ n }] = (await tx
    .select({ n: count(encounterOrders.id) })
    .from(encounterOrders)
    .innerJoin(testCatalogue, eq(testCatalogue.id, encounterOrders.testId))
    .innerJoin(specimens, eq(specimens.orderId, encounterOrders.id))
    .innerJoin(
      specimenEvents,
      and(eq(specimenEvents.specimenId, specimens.id), eq(specimenEvents.kind, "received")),
    )
    .where(
      and(
        eq(encounterOrders.hospitalId, a.hospitalId),
        inArray(testCatalogue.code, [...tests]),
        notExists(
          tx
            .select({ id: diagnosticReports.id })
            .from(diagnosticReports)
            .where(
              and(
                eq(diagnosticReports.orderId, encounterOrders.id),
                inArray(diagnosticReports.status, ["final", "amended", "corrected"]),
              ),
            ),
        ),
      ),
    )) as [{ n: number }];
  return Number(n);
}

/**
 * EQ-2, S11: mark a machine down. The hub problems are reported first (their ids are part of the breakdown
 * record, which is written once); if anything after that fails, they are resolved again so the hub never says
 * "down" for a machine the lab did not mark down.
 */
export async function markDown(
  tx: EmrTx,
  a: Actor,
  input: {
    deviceId: string;
    since: Date;
    cause: string;
    reportedTo: string | null;
    ticket: string | null;
  },
  hub: HubCall,
  now: Date,
): Promise<string> {
  const d = await deviceOf(tx, a, input.deviceId);
  if (d.state !== "in_use") throw new EmrWriteError("conflict", "This machine is not in service.");
  if (input.since > now) throw invalid("The time it went down cannot be in the future.");
  const { tests, codes } = await hubSubjects(tx, a, d);
  const problems: string[] = [];
  const undo = () =>
    Promise.all(
      problems.map((id) => hub({ op: "resolve_problem", problem_id: id }).catch(() => null)),
    );
  try {
    for (const code of codes) {
      const r = await hub({
        op: "report_problem",
        subject_kind: "test",
        subject_ref: code,
        state: "unavailable",
        reason_code: "equipment_down",
        note: `${d.model}: ${input.cause}`.slice(0, 280),
        reason: `Marked down in the laboratory: ${d.model}`,
      });
      if (!r.ok) throw new EmrWriteError("conflict", `The services hub refused: ${r.error}`);
      problems.push((r.data as { problem_id: string }).problem_id);
    }
    const [b] = await tx
      .insert(labBreakdowns)
      .values({
        hospitalId: a.hospitalId,
        deviceId: d.id,
        since: input.since,
        cause: input.cause,
        reportedTo: input.reportedTo,
        ticket: input.ticket,
        hubProblemIds: problems,
        specimensToRefer: await specimensToRefer(tx, a, tests),
      })
      .returning({ id: labBreakdowns.id });
    await tx.update(devices).set({ state: "down", updatedAt: now }).where(eq(devices.id, d.id));
    return b!.id;
  } catch (e) {
    await undo();
    throw e;
  }
}

/** EQ-3: a repair, an append-only log row. */
export async function recordLog(
  tx: EmrTx,
  a: Actor,
  input: {
    deviceId: string;
    kind: "maintenance" | "calibration" | "repair" | "error" | "drop";
    taskKey: string | null;
    doneAt: Date;
    note: string | null;
    filePath: string | null;
    clientKey: string;
  },
  now: Date,
): Promise<string> {
  const [again] = await tx
    .select({ id: labEquipmentLogs.id })
    .from(labEquipmentLogs)
    .where(eq(labEquipmentLogs.clientKey, input.clientKey));
  if (again) return again.id;
  await deviceOf(tx, a, input.deviceId);
  if (input.doneAt > now) throw invalid("The time done cannot be in the future.");
  const [r] = await tx
    .insert(labEquipmentLogs)
    .values({
      hospitalId: a.hospitalId,
      deviceId: input.deviceId,
      kind: input.kind,
      taskKey: input.taskKey,
      note: input.note,
      filePath: input.filePath,
      doneAt: input.doneAt,
      actor: a.userId,
      at: now,
      clientKey: input.clientKey,
    })
    .returning({ id: labEquipmentLogs.id });
  return r!.id;
}

const ERR_WORDS = (e: string) =>
  e === "no_repair"
    ? "Record the repair first."
    : e.startsWith("no_accepted_run:")
      ? `QC has not passed on ${e.slice(16)} since the repair.`
      : `The control check has not passed on ${e.slice(17)} since the repair.`;

/**
 * EQ-3, S12: back in service only with a repair recorded after the breakdown and an accepted QC run after the
 * repair for every linked component; then the hub's problems are resolved and the downtime is recorded.
 * ponytail: kit and stain checks join when a device carries linked kit items (none does yet).
 */
export async function markBackInService(
  tx: EmrTx,
  a: Actor,
  input: { deviceId: string },
  hub: HubCall,
  now: Date,
): Promise<string> {
  const d = await deviceOf(tx, a, input.deviceId);
  const [b] = await tx
    .select()
    .from(labBreakdowns)
    .where(and(eq(labBreakdowns.deviceId, d.id), isNull(labBreakdowns.backAt)));
  if (!b) throw new EmrWriteError("conflict", "This machine has no open breakdown.");
  const [logs, runs] = await Promise.all([
    tx
      .select()
      .from(labEquipmentLogs)
      .where(and(eq(labEquipmentLogs.deviceId, d.id), eq(labEquipmentLogs.kind, "repair")))
      .orderBy(desc(labEquipmentLogs.doneAt)),
    tx
      .select({
        conceptId: labQcRuns.conceptId,
        runAt: labQcRuns.runAt,
        decision: labQcRuns.decision,
      })
      .from(labQcRuns)
      .where(eq(labQcRuns.deviceId, d.id)),
  ]);
  const errors = backInServiceErrors({
    since: b.since,
    linkedConcepts: d.linkedConcepts,
    linkedKitItems: [],
    logs: logs.map((l) => ({ kind: "repair" as const, doneAt: l.doneAt })),
    runs: runs.map((r) => ({ ...r, decision: r.decision as "accepted" | "warning" | "rejected" })),
    kitChecks: [],
  });
  if (errors.length) throw invalid(errors.map(ERR_WORDS).join(" "));
  for (const id of b.hubProblemIds) {
    const r = await hub({
      op: "resolve_problem",
      problem_id: id,
      reason: `Back in service in the laboratory: ${d.model}`,
    });
    if (!r.ok) throw new EmrWriteError("conflict", `The services hub refused: ${r.error}`);
  }
  await tx
    .update(labBreakdowns)
    .set({
      repairLogId: logs.find((l) => l.doneAt >= b.since)!.id,
      backAt: now,
      backBy: a.userId,
      downtimeMinutes: downtimeMinutes(b.since, now),
    })
    .where(eq(labBreakdowns.id, b.id));
  await tx.update(devices).set({ state: "in_use", updatedAt: now }).where(eq(devices.id, d.id));
  return b.id;
}

/* ─── Temperature (EQ-6) ───────────────────────────────────────────── */

/**
 * EQ-6, S14: a reading is logged with whether it is in the item's range; out of range opens a nonconformity
 * (owner and in-app notice the lead) and returns the lots stored there with a Quarantine suggestion, never
 * quarantining them itself (D-LAB3-12). No range set: logged with "in range" unknown.
 */
export async function recordTemperature(
  tx: EmrTx,
  a: Actor,
  input: { deviceId: string; value: number; unit: string; doneAt: Date; clientKey: string },
  now: Date,
): Promise<{
  logId: string;
  ncId: string | null;
  suggestQuarantine: { id: string; lot: string }[];
}> {
  const [again] = await tx
    .select({ id: labEquipmentLogs.id })
    .from(labEquipmentLogs)
    .where(eq(labEquipmentLogs.clientKey, input.clientKey));
  if (again) return { logId: again.id, ncId: null, suggestQuarantine: [] };
  const d = await deviceOf(tx, a, input.deviceId);
  if (input.doneAt > now) throw invalid("The time read cannot be in the future.");
  const range = (d.schedules as Partial<DeviceSchedules>).temperature ?? null;
  const stored = range
    ? await tx
        .select({ id: labStockLots.id, lot: labStockLots.lot })
        .from(labStockLots)
        .innerJoin(labStockItems, eq(labStockItems.id, labStockLots.itemId))
        .where(
          and(
            eq(labStockItems.storageDeviceId, d.id),
            notInArray(labStockLots.state, ["finished", "rejected", "quarantined"]),
          ),
        )
    : [];
  const t = range
    ? temperatureReading(
        input.value,
        range,
        stored.map((s) => s.id),
      )
    : null;
  const [log] = await tx
    .insert(labEquipmentLogs)
    .values({
      hospitalId: a.hospitalId,
      deviceId: d.id,
      kind: "temperature",
      value: String(input.value),
      unit: input.unit,
      inRange: t?.inRange ?? null,
      doneAt: input.doneAt,
      actor: a.userId,
      at: now,
      clientKey: input.clientKey,
    })
    .returning({ id: labEquipmentLogs.id });
  if (!t?.openNonconformity || !range) return { logId: log!.id, ncId: null, suggestQuarantine: [] };
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Kampala",
  }).format(input.doneAt);
  const nc = await openAutomaticNc(
    tx,
    a.hospitalId,
    {
      source: "temperature",
      sourceRef: log!.id,
      deviceId: d.id,
      title: `${d.model}: temperature out of range`,
      whatHappened: fill(LAB3.temperatureOut, {
        Point: d.model,
        value: `${input.value} ${input.unit}`,
        time,
        range: `${range.min} to ${range.max} ${input.unit}`,
      }),
    },
    now,
  );
  return {
    logId: log!.id,
    ncId: nc.id,
    suggestQuarantine: stored.filter((s) => t.suggestQuarantine.includes(s.id)),
  };
}
