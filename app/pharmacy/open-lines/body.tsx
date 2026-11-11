import { notFound } from "next/navigation";

import { REVIEW } from "@/content/pharmacy-review";
import { identitiesFor } from "@/lib/emr/read/results";
import { can } from "@/lib/pharmacy/access";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import { patientListLive } from "@/lib/pharmacy/patient-list";
import { getOpenLines } from "@/lib/pharmacy/review/read";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { OpenLines } from "./_components/open-lines";

/**
 * Open lines (5.7, artboard 1.7; wireframe §7.1): every line owed or being bought outside, oldest
 * first, until a person acts on it (Law 4, LO-3, LO-5). Behind `pharmacyDispensing`; a point that
 * was live and is switched off keeps this page so what it left open can be closed (RD-3). "Supply now"
 * (Step 6) opens the hand-over for that line when it is on the shelf here; "Tell the patient it is
 * here" (MS-4) shows on an owed line on the shelf here, only where a message can be sent (S94).
 */
/** The old page's body, unchanged; Window renders it too. */
export async function OpenLinesBody() {
  const scope = await requirePharmacyScope();
  if (!pharmacyDispensingLiveFor(scope.hospitalId)) notFound();
  const actor = await requirePharmacyActor();
  const { rows, points, liveSms } = await getOpenLines(scope.hospitalId, undefined, actor.pointId);
  const ids = await identitiesFor(
    scope,
    rows.map((r) => r.patientUserId),
    "pharmacy_open_lines",
  );
  const point = points.find((p) => p.id === actor.pointId) ?? null;
  return (
    <OpenLines
      hospitalName={scope.hospitalName}
      pointName={point?.name ?? null}
      rows={rows}
      identities={Object.fromEntries(ids)}
      canChange={can(actor.access, "pharmacy.dispense") && !!point?.live}
      canClose={can(actor.access, "pharmacy.dispense") && !!point?.wasLive}
      canTell={
        can(actor.access, "pharmacy.dispense") &&
        !!point?.live &&
        liveSms &&
        (await patientListLive(scope.hospitalId))
      }
      serverNow={new Date().toISOString()}
      timeZone={DEFAULT_TIME_ZONE}
      title={REVIEW.open.title}
    />
  );
}
