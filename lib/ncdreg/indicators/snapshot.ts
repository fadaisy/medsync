/**
 * Monthly snapshots (§6, F5, ADR 0213). The engine computes; the snapshot stores the result without
 * person ids. A snapshot computed from any synthetic person is marked synthetic and can never be
 * signed. A signed snapshot is immutable (a trigger refuses any update or delete): corrections made
 * afterwards appear in the next period.
 */
import "server-only";

import type { NcdContext } from "../context";
import type { IndicatorReport } from "./engine";
import { and, eq } from "drizzle-orm";

import { ncdIndicatorSnapshot } from "@/db/schema";
import { enabledConditions } from "../commands/shared";
import { authorize, fromDb, NcdError } from "../context";
import { withNcd } from "../db";
import { computeIndicators, withoutIds } from "./engine";
import { loadDataset } from "./load";

export async function enabledModules(ctx: NcdContext): Promise<Set<string>> {
  return withNcd(ctx, "app", (tx) => enabledConditions(tx, ctx), ctx.db);
}

export async function computeReport(
  ctx: NcdContext,
  month: string,
  o: { asOf?: string; dataCutoff?: string } = {},
): Promise<IndicatorReport> {
  const [ds, enabled] = await Promise.all([loadDataset(ctx), enabledModules(ctx)]);
  return computeIndicators(ds, {
    month,
    asOf: o.asOf,
    dataCutoff: o.dataCutoff,
    catalogue: ctx.catalogue,
    enabled,
  });
}

/** Compute and store (or refresh, while unsigned) the month's snapshot. */
export async function storeSnapshot(ctx: NcdContext, month: string, dataCutoff?: string) {
  authorize(ctx, "snapshot_compute");
  const ds = await loadDataset(ctx);
  const enabled = await enabledModules(ctx);
  const report = withoutIds(
    computeIndicators(ds, { month, dataCutoff, catalogue: ctx.catalogue, enabled }),
  );
  const synthetic = ds.persons.some((p) => p.isSynthetic);
  return withNcd(
    ctx,
    "app",
    async (tx) => {
      const where = and(
        eq(ncdIndicatorSnapshot.facilityId, ctx.facilityId),
        eq(ncdIndicatorSnapshot.month, `${month}-01`),
        eq(ncdIndicatorSnapshot.isSynthetic, synthetic),
      );
      const [prior] = await tx.select().from(ncdIndicatorSnapshot).where(where);
      if (prior?.signedAt) return prior; // signed: never recomputed
      const values = {
        definitionVersion: report.definitionVersion,
        results: report as unknown as Record<string, unknown>,
        computedAt: ctx.enteredAt,
        demoLoadId: synthetic ? ctx.demoLoadId : null,
      };
      if (prior) {
        const [u] = await tx
          .update(ncdIndicatorSnapshot)
          .set(values)
          .where(eq(ncdIndicatorSnapshot.id, prior.id))
          .returning();
        return u!;
      }
      const [i] = await tx
        .insert(ncdIndicatorSnapshot)
        .values({
          facilityId: ctx.facilityId,
          month: `${month}-01`,
          isSynthetic: synthetic,
          ...values,
        })
        .returning();
      return i!;
    },
    ctx.db,
  );
}

/** F5: the registry lead signs; signing locks the month. The database refuses it before go-live or with demo data on. */
export async function signSnapshot(ctx: NcdContext, snapshotId: string) {
  authorize(ctx, "report_sign");
  return withNcd(
    ctx,
    "app",
    async (tx) => {
      const [s] = await tx
        .select()
        .from(ncdIndicatorSnapshot)
        .where(eq(ncdIndicatorSnapshot.id, snapshotId));
      if (!s) throw new NcdError("not_found", "Snapshot not found.");
      if (s.signedAt) throw new NcdError("conflict", "Already signed.");
      const [u] = await tx
        .update(ncdIndicatorSnapshot)
        .set({ signedBy: ctx.userId, signedAt: ctx.enteredAt })
        .where(eq(ncdIndicatorSnapshot.id, snapshotId))
        .returning();
      return u!;
    },
    ctx.db,
  ).catch((e: unknown) => {
    throw fromDb(e);
  });
}
