import { eq } from "drizzle-orm";

import { NETWORK_B } from "@/content/pharmacy-network";
import { clinicianProfiles } from "@/db/schema/clinician-profiles";
import { councils } from "@/db/schema/reference-data";
import { asClinicalWriter } from "@/lib/emr/db";
import { repeatTermsFor } from "@/lib/emr/write/repeats";
import { pharmacyRepeatsLiveFor } from "@/lib/pharmacy/feature";
import { longDate } from "@/lib/prescribing/repeats";

/**
 * Pharmacy Phase 4 (5.2, s.37(5)): a line with standing repeats prints them under it, with the prescriber's council
 * number. Behind PHARMACY_REPEATS; off, or with no live repeats, it renders nothing (D-PH1-49 keeps the page itself).
 */
export async function RepeatsPrint({
  actor,
  prescriptionId,
  prescriberUserId,
  prescriberName,
}: {
  actor: { userId: string; hospitalId: string };
  prescriptionId: string;
  prescriberUserId: string;
  prescriberName: string;
}) {
  if (!pharmacyRepeatsLiveFor(actor.hospitalId)) return null;
  const { t, council } = await asClinicalWriter(actor, async (tx) => {
    const t = (await repeatTermsFor({ tx }, [prescriptionId])).get(prescriptionId);
    if (!t || t.stoppedAt || t.lineState !== "active") return { t: null, council: "" };
    const [c] = await tx
      .select({ number: clinicianProfiles.registrationNumber, council: councils.shortName })
      .from(clinicianProfiles)
      .innerJoin(councils, eq(councils.id, clinicianProfiles.councilId))
      .where(eq(clinicianProfiles.id, prescriberUserId));
    return { t, council: c ? `${c.council} ${c.number}` : "" };
  });
  if (!t) return null;
  return (
    <span>
      {NETWORK_B.repeatsPrint(
        t.furtherSupplies,
        t.minIntervalDays,
        longDate(t.notAfter),
        prescriberName,
        council,
      )}
    </span>
  );
}
