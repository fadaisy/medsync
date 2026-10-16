/**
 * The national list as the pharmacy's catalogue (ADR 0282, migration 0136) on the PGlite lane, every
 * migration replayed. Rows here are fixtures, never the edition's own (Law 8).
 * Runs only with EMR_PGLITE=1.
 */
import type { Lane, Pg } from "./_pglite";
import type { EmrTx } from "@/lib/emr/db";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { asClinicalReader } from "@/lib/emr/db";
import {
  confirmLinks,
  loadCatalogueConsole,
  recordRowCheck,
  removeLink,
  searchNationalList,
} from "@/lib/pharmacy/national-catalogue";
import { FORMULARY_DRUGS } from "@/lib/prescribing/reference/general-formulary";
import { bootLane, department, hospital, laneOn, staff, superadmin } from "./_pglite";

vi.mock("server-only", () => ({}));

const MED_A = FORMULARY_DRUGS[0]!;
const MED_B = FORMULARY_DRUGS[1]!;
const MED_C = FORMULARY_DRUGS[2]!;

describe.skipIf(!laneOn)("the national catalogue (ADR 0282, 0136)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;
  const one = async (sql: string, p?: unknown[]) =>
    (await pg.query<{ id: string }>(sql, p)).rows[0]!.id;
  const write = <T>(fn: (tx: EmrTx) => Promise<T>) =>
    lane.db.transaction((tx) => fn(tx as unknown as EmrTx));
  const row = (edition: string, o: Record<string, unknown>) =>
    one(
      `INSERT INTO public.pharmacy_national_list_rows
         (edition_id, generic_name, form, strength, kind, specialist, source_page, check_note, source_line, ven_class)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        edition,
        o.name,
        o.form ?? null,
        o.strength ?? null,
        o.kind ?? "medicine",
        o.specialist ?? false,
        o.page ?? null,
        o.note ?? null,
        o.line ?? null,
        o.ven ?? null,
      ],
    );

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    f.h = await hospital(pg, "Catalogue hospital");
    const pharm = await one(
      `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
       VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
      [f.h, `pharmacy-${Date.now()}`],
    );
    f.point = await one(
      `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
       VALUES ($1, $2, 'Outpatient pharmacy', $3, 'support') RETURNING id`,
      [f.h, pharm, `op-${Date.now()}`],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves) VALUES ($1, $2, 'window')`,
      [f.point, f.h],
    );
    f.pharmacist = (
      await staff(pg, { hospitalId: f.h, departmentId: f.point, cadre: "PHARMACIST" })
    ).userId;
    f.nurse = (
      await staff(pg, {
        hospitalId: f.h,
        departmentId: await department(pg, f.h, "Ward"),
        cadre: "NURSE",
      })
    ).userId;
    f.cso = await superadmin(pg);
    f.edition = await one(
      `INSERT INTO public.pharmacy_national_list_editions (name, source_ref, imported_by)
       VALUES ('Fixture list', 'fixture', $1) RETURNING id`,
      [f.cso],
    );
    f.other = await one(
      `INSERT INTO public.pharmacy_national_list_editions (name, source_ref, imported_by, imported_at)
       VALUES ('Older fixture list', 'fixture', $1, now() - interval '1 year') RETURNING id`,
      [f.cso],
    );
    f.a = await row(f.edition, {
      name: MED_A.generic,
      form: "Tablet",
      strength: "[S1]",
      line: 2,
      ven: "V",
    });
    f.b1 = await row(f.edition, { name: MED_B.generic.toUpperCase(), form: "Tablet", line: 3 });
    f.b2 = await row(f.edition, {
      name: MED_B.generic,
      form: "Injection",
      line: 4,
      specialist: true,
    });
    f.c = await row(f.edition, {
      name: MED_C.generic,
      line: 5,
      page: 33,
      note: "fixture: VEN printed blank",
    });
    f.supply = await row(f.edition, { name: MED_A.generic, kind: "supply", line: 6 });
    f.old = await row(f.other, { name: MED_A.generic, line: 2 });
  });

  it("the console proposes by generic name, never a supply row, and flags an unchecked row unlinkable", async () => {
    const c = (await loadCatalogueConsole(lane.db))!;
    expect(c.edition.id).toBe(f.edition);
    expect(c.counts).toMatchObject({
      rows: 5,
      medicines: 4,
      supplies: 1,
      specialist: 1,
      flagged: 1,
    });
    const byMed = new Map(c.proposals.map((p) => [p.medicineId, p]));
    expect(byMed.get(MED_A.id)!.candidates.map((x) => x.id)).toEqual([f.a]);
    expect(byMed.get(MED_B.id)!.candidates.map((x) => x.id)).toEqual([f.b1, f.b2]);
    expect(byMed.get(MED_C.id)!.candidates[0]!.linkable).toBe(false);
  });

  it("the database refuses a supply row, another edition's row and an unchecked flagged row", async () => {
    const link = (medicineId: string, rowId: string, editionId = f.edition!) =>
      pg.query(
        `INSERT INTO public.pharmacy_medicine_links (medicine_id, row_id, edition_id, linked_by)
         VALUES ($1, $2, $3, $4)`,
        [medicineId, rowId, editionId, f.cso],
      );
    await expect(link(MED_A.id, f.supply!)).rejects.toThrow(/Only a medicine row/);
    await expect(link(MED_A.id, f.old!)).rejects.toThrow(/not in this edition/);
    await expect(link(MED_C.id, f.c!)).rejects.toThrow(/flagged/);
  });

  it("a recorded check lets a flagged row link; the check is append-only and the row unchanged", async () => {
    await write((tx) =>
      recordRowCheck(tx, { userId: f.cso! }, f.c!, "Checked p. 33: blank as printed."),
    );
    await write((tx) =>
      confirmLinks(tx, { userId: f.cso! }, f.edition!, [{ medicineId: MED_C.id, rowId: f.c! }]),
    );
    await expect(
      pg.query(
        `UPDATE public.pharmacy_national_list_row_checks SET note = 'changed note here' WHERE row_id = $1`,
        [f.c],
      ),
    ).rejects.toThrow();
    const r = await pg.query<{ check_note: string }>(
      `SELECT check_note FROM public.pharmacy_national_list_rows WHERE id = $1`,
      [f.c],
    );
    expect(r.rows[0]!.check_note).toBe("fixture: VEN printed blank");
  });

  it("confirmLinks takes a batch whole or not at all, and one row per medicine", async () => {
    await write((tx) =>
      confirmLinks(tx, { userId: f.cso! }, f.edition!, [{ medicineId: MED_A.id, rowId: f.a! }]),
    );
    await expect(
      write((tx) =>
        confirmLinks(tx, { userId: f.cso! }, f.edition!, [
          { medicineId: MED_B.id, rowId: f.b1! },
          { medicineId: MED_A.id, rowId: f.a! },
        ]),
      ),
    ).rejects.toThrow(/already linked/);
    const b = await pg.query(
      `SELECT 1 FROM public.pharmacy_medicine_links WHERE medicine_id = $1`,
      [MED_B.id],
    );
    expect(b.rows).toHaveLength(0);
    await expect(
      write((tx) =>
        confirmLinks(tx, { userId: f.cso! }, f.edition!, [
          { medicineId: "not_a_medicine", rowId: f.b1! },
        ]),
      ),
    ).rejects.toThrow(/prescribing-list/);
    await write((tx) => removeLink(tx, f.edition!, MED_A.id));
    await expect(write((tx) => removeLink(tx, f.edition!, MED_A.id))).rejects.toThrow(/not linked/);
  });

  it("pharmacy staff search the current edition under RLS; a nurse reads nothing", async () => {
    const asPharmacist = await asClinicalReader(
      { userId: f.pharmacist!, hospitalId: f.h! },
      (tx) => searchNationalList(tx, { q: MED_B.generic, kind: "medicine", vital: false }),
      lane.db,
    );
    expect(asPharmacist!.edition.id).toBe(f.edition);
    expect(asPharmacist!.rows.map((r) => r.id).sort()).toEqual([f.b1, f.b2].sort());
    const vital = await asClinicalReader(
      { userId: f.pharmacist!, hospitalId: f.h! },
      (tx) => searchNationalList(tx, { q: "", kind: null, vital: true }),
      lane.db,
    );
    expect(vital!.rows.map((r) => r.id)).toEqual([f.a]);
    const percent = await asClinicalReader(
      { userId: f.pharmacist!, hospitalId: f.h! },
      (tx) => searchNationalList(tx, { q: "%", kind: null, vital: false }),
      lane.db,
    );
    expect(percent!.total).toBe(0);
    const asNurse = await asClinicalReader(
      { userId: f.nurse!, hospitalId: f.h! },
      (tx) => searchNationalList(tx, { q: "", kind: null, vital: false }),
      lane.db,
    );
    expect(asNurse).toBeNull();
  });
});
