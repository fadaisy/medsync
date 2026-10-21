import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { SUPPLY_COMMON as C, RECALL } from "@/content/pharmacy-stores-supply";
import { asClinicalReader } from "@/lib/emr/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { pharmacyRecallLiveFor } from "@/lib/pharmacy/feature";
import { listRecalls, loadLedger } from "@/lib/pharmacy/stores/recall-read";
import { StartRecallDialog } from "../_components/expiry-dialogs";

export const metadata: Metadata = { title: "Recalls · Pharmacy" };
export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Kampala",
});

/** Recalls (5.7): open recalls stay listed until closed (RC-6, Law 11). Behind `pharmacyRecall`. */
export default async function RecallsPage() {
  const actor = await requirePharmacyActor();
  if (!pharmacyRecallLiveFor(actor.hospitalId)) notFound();
  const [recalls, ledger, manages] = await Promise.all([
    listRecalls(actor),
    asClinicalReader(actor, (tx) => loadLedger(tx, actor.hospitalId)),
    managesPharmacy(actor.userId, actor.hospitalId),
  ]);
  const products = [...ledger.products.values()]
    .map((p) => ({ value: p.id, label: p.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const name = (id: string) => ledger.products.get(id)?.name ?? id;
  const groups = [
    { title: RECALL.open, rows: recalls.filter((r) => !r.closedAt) },
    { title: RECALL.closed, rows: recalls.filter((r) => r.closedAt) },
  ];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={RECALL.title}
        right={manages ? <StartRecallDialog products={products} /> : null}
      />
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-2" aria-label={g.title}>
          <h2 className="text-heading-s">{g.title}</h2>
          {g.rows.length === 0 ? (
            <p className="text-body-s text-muted-foreground">
              {g.title === RECALL.open ? RECALL.none : C.none}
            </p>
          ) : (
            <ul className="border-border divide-border divide-y rounded-lg border">
              {g.rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <Link
                    href={`/pharmacy/store/expiry/recalls/${r.id}`}
                    className="text-body-s text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                  >
                    {`${name(r.productId)} · ${r.batchNumber ?? RECALL.allBatches} · ${r.noticeRef}`}
                  </Link>
                  {r.closedAt ? (
                    <StatusWord>{`${RECALL.closed}: ${day.format(r.closedAt)}`}</StatusWord>
                  ) : (
                    <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                      {`${RECALL.open}: ${day.format(r.startedAt)}`}
                    </StatusWord>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
