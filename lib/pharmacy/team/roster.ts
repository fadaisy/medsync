import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { RC } from "@/content/pharmacy-rework-records";
import { EmrWriteError } from "@/lib/emr/write/context";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { addDays } from "@/lib/pharmacy/stores/ledger";

/**
 * Set-up › People (rework PRD §6.7, §2 duty roster): the in-charge adds a roster line or ends one. A line is never
 * edited or deleted (0265's guard). Witnesses and handovers read the roster through `private.pharmacy_on_duty`.
 */
export const ROSTER_NEED: PharmacyNeed = { permission: "pharmacy.manage", point: "none" };

export const AddRosterInput = z.object({
  clientKey: z.uuid(),
  userId: z.uuid(),
  locationId: z.uuid().nullable(),
  role: z.enum([
    "pharmacist",
    "technician",
    "store_keeper",
    "in_charge",
    "second_nurse",
    "nurse_in_charge",
    "doctor_on_duty",
    "epi_nurse",
  ]),
  shift: z.enum(["day", "night", "call"]),
  dateFrom: z.iso.date(),
  days: z.number().int().min(1).max(366),
});

export async function addRosterLine(ctx: PharmacyCtx, input: z.infer<typeof AddRosterInput>) {
  const h = ctx.actor.hospitalId;
  const [row] = rowsOf<{ id: string }>(
    await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_duty_roster (id, hospital_id, user_id, location_id, role, shift, date_from, date_to, created_by)
    SELECT ${input.clientKey}::uuid, ${h}::uuid, ${input.userId}::uuid, ${input.locationId}::uuid, ${input.role},
           ${input.shift}, ${input.dateFrom}::date, ${addDays(input.dateFrom, input.days - 1)}::date, ${ctx.actor.userId}::uuid
     WHERE (${input.locationId}::uuid IS NULL
            OR EXISTS (SELECT 1 FROM public.pharmacy_locations l WHERE l.id = ${input.locationId}::uuid AND l.hospital_id = ${h}::uuid))
    ON CONFLICT (id) DO NOTHING
    RETURNING id`),
  );
  if (!row) {
    const [again] = rowsOf<{ id: string }>(
      await ctx.tx.execute(
        sql`SELECT id FROM public.pharmacy_duty_roster WHERE id = ${input.clientKey}::uuid AND hospital_id = ${h}::uuid`,
      ),
    );
    if (!again) throw new EmrWriteError("invalid", RC.setup.people.choose);
    return { id: again.id };
  }
  return { id: row.id };
}

export const EndRosterInput = z.object({ id: z.uuid() });

export async function endRosterLine(ctx: PharmacyCtx, input: z.infer<typeof EndRosterInput>) {
  await ctx.tx.execute(sql`
    UPDATE public.pharmacy_duty_roster SET ended_at = ${ctx.now.toISOString()}::timestamptz, ended_by = ${ctx.actor.userId}::uuid
     WHERE id = ${input.id}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid AND ended_at IS NULL`);
  return { id: input.id };
}
