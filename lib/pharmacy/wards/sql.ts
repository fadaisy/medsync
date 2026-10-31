import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { SQL } from "drizzle-orm";

import { PRW } from "@/content/pharmacy-rework-patients";

/** Raw rows from either driver (postgres-js returns an array, PGlite `{ rows }`). Shared by the P4 areas. */
export const q = async <T>(d: EmrDb | EmrTx, query: SQL): Promise<T[]> => {
  const r: unknown = await d.execute(query);
  return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);
};

/** A refusal raised by a 0268 guard, in words (the 0265 ones go through `databaseRefusal`). */
export function patientsRefusal(e: unknown): string | null {
  const msg = e instanceof Error ? `${e.message} ${String((e as { cause?: unknown }).cause ?? "")}` : String(e);
  if (msg.includes("exactly one dose")) return PRW.refused.dose;
  if (/pharmacy_epi: batch \S+ (expired|is recalled|is at VVM)/.test(msg))
    return PRW.refused.batch;
  if (msg.includes("vial is used up")) return PRW.refused.vial;
  if (msg.includes("opted out")) return PRW.refused.optedOut;
  return null;
}
