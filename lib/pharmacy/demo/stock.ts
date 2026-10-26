import "server-only";

import type { DemoMedicine, DemoState, PointKey } from "./state";
import { sql } from "drizzle-orm";

import * as stock from "@/lib/pharmacy/stock/store";
import { bump, chiefActor, DAY, pharmacyActor, q, witness, write } from "./state";

/**
 * Section 3: the shelf at every point, received through the stock store 35 days ago (controlled medicines witnessed),
 * an opening count a day later, reorder levels at the busy points, one stock-out and one open request between points.
 */

const ORAL = new Set<DemoMedicine["unit"]>(["tablet", "capsule", "sachet", "inhaler", "bottle"]);
const BY_POINT: Partial<Record<PointKey, string[]>> = {
  paediatrics: ["amoxicillin", "artemether_lumefantrine", "artesunate", "oral_rehydration_salts", "zinc_sulfate",
    "paracetamol", "ceftriaxone", "gentamicin", "salbutamol", "phenobarbital", "diazepam", "albendazole",
    "ferrous_sulfate", "co_trimoxazole", "metronidazole", "glucose_50", "ringers_lactate"],
  maternity: ["oxytocin", "magnesium_sulfate", "ferrous_sulfate", "folic_acid", "paracetamol", "amoxicillin",
    "metronidazole", "ceftriaxone", "tranexamic_acid", "ringers_lactate", "sodium_chloride_0_9", "pethidine",
    "ibuprofen", "gentamicin"],
  art: ["tld", "dolutegravir", "co_trimoxazole", "fluconazole", "rhze_fdc", "paracetamol", "amitriptyline",
    "metronidazole", "azithromycin"],
  ncd: ["amlodipine", "enalapril", "losartan", "hydrochlorothiazide", "furosemide", "atorvastatin", "aspirin",
    "metformin", "glibenclamide", "insulin_isophane", "insulin_soluble", "salbutamol", "beclometasone", "phenytoin",
    "sodium_valproate", "carbamazepine", "amitriptyline", "omeprazole"],
};

/** Which medicines each point stocks. */
export function shelfAt(point: PointKey, all: DemoMedicine[]): DemoMedicine[] {
  const ids = BY_POINT[point];
  if (ids) return all.filter((m) => ids.includes(m.id));
  if (point === "inpatient") return all;
  if (point === "emergency") return all.filter((m) => !ORAL.has(m.unit) || ["paracetamol", "oral_rehydration_salts", "salbutamol"].includes(m.id));
  if (point === "private") return all.filter((m) => ORAL.has(m.unit) && !m.controlled).slice(0, 30);
  return all.filter((m) => ORAL.has(m.unit)); // opd
}

const quantityOf = (m: DemoMedicine, i: number) =>
  ({ tablet: 1000, capsule: 1000, sachet: 300, bottle: 120, inhaler: 40, vial: 120, ampoule: 150, bag: 200, tube: 60, pen: 30 })[m.unit] +
  (i % 5) * 50;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function stockSection(s: DemoState) {
  const received = new Date(s.now.getTime() - 35 * DAY);
  const products = new Map<string, string>();
  const witnessFor = async (actor: string) =>
    witness(s, actor, s.people.pharmacists.find((p) => p !== actor) ?? s.people.chief, "controlled_receipt");
  let i = 0;
  for (const point of Object.keys(s.points) as PointKey[]) {
    const actor = pharmacyActor(s, s.people.techs[Object.keys(s.points).indexOf(point)]!, "PHARMACY_TECH", point);
    for (const m of shelfAt(point, s.medicines)) {
      i += 1;
      let productId = products.get(m.id);
      if (!productId) {
        productId = (
          await write(s, actor, stock.ProductInput, stock.STOCK_NEED, stock.addProduct, {
            medicineId: m.id,
            name: m.product,
            issueUnit: m.unit,
            manufacturer: "Demo manufacturer",
          })
        ).id;
        products.set(m.id, productId);
        bump(s, "products");
      }
      // One batch for most; every third medicine has a second, older batch that expires within the 90-day look-ahead.
      const batches: string[] = [];
      const expiries = i % 3 === 0 ? [new Date(s.now.getTime() + (30 + (i % 50)) * DAY), new Date(s.now.getTime() + (420 + i) * DAY)] : [new Date(s.now.getTime() + (300 + i * 3) * DAY)];
      for (const [b, expiry] of expiries.entries()) {
        const w = m.controlled ? await witnessFor(actor.userId) : null;
        const r = await write(
          s,
          actor,
          stock.ReceiveInput,
          stock.STOCK_NEED,
          (ctx, input) => stock.receiveStock(ctx, input, w),
          {
            productId,
            batchNumber: `DEMO-${m.id.slice(0, 4).toUpperCase()}-${String(i).padStart(3, "0")}${b ? "B" : "A"}`,
            expiry: iso(expiry),
            quantity: b === 0 && expiries.length > 1 ? Math.round(quantityOf(m, i) / 4) : quantityOf(m, i),
            from: "supplier",
            deliveryRef: `Demo delivery ${String(1 + (i % 12)).padStart(2, "0")}`,
          },
          received,
        );
        if (!r.batchId) throw new Error("The demo receipt made no batch.");
        batches.push(r.batchId);
        bump(s, "batches");
      }
      const byPoint = s.stock.get(m.id) ?? new Map();
      byPoint.set(point, { productId, batches });
      s.stock.set(m.id, byPoint);
    }
  }

  // The opening count: every batch at every point, a day after receipt, matching what was received.
  for (const point of Object.keys(s.points) as PointKey[]) {
    // Controlled medicines are counted with a witness on the Controlled drugs page, not in a full count.
    const controlled = new Set(s.medicines.filter((m) => m.controlled).map((m) => m.id));
    const rows = (
      await q<{ id: string; medicine: string; balance: number }>(
        s,
        sql`SELECT b.id, p.medicine_id AS medicine, coalesce(sum(m.quantity), 0)::int AS balance FROM pharmacy_batches b
          JOIN pharmacy_products p ON p.id = b.product_id
          LEFT JOIN pharmacy_stock_movements m ON m.batch_id = b.id
          WHERE b.hospital_id = ${s.h} AND b.dispensing_point_id = ${s.points[point].id} GROUP BY b.id, p.medicine_id`,
      )
    ).filter((r) => !controlled.has(r.medicine));
    if (!rows.length) continue;
    const tech = s.people.techs[Object.keys(s.points).indexOf(point)]!;
    const actor = pharmacyActor(s, tech, "PHARMACY_TECH", point);
    await write(
      s,
      actor,
      stock.CountInput,
      stock.STOCK_NEED,
      stock.recordCount,
      { step: "count", medicineId: null, lines: rows.map((r) => ({ batchId: r.id, counted: r.balance })) },
      new Date(received.getTime() + DAY),
    );
    bump(s, "counts");
  }

  // Reorder levels where the queues are longest (the chief pharmacist manages them).
  for (const point of ["opd", "inpatient", "ncd"] as const)
    for (const m of shelfAt(point, s.medicines).slice(0, 25)) {
      await write(s, chiefActor(s, point), stock.LevelInput, stock.MANAGE_AT_POINT, stock.setReorderLevel, {
        medicineId: m.id,
        level: Math.round(quantityOf(m, 0) / 5),
      });
      bump(s, "reorder_levels");
    }

  // A stock-out at the main outpatient pharmacy (stock lost), and the NCD clinic asking the inpatient
  // pharmacy for a medicine it is short of.
  const gone = s.stock.get("artemether_lumefantrine")?.get("opd");
  if (gone)
    for (const batchId of gone.batches) {
      const [b] = await q<{ balance: number }>(
        s,
        sql`SELECT coalesce(sum(quantity), 0)::int AS balance FROM pharmacy_stock_movements WHERE batch_id = ${batchId}`,
      );
      if (b && b.balance > 0)
        await write(s, pharmacyActor(s, s.people.pharmacists[0]!, "PHARMACIST", "opd"), stock.AdjustInput, stock.STOCK_NEED, stock.adjustStock, {
          batchId,
          quantity: -b.balance,
          reasonCode: "lost",
          note: "Demo: not found on the shelf at the evening check.",
        }, new Date(s.now.getTime() - 2 * DAY));
      bump(s, "stockouts");
    }
  await write(s, pharmacyActor(s, s.people.pharmacists[5] ?? s.people.chief, "PHARMACIST", "ncd"), stock.RequestInput, stock.STOCK_NEED, stock.requestStock, {
    toPointId: s.points.inpatient.id,
    medicineId: "insulin_soluble",
    quantity: 20,
  });
  bump(s, "stock_requests");
}
