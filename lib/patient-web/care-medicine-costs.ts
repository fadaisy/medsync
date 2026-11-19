import "server-only";

import type { Costs, SupplyPrice } from "./costs";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { pharmacySupplies, pharmacySupplyReversals } from "@/db/schema";
import { patientPricesLiveFor } from "@/lib/lab/feature";
import { medicineCosts } from "./costs";

/**
 * What the medicines a patient was given cost (ADR 0527), for the medicines page on Care: the price the pharmacy
 * recorded at hand-over, never today's price list. It prices only the medicines the page already lists (the
 * pharmacy's own patient list, with its gates), reads only this patient's supplies that stand (a reversed supply
 * is not owed), and only at hospitals where PATIENT_PRICES is on. Null: show nothing about cost.
 */
export async function loadMedicineCosts(
  userId: string,
  medicines: readonly { lineId: string; name: string }[],
): Promise<Costs | null> {
  if (!medicines.length) return null;
  const rows = await db
    .select({
      lineId: pharmacySupplies.prescriptionId,
      hospitalId: pharmacySupplies.hospitalId,
      quantity: pharmacySupplies.quantity,
      kind: pharmacySupplies.priceKind,
      price: pharmacySupplies.priceUgx,
    })
    .from(pharmacySupplies)
    .leftJoin(pharmacySupplyReversals, eq(pharmacySupplyReversals.supplyId, pharmacySupplies.id))
    .where(
      and(
        eq(pharmacySupplies.patientUserId, userId),
        inArray(
          pharmacySupplies.prescriptionId,
          medicines.map((m) => m.lineId),
        ),
        isNull(pharmacySupplyReversals.id),
      ),
    );
  const shown = rows.filter((r) => r.lineId && patientPricesLiveFor(r.hospitalId));
  if (!shown.length) return null;
  const supplies: SupplyPrice[] = shown.map((r) => ({
    lineId: r.lineId!,
    quantity: r.quantity,
    kind: r.kind ?? null,
    unitUgx: r.price === null ? null : Number(r.price),
  }));
  const priced = new Set(supplies.map((s) => s.lineId));
  return medicineCosts(
    medicines.filter((m) => priced.has(m.lineId)),
    supplies,
  );
}
