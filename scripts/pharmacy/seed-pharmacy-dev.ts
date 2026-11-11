/* eslint-disable no-console -- owner CLI: it reports to the terminal */
/**
 * Dev seed for Set-up › Medicines (PROMPT-MEDICINES step 2): about 50 lines from the prescribing formulary, for a
 * test hospital only. It writes identity, class and form from the formulary and a store top-up level of 100, and
 * nothing else: no prices, no stock, no VEN (those are a person's to set, or come from receiving). Refused unless the
 * hospital is listed in PHARMACY_DEV_HOSPITALS. Idempotent: a line already stocked is skipped.
 *
 *   npm run pharmacy:seed-dev -- --hospital <uuid> [--apply --actor <your auth user id>]
 */
import "./_env";

import { randomUUID } from "node:crypto";
import type { EmrDb } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { rowsOf } from "@/lib/pharmacy/audit/read";
import { DRUGS } from "@/lib/prescribing/formulary";
import { asActor, DryRun, runCli } from "../emr/_cli";

const ROUTE: Record<string, string> = {
  iv: "IV",
  im: "IM",
  sc: "SC",
  po: "Oral",
  oral: "Oral",
  pr: "Rectal",
};

export async function seedDev(
  db: EmrDb,
  hospitalId: string,
  apply: boolean,
  actor: string | undefined,
) {
  const dev = (process.env.PHARMACY_DEV_HOSPITALS ?? "").split(",").map((s) => s.trim());
  if (!dev.includes(hospitalId))
    throw new Error("That hospital is not in PHARMACY_DEV_HOSPITALS: refusing.");
  if (!actor)
    throw new Error(
      "Give --actor <your auth user id>, even for a dry run: each line names who added it.",
    );
  let added = 0;
  try {
    await db.transaction(async (tx) => {
      if (actor) await asActor(tx, actor);
      const [store] = rowsOf<{ id: string }>(
        await tx.execute(sql`SELECT id FROM public.pharmacy_locations WHERE hospital_id = ${hospitalId}
          AND kind = 'store' AND archived_at IS NULL ORDER BY created_at LIMIT 1`),
      );
      for (const d of DRUGS.slice(0, 50)) {
        const route = d.routes.map((r) => ROUTE[r] ?? r.toUpperCase()).join("/") || null;
        const form = d.presentationsDraft[0] ?? null;
        const id = randomUUID();
        const r = rowsOf<{ id: string }>(
          await tx.execute(sql`
          INSERT INTO public.pharmacy_products (id, hospital_id, medicine_id, name, issue_unit, generic, form, route,
            controlled_class, created_by)
          SELECT ${id}, ${hospitalId}, ${d.id}, ${`${d.generic}${form ? ` ${form.toLowerCase()}` : ""}`.slice(0, 160)},
            'unit', ${d.generic}, ${form}, ${route}, ${d.flags.controlled ? "controlled" : null}, ${actor ?? null}
           WHERE NOT EXISTS (SELECT 1 FROM public.pharmacy_products p WHERE p.hospital_id = ${hospitalId}
             AND p.active AND (p.medicine_id = ${d.id} OR lower(p.generic) = lower(${d.generic})))
          RETURNING id`),
        );
        if (!r.length) continue;
        added++;
        if (store)
          await tx.execute(sql`INSERT INTO public.pharmacy_reorder_levels (hospital_id, location_id, product_id,
            medicine_id, level, valid_from, set_by) VALUES (${hospitalId}, ${store.id}, ${id}, ${d.id}, 100,
            private.pharmacy_local_date(), ${actor ?? null})`);
      }
      if (!apply) throw new DryRun();
    });
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
  }
  return added;
}

if (process.argv[1]?.endsWith("seed-pharmacy-dev.ts")) {
  const args = process.argv.slice(2);
  const h = args.indexOf("--hospital");
  const hospital = h >= 0 ? args[h + 1] : undefined;
  void runCli(
    "Seed ~50 medicine lines for a dev hospital: --hospital <uuid> [--apply --actor <uuid>].",
    async ({ db, apply, actor }) => {
      if (!hospital) throw new Error("Give --hospital <uuid>.");
      console.log(
        `Lines ${apply ? "added" : "to add"}: ${await seedDev(db, hospital, apply, actor)}`,
      );
    },
  );
}
