import type { PharmacyV2 } from "../../_lib/v2";
import type { EmrDb } from "@/lib/emr/db";
import { notFound } from "next/navigation";

import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { db } from "@/db";
import { asClinicalReader } from "@/lib/emr/db";
import { can } from "@/lib/pharmacy/access";
import { pharmacyCatalogueLiveFor } from "@/lib/pharmacy/feature";
import { pricesPage } from "@/lib/pharmacy/prices/store";
import { loadHospitalContext } from "@/lib/pharmacy/review/load";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { NeedsPrice, PayerDialog, PointControls, RuleDialog } from "./prices-controls";

const P = CATALOGUE.prices;
const card = "bg-card shadow-tide-card rounded-tide-card overflow-hidden";
const head = "border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3";

/**
 * Set-up › Prices (4.6; catalogue slice Step 8, ADR 0460). Read as the viewer (RLS: `pharmacy.view`); the controls
 * show only to `pharmacy.manage`, and every write re-checks it on the server. Never UGX 0: free and "Price not set"
 * are words (Law 11).
 */
export async function PricesView({ v2 }: { v2: PharmacyV2 }) {
  const actor = v2.scope;
  if (!pharmacyCatalogueLiveFor(actor.hospitalId)) notFound();
  const manage = can(actor.access, "pharmacy.manage");
  const today = localDate(new Date());
  const h = await loadHospitalContext(db as unknown as EmrDb, actor.hospitalId);
  const page = await asClinicalReader(actor, (tx) =>
    pricesPage(
      tx,
      actor.hospitalId,
      h.points.map((p) => p.id),
      today,
    ),
  );
  const pointName = new Map(h.points.map((p) => [p.id, p.name]));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <p className="text-body-s text-ink-700 max-w-[70ch]">{P.lead}</p>
      {!manage && <p className="text-body-s text-muted-foreground">{P.readOnly}</p>}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [P.figures.value, P.ugx(Math.round(page.value.valueUgx))],
          [P.figures.priced, String(page.counts.priced)],
          [P.figures.free, String(page.counts.free)],
          [P.figures.notSet, String(page.counts.notSet)],
        ].map(([k, v]) => (
          <div key={k} className={`${card} flex flex-col gap-1 px-4 py-3`}>
            <dt className="text-caption text-muted-foreground">{k}</dt>
            <dd className="text-heading-s text-foreground tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-caption text-muted-foreground">
        {P.figures.valueNote}
        {page.value.unvalued.length > 0 &&
          ` ${P.figures.unvalued(page.value.unvalued.length)}: ${page.value.unvalued.slice(0, 10).join(", ")}${page.value.unvalued.length > 10 ? "…" : ""}`}
      </p>

      <section aria-label={P.rule.title} className={card}>
        <div className={head}>
          <h3 className="text-heading-s text-foreground">{P.rule.title}</h3>
          {manage && (
            <RuleDialog payers={page.payers.filter((p) => p.code !== "cash")} today={today} />
          )}
        </div>
        <p className="text-body-s text-foreground px-4 py-3">
          {page.rule
            ? P.rule.inForce(String(page.rule.multiplier), page.rule.roundingStep, today)
            : P.rule.none}
        </p>
      </section>

      <section aria-label={P.payers.title} className={card}>
        <div className={head}>
          <h3 className="text-heading-s text-foreground">{P.payers.title}</h3>
          {manage && <PayerDialog />}
        </div>
        <ul className="divide-border divide-y">
          {page.payers.map((p) => (
            <li key={p.id} className="text-body-s flex justify-between gap-3 px-4 py-2">
              <span>{p.name}</span>
              <span className="text-muted-foreground">{P.payers.kinds[p.kind]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={P.points.title} className={card}>
        <div className={head}>
          <div className="flex flex-col gap-1">
            <h3 className="text-heading-s text-foreground">{P.points.title}</h3>
            <p className="text-body-s text-muted-foreground max-w-[70ch]">{P.points.lead}</p>
          </div>
        </div>
        <ul className="divide-border divide-y">
          {page.points.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
              <span className="text-body-s">
                {pointName.get(p.id)} · {p.mode === "free" ? P.points.free : P.points.charged} ·{" "}
                {P.points.payFirst}:{" "}
                {p.payFirst === null
                  ? P.points.payFirstHospital(h.settings.paymentStatusRequired)
                  : p.payFirst
                    ? P.points.payFirstOn
                    : P.points.payFirstOff}
              </span>
              {manage && (
                <PointControls
                  pointId={p.id}
                  mode={p.mode}
                  payFirst={p.payFirst ?? h.settings.paymentStatusRequired}
                  today={today}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={P.needs.title} className={card}>
        <div className={head}>
          <h3 className="text-heading-s text-foreground">{P.needs.title}</h3>
        </div>
        {page.needs.length === 0 ? (
          <p className="text-body-s text-muted-foreground px-4 py-3">{P.needs.none}</p>
        ) : (
          <ul className="divide-border divide-y">
            {page.needs.slice(0, 200).map((n) => (
              <NeedsPrice
                key={n.id}
                row={n}
                cashPayerId={page.cash}
                manage={manage}
                today={today}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-label={P.history.title} className={card}>
        <div className={head}>
          <h3 className="text-heading-s text-foreground">{P.history.title}</h3>
        </div>
        {page.history.length === 0 ? (
          <p className="text-body-s text-muted-foreground px-4 py-3">{P.history.none}</p>
        ) : (
          <ul className="divide-border divide-y">
            {page.history.map((r) => (
              <li key={r.id} className="text-body-s flex flex-wrap justify-between gap-3 px-4 py-2">
                <span>
                  {r.product} · {r.payer}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {r.free ? P.history.free : P.ugx(r.priceUgx!)} · {String(r.fromDate)} ·{" "}
                  {P.history.source[r.source]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
