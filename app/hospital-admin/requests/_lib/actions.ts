"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { REQUESTS } from "@/content/hospital-admin/admin-nav";
import { db } from "@/db";
import { rowsOf } from "@/lib/exchange/store";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { logger } from "@/lib/logger";

const Input = z.object({ id: z.uuid(), note: z.string().trim().min(8).max(300) });

/**
 * PR-15, ADR 0520: the admin marks a copy of results sent. The note says how it went out; the request row keeps it
 * with who and when (`fulfilled_by`, `fulfilled_at`), which is the record. Only an open request at this hospital
 * can be closed, and the caller is told when nothing changed.
 */
export async function fulfilRecordsRequestAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = Input.safeParse(raw);
  if (!p.success) return { ok: false, error: REQUESTS.errors.invalid };
  const scope = await requireHospitalAdminScope();
  try {
    const done = rowsOf<{ id: string }>(
      await db.execute(sql`UPDATE records_requests SET fulfilled_at = now(), fulfilled_by = ${scope.userId},
          note = ${p.data.note}
        WHERE id = ${p.data.id} AND hospital_id = ${scope.hospitalId} AND fulfilled_at IS NULL
        RETURNING id`),
    );
    if (!done.length) return { ok: false, error: REQUESTS.errors.gone };
  } catch (e) {
    logger.error("[requests] fulfil copy request", { err: e });
    return { ok: false, error: REQUESTS.errors.failed };
  }
  revalidatePath("/hospital-admin/requests");
  return { ok: true };
}
