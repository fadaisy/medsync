import "server-only";

import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { CRITICAL_FLAGGING_NOTICE } from "@/content/lab";
import { CRITICALS_COPY_STATUS } from "@/content/lab-criticals";
import { db as appDb } from "@/db";
import { encounterOrders } from "@/db/schema/encounter";
import { downtimeDrills, labBriefings, labCutover } from "@/db/schema/lab-safety";
import { encounters } from "@/db/schema/scheduling";
import { EmrWriteError } from "@/lib/emr/write/context";
import { departmentsWithoutLevel1, testsWithoutUnit } from "./criticals/readiness";
import { signedTimes } from "./criticals/store";
import { canReverse, canSwitch, cutoverReadiness, legacyWritesAllowed } from "./cutover";

/**
 * One result path (Lab Phase 1 Step 8, §5.9 artboard 14; CO-1 to CO-5; ADR 0249). The hospital
 * admin requests the switch once all four conditions hold; a second admin approves it in one
 * audited transaction; the legacy result path then takes no writes for that hospital. Reversal is
 * a superadmin's request and another superadmin's approval, with a reason.
 */

type Actor = { userId: string; hospitalId: string };

/** CO-1: the four conditions, read now. */
export async function readinessFor(tx: EmrTx, hospitalId: string, now: Date) {
  const database = tx as unknown as EmrDb;
  const [[legacy], units, depts, times, [drills], [briefings]] = await Promise.all([
    // What the legacy worklist shows (lib/lab-tech/worklist.ts): any kind, found through the
    // encounter (legacy rows may carry no hospital_id), still ordered or collected.
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(encounterOrders)
      .innerJoin(encounters, eq(encounters.id, encounterOrders.encounterId))
      .where(
        and(
          eq(encounters.hospitalId, hospitalId),
          eq(encounterOrders.lifecycle, "legacy"),
          inArray(encounterOrders.status, ["ordered", "collected"]),
        ),
      ),
    testsWithoutUnit(hospitalId, now, database),
    departmentsWithoutLevel1(hospitalId, now, database),
    signedTimes(tx, hospitalId),
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(downtimeDrills)
      .where(and(eq(downtimeDrills.hospitalId, hospitalId), eq(downtimeDrills.workspace, "lab"))),
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(labBriefings)
      .where(eq(labBriefings.hospitalId, hospitalId)),
  ]);
  return cutoverReadiness({
    openLegacyItems: legacy?.n ?? 0,
    testsWithoutUnit: units.map((t) => t.display),
    noticeSigned: CRITICAL_FLAGGING_NOTICE.status === "signed",
    alertWordingSigned: CRITICALS_COPY_STATUS.status === "signed",
    responseTimesSigned: times !== null,
    departmentsWithoutLevel1: depts.map((d) => d.name),
    drills: drills?.n ?? 0,
    briefings: briefings?.n ?? 0,
  });
}

/** The live switch row for a hospital (requested or switched, not reversed), if any. */
export async function liveCutover(tx: EmrTx | EmrDb, hospitalId: string) {
  const [row] = await tx
    .select()
    .from(labCutover)
    .where(and(eq(labCutover.hospitalId, hospitalId), isNull(labCutover.reversedAt)))
    .orderBy(desc(labCutover.requestedAt))
    .limit(1);
  return row ?? null;
}

/** CO-4: the legacy path takes writes only where no live switch exists. */
export async function legacyWritesOpen(
  hospitalId: string,
  database: EmrDb = appDb as unknown as EmrDb,
): Promise<boolean> {
  return legacyWritesAllowed(await liveCutover(database, hospitalId));
}

export async function requestCutover(tx: EmrTx, actor: Actor, now: Date): Promise<string> {
  if (await liveCutover(tx, actor.hospitalId))
    throw new EmrWriteError("conflict", "A switch is already requested or made here.");
  const r = await readinessFor(tx, actor.hospitalId, now);
  if (!r.ready) throw new EmrWriteError("conflict", "All four conditions must be met first.");
  const [row] = await tx
    .insert(labCutover)
    .values({
      hospitalId: actor.hospitalId,
      conditions: r.conditions,
      requestedBy: actor.userId,
      requestedAt: now,
    })
    .returning({ id: labCutover.id });
  return row!.id;
}

/** CO-2: a second admin approves; the conditions are read again at that moment. One transaction. */
export async function approveCutover(tx: EmrTx, actor: Actor, cutoverId: string, now: Date) {
  const [row] = await tx
    .select()
    .from(labCutover)
    .where(and(eq(labCutover.id, cutoverId), eq(labCutover.hospitalId, actor.hospitalId)))
    .for("update");
  if (!row || row.reversedAt) throw new EmrWriteError("not_found", "That request was not found.");
  if (row.switchedAt) throw new EmrWriteError("conflict", "This hospital has already switched.");
  const decision = canSwitch(
    await readinessFor(tx, actor.hospitalId, now),
    row.requestedBy,
    actor.userId,
  );
  if (!decision.ok)
    throw new EmrWriteError(
      decision.reason === "same_person" ? "forbidden" : "conflict",
      decision.reason === "same_person"
        ? "You requested the switch: a second admin approves it."
        : "A condition is no longer met: see the list.",
    );
  await tx
    .update(labCutover)
    .set({ approvedBy: actor.userId, switchedAt: now })
    .where(eq(labCutover.id, row.id));
}

/** CO-5: a superadmin requests the reversal with a reason; a different superadmin approves it. */
export async function reverseCutover(
  tx: EmrTx,
  superadmin: { userId: string },
  input: { cutoverId: string; reason: string | null; approve: boolean },
  now: Date,
) {
  const [row] = await tx
    .select()
    .from(labCutover)
    .where(eq(labCutover.id, input.cutoverId))
    .for("update");
  if (!row || row.reversedAt) throw new EmrWriteError("not_found", "No live switch to reverse.");
  if (!input.approve) {
    if (row.reversedBy) throw new EmrWriteError("conflict", "A reversal is already requested.");
    const reason = input.reason?.trim() ?? "";
    if (reason.length < 10)
      throw new EmrWriteError("invalid", "Say in a sentence why the switch is reversed.");
    await tx
      .update(labCutover)
      .set({ reversedBy: superadmin.userId, reversalReason: reason })
      .where(eq(labCutover.id, row.id));
    return;
  }
  if (!row.reversedBy || !row.reversalReason)
    throw new EmrWriteError("conflict", "Request the reversal first.");
  const ok = canReverse({
    reversedBy: row.reversedBy,
    reversedByIsSuperadmin: true,
    approvedBy: superadmin.userId,
    approvedByIsSuperadmin: true,
    reason: row.reversalReason,
  });
  if (!ok.ok)
    throw new EmrWriteError("forbidden", "A second, different superadmin approves the reversal.");
  await tx
    .update(labCutover)
    .set({ reversalApprovedBy: superadmin.userId, reversedAt: now })
    .where(eq(labCutover.id, row.id));
}
