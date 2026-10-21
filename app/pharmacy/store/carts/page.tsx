import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { CARTS, WARDS } from "@/content/pharmacy-stores-wards";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyCartsLiveFor } from "@/lib/pharmacy/feature";
import { getCartsPage, manages, unplacedCarts } from "@/lib/pharmacy/stores/ward-read";
import { AddPlaceDialog, TARGET } from "../wards/_components/ward-dialogs";
import { when } from "../wards/_lib/view";
import { createCartLocation } from "./actions";

export const metadata: Metadata = { title: "Emergency carts · Pharmacy" };

export const dynamic = "force-dynamic";

/**
 * 5.5: every emergency cart, its signed list and its last check. A cart past its signed check interval is
 * listed amber with an icon and a word (S26). Resus-desk cart names that match no cart are listed for the
 * pharmacy in charge (H2-16). Behind `pharmacyCarts`.
 */
export default async function CartsPage() {
  const actor = await requirePharmacyActor();
  if (!pharmacyCartsLiveFor(actor.hospitalId)) notFound();
  const d = db as unknown as EmrDb;
  const [data, manage] = await Promise.all([
    getCartsPage(d, actor.hospitalId, new Date()),
    manages(d, actor.userId, actor.hospitalId),
  ]);
  const hubs = manage ? await unplacedCarts(d, actor.hospitalId) : [];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={CARTS.title}
        right={
          manage ? <AddPlaceDialog kind="cart" hubs={hubs} action={createCartLocation} /> : null
        }
      />
      {data.rows.length === 0 ? (
        <p className="text-body-s text-muted-foreground">{CARTS.none}</p>
      ) : (
        <ul className="border-border bg-card divide-border divide-y rounded-lg border">
          {data.rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span className="text-body-s flex flex-col gap-0.5">
                <span className="text-foreground font-medium">{c.name}</span>
                <span className="text-muted-foreground">
                  {c.live ? WARDS.live : WARDS.notLive} ·{" "}
                  {c.list?.checkIntervalDays
                    ? CARTS.interval(c.list.checkIntervalDays)
                    : CARTS.listUnsigned}{" "}
                  · {c.lastCheck ? CARTS.lastCheck(when(c.lastCheck)) : CARTS.neverChecked}
                </span>
                {c.overdue ? (
                  <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                    {CARTS.overdue}
                  </StatusWord>
                ) : null}
              </span>
              <Link
                href={`/pharmacy/store/carts/${c.id}`}
                className={`text-body-s text-primary inline-flex ${TARGET} items-center underline-offset-4 hover:underline`}
              >
                {WARDS.open}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data.unmatched.length ? (
        <CautionNotice lead={CARTS.unmatched}>
          <ul className="flex flex-col gap-0.5">
            {data.unmatched.map((u) => (
              <li key={u.name}>{CARTS.unmatchedLine(u.name, u.n)}</li>
            ))}
          </ul>
        </CautionNotice>
      ) : null}
    </div>
  );
}
