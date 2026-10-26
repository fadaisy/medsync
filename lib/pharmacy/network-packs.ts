import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { pharmacySignedSets } from "@/db/schema/pharmacy-dispensing";

/**
 * Phase 4's signed packs (Appendix D; kinds added by 0232), stored as Phase 2's are (`pharmacy_signed_sets`, signed by
 * two people or the CSO alone with the exception text). Kept apart from Phase 2's PACK_SCHEMAS so Phase 2's signed
 * wording is not touched. Nothing has a default: while a pack is unsigned the reader returns null and the engines do
 * Appendix D's "while unsigned" column.
 */

const days = (max: number) => z.number().int().min(0).max(max);
const drugIds = z.array(z.string().trim().min(2).max(80));

export const NETWORK_PACK_SCHEMAS = {
  repeat_rules: z
    .object({
      repeatList: drugIds.min(1),
      neverRepeat: drugIds,
      maxSupplies: z.number().int().min(1).max(99),
      maxPeriodDays: days(3660).min(1),
      minIntervalDays: days(3660).min(1),
      toleranceDays: days(60),
    })
    .refine((p) => p.toleranceDays < p.minIntervalDays, {
      message: "The tolerance is shorter than the minimum interval.",
    }),
  refill_timing: z.object({ requestWindowDays: days(90), lateWindowDays: days(365) }),
  hold_rules: z
    .object({
      holdDays: days(60).min(1),
      extensions: days(5),
      holdLongerMaxDays: days(120).min(1),
      missThreshold: z.number().int().min(1).max(10),
    })
    .refine((p) => p.holdLongerMaxDays >= p.holdDays, {
      message: "The hold-longer maximum is at least the hold days.",
    }),
  renewal_decline_reasons: z.object({
    items: z
      .array(
        z.object({
          code: z
            .string()
            .trim()
            .regex(/^[a-z0-9_]{2,60}$/),
          words: z.string().trim().min(1).max(200),
        }),
      )
      .min(1),
  }),
  routing_rules: z.object({
    routingList: drugIds,
    neverRouted: drugIds,
    responseWindowHours: z.number().int().min(1).max(168),
  }),
} as const;

export type NetworkPackKind = keyof typeof NETWORK_PACK_SCHEMAS;
export type NetworkPack<K extends NetworkPackKind> = z.infer<(typeof NETWORK_PACK_SCHEMAS)[K]>;

/** The signed pack of a kind in force at a hospital, or null while none is (or it no longer parses: Law 6). */
export async function networkPack<K extends NetworkPackKind>(
  tx: EmrTx | EmrDb,
  hospitalId: string,
  kind: K,
): Promise<{ version: number; content: NetworkPack<K> } | null> {
  const [row] = await tx
    .select({ version: pharmacySignedSets.version, content: pharmacySignedSets.content })
    .from(pharmacySignedSets)
    .where(
      and(
        eq(pharmacySignedSets.hospitalId, hospitalId),
        eq(pharmacySignedSets.kind, kind),
        eq(pharmacySignedSets.status, "signed"),
      ),
    )
    .orderBy(desc(pharmacySignedSets.version))
    .limit(1);
  const parsed = row ? NETWORK_PACK_SCHEMAS[kind].safeParse(row.content) : null;
  return parsed?.success ? { version: row!.version, content: parsed.data as NetworkPack<K> } : null;
}
