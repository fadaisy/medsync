import "server-only";

import type { EmrTx } from "@/lib/emr/db";
import { eq } from "drizzle-orm";

import { ucumUnits } from "@/db/schema/lab-safety";

/** The curated list's notation for a UCUM code (`umol/L` → `µmol/L`), or null if not on the list. */
export async function unitDisplay(tx: EmrTx, code: string): Promise<string | null> {
  const [u] = await tx
    .select({ display: ucumUnits.display })
    .from(ucumUnits)
    .where(eq(ucumUnits.code, code));
  return u?.display ?? null;
}
