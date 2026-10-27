import type { EmrDb } from "@/lib/emr/db";
import type { MovementGroup } from "@/lib/pharmacy/distribution/engine";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { groupOf } from "@/lib/pharmacy/distribution/engine";
import { medicineTrace } from "@/lib/pharmacy/distribution/map";

const T = CATALOGUE.trace;
const LINK = "text-body-s text-primary underline-offset-4 hover:underline";
const ugx = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });
const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Kampala",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const DAY = 86_400_000;
const FILTERS = ["all", "arrived", "between", "patients", "wards", "losses"] as const;

/**
 * 4.15 Follow one medicine (ADR 0466): where it is now, by place and by batch (the same total, S48), its batches with
 * state and "Who received" for a recalled one (S49), and every movement in the last 90 days, newest first.
 */
export async function TraceBody({ productId, show = "all" }: { productId: string; show?: string }) {
  const actor = await requirePharmacyActor();
  const now = new Date();
  const t = await medicineTrace(
    db as unknown as EmrDb,
    actor.hospitalId,
    productId,
    { from: new Date(now.getTime() - 90 * DAY), to: new Date(now.getTime() + 1) },
    now,
  );
  if (!t) notFound();
  const F = T.figures;
  const most = Math.max(1, ...t.where.map((w) => w.units));
  const filter = (FILTERS as readonly string[]).includes(show) ? show : "all";
  const moves =
    filter === "all"
      ? t.movements
      : t.movements.filter((m) => groupOf(m.kind) === (filter as MovementGroup));
  const base = `/pharmacy/store?tab=map&product=${productId}`;
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <Link href="/pharmacy/store?tab=map" className={LINK}>
        {CATALOGUE.map.title}
      </Link>
      <h2 className="text-heading-m text-foreground">
        {CATALOGUE.traceTitle}: {t.product.name}
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          [
            F.inHospital,
            `${t.figures.inHospital} ${t.product.issueUnit} · UGX ${ugx.format(t.figures.valueUgx)}`,
          ],
          [
            F.perMonth,
            t.figures.perMonth === null ? T.notSigned : String(Math.round(t.figures.perMonth)),
          ],
          [F.cover, t.figures.coverWeeks === null ? "—" : T.weeks(t.figures.coverWeeks)],
          [F.batches, String(t.figures.batches)],
          [F.onOrder, String(t.figures.onOrder)],
        ].map(([k, v]) => (
          <div key={k} className="border-border bg-card rounded-lg border px-4 py-3">
            <dt className="text-caption text-muted-foreground">{k}</dt>
            <dd className="text-body-s text-foreground tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="trace-where" className="flex flex-col gap-2">
        <h3 id="trace-where" className="text-heading-s text-foreground">
          {T.where}
        </h3>
        <ul className="border-border bg-card divide-border divide-y rounded-lg border">
          {t.where.map((w) => (
            <li
              key={w.placeId}
              className="text-body-s grid gap-2 px-4 py-2 sm:grid-cols-[14rem_1fr_6rem]"
            >
              <span>{w.name}</span>
              <span className="bg-muted h-2 self-center rounded-full" aria-hidden>
                <span
                  className="bg-ink-500 block h-2 rounded-full"
                  style={{ width: `${Math.max(2, (100 * Math.max(0, w.units)) / most)}%` }}
                />
              </span>
              <span className="tabular-nums sm:text-right">
                {w.units} · {w.batches.join(", ")}
                {w.issueOnly ? ` · ${CATALOGUE.map.noBalance}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="trace-batches" className="flex flex-col gap-2">
        <h3 id="trace-batches" className="text-heading-s text-foreground">
          {T.batchesTitle}
        </h3>
        <ul className="border-border bg-card divide-border divide-y rounded-lg border">
          {t.batches.map((b) => (
            <li
              key={b.id}
              className="text-body-s flex flex-wrap items-center justify-between gap-2 px-4 py-2"
            >
              <span>
                <span className="font-mono">{b.batchNumber}</span> ·{" "}
                {b.expiryMonthOnly ? b.expiry.slice(0, 7) : b.expiry} · {b.place} · {b.units}
                {b.recalled ? ` · ${T.recalled}` : ""}
                {b.quarantined ? ` · ${T.quarantined}` : ""}
              </span>
              {b.recallId ? (
                <Link href={`/pharmacy/store/expiry/recalls/${b.recallId}`} className={LINK}>
                  {T.whoReceived(b.batchNumber)}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="trace-moves" className="flex flex-col gap-2">
        <h3 id="trace-moves" className="text-heading-s text-foreground">
          {T.movements}
        </h3>
        <nav aria-label={T.movements} className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={f === "all" ? base : `${base}&show=${f}`}
              aria-current={f === filter ? "page" : undefined}
              className="text-body-s border-border inline-flex min-h-11 items-center rounded-md border px-3 aria-[current=page]:font-semibold"
            >
              {T.filters[f]}
            </Link>
          ))}
        </nav>
        {moves.length === 0 ? (
          <p className="text-body-s text-muted-foreground">{T.none}</p>
        ) : (
          <ul className="border-border bg-card divide-border divide-y rounded-lg border">
            {moves.map((m) => (
              <li key={m.id} className="text-body-s flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  {(CATALOGUE.movementWords as Record<string, string>)[m.kind] ?? m.kind} ·{" "}
                  {m.place} · <span className="font-mono">{m.batchNumber}</span> ·{" "}
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </span>
                <span className="text-muted-foreground">
                  {when.format(m.at)}
                  {m.who ? ` · ${m.who}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
