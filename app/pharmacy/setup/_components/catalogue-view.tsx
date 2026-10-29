import type { PharmacyV2 } from "../../_lib/v2";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { STOCK_UP_POLISH } from "@/content/pharmacy-stock-up-polish";
import { pharmacyProducts } from "@/db/schema/pharmacy-dispensing";
import { asClinicalReader } from "@/lib/emr/db";
import { pharmacyCatalogueLiveFor } from "@/lib/pharmacy/feature";
import { correctionChanges } from "@/lib/pharmacy/shared-catalogue/correction";
import { catalogueMedicine } from "@/lib/pharmacy/shared-catalogue/medicine";
import { productLinkRows } from "@/lib/pharmacy/shared-catalogue/products";
import { correctionContext, vocabularies } from "@/lib/pharmacy/shared-catalogue/queue";
import { CatalogueCorrection } from "./catalogue-correction";
import { CatalogueOpen } from "./catalogue-open";
import { CatalogueProducts } from "./catalogue-products";

const C = CATALOGUE;
const P = CATALOGUE.page;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Set-up › Catalogue (4.5, board 5): the search, and one medicine's names, facts and packs. Read as the viewer
 * (RLS: `pharmacy.view`). No dose or limit: the catalogue holds what is printed on the pack. The hospital's own
 * products and their links (Step 6) sit under the search; prices and the history arrive with Step 8.
 */
export async function CatalogueView({ v2, medicineId }: { v2: PharmacyV2; medicineId?: string }) {
  const actor = v2.scope;
  if (!pharmacyCatalogueLiveFor(actor.hospitalId)) notFound();
  const m =
    medicineId && UUID.test(medicineId)
      ? await asClinicalReader(actor, (tx) => catalogueMedicine(tx, medicineId, actor.hospitalId))
      : null;
  const wrap = "mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6";

  if (!medicineId) {
    const rows = await asClinicalReader(actor, (tx) => productLinkRows(tx, actor.hospitalId));
    return (
      <div className={wrap}>
        <p className="text-body-s text-ink-700 max-w-[70ch]">{P.lead}</p>
        <CatalogueOpen />
        <ul className="text-body-s text-muted-foreground flex max-w-[70ch] list-disc flex-col gap-1 pl-5">
          <li>{C.catalogueHolds}</li>
          <li>{C.noDoses}</li>
          <li>{C.edqmPending}</li>
        </ul>
        <CatalogueProducts rows={rows} />
      </div>
    );
  }

  const back = (
    <Link
      href="/pharmacy/setup?view=catalogue"
      className="text-body-s text-primary self-start underline-offset-4 hover:underline"
    >
      {P.back}
    </Link>
  );
  if (!m)
    return (
      <div className={wrap}>
        {back}
        <p className="text-body-s text-muted-foreground">{P.notFound}</p>
      </div>
    );

  const facts: [string, string | null][] = [
    [P.strength, m.strength],
    [P.form, m.form],
    [P.routes, m.routes.join(", ") || null],
    [P.issueUnit, m.issueUnit],
    [P.level, m.onNationalList ? m.emhsluLevel : P.notOnList],
    [P.ven, m.emhsluVen],
  ];
  const packs = m.packs.filter((p) => p.packId);
  // Owner item 10: the form and routes as codes, the signed lists, and any correction still waiting.
  const { fix, vocab } = await asClinicalReader(actor, async (tx) => ({
    fix: await correctionContext(tx, m.id),
    vocab: await vocabularies(tx),
  }));
  const K = STOCK_UP_POLISH.correction;
  const pending = fix.pending
    ? correctionChanges(fix.pending, vocab, K.none)
        .map((c) => K.pendingLine(K.field[c.field], c.to))
        .join(" · ")
    : null;
  // Step 11: the hospital's own products of this medicine, each opening Follow one medicine (4.15).
  const own = await asClinicalReader(actor, (tx) =>
    tx
      .select({ id: pharmacyProducts.id, name: pharmacyProducts.name })
      .from(pharmacyProducts)
      .where(
        and(
          eq(pharmacyProducts.hospitalId, actor.hospitalId),
          eq(pharmacyProducts.catalogueMedicineId, m.id),
        ),
      ),
  );
  const card = "bg-card shadow-tide-card rounded-tide-card overflow-hidden";
  return (
    <div className={wrap}>
      {back}
      <div className="flex flex-col gap-1">
        <h2 className="text-heading-m text-foreground">{m.displayName}</h2>
        <p className="text-body-s text-muted-foreground">
          {m.kind === "medicine"
            ? m.prescribable
              ? P.prescribable
              : C.notPrescribable
            : P.healthSupply}
          {m.flagged ? ` · ${P.flagged}` : ""}
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <section aria-label={P.names} className={card}>
          <h3 className="text-heading-s text-foreground border-border border-b px-4 py-3">
            {P.names}
          </h3>
          <ul className="divide-border divide-y">
            {m.names.map((n) => (
              <li key={n.name} className="text-body-s flex justify-between gap-3 px-4 py-2">
                <span className="text-foreground">{n.name}</span>
                <span className="text-muted-foreground">{C.nameType[n.type] ?? n.type}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label={P.facts} className={card}>
          <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-2">
            <h3 className="text-heading-s text-foreground">{P.facts}</h3>
            {pending ? null : (
              <CatalogueCorrection
                medicineId={m.id}
                healthSupply={m.kind === "health_supply"}
                formCode={fix.formCode}
                routeCodes={fix.routes}
                forms={vocab.signedForms}
                routes={vocab.signedRoutes}
              />
            )}
          </div>
          {pending ? (
            <p
              role="status"
              className="text-body-s text-foreground border-border border-b px-4 py-2"
            >
              {K.pending(pending)}
            </p>
          ) : null}
          <dl className="divide-border divide-y">
            {facts.map(([k, v]) => (
              <div key={k} className="text-body-s flex justify-between gap-3 px-4 py-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-foreground text-right">{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
          {m.checkNote && (
            <p className="text-caption text-muted-foreground border-border border-t px-4 py-2">
              {P.checkNote}: {m.checkNote}
            </p>
          )}
        </section>
        {own.length ? (
          <section aria-label={C.traceTitle} className={card}>
            <h3 className="text-heading-s text-foreground border-border border-b px-4 py-3">
              {C.traceTitle}
            </h3>
            <ul className="divide-border divide-y">
              {own.map((p) => (
                <li key={p.id} className="text-body-s px-4 py-2">
                  <Link
                    href={`/pharmacy/store?tab=map&product=${p.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <section aria-label={P.packs} className={card}>
        <h3 className="text-heading-s text-foreground border-border border-b px-4 py-3">
          {P.packs}
        </h3>
        {packs.length === 0 ? (
          <p className="text-body-s text-muted-foreground px-4 py-3">{P.noPacks}</p>
        ) : (
          <div tabIndex={0} className="overflow-x-auto">
            <table className="text-body-s w-full">
              <thead className="text-muted-foreground text-left">
                <tr>
                  {[
                    P.columns.brand,
                    P.columns.maker,
                    P.columns.registration,
                    P.columns.pack,
                    P.columns.barcode,
                  ].map((h) => (
                    <th key={h} scope="col" className="px-4 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {packs.map((p) => (
                  <tr key={p.packId}>
                    <td className="px-4 py-2">{p.brand ?? C.loose}</td>
                    <td className="px-4 py-2">{p.maker ?? "—"}</td>
                    <td className="px-4 py-2">
                      {p.ndaNumber ?? P.unknownNda}
                      {p.ndaState === "lapsed" ? ` · ${C.lapsed}` : ""}
                    </td>
                    <td className="px-4 py-2">{p.description}</td>
                    <td className="px-4 py-2 font-mono tabular-nums">
                      {p.gtin ? `${p.gtin} · ${C.confirmedBy(p.confirmedBy)}` : C.noBarcode}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
