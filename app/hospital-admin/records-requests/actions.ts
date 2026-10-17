"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";

/** PR-15: the records office marks a copy request fulfilled (who and when; the copy itself is made offline). */
export async function fulfilRecordsRequestAction(raw: unknown) {
  const p = z.object({ id: z.uuid(), note: z.string().trim().max(300) }).safeParse(raw);
  if (!p.success) return { ok: false as const, error: "Invalid input." };
  const scope = await requireHospitalAdminScope();
  await db.execute(sql`UPDATE records_requests SET fulfilled_at = now(), fulfilled_by = ${scope.userId},
      note = ${p.data.note || null}
    WHERE id = ${p.data.id} AND hospital_id = ${scope.hospitalId} AND fulfilled_at IS NULL`);
  revalidatePath("/hospital-admin/records-requests");
  return { ok: true as const };
}
