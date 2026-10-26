import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { buttonVariants } from "@/components/ui/button";
import { PHARMACY } from "@/content/pharmacy";
import { RECON_UI as U } from "@/content/pharmacy-reconciliation";
import { db } from "@/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { blockers, rowsOf } from "@/lib/pharmacy/clinical/reconciliation";
import {
  listReconciliations,
  medicineName,
  rulesFor,
} from "@/lib/pharmacy/clinical/reconciliation-read";
import { pharmacyReconciliationLiveFor } from "@/lib/pharmacy/feature";

export const metadata: Metadata = { title: "Reconciliation · Pharmacy" };
export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Africa/Kampala",
});

/** 5.7 the Reconciliation page: every reconciliation, newest first, with what still blocks it. */
export default async function ReconciliationListPage() {
  const actor = await requirePharmacyActor();
  if (!pharmacyReconciliationLiveFor(actor.hospitalId)) notFound();
  const now = new Date();
  // On the app connection: the clinical reader has no grant on admissions and its rule gives a
  // pharmacist no ward patient. Every read is scoped to this hospital.
  const database = db as unknown as EmrDb;
  const [list, rules] = await Promise.all([
    listReconciliations(database, actor.hospitalId, now),
    rulesFor(database, actor.hospitalId),
  ]);
  const ids = await identitiesFor(
    actor,
    list.map((r) => r.rec.patientUserId),
    "pharmacy_reconciliation",
  );
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={U.title}
        subline={<span className="text-body-s text-muted-foreground max-w-[70ch]">{U.lead}</span>}
      />
      {rules.signed ? null : <p className="text-body-s">{U.noRules}</p>}
      {list.length ? (
        <ul className="flex flex-col gap-2">
          {list.map((r) => {
            const who = ids.get(r.rec.patientUserId);
            const left = blockers(r.facts, rules.on, (x) =>
              medicineName(x.medicineId, x.text),
            ).length;
            return (
              <li
                key={r.rec.id}
                className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-body-m font-semibold">{who?.name ?? "Name withheld"}</span>
                  <span className="text-body-s text-muted-foreground">
                    {when.format(r.rec.openedAt)} · {rowsOf(r.facts).length} medicines
                    {r.state === "open" && left ? ` · ${left} to settle` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusWord tone="neutral">{U.states[r.state]}</StatusWord>
                  <Link
                    href={`/pharmacy/clinical/reconciliation/${r.rec.id}`}
                    className={buttonVariants({ variant: "secondary", size: "md" })}
                  >
                    {U.open}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-body-s text-muted-foreground">{U.nothing}</p>
      )}
    </div>
  );
}
