import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { CARTS, WARDS } from "@/content/pharmacy-stores-wards";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyCartsLiveFor } from "@/lib/pharmacy/feature";
import {
  confirmersAt,
  getCartPage,
  hospitalProducts,
  manages,
} from "@/lib/pharmacy/stores/ward-read";
import { CartCheck } from "../_components/cart-check";
import { SealReport } from "../_components/seal-report";
import { PackDialog, SignDialog, TARGET } from "../../wards/_components/ward-dialogs";
import { countItems, when } from "../../wards/_lib/view";
import {
  attestCartConfirmer,
  attestCartSigner,
  recordCartCheck,
  reportCartSealBroken,
  setCartList,
  signCartList,
} from "../actions";

export const metadata: Metadata = { title: "Emergency carts · Pharmacy" };

export const dynamic = "force-dynamic";

/**
 * One emergency cart (5.5): its signed list, last check and the check itself (`?check=1`, blind). The
 * check is by `pharmacy.stock` with the unit's nurse in charge confirming; `pharmacy.manage` keeps the
 * list and signs it with the unit's clinical lead. Usable at 834 px and 390 px. Behind `pharmacyCarts`.
 */
export default async function CartPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<{ check?: string }>;
}) {
  const actor = await requirePharmacyActor();
  if (!pharmacyCartsLiveFor(actor.hospitalId)) notFound();
  const { locationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(locationId)) notFound();
  const d = db as unknown as EmrDb;
  const page = await getCartPage(d, actor.hospitalId, locationId, new Date());
  if (!page) notFound();
  const [manage, confirmers] = await Promise.all([
    manages(d, actor.userId, actor.hospitalId),
    confirmersAt(d, actor.hospitalId, locationId, "cart_confirm"),
  ]);
  const products = manage ? await hospitalProducts(d, actor.hospitalId) : [];
  const canCheck = actor.access.permissions.has("pharmacy.stock") && !!page.list;
  const base = `/pharmacy/store/carts/${locationId}`;
  const names = Object.fromEntries(page.products.map((p) => [p.id, p.name]));
  const draft = page.packs.draft;
  const source = page.draft ?? page.list;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={`${CARTS.title} · ${page.location.name}`}
      />
      {(await searchParams).check && canCheck ? (
        <>
          <Link
            href={base}
            className={`text-body-s text-primary inline-flex ${TARGET} items-center underline-offset-4 hover:underline`}
          >
            {WARDS.count.back}
          </Link>
          <CartCheck
            locationId={locationId}
            cart={page.location.name}
            unit={page.location.name}
            items={countItems(page.products)}
            names={names}
            issuers={page.issuers}
            otherCarts={page.otherCarts}
            confirmers={confirmers}
            attest={attestCartConfirmer}
            check={recordCartCheck}
          />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {canCheck ? (
              <Link
                href={`${base}?check=1`}
                className={`bg-primary text-primary-foreground text-body-s inline-flex ${TARGET} items-center rounded-md px-4`}
              >
                {CARTS.check.open}
              </Link>
            ) : null}
            {manage ? (
              <PackDialog
                kind="cart_list"
                locationId={locationId}
                products={products}
                values={Object.fromEntries(source?.items ?? [])}
                interval={source?.checkIntervalDays ?? null}
                names={source?.names ?? []}
                action={setCartList}
              />
            ) : null}
            {manage && draft ? (
              <SignDialog
                packId={draft.id}
                locationId={locationId}
                me={actor.userId}
                people={confirmers}
                secondTitle={WARDS.sign.second}
                attest={attestCartSigner}
                sign={signCartList}
              />
            ) : null}
          </div>
          <p className="text-body-s text-muted-foreground">
            {page.location.live ? WARDS.live : WARDS.notLive} ·{" "}
            {page.list?.checkIntervalDays
              ? CARTS.interval(page.list.checkIntervalDays)
              : CARTS.listUnsigned}{" "}
            · {page.lastCheck ? CARTS.lastCheck(when(page.lastCheck)) : CARTS.neverChecked}
            {draft ? ` ${WARDS.levels.draft(draft.version)}` : ""}
          </p>
          {page.overdue ? (
            <StatusWord tone="caution" glyph={TriangleAlertIcon}>
              {CARTS.overdue}
            </StatusWord>
          ) : null}
          {page.seals ? (
            <div className="flex flex-wrap items-center gap-3">
              {(() => {
                const last = page.seals[0];
                const sealed = page.seals.find((s) => s.kind === "applied");
                if (last?.kind === "broken")
                  return (
                    <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                      {CATALOGUE.sealBroken(sealed?.sealNumber ?? "", when(last.reportedAt))}
                    </StatusWord>
                  );
                return sealed?.sealNumber ? (
                  <span className="text-body-s text-muted-foreground">
                    {CATALOGUE.seal.applied(sealed.sealNumber)}
                  </span>
                ) : null;
              })()}
              <SealReport locationId={page.location.id} report={reportCartSealBroken} />
            </div>
          ) : null}
          {page.list ? (
            <ul className="border-border bg-card divide-border divide-y rounded-lg border">
              {[...page.list.items].map(([productId, n]) => (
                <li key={productId} className="text-body-s flex justify-between gap-2 px-4 py-2">
                  <span>{names[productId] ?? productId}</span>
                  <span className="tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-s">{CARTS.check.noList}</p>
          )}
        </>
      )}
    </div>
  );
}
