import "server-only";

import type { Competency, DeviceCheck, DeviceQcRule, DeviceTrigger } from "./bedside-quality";
import type { SignedConfig } from "./signed-config";
import type { LotState } from "./stock";
import type { EmrTx } from "@/lib/emr/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { fill, LAB3 } from "@/content/lab-phase-3";
import {
  devices,
  labCompetencies,
  labControlChecks,
  labEquipmentLogs,
  labLotsInUse,
  labStockLots,
  poctOperators,
  testCatalogue,
  users,
} from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import {
  bedsideQuality,
  competencyStatus,
  competencyValidTo,
  deviceCheckDue,
  evaluateDeviceCheck,
} from "./bedside-quality";
import { isOperator } from "./bedside-store";
import { loadConfigs } from "./catalogue-v2";
import { inForce } from "./signed-config";
import { dayOf, lotRefusal } from "./stock";

/**
 * Bedside quality on the database (Lab Phase 3 Step 8, §6.9 BQ-1..BQ-5; GATE A P6, P9, P14; D-LAB3-15, -16).
 * Device control checks are `lab_control_checks` rows with subject `device`; the accepted range per level is the
 * strip lot's `insert_ranges`, entered once by the lab from the vial (never typed by the operator); the rule is the
 * signed `device_qc_rule` for the device's test; competency is `lab_competencies` beside the Phase 2 grant, valid
 * for the signed `competency_validity` (the grace period at switch-on is signed data too). A failed check sets the
 * device `blocked` until a check passes; the server refuses a blocked device, a lapsed operator, and (by the rule
 * or a new strip lot, control vial or incident) a result before the check (Law 6).
 */

type Actor = { userId: string; hospitalId: string };
const TZ = DEFAULT_TIME_ZONE;
const invalid = (m: string) => new EmrWriteError("invalid", m);
const MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");
/** "2026-09-08" → "08 SEP 2026" (the design system's date). */
const fmtDay = (day: string) =>
  `${day.slice(8)} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
const fmtTime = (at: Date) =>
  at.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TZ,
  });

export type LotRanges = Record<string, { low: number; high: number }>;

async function testName(tx: EmrTx, code: string) {
  const [t] = await tx
    .select({ display: testCatalogue.display })
    .from(testCatalogue)
    .where(and(eq(testCatalogue.code, code), isNull(testCatalogue.hospitalId)));
  return t?.display ?? code;
}

/** The device checks, the newest control lot and the newest incident of these devices (one read each). */
async function deviceHistory(tx: EmrTx, hospitalId: string, deviceIds: readonly string[]) {
  if (!deviceIds.length) return { checks: [], controls: new Map(), incidents: new Map() };
  const [checks, inUse, logs] = await Promise.all([
    tx
      .select()
      .from(labControlChecks)
      .where(
        and(
          eq(labControlChecks.hospitalId, hospitalId),
          eq(labControlChecks.subject, "device"),
          inArray(labControlChecks.deviceId, [...deviceIds]),
        ),
      )
      .orderBy(desc(labControlChecks.at)),
    tx
      .select({ deviceId: labLotsInUse.deviceId, lotId: labLotsInUse.lotId })
      .from(labLotsInUse)
      .where(
        and(
          eq(labLotsInUse.hospitalId, hospitalId),
          eq(labLotsInUse.kind, "control"),
          inArray(labLotsInUse.deviceId, [...deviceIds]),
        ),
      )
      .orderBy(desc(labLotsInUse.fromAt)),
    tx
      .select({ deviceId: labEquipmentLogs.deviceId, at: labEquipmentLogs.doneAt })
      .from(labEquipmentLogs)
      .where(
        and(
          eq(labEquipmentLogs.hospitalId, hospitalId),
          inArray(labEquipmentLogs.kind, ["error", "drop"]),
          inArray(labEquipmentLogs.deviceId, [...deviceIds]),
        ),
      )
      .orderBy(desc(labEquipmentLogs.doneAt)),
  ]);
  const controls = new Map<string, string>();
  for (const r of inUse)
    if (r.deviceId && !controls.has(r.deviceId)) controls.set(r.deviceId, r.lotId);
  const incidents = new Map<string, Date>();
  for (const r of logs) if (!incidents.has(r.deviceId)) incidents.set(r.deviceId, r.at);
  return {
    checks: checks.map((c) => ({
      id: c.id,
      at: c.at,
      outcome: c.outcome as "pass" | "fail",
      check: {
        hospitalId: c.hospitalId,
        deviceId: c.deviceId!,
        stripLotId: c.lotId ?? "",
        controlVialLotId:
          (c.controls as { controlLotId?: string | null }[])[0]?.controlLotId ?? null,
        outcome: c.outcome as "pass" | "fail",
        at: c.at,
      } satisfies DeviceCheck,
    })),
    controls,
    incidents,
  };
}

async function competencies(tx: EmrTx, hospitalId: string, userIds: readonly string[]) {
  if (!userIds.length) return [];
  const rows = await tx
    .select()
    .from(labCompetencies)
    .where(
      and(
        eq(labCompetencies.hospitalId, hospitalId),
        inArray(labCompetencies.userId, [...userIds]),
      ),
    );
  return rows.map((r): Competency & { assessor: string | null; method: string[] } => ({
    hospitalId: r.hospitalId,
    userId: r.userId,
    testCode: r.testCode,
    assessedOn: r.assessedOn,
    validTo: r.validTo,
    grandfathered: r.grandfathered,
    revokedAt: r.revokedAt,
    assessor: r.assessor,
    method: r.method,
  }));
}

/** The newest competency row of a user for a test (the one `competencyStatus` reads). */
export const newestCompetency = <T extends Competency>(
  rows: readonly T[],
  userId: string,
  test: string,
) =>
  rows
    .filter((r) => r.userId === userId && r.testCode === test)
    .sort((a, b) => b.assessedOn.localeCompare(a.assessedOn))[0] ?? null;

/**
 * BQ-1..BQ-4 for devices at `at`: the rule in force for each device's test, the triggers outstanding (with the
 * strip lot when given), the last failure, and the user's competency per test. One read per table.
 */
export async function deviceStatus(
  tx: EmrTx,
  hospitalId: string,
  input: {
    userId: string;
    devices: { id: string; testCode: string | null; stripLotId?: string | null }[];
  },
  at: Date,
) {
  const ids = input.devices.map((d) => d.id);
  const [configs, hist, comps] = await Promise.all([
    loadConfigs(tx, hospitalId),
    deviceHistory(tx, hospitalId, ids),
    competencies(tx, hospitalId, [input.userId]),
  ]);
  return new Map(
    input.devices.map((d) => {
      const rule = d.testCode
        ? ((inForce(configs, "device_qc_rule", d.testCode, at)?.payload as
            | DeviceQcRule
            | undefined) ?? null)
        : null;
      const mine = hist.checks.filter((c) => c.check.deviceId === d.id);
      // A check on any strip lot satisfies the daily trigger; the strip-lot trigger is per lot (BQ-1).
      const due: DeviceTrigger[] = rule
        ? deviceCheckDue({
            rule,
            hospitalId,
            deviceId: d.id,
            stripLotId:
              d.stripLotId ?? mine.find((c) => c.outcome === "pass")?.check.stripLotId ?? "",
            controlVialLotId: hist.controls.get(d.id) ?? null,
            lastIncidentAt: hist.incidents.get(d.id) ?? null,
            checks: mine.map((c) => c.check),
            at,
            timeZone: TZ,
          })
        : [];
      const lastFail = mine.find((c) => c.outcome === "fail") ?? null;
      const competency = d.testCode
        ? competencyStatus(comps, {
            hospitalId,
            userId: input.userId,
            testCode: d.testCode,
            at,
            timeZone: TZ,
          })
        : "none";
      return [
        d.id,
        {
          rule,
          due,
          lastCheck: mine[0] ?? null,
          /** Strip lots with a passing check on this device (a new lot needs one, BQ-1). */
          checkedLots: new Set(
            mine.filter((c) => c.outcome === "pass").map((c) => c.check.stripLotId),
          ),
          lastFailAt: lastFail?.at ?? null,
          controlLotId: hist.controls.get(d.id) ?? null,
          competency,
          competencyRow: d.testCode ? newestCompetency(comps, input.userId, d.testCode) : null,
        },
      ] as const;
    }),
  );
}

/**
 * The bedside result's gate and snapshot (BQ-2..BQ-5), called by `recordBedsideResult` with labPoctQuality on:
 * refuses a blocked device, a lapsed operator, and a check the rule or a new strip lot requires; returns what the
 * result records (`bedsideQuality` in each observation's context).
 */
export async function bedsideGate(
  tx: EmrTx,
  a: Actor,
  input: {
    deviceId: string;
    deviceModel: string;
    deviceState: string;
    testCode: string;
    stripLotId: string;
  },
  at: Date,
) {
  const s = (
    await deviceStatus(
      tx,
      a.hospitalId,
      {
        userId: a.userId,
        devices: [{ id: input.deviceId, testCode: input.testCode, stripLotId: input.stripLotId }],
      },
      at,
    )
  ).get(input.deviceId)!;
  const q = bedsideQuality({
    deviceState: input.deviceState,
    rule: s.rule,
    due: s.due,
    competency: s.competency,
  });
  // A stopped device first, then who may record, then the check: an operator who may not record cannot run it.
  const first = (
    ["device_blocked", "competency_not_valid", "control_check_required"] as const
  ).find((e) => q.errors.includes(e));
  if (first === "device_blocked")
    throw invalid(
      fill(LAB3.deviceBlocked, {
        Device: input.deviceModel,
        time: s.lastFailAt ? fmtTime(s.lastFailAt) : "its last check",
      }),
    );
  if (first === "control_check_required") throw invalid(LAB3.deviceCheckRequired);
  if (first === "competency_not_valid") {
    const test = await testName(tx, input.testCode);
    throw new EmrWriteError(
      "forbidden",
      s.competency === "lapsed" && s.competencyRow
        ? fill(LAB3.competencyLapsed, { test, date: fmtDay(s.competencyRow.validTo) })
        : fill(LAB3.competencyNone, { test }),
    );
  }
  return {
    notice: q.notice,
    snapshot: { ...q.snapshot, checkId: s.lastCheck?.outcome === "pass" ? s.lastCheck.id : null },
  };
}

/* ─── BQ-1, BQ-2: a device check (the operator) ───────────────────────── */

export async function recordDeviceCheck(
  tx: EmrTx,
  a: Actor,
  input: {
    deviceId: string;
    stripLotId: string;
    trigger: DeviceTrigger;
    observed: Record<string, number>;
    clientKey: string;
  },
  now: Date,
): Promise<{ id: string; outcome: "pass" | "fail" }> {
  const [dup] = await tx
    .select({ id: labControlChecks.id, outcome: labControlChecks.outcome })
    .from(labControlChecks)
    .where(eq(labControlChecks.clientKey, input.clientKey));
  if (dup) return { id: dup.id, outcome: dup.outcome as "pass" | "fail" };
  const [d] = await tx
    .select()
    .from(devices)
    .where(and(eq(devices.id, input.deviceId), eq(devices.hospitalId, a.hospitalId)));
  if (!d || !d.testCode)
    throw new EmrWriteError("not_found", "Choose a registered bedside device.");
  if (d.state !== "in_use" && d.state !== "blocked")
    throw invalid("This device is not in use: the laboratory lead verifies it first.");
  if (!(await isOperator(tx, a.hospitalId, a.userId)))
    throw new EmrWriteError(
      "forbidden",
      "Only people the laboratory lead has granted bedside testing can record it.",
    );
  const s = (
    await deviceStatus(
      tx,
      a.hospitalId,
      { userId: a.userId, devices: [{ id: d.id, testCode: d.testCode }] },
      now,
    )
  ).get(d.id)!;
  if (s.competency !== "valid" && s.competency !== "grace") {
    const test = await testName(tx, d.testCode);
    throw new EmrWriteError(
      "forbidden",
      s.competency === "lapsed" && s.competencyRow
        ? fill(LAB3.competencyLapsed, { test, date: fmtDay(s.competencyRow.validTo) })
        : fill(LAB3.competencyNone, { test }),
    );
  }
  if (!s.rule)
    throw new EmrWriteError(
      "config",
      "This test has no signed device control rule. The laboratory lead sets one.",
    );
  const [lot] = await tx
    .select({
      id: labStockLots.id,
      itemId: labStockLots.itemId,
      lot: labStockLots.lot,
      state: labStockLots.state,
      useBy: labStockLots.useBy,
      ranges: labStockLots.insertRanges,
    })
    .from(labStockLots)
    .innerJoin(
      labLotsInUse,
      and(eq(labLotsInUse.lotId, labStockLots.id), eq(labLotsInUse.deviceId, d.id)),
    )
    .where(and(eq(labStockLots.id, input.stripLotId), eq(labStockLots.hospitalId, a.hospitalId)))
    .limit(1);
  if (!lot || lotRefusal({ state: lot.state as LotState, useBy: lot.useBy }, now, TZ))
    throw invalid("Choose a current strip lot for this device.");
  const ev = evaluateDeviceCheck({
    rule: s.rule,
    lotRanges: lot.ranges as LotRanges | null,
    observed: input.observed,
  });
  if (!ev.ok)
    throw new EmrWriteError(
      "config",
      `The laboratory has not entered the accepted ranges for strip lot ${lot.lot}. Ask the laboratory.`,
    );
  const ranges = lot.ranges as LotRanges;
  const [row] = await tx
    .insert(labControlChecks)
    .values({
      hospitalId: a.hospitalId,
      subject: "device",
      itemId: lot.itemId,
      lotId: lot.id,
      deviceId: d.id,
      trigger: input.trigger,
      controls: ev.levels.map((l) => ({
        name: l.level,
        expected: ranges[l.level],
        observed: input.observed[l.level] ?? null,
        pass: l.pass,
        controlLotId: s.controlLotId,
      })),
      outcome: ev.outcome,
      operator: a.userId,
      at: now,
      clientKey: input.clientKey,
    })
    .returning({ id: labControlChecks.id });
  // BQ-2: a fail blocks the device; a pass unblocks it.
  if (ev.deviceState !== d.state)
    await tx
      .update(devices)
      .set({ state: ev.deviceState, updatedAt: now })
      .where(eq(devices.id, d.id));
  return { id: row!.id, outcome: ev.outcome };
}

/** BQ-1: a drop or an error message, recorded by the operator: a check is due before the next result. */
export async function recordDeviceError(
  tx: EmrTx,
  a: Actor,
  input: { deviceId: string; kind: "error" | "drop"; note: string | null; clientKey: string },
  now: Date,
) {
  const [d] = await tx
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, input.deviceId), eq(devices.hospitalId, a.hospitalId)));
  if (!d) throw new EmrWriteError("not_found", "Choose a registered bedside device.");
  if (!(await isOperator(tx, a.hospitalId, a.userId)))
    throw new EmrWriteError(
      "forbidden",
      "Only people the laboratory lead has granted bedside testing can record it.",
    );
  const [r] = await tx
    .insert(labEquipmentLogs)
    .values({
      hospitalId: a.hospitalId,
      deviceId: d.id,
      kind: input.kind,
      note: input.note,
      doneAt: now,
      actor: a.userId,
      at: now,
      clientKey: input.clientKey,
    })
    .onConflictDoNothing()
    .returning({ id: labEquipmentLogs.id });
  return r?.id ?? d.id;
}

/* ─── BQ-1: strip-lot ranges (the lab, from the vial; once) ─────────────── */

export async function setStripLotRanges(
  tx: EmrTx,
  a: Actor,
  input: { lotId: string; ranges: LotRanges },
) {
  const [lot] = await tx
    .select({ id: labStockLots.id, ranges: labStockLots.insertRanges })
    .from(labStockLots)
    .where(and(eq(labStockLots.id, input.lotId), eq(labStockLots.hospitalId, a.hospitalId)));
  if (!lot) throw new EmrWriteError("not_found", "That lot is not in this lab's stock.");
  if (lot.ranges)
    throw new EmrWriteError(
      "conflict",
      "The ranges for this lot are already entered. Checks were scored against them.",
    );
  for (const [level, r] of Object.entries(input.ranges))
    if (!(r.low < r.high)) throw invalid(`${level}: the low end must be below the high end.`);
  await tx
    .update(labStockLots)
    .set({ insertRanges: input.ranges })
    .where(eq(labStockLots.id, lot.id));
  return lot.id;
}

/* ─── BQ-4: competency (assessed by the lab) and the grace period at switch-on ─── */

async function validity(tx: EmrTx, hospitalId: string, testCode: string, now: Date) {
  const v = inForce(await loadConfigs(tx, hospitalId), "competency_validity", testCode, now);
  if (!v)
    throw new EmrWriteError(
      "config",
      "This test has no signed competency validity. The laboratory lead sets one.",
    );
  return v.payload;
}

export async function recordCompetency(
  tx: EmrTx,
  a: Actor,
  input: { userId: string; testCode: string; assessedOn: string; method: string[] },
  now: Date,
) {
  if (input.assessedOn > dayOf(now, TZ))
    throw invalid("The assessment date cannot be in the future.");
  const v = await validity(tx, a.hospitalId, input.testCode, now);
  const [r] = await tx
    .insert(labCompetencies)
    .values({
      hospitalId: a.hospitalId,
      userId: input.userId,
      testCode: input.testCode,
      assessedOn: input.assessedOn,
      assessor: a.userId,
      method: input.method,
      validTo: competencyValidTo(input.assessedOn, v.validDays),
    })
    .returning({ id: labCompetencies.id });
  return r!.id;
}

/**
 * D-LAB3-16: at switch-on, every live bedside operator with no assessment for the test is valid for the signed
 * grace period (grandfathered, no assessor), until assessed. Returns how many were added.
 */
export async function grandfatherOperators(
  tx: EmrTx,
  a: Actor,
  input: { testCode: string },
  now: Date,
): Promise<number> {
  const v = await validity(tx, a.hospitalId, input.testCode, now);
  const [ops, have] = await Promise.all([
    tx
      .select({ userId: poctOperators.userId })
      .from(poctOperators)
      .where(and(eq(poctOperators.hospitalId, a.hospitalId), isNull(poctOperators.revokedAt))),
    tx
      .select({ userId: labCompetencies.userId })
      .from(labCompetencies)
      .where(
        and(
          eq(labCompetencies.hospitalId, a.hospitalId),
          eq(labCompetencies.testCode, input.testCode),
        ),
      ),
  ]);
  const has = new Set(have.map((h) => h.userId));
  const today = dayOf(now, TZ);
  const rows = [...new Set(ops.map((o) => o.userId))]
    .filter((u) => !has.has(u))
    .map((userId) => ({
      hospitalId: a.hospitalId,
      userId,
      testCode: input.testCode,
      assessedOn: today,
      assessor: null,
      method: [],
      validTo: competencyValidTo(today, v.graceDays),
      grandfathered: true,
    }));
  if (rows.length) await tx.insert(labCompetencies).values(rows);
  return rows.length;
}

/* ─── Page reads ──────────────────────────────────────────────────────── */

const BEDSIDE = [
  "glucometer",
  "ketone_meter",
  "hba1c_analyser",
  "bp_monitor",
  "rdt_kit",
  "dipstick",
];

/** The strip (or kit) lots in use on these devices that a patient result may use today, with their ranges. */
async function usableLotsOn(
  tx: EmrTx,
  hospitalId: string,
  deviceIds: readonly string[],
  now: Date,
) {
  if (!deviceIds.length) return [];
  const rows = await tx
    .selectDistinct({
      deviceId: labLotsInUse.deviceId,
      id: labStockLots.id,
      lot: labStockLots.lot,
      useBy: labStockLots.useBy,
      state: labStockLots.state,
      ranges: labStockLots.insertRanges,
    })
    .from(labLotsInUse)
    .innerJoin(labStockLots, eq(labStockLots.id, labLotsInUse.lotId))
    .where(
      and(
        eq(labLotsInUse.hospitalId, hospitalId),
        inArray(labLotsInUse.kind, ["strip", "kit"]),
        inArray(labLotsInUse.deviceId, [...deviceIds]),
      ),
    );
  return rows
    .filter((l) => lotRefusal({ state: l.state as LotState, useBy: l.useBy }, now, TZ) === null)
    .sort((a, b) => (a.useBy ?? "9999").localeCompare(b.useBy ?? "9999"));
}

/** §5.10 (artboard 10): the nurse's device checks page: each bedside device, its check and her competency. */
export async function loadDeviceChecks(tx: EmrTx, hospitalId: string, userId: string, now: Date) {
  const devs = await tx
    .select({
      id: devices.id,
      model: devices.model,
      serial: devices.serial,
      testCode: devices.testCode,
      state: devices.state,
    })
    .from(devices)
    .where(
      and(
        eq(devices.hospitalId, hospitalId),
        inArray(devices.kind, BEDSIDE),
        inArray(devices.state, ["in_use", "blocked"]),
      ),
    )
    .orderBy(devices.model);
  const withTest = devs.filter((d): d is typeof d & { testCode: string } => !!d.testCode);
  const [status, lots, tests, controlLots] = await Promise.all([
    deviceStatus(tx, hospitalId, { userId, devices: withTest }, now),
    usableLotsOn(
      tx,
      hospitalId,
      withTest.map((d) => d.id),
      now,
    ),
    withTest.length
      ? tx
          .select({ code: testCatalogue.code, display: testCatalogue.display })
          .from(testCatalogue)
          .where(
            and(
              isNull(testCatalogue.hospitalId),
              inArray(testCatalogue.code, [...new Set(withTest.map((d) => d.testCode))]),
            ),
          )
      : [],
    tx
      .select({ id: labStockLots.id, lot: labStockLots.lot })
      .from(labStockLots)
      .where(eq(labStockLots.hospitalId, hospitalId)),
  ]);
  const name = new Map(tests.map((t) => [t.code, t.display]));
  const lotNo = new Map(controlLots.map((l) => [l.id, l.lot]));
  return withTest.map((d) => {
    const s = status.get(d.id)!;
    return {
      id: d.id,
      label: d.serial ? `${d.model} · ${d.serial}` : d.model,
      model: d.model,
      testCode: d.testCode,
      test: name.get(d.testCode) ?? d.testCode,
      blocked: d.state === "blocked",
      rule: s.rule,
      due: s.due,
      lastFailAt: s.lastFailAt,
      lastCheck: s.lastCheck ? { at: s.lastCheck.at, outcome: s.lastCheck.outcome } : null,
      controlLot: s.controlLotId ? (lotNo.get(s.controlLotId) ?? null) : null,
      lots: lots
        .filter((l) => l.deviceId === d.id)
        .map((l) => ({
          id: l.id,
          lot: l.lot,
          useBy: l.useBy,
          ranges: (l.ranges as LotRanges | null) ?? null,
          checked: s.checkedLots.has(l.id),
        })),
      competency: s.competency,
      validTo: s.competencyRow?.validTo ?? null,
      assessedOn: s.competencyRow?.assessedOn ?? null,
    };
  });
}

/**
 * The laboratory's bedside-quality set-up (§5.10's lab side): per bedside test, the device rule and the
 * competency validity (in force and the open draft), strip lots and their ranges, and every operator's
 * competency per test.
 */
export async function loadBedsideQuality(tx: EmrTx, hospitalId: string, now: Date) {
  const devs = await tx
    .select({
      id: devices.id,
      model: devices.model,
      testCode: devices.testCode,
      state: devices.state,
    })
    .from(devices)
    .where(and(eq(devices.hospitalId, hospitalId), inArray(devices.kind, BEDSIDE)))
    .orderBy(devices.model);
  const codes = [...new Set(devs.flatMap((d) => (d.testCode ? [d.testCode] : [])))];
  const [configs, tests, lotRows, ops, comps] = await Promise.all([
    loadConfigs(tx, hospitalId),
    codes.length
      ? tx
          .select({ code: testCatalogue.code, display: testCatalogue.display })
          .from(testCatalogue)
          .where(and(isNull(testCatalogue.hospitalId), inArray(testCatalogue.code, codes)))
      : [],
    devs.length
      ? tx
          .selectDistinct({
            id: labStockLots.id,
            lot: labStockLots.lot,
            useBy: labStockLots.useBy,
            state: labStockLots.state,
            ranges: labStockLots.insertRanges,
            testCode: devices.testCode,
          })
          .from(labLotsInUse)
          .innerJoin(labStockLots, eq(labStockLots.id, labLotsInUse.lotId))
          .innerJoin(devices, eq(devices.id, labLotsInUse.deviceId))
          .where(
            and(
              eq(labLotsInUse.hospitalId, hospitalId),
              inArray(labLotsInUse.kind, ["strip", "kit"]),
              inArray(
                labLotsInUse.deviceId,
                devs.map((d) => d.id),
              ),
            ),
          )
      : [],
    tx
      .selectDistinct({ userId: poctOperators.userId, name: users.fullName })
      .from(poctOperators)
      .leftJoin(users, eq(users.id, poctOperators.userId))
      .where(and(eq(poctOperators.hospitalId, hospitalId), isNull(poctOperators.revokedAt))),
    tx.select().from(labCompetencies).where(eq(labCompetencies.hospitalId, hospitalId)),
  ]);
  const name = new Map(tests.map((t) => [t.code, t.display]));
  const draft = <K extends "device_qc_rule" | "competency_validity">(kind: K, code: string) =>
    (configs
      .filter((c) => c.kind === kind && c.key === code && c.status === "draft")
      .sort((a, b) => b.version - a.version)[0] as SignedConfig<K> | undefined) ?? null;
  const rows = comps.map((r) => ({ ...r, revokedAt: r.revokedAt }));
  return {
    tests: codes.map((code) => ({
      code,
      display: name.get(code) ?? code,
      rule: inForce(configs, "device_qc_rule", code, now),
      ruleDraft: draft("device_qc_rule", code),
      validity: inForce(configs, "competency_validity", code, now),
      validityDraft: draft("competency_validity", code),
      devices: devs.filter((d) => d.testCode === code),
    })),
    lots: lotRows
      .filter((l) => l.state !== "finished" && l.state !== "rejected")
      .map((l) => ({
        ...l,
        ranges: (l.ranges as LotRanges | null) ?? null,
        test: l.testCode ? (name.get(l.testCode) ?? l.testCode) : null,
      })),
    competencies: ops.flatMap((o) =>
      codes.map((code) => {
        const row = newestCompetency(rows, o.userId, code);
        return {
          userId: o.userId,
          name: o.name ?? "Staff",
          testCode: code,
          test: name.get(code) ?? code,
          status: competencyStatus(rows, {
            hospitalId,
            userId: o.userId,
            testCode: code,
            at: now,
            timeZone: TZ,
          }),
          assessedOn: row?.assessedOn ?? null,
          validTo: row?.validTo ?? null,
          grandfathered: row?.grandfathered ?? false,
        };
      }),
    ),
  };
}
