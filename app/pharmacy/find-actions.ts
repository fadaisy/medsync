"use server";

import type { FindHit, SupplyMatch } from "@/lib/pharmacy/workspace-v2/find";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { hospitalDepartments } from "@/db/schema/hospital-departments";
import {
  pharmacyBatches,
  pharmacyProducts,
  pharmacySupplies,
  pharmacySupplyReversals,
} from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyCounterparties,
  pharmacyDeliveries,
  pharmacyLocations,
} from "@/db/schema/pharmacy-stores";
import { prescriptions } from "@/db/schema/prescribing";
import { asClinicalReader } from "@/lib/emr/db";
import { identitiesFor } from "@/lib/emr/read/results";
import {
  batchRows,
  deliveryRows,
  prescriptionKey,
  suppliedPatientIds,
  suppliedRows,
} from "@/lib/pharmacy/workspace-v2/find";
import { hasTab, pharmacyV2 } from "./_lib/v2";
import { findByPatientNumber } from "./actions";

const Input = z.object({ q: z.string().trim().min(2).max(60) });
const BATCHES_MAX = 10;

/**
 * Find (board 9). A read: Zod, then the pharmacy scope (`pharmacyV2` runs `requirePharmacyScope`); every query is
 * at the viewer's hospital. The text travels in the request body, never the URL. Batches and deliveries match the
 * whole number, case aside; patients supplied from a batch are net of reversals (as recall-read `loadTraceBase`),
 * named only through `identitiesFor` (audited, "pharmacy_find").
 */
export async function pharmacyFindAction(
  input: unknown,
): Promise<{ ok: true; hit: FindHit } | { ok: false }> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false };
  const q = parsed.data.q;
  const v2 = await pharmacyV2();
  const scope = v2.scope;
  const h = scope.hospitalId;
  const Q = q.toUpperCase();
  const [found, read] = await Promise.all([
    findByPatientNumber({ patientNumber: q }),
    asClinicalReader(scope, async (tx) => {
      const batches = await tx
        .select({
          id: pharmacyBatches.id,
          batchNumber: pharmacyBatches.batchNumber,
          firstBatchNumber: pharmacyBatches.firstBatchNumber,
          expiry: pharmacyBatches.expiry,
          productName: pharmacyProducts.name,
          medicineId: pharmacyProducts.medicineId,
          locationName: pharmacyLocations.name,
          pointName: hospitalDepartments.name,
        })
        .from(pharmacyBatches)
        .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyBatches.productId))
        .leftJoin(pharmacyLocations, eq(pharmacyLocations.id, pharmacyBatches.locationId))
        .leftJoin(
          hospitalDepartments,
          eq(hospitalDepartments.id, pharmacyBatches.dispensingPointId),
        )
        .where(
          and(
            eq(pharmacyBatches.hospitalId, h),
            or(
              sql`upper(${pharmacyBatches.batchNumber}) = ${Q}`,
              sql`upper(${pharmacyBatches.firstBatchNumber}) = ${Q}`,
            ),
          ),
        )
        .orderBy(desc(pharmacyBatches.createdAt))
        .limit(BATCHES_MAX);
      const supplies = batches.length
        ? await tx
            .select({
              patientUserId: pharmacySupplies.patientUserId,
              suppliedAt: pharmacySupplies.suppliedAt,
              reversal: pharmacySupplyReversals.id,
              batchId: pharmacySupplies.batchId,
              drugName: prescriptions.drugName,
              placementId: prescriptions.placementId,
              encounterId: prescriptions.encounterId,
              prescriberUserId: prescriptions.prescriberUserId,
              createdAt: prescriptions.createdAt,
            })
            .from(pharmacySupplies)
            .leftJoin(
              pharmacySupplyReversals,
              eq(pharmacySupplyReversals.supplyId, pharmacySupplies.id),
            )
            .leftJoin(prescriptions, eq(prescriptions.id, pharmacySupplies.prescriptionId))
            .where(
              and(
                eq(pharmacySupplies.hospitalId, h),
                inArray(
                  pharmacySupplies.batchId,
                  batches.map((b) => b.id),
                ),
              ),
            )
            .orderBy(desc(pharmacySupplies.suppliedAt))
            .limit(200)
        : [];
      const deliveries = hasTab(v2, "store", "deliveries")
        ? await tx
            .select({
              id: pharmacyDeliveries.id,
              noteNumber: pharmacyDeliveries.noteNumber,
              supplier: pharmacyCounterparties.name,
              placeName: pharmacyLocations.name,
              arrivedAt: pharmacyDeliveries.arrivedAt,
            })
            .from(pharmacyDeliveries)
            .innerJoin(
              pharmacyCounterparties,
              eq(pharmacyCounterparties.id, pharmacyDeliveries.supplierId),
            )
            .innerJoin(pharmacyLocations, eq(pharmacyLocations.id, pharmacyDeliveries.locationId))
            .where(
              and(
                eq(pharmacyDeliveries.hospitalId, h),
                sql`upper(${pharmacyDeliveries.noteNumber}) = ${Q}`,
              ),
            )
            .orderBy(desc(pharmacyDeliveries.arrivedAt))
            .limit(10)
        : [];
      return { batches, supplies, deliveries };
    }),
  ]);

  const batchOf = new Map(read.batches.map((b) => [b.id, b]));
  const supplies: SupplyMatch[] = read.supplies.map((s) => {
    const b = batchOf.get(s.batchId ?? "");
    return {
      patientUserId: s.patientUserId,
      suppliedAt: s.suppliedAt,
      reversed: s.reversal !== null,
      medicine: s.drugName ?? b?.productName ?? "",
      medicineId: b?.medicineId ?? "",
      key:
        s.prescriberUserId && s.createdAt
          ? prescriptionKey({
              placementId: s.placementId,
              encounterId: s.encounterId,
              prescriberUserId: s.prescriberUserId,
              createdAt: s.createdAt,
            })
          : null,
    };
  });
  const ids = await identitiesFor(scope, suppliedPatientIds(supplies), "pharmacy_find");

  const rows: FindHit["rows"] = [];
  if (found.slip)
    rows.push({ group: "slip", label: Q, href: `/pharmacy/slip/${found.slip}`, mono: true });
  for (const r of found.rows) {
    const who = found.identities[r.patientUserId];
    rows.push({
      group: "prescription",
      label: r.medicines.join(", "),
      sub: [who?.name, who?.mrn, r.state].filter(Boolean).join(" · "),
      href: `/pharmacy/prescriptions/${encodeURIComponent(r.key)}`,
    });
  }
  rows.push(
    ...batchRows(
      read.batches.map((b) => ({ ...b, placeName: b.locationName ?? b.pointName ?? null })),
    ),
    ...suppliedRows(supplies, ids),
    ...deliveryRows(read.deliveries),
  );
  return { ok: true, hit: { rows } };
}
