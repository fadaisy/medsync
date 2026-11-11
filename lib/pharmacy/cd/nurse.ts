import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import type { Result } from "@/lib/pharmacy/cd/act";
import { unstable_rethrow } from "next/navigation";

import { CTL } from "@/content/pharmacy-rework-controls";
import { asClinicalWriter } from "@/lib/emr/db";
import { EmrWriteError } from "@/lib/emr/write/context";
import { logger } from "@/lib/logger";
import { controlsWords } from "@/lib/pharmacy/cd/act";
import { cdPrescribers, wardPatients } from "@/lib/pharmacy/cd/read";
import { DoseInput, recordDose } from "@/lib/pharmacy/cd/store";
import { fail, hasLocationRight } from "@/lib/pharmacy/stores/write";
import { databaseRefusal } from "@/lib/pharmacy/write";

/**
 * A controlled dose given on a ward, the nurse's side (rework PRD §6.5, scenario 5). A nurse holds no pharmacy
 * permission: the right is the ward assignment (`ward_read`) at that place, checked in the one transaction. The
 * witness rules (on duty, unused, under 10 minutes, not oneself) are the database's (0265).
 */
export async function nurseRecordDose(
  who: { userId: string; hospitalId: string },
  raw: unknown,
): Promise<Result> {
  const parsed = DoseInput.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? CTL.common.failed };
  try {
    const r = await asClinicalWriter(who, async (tx) => {
      if (!(await hasLocationRight(tx, who.userId, parsed.data.locationId, "ward_read")))
        throw fail("forbidden", CTL.nurse.noWard);
      try {
        return await recordDose(
          { tx, ...who, now: new Date() },
          { ...parsed.data, givenByUserId: who.userId },
        );
      } catch (e) {
        const words = controlsWords(e);
        if (words) throw fail("conflict", words);
        throw e;
      }
    });
    return { ok: true, id: r.id };
  } catch (e) {
    unstable_rethrow(e);
    const words = databaseRefusal(e) ?? (e instanceof EmrWriteError ? e.message : null);
    if (words) return { ok: false, error: words };
    logger.error("nurse.cd_dose.failed", { error: e instanceof Error ? e.name : "unknown" });
    return { ok: false, error: CTL.common.failed };
  }
}

/** The dose dialog's choices: the ward's patients and the prescribers allowed this medicine. */
export async function nurseDoseContext(
  d: EmrDb,
  hospitalId: string,
  locationId: string,
  medicineId: string,
) {
  const [patients, prescribers] = await Promise.all([
    wardPatients(d, hospitalId, locationId),
    cdPrescribers(d, hospitalId, medicineId, locationId),
  ]);
  return { patients, prescribers };
}
