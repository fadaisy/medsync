import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { buttonVariants } from "@/components/ui/button";
import { PHARMACY } from "@/content/pharmacy";
import { REACTIONS_UI as U } from "@/content/pharmacy-clinical";
import { asClinicalReader } from "@/lib/emr/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { listReports } from "@/lib/pharmacy/clinical/reaction-read";
import { pharmacyReactionsLiveFor } from "@/lib/pharmacy/feature";

export const metadata: Metadata = { title: "Reactions · Pharmacy" };
export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Africa/Kampala",
});

/** 5.6 the Reactions page: every event recorded, newest first, listed until it leaves "to submit" (Law 11). */
export default async function ReactionsPage() {
  const actor = await requirePharmacyActor();
  if (!pharmacyReactionsLiveFor(actor.hospitalId)) notFound();
  const rows = await asClinicalReader(actor, (tx) => listReports(tx, actor.hospitalId, new Date()));
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={U.title}
        subline={<span className="text-body-s text-muted-foreground max-w-[70ch]">{U.lead}</span>}
      />
      {rows.length ? (
        <div tabIndex={0} className="border-border overflow-x-auto rounded-lg border">
          <table className="text-body-s w-full">
            <thead className="text-muted-foreground text-left">
              <tr>
                {["Recorded", "Kind", "Medicine", "Seriousness", "State", "Due by", ""].map((h) => (
                  <th key={h} className="p-2 font-medium">
                    {h || <span className="sr-only">Open</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-border border-t align-top">
                  <td className="p-2 tabular-nums">{when.format(r.recordedAt)}</td>
                  <td className="p-2">{U.kinds[r.kind as keyof typeof U.kinds]}</td>
                  <td className="p-2">{r.medicine}</td>
                  <td className="p-2">{r.serious ? U.serious : U.notSerious}</td>
                  <td className="p-2">
                    <div className="flex flex-col items-start gap-1">
                      <StatusWord tone="neutral">{U.state[r.state]}</StatusWord>
                      {r.assessed ? null : (
                        <span className="text-muted-foreground">{U.notAssessed}</span>
                      )}
                    </div>
                  </td>
                  <td className="p-2">
                    {r.dueAt ? (
                      r.pastDue ? (
                        <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                          {U.pastDue}: {when.format(r.dueAt)}
                        </StatusWord>
                      ) : (
                        when.format(r.dueAt)
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <Link
                      href={`/pharmacy/clinical/reactions/${r.id}`}
                      className={buttonVariants({ variant: "secondary", size: "md" })}
                    >
                      {U.open}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-body-s text-muted-foreground">{U.nothing}</p>
      )}
    </div>
  );
}
