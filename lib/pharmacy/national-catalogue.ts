import "server-only";

import type { LoadedRow } from "./national-list";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import {
  pharmacyMedicineLinks,
  pharmacyNationalListEditions,
  pharmacyNationalListRowChecks,
  pharmacyNationalListRows,
} from "@/db/schema/pharmacy-dispensing";
import { EmrWriteError } from "@/lib/emr/write/context";
import { FORMULARY_DRUGS } from "@/lib/prescribing/reference/general-formulary";
import { linkProposals } from "./national-list";

/**
 * The national list as the pharmacy's catalogue (Pharmacy Phase 1, CT-3; ADR 0282). The owner loads an
 * edition with scripts/pharmacy/load-national-list.ts; the CSO links its medicine rows to the
 * prescribing list once, nationally, from /admin/pharmacy-catalogue; pharmacy staff search it from
 * Stock. Links and checks are written as the clinical writer (audited). Nothing is matched by guess.
 */

type Database = EmrDb | EmrTx;

/** The edition in use: the most recently loaded. */
export async function currentEdition(database: Database) {
  const [e] = await database
    .select()
    .from(pharmacyNationalListEditions)
    .orderBy(desc(pharmacyNationalListEditions.importedAt))
    .limit(1);
  return e ?? null;
}

const rowColumns = {
  id: pharmacyNationalListRows.id,
  genericName: pharmacyNationalListRows.genericName,
  form: pharmacyNationalListRows.form,
  strength: pharmacyNationalListRows.strength,
  unit: pharmacyNationalListRows.unit,
  levelOfCare: pharmacyNationalListRows.levelOfCare,
  venClass: pharmacyNationalListRows.venClass,
  therapeuticClass: pharmacyNationalListRows.therapeuticClass,
  listSection: pharmacyNationalListRows.listSection,
  kind: pharmacyNationalListRows.kind,
  specialist: pharmacyNationalListRows.specialist,
  sourcePage: pharmacyNationalListRows.sourcePage,
  checkNote: pharmacyNationalListRows.checkNote,
};

/** The CSO's console: the edition, its counts, the link proposals and the flagged rows. */
export async function loadCatalogueConsole(database: Database) {
  const edition = await currentEdition(database);
  if (!edition) return null;
  const [rows, checks, links] = await Promise.all([
    database
      .select(rowColumns)
      .from(pharmacyNationalListRows)
      .where(eq(pharmacyNationalListRows.editionId, edition.id))
      .orderBy(asc(pharmacyNationalListRows.sourceLine)),
    database
      .select({
        rowId: pharmacyNationalListRowChecks.rowId,
        note: pharmacyNationalListRowChecks.note,
        checkedAt: pharmacyNationalListRowChecks.checkedAt,
      })
      .from(pharmacyNationalListRowChecks)
      .innerJoin(
        pharmacyNationalListRows,
        eq(pharmacyNationalListRows.id, pharmacyNationalListRowChecks.rowId),
      )
      .where(eq(pharmacyNationalListRows.editionId, edition.id)),
    database
      .select({ medicineId: pharmacyMedicineLinks.medicineId, rowId: pharmacyMedicineLinks.rowId })
      .from(pharmacyMedicineLinks)
      .where(eq(pharmacyMedicineLinks.editionId, edition.id)),
  ]);
  const checkOf = new Map(checks.map((c) => [c.rowId, c]));
  const loaded = rows.map((r) => ({
    ...r,
    checked: checkOf.has(r.id),
    check: checkOf.get(r.id) ?? null,
  })) satisfies LoadedRow[];
  return {
    edition,
    counts: {
      rows: rows.length,
      medicines: rows.filter((r) => r.kind === "medicine").length,
      supplies: rows.filter((r) => r.kind === "supply").length,
      specialist: rows.filter((r) => r.specialist).length,
      flagged: rows.filter((r) => r.checkNote).length,
      linked: links.length,
    },
    proposals: linkProposals(loaded, FORMULARY_DRUGS, links),
    flagged: loaded.filter((r) => r.checkNote),
  };
}

export const SEARCH_LIMIT = 100;

/**
 * Stock's national-list search (pharmacy staff, under RLS: `pharmacy.view`). The current edition's
 * rows whose name or class contains `q`, with the prescribing-list medicine a row is linked to.
 */
export async function searchNationalList(
  tx: Database,
  f: { q: string; kind: "medicine" | "supply" | null; vital: boolean },
) {
  const edition = await currentEdition(tx);
  if (!edition) return null;
  const q = f.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
  const where = and(
    eq(pharmacyNationalListRows.editionId, edition.id),
    f.kind ? eq(pharmacyNationalListRows.kind, f.kind) : undefined,
    f.vital ? eq(pharmacyNationalListRows.venClass, "V") : undefined,
    q
      ? or(
          ilike(pharmacyNationalListRows.genericName, `%${q}%`),
          ilike(pharmacyNationalListRows.therapeuticClass, `%${q}%`),
        )
      : undefined,
  );
  const [rows, [total]] = await Promise.all([
    tx
      .select({ ...rowColumns, medicineId: pharmacyMedicineLinks.medicineId })
      .from(pharmacyNationalListRows)
      .leftJoin(pharmacyMedicineLinks, eq(pharmacyMedicineLinks.rowId, pharmacyNationalListRows.id))
      .where(where)
      .orderBy(asc(pharmacyNationalListRows.sourceLine))
      .limit(SEARCH_LIMIT),
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(pharmacyNationalListRows)
      .where(where),
  ]);
  return { edition, rows, total: total?.n ?? 0 };
}

/* ─── The CSO's writes (ADR 0282) ─────────────────────────────────────── */

const known = new Set(FORMULARY_DRUGS.map((d) => d.id));

/**
 * Link prescribing-list medicines to rows of the current edition. The database refuses a supply row, a
 * row of another edition and a flagged row nobody has checked (0136); a medicine already linked in
 * this edition is refused here, so a batch never half-applies.
 */
export async function confirmLinks(
  tx: EmrTx,
  signer: { userId: string },
  editionId: string,
  picks: readonly { medicineId: string; rowId: string }[],
): Promise<number> {
  if (!picks.length) throw new EmrWriteError("invalid", "Choose at least one link.");
  if (new Set(picks.map((p) => p.medicineId)).size !== picks.length)
    throw new EmrWriteError("invalid", "One row per medicine.");
  const unknown = picks.find((p) => !known.has(p.medicineId));
  if (unknown) throw new EmrWriteError("invalid", "Not a prescribing-list medicine.");
  const already = await tx
    .select({ medicineId: pharmacyMedicineLinks.medicineId })
    .from(pharmacyMedicineLinks)
    .where(
      and(
        eq(pharmacyMedicineLinks.editionId, editionId),
        inArray(
          pharmacyMedicineLinks.medicineId,
          picks.map((p) => p.medicineId),
        ),
      ),
    );
  if (already.length)
    throw new EmrWriteError(
      "conflict",
      "A medicine in this batch is already linked. Reload the page.",
    );
  await tx
    .insert(pharmacyMedicineLinks)
    .values(picks.map((p) => ({ ...p, editionId, linkedBy: signer.userId })));
  return picks.length;
}

export async function removeLink(tx: EmrTx, editionId: string, medicineId: string) {
  const gone = await tx
    .delete(pharmacyMedicineLinks)
    .where(
      and(
        eq(pharmacyMedicineLinks.editionId, editionId),
        eq(pharmacyMedicineLinks.medicineId, medicineId),
      ),
    )
    .returning({ id: pharmacyMedicineLinks.id });
  if (!gone.length) throw new EmrWriteError("not_found", "That medicine is not linked.");
}

/** The CSO records checking a flagged row against the source; the row itself is never changed. */
export async function recordRowCheck(
  tx: EmrTx,
  signer: { userId: string },
  rowId: string,
  note: string,
) {
  const [row] = await tx
    .select({ checkNote: pharmacyNationalListRows.checkNote })
    .from(pharmacyNationalListRows)
    .where(eq(pharmacyNationalListRows.id, rowId));
  if (!row) throw new EmrWriteError("not_found", "No such row.");
  if (!row.checkNote) throw new EmrWriteError("invalid", "This row is not flagged.");
  await tx
    .insert(pharmacyNationalListRowChecks)
    .values({ rowId, checkedBy: signer.userId, note: note.trim() })
    .onConflictDoNothing();
}
