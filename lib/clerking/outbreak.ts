import "server-only";

import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { eq, sql } from "drizzle-orm";

import { hospitalClinicalSettings } from "@/db/schema/clerking";
import { asClinicalWriter } from "@/lib/emr/db";

/**
 * Outbreak mode (D-CV-06, migration 0076): a hospital setting that turns on the outbreak VHF
 * screen. Fever plus an exposure is always on and does not depend on it. Turning it on needs a
 * reason; every change is audited (audit_log_changes, with the actor set by asClinicalWriter).
 */

export async function readOutbreakMode(tx: EmrTx, hospitalId: string): Promise<boolean> {
  const [row] = await tx
    .select({ on: hospitalClinicalSettings.outbreakMode })
    .from(hospitalClinicalSettings)
    .where(eq(hospitalClinicalSettings.hospitalId, hospitalId));
  return row?.on === true;
}

export async function writeOutbreakMode(
  scope: { userId: string; hospitalId: string },
  input: { on: boolean; reason: string },
  database?: EmrDb,
): Promise<void> {
  const reason = input.reason.trim();
  if (input.on && !reason) throw new Error("Give the reason for turning outbreak mode on.");
  await asClinicalWriter(
    scope,
    async (tx) => {
      await tx
        .insert(hospitalClinicalSettings)
        .values({
          hospitalId: scope.hospitalId,
          outbreakMode: input.on,
          outbreakReason: reason || null,
          updatedBy: scope.userId,
        })
        .onConflictDoUpdate({
          target: hospitalClinicalSettings.hospitalId,
          set: {
            outbreakMode: input.on,
            outbreakReason: reason || null,
            updatedBy: scope.userId,
            updatedAt: sql`now()`,
          },
        });
    },
    database,
  );
}
