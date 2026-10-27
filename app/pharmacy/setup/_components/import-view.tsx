import type { PharmacyV2 } from "../../_lib/v2";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";

import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { asClinicalReader } from "@/lib/emr/db";
import { rowsOf } from "@/lib/exchange/store";
import { can } from "@/lib/pharmacy/access";
import { pharmacyCatalogueLiveFor } from "@/lib/pharmacy/feature";
import { importPage } from "@/lib/pharmacy/imports/store";
import { DraftRows, ImportUpload } from "./import-controls";

const I = CATALOGUE.imports;
const card = "bg-card shadow-tide-card rounded-tide-card overflow-hidden";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Set-up › Import (4.7; catalogue slice Step 9, ADR 0462). Read as the viewer (RLS: `pharmacy.view`); the controls
 * show to `pharmacy.stock`, and every write re-checks it on the server.
 */
export async function ImportView({ v2, draftId }: { v2: PharmacyV2; draftId?: string }) {
  const actor = v2.scope;
  if (!pharmacyCatalogueLiveFor(actor.hospitalId)) notFound();
  const edit = can(actor.access, "pharmacy.stock");
  const [page, stores, suppliers] = await asClinicalReader(
    actor,
    async (tx) =>
      [
        await importPage(tx, actor.hospitalId, draftId && UUID.test(draftId) ? draftId : undefined),
        rowsOf<{ id: string; name: string }>(
          await tx.execute(sql`SELECT id, name FROM public.pharmacy_locations
        WHERE hospital_id = ${actor.hospitalId} AND kind = 'store' AND archived_at IS NULL AND live_at IS NULL
        ORDER BY name`),
        ),
        rowsOf<{ id: string; name: string }>(
          await tx.execute(sql`SELECT id, name FROM public.pharmacy_counterparties
        WHERE hospital_id = ${actor.hospitalId} AND kind = 'supplier' AND retired_at IS NULL ORDER BY name`),
        ),
      ] as const,
  );

  // Each option of a "check" row in words: a catalogue entry's name and strength, a product's name, a pack.
  type Opt = {
    name?: string;
    strength?: string | null;
    productId?: string | null;
    packId?: string | null;
  };
  const opts = page.rows.flatMap((r) => (r.proposal as { options?: Opt[] } | null)?.options ?? []);
  const ids = (k: "productId" | "packId") => [
    ...new Set(opts.map((o) => o[k]).filter((x): x is string => !!x)),
  ];
  const [productNames, packNames] = await asClinicalReader(
    actor,
    async (tx) =>
      [
        new Map(
          ids("productId").length
            ? rowsOf<{ id: string; name: string }>(
                await tx.execute(sql`SELECT id, name || coalesce(' · ' || strength, '') AS name FROM public.pharmacy_products
              WHERE id IN (${sql.join(
                ids("productId").map((i) => sql`${i}::uuid`),
                sql`, `,
              )})`),
              ).map((r) => [r.id, r.name])
            : [],
        ),
        new Map(
          ids("packId").length
            ? rowsOf<{ id: string; name: string }>(
                await tx.execute(sql`SELECT k.id, m.display_name || coalesce(' · ' || p.brand_name, '') || ' · ' || k.description AS name
              FROM public.cat_packs k JOIN public.cat_products p ON p.id = k.product_id JOIN public.cat_medicines m ON m.id = p.medicine_id
              WHERE k.id IN (${sql.join(
                ids("packId").map((i) => sql`${i}::uuid`),
                sql`, `,
              )})`),
              ).map((r) => [r.id, r.name])
            : [],
        ),
      ] as const,
  );
  const label = (o: Opt) =>
    o.name
      ? [o.name, o.strength].filter(Boolean).join(" · ")
      : o.productId && !o.packId
        ? (productNames.get(o.productId) ?? o.productId)
        : (packNames.get(o.packId ?? "") ?? o.productId ?? "");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <p className="text-body-s text-ink-700 max-w-[70ch]">{I.lead}</p>
      {edit && <ImportUpload stores={stores} suppliers={suppliers} />}

      <section aria-label={I.drafts} className={card}>
        <h3 className="text-heading-s text-foreground border-border border-b px-4 py-3">
          {I.drafts}
        </h3>
        {page.drafts.length === 0 ? (
          <p className="text-body-s text-muted-foreground px-4 py-3">{I.none}</p>
        ) : (
          <ul className="divide-border divide-y">
            {page.drafts.map((d) => (
              <li
                key={d.id}
                className="text-body-s flex flex-wrap items-center justify-between gap-3 px-4 py-2"
              >
                <span>
                  {I.kinds[d.kind]} · {d.fileName} · {I.rows(d.rowCount)}
                  {d.committedAt && <span className="text-muted-foreground"> · {I.committed}</span>}
                </span>
                <Link
                  href={`/pharmacy/setup?view=import&draft=${d.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {I.open}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {page.open && (
        <DraftRows
          draft={{
            id: page.open.id,
            kind: page.open.kind,
            committed: page.open.committedAt !== null,
          }}
          rows={page.rows.map((r) => ({
            id: r.id,
            lineNo: r.lineNo,
            raw: r.raw,
            match: r.match,
            why: r.why,
            options: ((r.proposal as { options?: Opt[] } | null)?.options ?? []).map(label),
            decision: r.decision,
            committed: r.committedId !== null,
          }))}
          edit={edit}
        />
      )}
    </div>
  );
}
