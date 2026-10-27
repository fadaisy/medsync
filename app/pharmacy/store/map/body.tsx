import type { EmrDb } from "@/lib/emr/db";
import type { HowKnown } from "@/lib/pharmacy/distribution/map";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { hospitalStockMap } from "@/lib/pharmacy/distribution/map";
import { pharmacyCatalogueLiveFor } from "@/lib/pharmacy/feature";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { TraceBody } from "./trace";

const M = CATALOGUE.map;
const LINK = "text-body-s text-primary underline-offset-4 hover:underline";
const ugx = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });
const GROUPS = ["store", "dispensing_point", "ward", "cart", "quarantine"] as const;
const HOW: Record<HowKnown, string> = {
  every: CATALOGUE.mapHow.every,
  counted: CATALOGUE.mapHow.counted,
  issueOnly: CATALOGUE.mapHow.issueOnly,
  cart: CATALOGUE.mapHow.cart,
};
const openHref = (kind: string, id: string) =>
  kind === "ward"
    ? `/pharmacy/store/wards/${id}`
    : kind === "cart"
      ? `/pharmacy/store/carts/${id}`
      : kind === "quarantine"
        ? "/pharmacy/store?tab=expiry"
        : "/pharmacy/store?tab=issues";

/**
 * 4.10 Every place (ADR 0466): the figures, then one table per kind of place, each saying how its stock is known.
 * Amber only with an icon and words (S46). `product` opens 4.15 for one medicine. Behind `PHARMACY_CATALOGUE`.
 */
export async function StockMapBody({
  product,
  show,
}: {
  product: string | undefined;
  show?: string;
}) {
  const actor = await requirePharmacyActor();
  if (!pharmacyCatalogueLiveFor(actor.hospitalId)) notFound();
  if (product) return <TraceBody productId={product} show={show} />;
  const now = new Date();
  const map = await hospitalStockMap(db as unknown as EmrDb, actor.hospitalId, now);
  const F = M.figures;
  const figures = [
    [F.value, `UGX ${ugx.format(map.figures.valueUgx)}`],
    [F.vitalOut, String(map.figures.vitalOut)],
    [F.expiring, String(map.figures.expiring)],
    [F.stale, String(map.figures.stale)],
    [F.unconfirmed, String(map.figures.unconfirmed)],
    [F.carts, String(map.figures.carts)],
  ] as const;
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <h2 className="text-heading-m text-foreground">{M.title}</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {figures.map(([k, v]) => (
          <div key={k} className="border-border bg-card rounded-lg border px-4 py-3">
            <dt className="text-caption text-muted-foreground">{k}</dt>
            <dd className="text-heading-s text-foreground tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {map.windowSigned ? null : (
        <p className="text-body-s text-muted-foreground">{CATALOGUE.overdueUnsigned}</p>
      )}
      <form action="/pharmacy/store" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="map" />
        <label className="text-body-s flex flex-col gap-1">
          {M.followLabel}
          <select
            name="product"
            required
            defaultValue=""
            className="border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-md border px-2.5 outline-none"
          >
            <option value="" disabled>
              {M.followLabel}
            </option>
            {map.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" className="min-h-11">
          {M.follow}
        </Button>
      </form>
      {GROUPS.map((g) => {
        const rows = map.rows.filter((r) => r.kind === g);
        if (!rows.length) return null;
        return (
          <section key={g} aria-labelledby={`map-${g}`} className="flex flex-col gap-2">
            <h3 id={`map-${g}`} className="text-heading-s text-foreground">
              {M.groups[g]}
            </h3>
            <div tabIndex={0} className="border-border overflow-x-auto rounded-lg border">
              <table className="text-body-s w-full min-w-[880px]">
                <thead className="bg-muted text-left">
                  <tr>
                    {[
                      M.columns.place,
                      M.columns.how,
                      M.columns.value,
                      M.columns.out,
                      M.columns.expiring,
                      M.columns.last,
                      M.columns.next,
                    ].map((h) => (
                      <th key={h} scope="col" className="text-label px-3 py-2 font-semibold">
                        {h}
                      </th>
                    ))}
                    <th scope="col" className="sr-only">
                      {M.open}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {rows.map((r) => (
                    <tr key={r.id} className="align-top">
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        {r.name}
                      </th>
                      <td className="px-3 py-2">{HOW[r.how]}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.value === null ? (
                          <span className="text-muted-foreground">{M.noBalance}</span>
                        ) : (
                          `UGX ${ugx.format(r.value)}${r.unvalued ? ` · ${CATALOGUE.notValued(r.unvalued)}` : ""}`
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.out.length === 0
                          ? "0"
                          : r.out
                              .slice(0, 3)
                              .map(
                                (o) =>
                                  `${o.name}${o.vital ? ` (V, ${o.storeHolds ? M.storeHolds : M.storeOut})` : ""}`,
                              )
                              .join("; ") + (r.out.length > 3 ? ` +${r.out.length - 3}` : "")}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.expiring}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-col gap-0.5">
                          {r.sealBroken ? (
                            <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                              {`${CATALOGUE.seal.due}: ${CATALOGUE.seal.sealBroken}`}
                            </StatusWord>
                          ) : null}
                          {r.stale ? (
                            <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                              {r.last ? M.stale(localDate(r.last)) : M.neverCounted}
                            </StatusWord>
                          ) : r.last ? (
                            <span>{M.fresh(localDate(r.last))}</span>
                          ) : r.how === "every" ? null : (
                            <span className="text-muted-foreground">{M.neverCounted}</span>
                          )}
                          {r.overdue > 0 ? (
                            <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                              {M.unconfirmed(r.unconfirmed.n, r.unconfirmed.oldestHours)}
                            </StatusWord>
                          ) : r.unconfirmed.n > 0 ? (
                            <span>{M.unconfirmed(r.unconfirmed.n, r.unconfirmed.oldestHours)}</span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2">{M.next[r.next]}</td>
                      <td className="px-3 py-2">
                        <Link href={openHref(r.kind, r.id)} className={LINK}>
                          {M.open}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
