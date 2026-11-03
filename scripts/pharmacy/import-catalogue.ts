/* eslint-disable no-console -- owner CLI: it reports to the terminal */
/**
 * Import a catalogue or price list into the master catalogue's classification (MEDICINES-TAB.md §11.1, §14;
 * acceptance 14). Owner-run, after 0270. Idempotent and keyed on identity (generic + strength + form + route): a
 * re-run on a new EMHSLU, NMS, JMS or UNEPI file adds that list's tag and updates classification and the supplier
 * price, and never creates a duplicate. A medicine the catalogue does not hold yet is listed in the report for the
 * curators: catalogue facts enter only through a proposal two curators confirm (0251). The ATC code is stored only
 * where the file gives one under a WHO licence; otherwise the level-1 letter and the class.
 *
 *   npm run pharmacy:import-catalogue -- <file.csv> --source NMS [--apply --actor <your auth user id>]
 *
 * Columns (header row, any order): generic, strength, form, route, issue_unit, atc_level1, atc_code,
 * therapeutic_class, pharm_group, sale_category, flags (space-separated: controlled high cold freeze cyto),
 * packs (space-separated), price_ugx, nda_reg_no.
 */
import "./_env";

import { readFileSync } from "node:fs";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { rowsOf } from "@/lib/pharmacy/audit/read";
import { asActor, DryRun, runCli } from "../emr/_cli";

export const SOURCES = ["EMHSLU", "NMS", "JMS", "UNEPI"] as const;
export type Source = (typeof SOURCES)[number];
const SALE = ["controlled", "prescription_only", "pharmacy_only", "over_the_counter"];
const FLAG = ["controlled", "high", "cold", "freeze", "cyto"];

export interface CatalogueRow {
  line: number;
  generic: string;
  strength: string;
  form: string;
  route: string;
  issueUnit: string | null;
  atcLevel1: string | null;
  atcCode: string | null;
  cls: string | null;
  group: string | null;
  sale: string | null;
  flags: Record<string, boolean>;
  packs: number[];
  price: number | null;
  nda: string | null;
}

/** One CSV line into cells, with quoted cells. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') ((cur += '"'), i++);
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") (out.push(cur.trim()), (cur = ""));
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function readCatalogue(csv: string): {
  rows: CatalogueRow[];
  refused: { line: number; why: string }[];
} {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  const head = cells(lines[0] ?? "").map((h) => h.toLowerCase());
  const at = (r: string[], k: string) => {
    const i = head.indexOf(k);
    const v = i >= 0 ? (r[i] ?? "").trim() : "";
    return v || null;
  };
  const rows: CatalogueRow[] = [];
  const refused: { line: number; why: string }[] = [];
  lines.slice(1).forEach((l, i) => {
    const r = cells(l);
    const line = i + 2;
    const generic = at(r, "generic");
    const strength = at(r, "strength");
    const form = at(r, "form");
    const route = at(r, "route");
    if (!generic || !strength || !form || !route)
      return refused.push({ line, why: "generic, strength, form and route are all needed" });
    const atc1 = at(r, "atc_level1")?.toUpperCase() ?? null;
    if (atc1 && !/^[ABCDGHJLMNPRSV]$/.test(atc1))
      return refused.push({ line, why: `ATC level 1 "${atc1}"` });
    const sale = at(r, "sale_category");
    if (sale && !SALE.includes(sale)) return refused.push({ line, why: `sale category "${sale}"` });
    const price = at(r, "price_ugx");
    if (price && !(Number(price) > 0)) return refused.push({ line, why: `price "${price}"` });
    const flags = Object.fromEntries(
      (at(r, "flags") ?? "")
        .split(/\s+/)
        .filter((f) => FLAG.includes(f))
        .map((f) => [f, true]),
    );
    rows.push({
      line,
      generic,
      strength,
      form,
      route,
      issueUnit: at(r, "issue_unit"),
      atcLevel1: atc1,
      atcCode: at(r, "atc_code"),
      cls: at(r, "therapeutic_class"),
      group: at(r, "pharm_group"),
      sale,
      flags,
      packs: (at(r, "packs") ?? "")
        .split(/\s+/)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
      price: price ? Math.round(Number(price)) : null,
      nda: at(r, "nda_reg_no"),
    });
  });
  return { rows, refused };
}

/** The catalogue medicine for an identity: its identity columns, or (first import) its printed name. */
async function find(tx: EmrTx, r: CatalogueRow): Promise<string[]> {
  return rowsOf<{ id: string }>(
    await tx.execute(sql`
    SELECT id FROM public.cat_medicines
     WHERE status = 'active' AND (
       (lower(generic) = lower(${r.generic}) AND lower(coalesce(strength_text,'')) = lower(${r.strength})
         AND lower(coalesce(form_label,'')) = lower(${r.form}) AND lower(coalesce(route_label,'')) = lower(${r.route}))
       OR (generic IS NULL AND lower(display_name) IN (lower(${`${r.generic} ${r.strength} ${r.form}`}),
         lower(${`${r.generic} ${r.strength}`}))))`),
  ).map((x) => x.id);
}

export async function importCatalogue(
  db: EmrDb,
  csv: string,
  source: Source,
  apply: boolean,
  actor?: string,
) {
  const { rows, refused } = readCatalogue(csv);
  const report = { updated: 0, missing: [] as string[], several: [] as string[], refused };
  try {
    await db.transaction(async (tx) => {
      if (actor) await asActor(tx, actor);
      for (const r of rows) {
        const ids = await find(tx, r);
        const name = `${r.generic} ${r.strength} ${r.form} ${r.route} (line ${r.line})`;
        if (!ids.length) {
          report.missing.push(name);
          continue;
        }
        if (ids.length > 1) {
          report.several.push(name);
          continue;
        }
        await tx.execute(sql`
          UPDATE public.cat_medicines SET
            generic = ${r.generic}, form_label = ${r.form}, route_label = ${r.route},
            issue_unit = coalesce(${r.issueUnit}, issue_unit),
            atc_level1 = coalesce(${r.atcLevel1}, atc_level1), atc_code = coalesce(${r.atcCode}, atc_code),
            therapeutic_class = coalesce(${r.cls}, therapeutic_class), pharm_group = coalesce(${r.group}, pharm_group),
            sale_category = coalesce(${r.sale}, sale_category),
            sources = (SELECT array_agg(DISTINCT s ORDER BY s) FROM unnest(sources || ARRAY[${source}]::text[]) s),
            default_flags = default_flags || ${JSON.stringify(r.flags)}::jsonb,
            default_packs = (SELECT coalesce(array_agg(DISTINCT p ORDER BY p), '{}') FROM unnest(default_packs || ${r.packs}::int[]) p),
            nda_reg_nos = CASE WHEN ${r.nda}::text IS NULL OR ${r.nda} = ANY(nda_reg_nos) THEN nda_reg_nos
                               ELSE nda_reg_nos || ARRAY[${r.nda}]::text[] END,
            supplier_prices = CASE WHEN ${r.price}::int IS NULL THEN supplier_prices
                                   ELSE supplier_prices || jsonb_build_object(${source}, ${r.price}::int) END
           WHERE id = ${ids[0]}`);
        report.updated++;
      }
      if (!apply) throw new DryRun();
    });
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
  }
  return { ...report, rows: rows.length };
}

if (process.argv[1]?.endsWith("import-catalogue.ts")) {
  const args = process.argv.slice(2);
  const file = args[0];
  const s = args.indexOf("--source");
  const source = (s >= 0 ? args[s + 1] : undefined) as Source | undefined;
  void runCli(
    "Import a catalogue or price list: <file.csv> --source EMHSLU|NMS|JMS|UNEPI [--apply --actor <uuid>].",
    async ({ db, apply, actor }) => {
      if (!file || file.startsWith("--") || !source || !SOURCES.includes(source))
        throw new Error("Give the CSV file and --source EMHSLU, NMS, JMS or UNEPI.");
      const r = await importCatalogue(db, readFileSync(file, "utf8"), source, apply, actor);
      console.log(`Rows: ${r.rows} · updated: ${r.updated} · refused: ${r.refused.length}`);
      for (const x of r.refused) console.log(`  refused line ${x.line}: ${x.why}`);
      if (r.several.length)
        console.log(
          `Matches several catalogue medicines (fix by hand):\n  ${r.several.join("\n  ")}`,
        );
      if (r.missing.length)
        console.log(
          `Not in the catalogue yet (propose them for the curators):\n  ${r.missing.join("\n  ")}`,
        );
    },
  );
}
