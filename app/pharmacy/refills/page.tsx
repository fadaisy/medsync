import type { EmrDb } from "@/lib/emr/db";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { can } from "@/lib/pharmacy/access";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyRefillsLiveFor } from "@/lib/pharmacy/feature";
import { refillBoard } from "@/lib/pharmacy/refill-read";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { RefillBoard } from "./_components/refill-board";

export const dynamic = "force-dynamic";

/** Refills (Pharmacy Phase 4, 5.5, board 4.2). Behind `pharmacyRefills`; not found while it is off. */
export default async function RefillsPage() {
  const scope = await requirePharmacyScope();
  if (!pharmacyRefillsLiveFor(scope.hospitalId)) notFound();
  const actor = await requirePharmacyActor();
  const rows = await refillBoard(db as unknown as EmrDb, scope.hospitalId, new Date());
  const ids = await identitiesFor(
    scope,
    rows.map((r) => r.patientUserId),
    "pharmacy_refills",
  );
  return (
    <RefillBoard
      place={scope.hospitalName}
      rows={rows.filter(
        (r) => !actor.pointId || r.tab === "needs_clinic" || r.pointId === actor.pointId,
      )}
      identities={Object.fromEntries(ids)}
      canDispense={can(actor.access, "pharmacy.dispense")}
      pointId={actor.pointId}
    />
  );
}
