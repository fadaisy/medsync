/* eslint-disable no-console */
/**
 * Register the patient symptom catalog in the database (ADR 0098 rulings 2
 * and 5; migration 0066). Reads `catalog.v0.1.json` + `i18n/en.json` — the
 * same package `scripts/gen-symptom-catalog.mjs` embeds — and computes the
 * checksum with the shared function, so the row matches what every
 * submission stamps. Upserts the version row (status `draft` unless the
 * owner signs it here) and mirrors the items for FK/audit.
 *
 * Owner action, after `npm run db:migrate` has applied 0066:
 *
 *   npm run db:seed-symptom-catalog                              # draft
 *   npm run db:seed-symptom-catalog -- --sign <ref> --signed-by <uuid>
 *   npm run db:seed-symptom-catalog -- --dev-mulago               # dev only
 *
 * `--sign` is Gate CS: production renders this version only once it is
 * `signed`, and the artifact ref is the CSO's sign-off document.
 * `--dev-mulago` sets the Mulago dev hospital to 24h + pre-alert with a
 * dev board owner so the Incoming board can be exercised. Never in prod.
 *
 * Runs under tsx (already used by ncd:check): the checksum module is
 * imported without an extension so the app tsconfig typechecks this file.
 */
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";

import { catalogChecksum } from "../supabase/functions/_shared/symptom-catalog/checksum";

for (const f of [".env", ".env.local"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required (pooler URL on port 6543).");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};
const signRef = flag("--sign");
const signedBy = flag("--signed-by");
const devMulago = args.includes("--dev-mulago");
if ((signRef === null) !== (signedBy === null)) {
  console.error("--sign <artifact-ref> and --signed-by <uuid> go together.");
  process.exit(1);
}
if (devMulago && (process.env.MEDSYNC_ENV ?? process.env.VERCEL_ENV) === "production") {
  console.error("--dev-mulago is refused in production.");
  process.exit(1);
}

const DIR = "./supabase/functions/_shared/symptom-catalog";
const read = (rel: string) => JSON.parse(readFileSync(`${DIR}/${rel}`, "utf8")) as unknown;

interface Item {
  key: string;
  tier: "E" | "U" | "R";
  category: string;
  audience: string[];
  triageDiscriminatorRef: string | null;
  reasoningTokenRef: string | null;
  flags?: string[];
}
const pkg = {
  ...(read("catalog.v0.1.json") as { version: string; items: Item[] }),
  en: read("i18n/en.json"),
};
const checksum = catalogChecksum(pkg);

const client = postgres(url, { prepare: false, max: 1 });

async function main() {
  const status = signRef ? "signed" : "draft";
  await client.begin(async (tx) => {
    // Gate CS: a SIGNED row is what the CSO read. A re-run without --sign
    // never touches its checksum — a drifted package is a new version, not
    // a silent refresh — and --sign over a different checksum is refused.
    const [existing] = await tx.unsafe<{ status: string; checksum: string }[]>(
      `SELECT status, checksum FROM public.patient_symptom_catalog_versions WHERE version = $1;`,
      [pkg.version],
    );
    if (existing?.status === "signed" && existing.checksum !== checksum) {
      throw new Error(
        `Version ${pkg.version} is SIGNED with checksum ${existing.checksum}; the package on disk is ${checksum}. ` +
          "Bump the version in catalog.v0.1.json (and rename the files) instead of editing signed content.",
      );
    }
    // The version row. A signed row is never demoted back to draft by a
    // re-run without --sign.
    await tx.unsafe(
      `INSERT INTO public.patient_symptom_catalog_versions
         (version, status, checksum, item_count, signed_by_user_id, signed_at, signoff_artifact_ref)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $2 = 'signed' THEN now() END, $6)
       ON CONFLICT (version) DO UPDATE SET
         checksum = EXCLUDED.checksum,
         item_count = EXCLUDED.item_count,
         status = CASE WHEN EXCLUDED.status = 'signed' THEN 'signed'
                       ELSE public.patient_symptom_catalog_versions.status END,
         signed_by_user_id = COALESCE(EXCLUDED.signed_by_user_id, public.patient_symptom_catalog_versions.signed_by_user_id),
         signed_at = COALESCE(EXCLUDED.signed_at, public.patient_symptom_catalog_versions.signed_at),
         signoff_artifact_ref = COALESCE(EXCLUDED.signoff_artifact_ref, public.patient_symptom_catalog_versions.signoff_artifact_ref);`,
      [pkg.version, status, checksum, pkg.items.length, signedBy, signRef],
    );

    // The mirror: exactly the package's items, nothing stale left behind.
    await tx.unsafe(`DELETE FROM public.patient_symptom_catalog_items WHERE version = $1;`, [
      pkg.version,
    ]);
    for (const it of pkg.items) {
      await tx.unsafe(
        `INSERT INTO public.patient_symptom_catalog_items
           (key, version, tier, category, audience, triage_discriminator_ref, reasoning_token_ref, flags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [
          it.key,
          pkg.version,
          it.tier,
          it.category,
          it.audience,
          it.triageDiscriminatorRef,
          it.reasoningTokenRef,
          it.flags ?? [],
        ],
      );
    }

    if (devMulago) {
      const rows = await tx.unsafe(
        `UPDATE public.hospitals
           SET emergency_capability = '24h', pre_alert_enabled = true,
               board_owner_note = 'Dev seed — reception desk'
         WHERE slug LIKE 'mulago%'
         RETURNING slug;`,
      );
      console.log(`dev-mulago: ${rows.length} hospital(s) set to 24h + pre-alert`);
    }
  });

  console.log(
    `catalog v${pkg.version}: ${status}, ${pkg.items.length} items, ${checksum}` +
      (signRef ? ` (signed by ${signedBy}, ref ${signRef})` : ""),
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => client.end());
