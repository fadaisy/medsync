import { notFound } from "next/navigation";

import { CautionNotice } from "@/components/medsync/caution-notice";
import { SUPPLY } from "@/content/pharmacy-supply";
import { identitiesFor } from "@/lib/emr/read/results";
import { can } from "@/lib/pharmacy/access";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { downtimeTagsFor, paperMedicinesFor } from "@/lib/pharmacy/downtime-entry";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { getLookBack, getSupplied } from "@/lib/pharmacy/supply/read";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { Supplied } from "./_components/supplied";

export const dynamic = "force-dynamic";

/**
 * Supplied today and the look-back tab (5.7, wireframe §7.2). Every hand-over at the acting point on one
 * hospital-local day, newest first; `?day=YYYY-MM-DD` reads an earlier day (for Correct the record,
 * SU-14; Reverse is offered only on the day recorded, SU-11). Behind `pharmacyDispensing`.
 */
export default async function SuppliedPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; tab?: string }>;
}) {
  const scope = await requirePharmacyScope();
  if (!pharmacyDispensingLiveFor(scope.hospitalId)) notFound();
  const actor = await requirePharmacyActor();
  const sp = await searchParams;
  const today = localDate(new Date());
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day <= today ? sp.day : today;
  if (!actor.pointId)
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <CautionNotice lead={SUPPLY.supplied.choosePoint} />
      </div>
    );
  const [supplied, lookBack, manages] = await Promise.all([
    getSupplied(scope.hospitalId, actor.pointId, day),
    getLookBack(scope.hospitalId),
    managesPharmacy(scope.userId, scope.hospitalId),
  ]);
  const handoverIds = supplied.rows.map((r) => r.handoverId);
  const [ids, downtimeTags, paperMedicines] = await Promise.all([
    identitiesFor(
      scope,
      [...supplied.rows.map((r) => r.patientUserId), ...lookBack.map((r) => r.patientUserId)],
      "pharmacy_supplied",
    ),
    // Law 13: back-entered supplies carry their tag; paper supplies show the medicine as written.
    downtimeTagsFor(
      scope.hospitalId,
      supplied.rows.filter((r) => r.enteredAfterDowntime).map((r) => r.handoverId),
    ),
    paperMedicinesFor(scope.hospitalId, handoverIds),
  ]);
  const point = actor.points.find((p) => p.id === actor.pointId);
  return (
    <Supplied
      hospitalName={scope.hospitalName}
      pointName={point?.name ?? null}
      title={day === today ? SUPPLY.supplied.title : SUPPLY.supplied.on(day)}
      day={day}
      today={today}
      rows={supplied.rows}
      lookBack={lookBack}
      identities={Object.fromEntries(ids)}
      initialTab={sp.tab === "look-back" ? "look_back" : "today"}
      canReverse={manages || can(actor.access, "pharmacy.review")}
      canCorrect={manages}
      canReprint={can(actor.access, "pharmacy.dispense")}
      canLookBack={can(actor.access, "pharmacy.review")}
      timeZone={DEFAULT_TIME_ZONE}
      downtimeTags={downtimeTags}
      paperMedicines={paperMedicines}
    />
  );
}
