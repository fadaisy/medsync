import "server-only";

import type { NcSource } from "./nonconformity";
import type { EmrTx } from "@/lib/emr/db";
import { and, asc, count, eq, isNull, like } from "drizzle-orm";

import { departmentHeads, hospitalDepartments, labNcEvents, labNonconformities } from "@/db/schema";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { ncNumber, openAutomatic } from "./nonconformity";
import { dayOf } from "./stock";

/** The laboratory lead: the open head of LABORATORY here (substantive first, then acting). */
export async function labLeadOf(tx: EmrTx, hospitalId: string): Promise<string | null> {
  const [h] = await tx
    .select({ userId: departmentHeads.userId })
    .from(departmentHeads)
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, departmentHeads.departmentId))
    .where(
      and(
        eq(departmentHeads.hospitalId, hospitalId),
        isNull(departmentHeads.endsAt),
        eq(hospitalDepartments.catalogueCode, "LABORATORY"),
      ),
    )
    .orderBy(asc(departmentHeads.acting), asc(departmentHeads.startsAt))
    .limit(1);
  return h?.userId ?? null;
}

/**
 * NC-1, NC-2: a nonconformity MedSync opens by itself (owner the lead, opened by MedSync), numbered
 * NC-{year}-{n} per hospital, with the lead notified in the app (a `notified` event). A lab with no lead
 * still opens it, with no owner (fail loud on Quality today, not silent).
 */
export async function openAutomaticNc(
  tx: EmrTx,
  hospitalId: string,
  input: {
    source: NcSource;
    sourceRef: string | null;
    deviceId: string | null;
    title: string;
    whatHappened: string;
  },
  now: Date,
): Promise<{ id: string; number: string }> {
  const lead = await labLeadOf(tx, hospitalId);
  const o = openAutomatic(input.source, lead ?? "");
  const year = Number(dayOf(now, DEFAULT_TIME_ZONE).slice(0, 4));
  const [{ n }] = (await tx
    .select({ n: count() })
    .from(labNonconformities)
    .where(
      and(
        eq(labNonconformities.hospitalId, hospitalId),
        like(labNonconformities.number, `NC-${year}-%`),
      ),
    )) as [{ n: number }];
  const number = ncNumber(year, Number(n) + 1);
  const [nc] = await tx
    .insert(labNonconformities)
    .values({
      hospitalId,
      number,
      source: o.source,
      sourceRef: input.sourceRef,
      subjectDeviceId: input.deviceId,
      title: input.title,
      whatHappened: input.whatHappened,
      testingHalted: o.testingHalted,
      owner: lead,
      openedBy: null,
      openedAt: now,
    })
    .returning({ id: labNonconformities.id });
  if (lead)
    await tx
      .insert(labNcEvents)
      .values({ ncId: nc!.id, hospitalId, kind: "notified", payload: { to: lead }, at: now });
  return { id: nc!.id, number };
}
