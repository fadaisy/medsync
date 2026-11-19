import "server-only";

import type { LabPriceRow } from "./prices";
import type { EmrDb, EmrScope } from "@/lib/emr/db";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { labTestPrices } from "@/db/schema";
import { asClinicalWriter } from "@/lib/emr/db";
import { EmrWriteError } from "@/lib/emr/write/context";
import { loadCatalogueTests, loadMenuOfferings } from "./test-menu-read";

/*
 * Lab test prices, the database side (ADR 0527, migration 0305). The caller has checked who may edit (the hospital
 * admin or the laboratory lead) and that LAB_TEST_PRICES is on for the hospital. History is append-only: a new
 * price is a new row, and the audit trigger records it.
 */

const kampalaToday = (now: Date) => now.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });

/** Every price row of a hospital, for `chargeFor` and `quote` (lib/lab/prices.ts). */
export async function loadTestPrices(hospitalId: string, database: EmrDb = db as unknown as EmrDb) {
  const rows = await database
    .select({
      code: labTestPrices.code,
      priceUgx: labTestPrices.priceUgx,
      free: labTestPrices.free,
      fromDate: labTestPrices.fromDate,
      createdAt: labTestPrices.createdAt,
    })
    .from(labTestPrices)
    .where(eq(labTestPrices.hospitalId, hospitalId));
  return rows.map((r): LabPriceRow => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function setTestPrice(
  me: EmrScope,
  input: { code: string; priceUgx: number | null; free: boolean; fromDate: string },
  now: Date,
  database?: EmrDb,
) {
  const invalid = (m: string) => new EmrWriteError("invalid", m);
  if (input.free === (input.priceUgx !== null)) throw invalid("A price or free, not both.");
  if (input.priceUgx !== null && !(Number.isInteger(input.priceUgx) && input.priceUgx > 0))
    throw invalid("A price is whole shillings above zero.");
  // A price starts today or later: history is never rewritten.
  if (input.fromDate < kampalaToday(now)) throw invalid("A price cannot start in the past.");
  const tests = await loadCatalogueTests(me.hospitalId, true, database);
  if (!tests.some((t) => t.code === input.code))
    throw invalid("That test is not in the catalogue.");
  const menu = await loadMenuOfferings(me.hospitalId, new Set([input.code]), database);
  if (!menu.some((o) => o.code === input.code && o.where !== "not_offered"))
    throw invalid("Price a test that is on your menu.");
  await asClinicalWriter(
    me,
    async (tx) => {
      await tx.insert(labTestPrices).values({
        hospitalId: me.hospitalId,
        code: input.code,
        priceUgx: input.free ? null : input.priceUgx,
        free: input.free,
        fromDate: input.fromDate,
        setBy: me.userId,
      });
    },
    database,
  );
}
