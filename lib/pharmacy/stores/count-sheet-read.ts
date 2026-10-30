import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import { cache } from "react";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { pharmacyBatches, pharmacyProducts } from "@/db/schema/pharmacy-dispensing";
import { pharmacyCountSheetLines, pharmacyCountSheets } from "@/db/schema/pharmacy-rework";
import { pharmacyLocations } from "@/db/schema/pharmacy-stores";
import { countBlockers, countDiffs } from "@/lib/pharmacy/derive/count";
import { balancesAt } from "./write";

/** The Count tab (rework PRD §6.4): open sheets and the places that can be counted; one sheet with its lines. */
const owner = () => db as unknown as EmrDb;

export const countTab = cache(async (hospitalId: string) => {
  const [sheets, places] = await Promise.all([
    owner()
      .select({
        id: pharmacyCountSheets.id,
        label: pharmacyCountSheets.label,
        status: pharmacyCountSheets.status,
        createdAt: pharmacyCountSheets.createdAt,
        place: pharmacyLocations.name,
      })
      .from(pharmacyCountSheets)
      .innerJoin(pharmacyLocations, eq(pharmacyLocations.id, pharmacyCountSheets.locationId))
      .where(eq(pharmacyCountSheets.hospitalId, hospitalId))
      .orderBy(desc(pharmacyCountSheets.createdAt))
      .limit(30),
    owner()
      .select({ id: pharmacyLocations.id, name: pharmacyLocations.name })
      .from(pharmacyLocations)
      .where(
        and(
          eq(pharmacyLocations.hospitalId, hospitalId),
          inArray(pharmacyLocations.kind, ["store", "dispensing_point", "quarantine"]),
          isNull(pharmacyLocations.archivedAt),
          isNull(pharmacyLocations.switchedOffAt),
        ),
      )
      .orderBy(asc(pharmacyLocations.name)),
  ]);
  return { sheets, places };
});

export const countSheet = cache(async (hospitalId: string, id: string) => {
  const [s] = await owner()
    .select()
    .from(pharmacyCountSheets)
    .where(and(eq(pharmacyCountSheets.id, id), eq(pharmacyCountSheets.hospitalId, hospitalId)));
  if (!s) return null;
  const lines = await owner()
    .select({
      batchId: pharmacyCountSheetLines.batchId,
      packSize: pharmacyCountSheetLines.packSize,
      countedPacks: pharmacyCountSheetLines.countedPacks,
      countedUnits: pharmacyCountSheetLines.countedUnits,
      reason: pharmacyCountSheetLines.reason,
      found: pharmacyCountSheetLines.found,
      product: pharmacyProducts.name,
      unit: pharmacyProducts.issueUnit,
      batchNumber: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
    })
    .from(pharmacyCountSheetLines)
    .innerJoin(pharmacyBatches, eq(pharmacyBatches.id, pharmacyCountSheetLines.batchId))
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyBatches.productId))
    .where(eq(pharmacyCountSheetLines.sheetId, id))
    .orderBy(asc(pharmacyProducts.name), asc(pharmacyBatches.expiry));
  // Blind: the record is read only once every line is counted, to ask a reason for each difference.
  const recorded = await balancesAt(owner(), s.locationId);
  const blockers = countBlockers(lines, recorded);
  const diffs = blockers.uncounted === 0 ? countDiffs(lines, recorded) : [];
  return { sheet: s, lines, blockers, diffs };
});
