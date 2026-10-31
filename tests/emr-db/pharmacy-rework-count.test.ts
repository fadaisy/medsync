/**
 * Pharmacy rework, safety test 4 and scenario 9 (docs/pharmacy/rework/TECH-SPEC.md §7) on the PGlite lane: a count
 * sheet is saved as you type and resumes with its lines; it is sent only when every difference has a fitting reason;
 * nothing posts to the ledger until the in-charge approves, and the counter never approves their own count.
 * Every row is a fixture. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { beforeAll, describe, expect, it } from "vitest";

import { asClinicalWriter } from "@/lib/emr/db";
import { PHARMACY_MAP_V2, pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import * as count from "@/lib/pharmacy/stores/count-sheet-store";
import { batchAtLocation, loadLocation, move } from "@/lib/pharmacy/stores/write";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { bootLane, hospital, laneOn, staff } from "./_pglite";

describe.skipIf(!laneOn)("Pharmacy rework: the count sheet (safety test 4, scenario 9)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;

  const id = async (q: string, p?: unknown[]) => (await pg.query<{ id: string }>(q, p)).rows[0]!.id;
  const actor = (userId: string): PharmacyActor => ({
    userId,
    hospitalId: f.h!,
    cadreCode: "PHARMACIST",
    cadreName: "PHARMACIST",
    pointId: null,
    access: pharmacyDispensingAccess("PHARMACIST", PHARMACY_MAP_V2),
  });
  const write = <I, R extends { id: string }>(
    schema: z.ZodType<I>,
    fn: (ctx: PharmacyCtx, input: I) => Promise<R>,
    raw: Record<string, unknown>,
    who: string,
    need: PharmacyNeed = count.COUNT_NEED,
  ) =>
    runPharmacyWrite(schema, raw, actor(who), need, fn, { database: lane.db }).catch(
      (e: Error) => ({
        ok: false as const,
        error: `${e.message} ${String((e as { cause?: unknown }).cause ?? "")}`,
      }),
    );
  const balance = async (b: string) =>
    (
      await pg.query<{ n: number }>(
        `SELECT coalesce(sum(quantity), 0)::int AS n FROM public.pharmacy_stock_movements WHERE batch_id = $1`,
        [b],
      )
    ).rows[0]!.n;

  beforeAll(async () => {
    process.env.PHARMACY_WORKSPACE = "1";
    lane = await bootLane();
    pg = lane.pg;
    f.h = await hospital(pg, "Rework count");
    const s = Date.now();
    f.pharm = await id(
      `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
       VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
      [f.h, `pharmacy-rc-${s}`],
    );
    f.storeDept = await id(
      `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
       VALUES ($1, $2, 'Main store', $3, 'support') RETURNING id`,
      [f.h, f.pharm, `store-rc-${s}`],
    );
    f.S = await id(
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, name) VALUES ($1, 'store', $2, 'Main store')
       RETURNING id`,
      [f.h, f.storeDept],
    );
    f.head = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pharm, cadre: "PHARMACIST" })
    ).userId;
    await pg.query(
      `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at)
       VALUES ($1, $2, $3, now() - interval '1 day')`,
      [f.h, f.pharm, f.head],
    );
    f.counter = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pharm, cadre: "PHARMACIST" })
    ).userId;
    f.other = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pharm, cadre: "PHARMACIST" })
    ).userId;
    await pg.query(
      `INSERT INTO public.pharmacy_location_golive (hospital_id, location_id, action, conditions, requested_by, approved_by)
       VALUES ($1, $2, 'on', '[]', $3, $4)`,
      [f.h, f.S, f.head, f.counter],
    );
    f.product = await id(
      `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, pack_size, created_by)
       VALUES ($1, 'amoxicillin', 'Fixture capsule', 'capsule', '10', $2) RETURNING id`,
      [f.h, f.head],
    );
    f.batch = await asClinicalWriter(
      { userId: f.head!, hospitalId: f.h! },
      async (tx) => {
        const loc = await loadLocation(tx, f.h!, f.S!);
        const batchId = await batchAtLocation(tx, {
          hospitalId: f.h!,
          location: loc,
          productId: f.product!,
          batchNumber: "RC-1",
          expiry: "2099-12-31",
          monthOnly: false,
          actorUserId: f.head!,
        });
        await move(tx, {
          hospitalId: f.h!,
          location: loc,
          batchId,
          kind: "received",
          quantity: 30,
          sourceKind: "delivery",
          actorUserId: f.head!,
          effectiveAt: new Date(),
        });
        return batchId;
      },
      lane.db,
    );
  }, 180_000);

  it("4: saved as you type and resumed; nothing posts until the in-charge approves", async () => {
    const sheet = randomUUID();
    const started = await write(
      count.StartCountInput,
      count.startCount,
      { clientKey: sheet, locationId: f.S, label: "Main store, month end" },
      f.counter!,
    );
    expect(started).toMatchObject({ ok: true });

    // Two packs of ten and five loose: 25, five fewer than the ledger's 30.
    const line = {
      sheetId: sheet,
      batchId: f.batch,
      packSize: 10,
      countedPacks: 2,
      countedUnits: 5,
    };
    expect(
      await write(count.SaveCountLineInput, count.saveCountLine, line, f.counter!),
    ).toMatchObject({ ok: true });

    // Resumed after a reload: the line is where it was left.
    const saved = await pg.query(
      `SELECT counted_packs, counted_units FROM public.pharmacy_count_sheet_lines WHERE sheet_id = $1`,
      [sheet],
    );
    expect(saved.rows).toEqual([{ counted_packs: 2, counted_units: 5 }]);

    // A difference needs a fitting reason ("found on another shelf" explains more, not fewer).
    const send = () =>
      write(count.SheetInput, count.sendCountForApproval, { sheetId: sheet }, f.counter!);
    expect(await send()).toMatchObject({ ok: false });
    await write(
      count.SaveCountLineInput,
      count.saveCountLine,
      { ...line, reason: "found_other_shelf" },
      f.counter!,
    );
    expect(await send()).toMatchObject({ ok: false });
    await write(
      count.SaveCountLineInput,
      count.saveCountLine,
      { ...line, reason: "damaged" },
      f.counter!,
    );
    expect(await send()).toMatchObject({ ok: true });

    // Sent: the line is frozen, and the ledger has not moved.
    expect(
      await write(
        count.SaveCountLineInput,
        count.saveCountLine,
        { ...line, countedUnits: 0 },
        f.counter!,
      ),
    ).toMatchObject({ ok: false });
    await expect(
      pg.query(
        `UPDATE public.pharmacy_count_sheet_lines SET counted_units = 0 WHERE sheet_id = $1`,
        [sheet],
      ),
    ).rejects.toThrow(/not changed now/);
    expect(await balance(f.batch!)).toBe(30);

    const approve = (who: string) =>
      write(
        count.ApproveCountInput,
        count.approveCount,
        { sheetId: sheet },
        who,
        count.APPROVE_NEED,
      );
    // Approval needs pharmacy.manage (the hub head) …
    expect(await approve(f.other!)).toMatchObject({ ok: false });
    // … and once a roster exists, the in-charge on it.
    await pg.query(
      `INSERT INTO public.pharmacy_duty_roster (hospital_id, user_id, location_id, role, shift, date_from, date_to, created_by)
       VALUES ($1, $2, NULL, 'pharmacist', 'call', current_date - 1, current_date + 1, $2)`,
      [f.h, f.counter],
    );
    const refused = await approve(f.head!);
    expect(refused).toMatchObject({ ok: false });
    expect(await balance(f.batch!)).toBe(30);
    await pg.query(
      `INSERT INTO public.pharmacy_duty_roster (hospital_id, user_id, location_id, role, shift, date_from, date_to, created_by)
       VALUES ($1, $2, NULL, 'in_charge', 'call', current_date - 1, current_date + 1, $2)`,
      [f.h, f.head],
    );
    expect(await approve(f.head!)).toMatchObject({ ok: true });
    expect(await balance(f.batch!)).toBe(25);
    const done = await pg.query<{ status: string; count_id: string | null }>(
      `SELECT status, count_id FROM public.pharmacy_count_sheets WHERE id = $1`,
      [sheet],
    );
    expect(done.rows[0]).toMatchObject({ status: "done" });
    expect(done.rows[0]!.count_id).not.toBeNull();
  });

  it("4: the counter never approves their own count", async () => {
    const sheet = randomUUID();
    await write(
      count.StartCountInput,
      count.startCount,
      { clientKey: sheet, locationId: f.S, label: "Self" },
      f.head!,
    );
    const line = {
      sheetId: sheet,
      batchId: f.batch,
      packSize: 1,
      countedPacks: null,
      countedUnits: 25,
    };
    await write(count.SaveCountLineInput, count.saveCountLine, line, f.head!);
    expect(
      await write(count.SheetInput, count.sendCountForApproval, { sheetId: sheet }, f.head!),
    ).toMatchObject({
      ok: true,
    });
    const r = await write(
      count.ApproveCountInput,
      count.approveCount,
      { sheetId: sheet },
      f.head!,
      count.APPROVE_NEED,
    );
    expect(r).toMatchObject({ ok: false });
    expect(await balance(f.batch!)).toBe(25);
  });

  it('an approved difference explained only as "other" opens a Low case linked to the count', async () => {
    const sheet = randomUUID();
    await write(
      count.StartCountInput,
      count.startCount,
      { clientKey: sheet, locationId: f.S, label: "Other" },
      f.counter!,
    );
    const line = {
      sheetId: sheet,
      batchId: f.batch,
      packSize: 1,
      countedPacks: null,
      countedUnits: 24,
      reason: "other",
    };
    await write(count.SaveCountLineInput, count.saveCountLine, line, f.counter!);
    await write(count.SheetInput, count.sendCountForApproval, { sheetId: sheet }, f.counter!);
    expect(
      await write(
        count.ApproveCountInput,
        count.approveCount,
        { sheetId: sheet },
        f.head!,
        count.APPROVE_NEED,
      ),
    ).toMatchObject({ ok: true });
    const cases = await pg.query(
      `SELECT severity, qty, medicine_id FROM public.pharmacy_cases WHERE source_type = 'count' AND source_id = $1`,
      [sheet],
    );
    expect(cases.rows).toEqual([{ severity: "low", qty: -1, medicine_id: "amoxicillin" }]);
  });
});
