import "server-only";

import type { EmrTx } from "@/lib/emr/db";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { ResultValueInput } from "@/lib/emr/write/results";
import { and, eq, isNull } from "drizzle-orm";

import { devices, poctLots, poctOperators, testCatalogue } from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { enterResults } from "@/lib/emr/write/results";
import { collectSpecimen } from "@/lib/emr/write/specimens";
import { bedsideErrors, glucoseConcept } from "./bedside";

/**
 * Bedside tests on the database (Lab Phase 2 §6.13; PC-1..PC-10; D-LAB2-09..-13; ADR 0259). A bedside result
 * is an order fulfilled at the bedside by its operator, in one transaction: the order (intent "bedside": no
 * label, never held for payment), the collection at the measured time, and the released result carrying its
 * device and lot. Units, ranges, schemes and flags run as for the lab, with the method "bedside" (Law 7).
 */

type Actor = { userId: string; hospitalId: string };
const ERR: Record<string, string> = {
  device_not_registered: "Choose a registered device.",
  device_not_in_use: "This device is not verified yet: the laboratory lead verifies it before use.",
  device_other_ward: "This device is registered to another ward.",
  device_other_test: "This device is registered for another test.",
  lot_not_for_device: "Choose a current lot for this device.",
  lot_expired: "This lot is past its use-by date. A result from an expired lot cannot be saved.",
  not_an_operator: "Only people the laboratory lead has granted bedside testing can record it.",
  measured_in_future: "The time measured cannot be in the future.",
  late_needs_reason: "Say why this is recorded more than a day later.",
};

export async function isOperator(tx: EmrTx, hospitalId: string, userId: string) {
  const [r] = await tx
    .select({ u: poctOperators.userId })
    .from(poctOperators)
    .where(
      and(
        eq(poctOperators.hospitalId, hospitalId),
        eq(poctOperators.userId, userId),
        isNull(poctOperators.revokedAt),
      ),
    );
  return !!r;
}

export interface BedsideInput {
  patientUserId: string;
  encounterId: string;
  testCode: string;
  deviceId: string;
  lotId: string;
  wardId: string | null;
  measuredAt: Date;
  lateReason?: string;
  /** PC-7: glucose only. */
  fasting?: boolean;
  values: ResultValueInput[];
  clientKey: string;
}

export async function recordBedsideResult(ctx: WriteCtx, input: BedsideInput) {
  const { tx, actor, now } = ctx;
  const [device] = await tx
    .select()
    .from(devices)
    .where(and(eq(devices.id, input.deviceId), eq(devices.hospitalId, actor.hospitalId)));
  const [lot] = await tx.select().from(poctLots).where(eq(poctLots.id, input.lotId));
  const errors = bedsideErrors({
    device: device
      ? { state: device.state, wardId: device.wardId, testCode: device.testCode }
      : null,
    lot: lot ? { deviceMatches: lot.deviceId === input.deviceId, useBy: lot.useBy } : null,
    operatorGranted: await isOperator(tx, actor.hospitalId, actor.userId),
    wardId: input.wardId,
    testCode: input.testCode,
    measuredAt: input.measuredAt,
    now,
    lateReason: input.lateReason ?? null,
  });
  if (errors.length) throw new EmrWriteError("invalid", ERR[errors[0]!] ?? errors[0]!);
  const [test] = await tx
    .select({ id: testCatalogue.id })
    .from(testCatalogue)
    .where(and(eq(testCatalogue.code, input.testCode), isNull(testCatalogue.hospitalId)));
  if (!test) throw new EmrWriteError("not_found", "That bedside test is not on the menu.");
  const order = await placeOrders(
    ctx,
    {
      patientUserId: input.patientUserId,
      encounterId: input.encounterId,
      orders: [
        {
          clientKey: `${input.clientKey}:order`,
          testId: test.id,
          priority: "routine",
          reasonText: input.lateReason
            ? `Bedside test (late: ${input.lateReason})`
            : "Bedside test",
        },
      ],
    },
    { bedside: true },
  );
  await collectSpecimen(ctx, {
    patientUserId: input.patientUserId,
    orderId: order.id,
    identifiersConfirmed: true,
    collectedAt: input.measuredAt,
    ...(input.fasting !== undefined
      ? { fastingState: input.fasting ? "fasting" : "non_fasting" }
      : {}),
    clientKey: `${input.clientKey}:collect`,
  });
  // PC-7, CC-3: a glucose measured fasting is the fasting-glucose result.
  const values = input.values.map((v) =>
    v.conceptId === "obs.glucose" && input.fasting !== undefined
      ? { ...v, conceptId: glucoseConcept(input.fasting) }
      : v,
  );
  return enterResults(ctx, {
    patientUserId: input.patientUserId,
    orderId: order.id,
    status: "final",
    values,
    clientKey: input.clientKey,
    bedside: { deviceId: input.deviceId, lotId: input.lotId },
  });
}

/* ─── The register (§5.14; PC-10, D-LAB2-11, -12) ──────────────────── */

export async function registerDevice(
  tx: EmrTx,
  actor: Actor,
  input: {
    kind: string;
    model: string;
    serial: string | null;
    testCode: string;
    wardId: string | null;
  },
) {
  const [d] = await tx
    .insert(devices)
    .values({
      hospitalId: actor.hospitalId,
      kind: input.kind,
      model: input.model,
      serial: input.serial,
      testCode: input.testCode,
      wardId: input.wardId,
    })
    .returning({ id: devices.id });
  return d!.id;
}

/** PC-10: "in use" only with a recorded verification by the laboratory lead; "retired" ends it. */
export async function setDeviceState(
  tx: EmrTx,
  actor: Actor,
  input: { deviceId: string; state: "in_use" | "retired"; note: string | null },
  now: Date,
) {
  const [d] = await tx
    .select()
    .from(devices)
    .where(and(eq(devices.id, input.deviceId), eq(devices.hospitalId, actor.hospitalId)));
  if (!d) throw new EmrWriteError("not_found", "That device was not found.");
  if (input.state === "in_use" && (input.note?.trim().length ?? 0) < 3)
    throw new EmrWriteError("invalid", "Record how the device was verified.");
  await tx
    .update(devices)
    .set(
      input.state === "in_use"
        ? {
            state: "in_use",
            verifiedBy: actor.userId,
            verifiedAt: now,
            verificationNote: input.note!.trim(),
            updatedAt: now,
          }
        : { state: "retired", active: false, updatedAt: now },
    )
    .where(eq(devices.id, d.id));
}

export async function addLot(
  tx: EmrTx,
  actor: Actor,
  input: { deviceId: string; lot: string; useBy: string },
) {
  const [d] = await tx
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, input.deviceId), eq(devices.hospitalId, actor.hospitalId)));
  if (!d) throw new EmrWriteError("not_found", "That device was not found.");
  const [l] = await tx
    .insert(poctLots)
    .values({
      hospitalId: actor.hospitalId,
      deviceId: d.id,
      lot: input.lot.trim(),
      useBy: input.useBy,
      addedBy: actor.userId,
    })
    .returning({ id: poctLots.id });
  return l!.id;
}

/** D-LAB2-09: the laboratory lead grants and revokes bedside testing. */
export async function setOperator(
  tx: EmrTx,
  actor: Actor,
  input: { userId: string; granted: boolean },
  now: Date,
) {
  if (input.granted) {
    if (await isOperator(tx, actor.hospitalId, input.userId)) return;
    await tx
      .insert(poctOperators)
      .values({
        hospitalId: actor.hospitalId,
        userId: input.userId,
        grantedBy: actor.userId,
        grantedAt: now,
      });
    return;
  }
  await tx
    .update(poctOperators)
    .set({ revokedBy: actor.userId, revokedAt: now })
    .where(
      and(
        eq(poctOperators.hospitalId, actor.hospitalId),
        eq(poctOperators.userId, input.userId),
        isNull(poctOperators.revokedAt),
      ),
    );
}
