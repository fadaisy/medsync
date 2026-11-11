/**
 * Pharmacy rework, Records on the PGlite lane (TECH-SPEC §7 test 10; PRD §10 scenarios 8 and 12), every migration
 * replayed, driving lib/pharmacy/{audit,losses,reports} with the lane's database. Every person, place, medicine and
 * quantity is a fixture. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { authUser, bootLane, hospital, laneOn, staff } from "./_pglite";

vi.mock("server-only", () => ({}));

const audit = await import("@/lib/pharmacy/audit/store");
const auditRead = await import("@/lib/pharmacy/audit/read");
const lossRead = await import("@/lib/pharmacy/losses/read");
const lossDerive = await import("@/lib/pharmacy/losses/derive");
const reports = await import("@/lib/pharmacy/reports/store");
const reportsRead = await import("@/lib/pharmacy/reports/read");

/** The refusal's words: drizzle wraps the database's message in `cause`. */
const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
    return "accepted";
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
};
const id = async (pg: Pg, q: string, p?: unknown[]) =>
  (await pg.query<{ id: string }>(q, p)).rows[0]!.id;

describe.skipIf(!laneOn)("Pharmacy rework: Records (test 10, scenarios 8 and 12)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;
  const ym = lossDerive.monthOf(new Date().toISOString());

  const as = <T>(userId: string, manages: boolean, fn: (ctx: PharmacyCtx) => Promise<T>) =>
    lane.db.transaction((tx) =>
      fn({
        tx,
        actor: {
          userId,
          hospitalId: f.h!,
          cadreCode: "PHARMACY_TECH",
          cadreName: "Fixture cadre",
          pointId: null,
          access: {} as never,
        },
        point: null,
        now: new Date(),
        manages,
      } as PharmacyCtx),
    );
  const product = (medicine: string, name: string, price: number, controlled = false) =>
    id(
      pg,
      `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, price_ugx, created_by, controlled_class)
       VALUES ($1, $2, $3, 'unit', $4, $5, $6) RETURNING id`,
      [f.h, medicine, name, price, f.head, controlled ? "narcotic" : null],
    );
  const batch = (productId: string, place = f.ward!) =>
    id(
      pg,
      `INSERT INTO public.pharmacy_batches (hospital_id, location_id, product_id, batch_number, expiry, first_batch_number,
         first_expiry, created_by)
       VALUES ($1, $2, $3, $4, '2099-12-31', $4, '2099-12-31', $5) RETURNING id`,
      [f.h, place, productId, `B-${randomUUID().slice(0, 6)}`, f.head],
    );
  const move = (
    b: string,
    kind: string,
    qty: number,
    o: { actor?: string; reason?: string; reverses?: string } = {},
  ) =>
    id(
      pg,
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at,
         actor_user_id, source_kind, reason_code, reverses_id)
       VALUES ($1, $2, $3, $4, $5, now() - interval '30 minutes', $6,
         CASE WHEN $7::uuid IS NOT NULL THEN 'reversal' WHEN $4 = 'received' THEN 'delivery'
              WHEN $4 = 'adjusted' THEN 'adjustment' ELSE 'transfer' END, $8, $7) RETURNING id`,
      [f.h, f.ward, b, kind, qty, o.actor ?? f.tech, o.reverses ?? null, o.reason ?? null],
    );
  const balance = async (b: string) =>
    Number(
      (
        await pg.query<{ n: string }>(
          `SELECT coalesce(sum(quantity), 0) AS n FROM public.pharmacy_stock_movements WHERE batch_id = $1`,
          [b],
        )
      ).rows[0]!.n,
    );

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    f.h = await hospital(pg, "Rework records");
    f.pharmacy = await id(
      pg,
      `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
       VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
      [f.h, `ph-${randomUUID().slice(0, 6)}`],
    );
    f.head = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pharmacy, cadre: "PHARMACIST" })
    ).userId;
    await pg.query(
      `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at) VALUES ($1, $2, $3, now() - interval '1 day')`,
      [f.h, f.pharmacy, f.head],
    );
    f.tech = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pharmacy, cadre: "PHARMACY_TECH" })
    ).userId;
    f.other = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pharmacy, cadre: "PHARMACY_TECH" })
    ).userId;
    f.witness = await authUser(pg, "witness");
    f.point = await id(
      pg,
      `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind) VALUES ($1, $2, 'Window', $3, 'support') RETURNING id`,
      [f.h, f.pharmacy, `win-${randomUUID().slice(0, 6)}`],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves) VALUES ($1, $2, 'window')`,
      [f.point, f.h],
    );
    const wardDept = await id(
      pg,
      `INSERT INTO public.hospital_departments (hospital_id, name, slug) VALUES ($1, 'Medicine', $2) RETURNING id`,
      [f.h, `med-${randomUUID().slice(0, 6)}`],
    );
    const ward = await id(
      pg,
      `INSERT INTO public.hospital_wards (hospital_id, department_id, name, slug) VALUES ($1, $2, 'Ward 3', $3) RETURNING id`,
      [f.h, wardDept, `w3-${randomUUID().slice(0, 6)}`],
    );
    f.ward = await id(
      pg,
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, ward_id, department_id, name, ward_supply_model, live_at)
       VALUES ($1, 'ward', $2, $3, 'Ward 3', 'stocked', now()) RETURNING id`,
      [f.h, ward, wardDept],
    );
    f.amox = await product("fx_amox", "Amoxicillin capsules", 80);
    f.ceft = await product("fx_ceft", "Ceftriaxone injection", 3500);
    f.bcg = await product("fx_bcg", "BCG vaccine", 350);
    f.morphine = await product("fx_morphine", "Morphine injection", 4000, true);
  }, 180_000);

  it("scenario 8: 15 caps given on the ward, corrected to 10 — a reversal and the right line, linked, once", async () => {
    const b = await batch(f.amox!);
    await move(b, "received", 100, { actor: f.head });
    const given = await move(b, "ward_used", -15);
    const key = randomUUID();
    const input = {
      clientKey: key,
      movementId: given,
      reason: "wrong_quantity" as const,
      quantity: 10,
    };
    // Someone else's entry: only the in-charge corrects it.
    expect(
      await refusal(
        as(f.other!, false, (c) => audit.correctMovement(c, { ...input, clientKey: randomUUID() })),
      ),
    ).toMatch(/own entries/);
    const r = await as(f.tech!, false, (c) => audit.correctMovement(c, input));
    expect(r.replacementId).not.toBeNull();
    const rows = (
      await pg.query<{
        id: string;
        kind: string;
        quantity: number;
        reverses_id: string | null;
        correction_of_id: string | null;
      }>(
        `SELECT id, kind, quantity, reverses_id, correction_of_id FROM public.pharmacy_stock_movements WHERE id IN ($1, $2)`,
        [r.id, r.replacementId],
      )
    ).rows;
    expect(rows.find((x) => x.id === r.id)).toMatchObject({
      kind: "reversed",
      quantity: 15,
      reverses_id: given,
    });
    expect(rows.find((x) => x.id === r.replacementId)).toMatchObject({
      kind: "ward_used",
      quantity: -10,
      correction_of_id: given,
    });
    expect(await balance(b)).toBe(90);
    // The same tap again returns what it wrote; a second correction is refused.
    expect((await as(f.tech!, false, (c) => audit.correctMovement(c, input))).id).toBe(r.id);
    expect(
      await refusal(
        as(f.head!, true, (c) => audit.correctMovement(c, { ...input, clientKey: randomUUID() })),
      ),
    ).toMatch(/already corrected/);
    // The trail shows the original struck through, with who and why.
    const moves = await auditRead.auditMovements(lane.db, f.h!, null);
    const orig = moves.find((m) => m.id === given)!;
    expect(orig.correctedAt).not.toBeNull();
    expect(orig.correctedWhy).toBe("wrong_quantity");
  });

  it("the in-charge corrects anyone's entry; a controlled correction needs a witness; the ledger refuses a stray replacement", async () => {
    const b = await batch(f.amox!);
    await move(b, "received", 20, { actor: f.head });
    const twice = await move(b, "ward_used", -5, { actor: f.other });
    await as(f.head!, true, (c) =>
      audit.correctMovement(c, {
        clientKey: randomUUID(),
        movementId: twice,
        reason: "entered_twice",
      }),
    );
    expect(await balance(b)).toBe(20);

    const cdb = await batch(f.morphine!);
    const cdIn = await move(cdb, "received", 10, { actor: f.tech });
    expect(
      await refusal(
        as(f.tech!, false, (c) =>
          audit.correctMovement(c, {
            clientKey: randomUUID(),
            movementId: cdIn,
            reason: "wrong_quantity",
            quantity: 8,
          }),
        ),
      ),
    ).toMatch(/needs a witness/);

    // A replacement for a line that was never reversed.
    const lone = await move(b, "ward_used", -2);
    expect(
      await refusal(
        pg.query(
          `INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, actor_user_id, source_kind, correction_of_id)
           VALUES ($1, $2, $3, 'ward_used', -1, $4, 'transfer', $5)`,
          [f.h, f.ward, b, f.tech, lone],
        ),
      ),
    ).toMatch(/replacement follows the reversal/);
  });

  it("test 10: the month's losses equal the sum of the ledger's loss lines, opened-vial wastage counted once", async () => {
    const c = await batch(f.ceft!);
    await move(c, "received", 10, { actor: f.head });
    await move(c, "adjusted", -3, { reason: "damaged" });
    const wrong = await move(c, "adjusted", -2, { reason: "expired" });
    await move(c, "reversed", 2, { reason: "entered_twice", reverses: wrong });
    const v = await batch(f.bcg!);
    await move(v, "received", 40, { actor: f.head });
    await move(v, "adjusted", -6, { reason: "wastage:opened_vial" });

    const from = lossRead.monthStart(ym);
    const to = lossRead.monthStart(lossRead.addMonths(ym, 1));
    const lines = lossDerive.losses(await lossRead.lossMovements(lane.db, f.h!, from, to));
    const expected = Number(
      (
        await pg.query<{ v: string }>(
          `SELECT coalesce(sum(-m.quantity * p.price_ugx), 0) AS v
             FROM public.pharmacy_stock_movements m
             JOIN public.pharmacy_batches b ON b.id = m.batch_id JOIN public.pharmacy_products p ON p.id = b.product_id
            WHERE m.hospital_id = $1 AND m.quantity < 0 AND m.kind IN ('adjusted','count_correction','written_off')
              AND m.reverses_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM public.pharmacy_stock_movements r WHERE r.reverses_id = m.id)`,
          [f.h],
        )
      ).rows[0]!.v,
    );
    expect(lossDerive.totalOf(lines)).toBe(expected);
    expect(lossDerive.totalOf(lines)).toBe(3 * 3500 + 6 * 350);
    expect(lines.filter((l) => l.epi).map((l) => [l.cause, l.qty])).toEqual([["opened_vial", 6]]);
  });

  it("scenario 12: HMIS 105 needs a remark for stock-out days; the in-charge submits; the CD return waits on an open case", async () => {
    await pg.query(
      `INSERT INTO public.pharmacy_stockouts (hospital_id, dispensing_point_id, medicine_id, started_at) VALUES ($1, $2, 'fx_amox', now() - interval '1 hour')`,
      [f.h, f.point],
    );
    const figures = await reportsRead.reportFigures(lane.db, f.h!, ym);
    expect(figures.meds.find((m) => m.productId === f.amox)?.daysOut).toBeGreaterThan(0);

    const check = (remarks: Record<string, string>) =>
      as(f.tech!, false, (c) => reports.checkReport(c, { kind: "hmis_meds", month: ym, remarks }));
    expect(await refusal(check({}))).toMatch(/Add a remark/);
    await check({ [`rm-${f.amox}`]: "Delivered late" });
    // Submitting is the in-charge's, in the app and in the database.
    expect(
      await refusal(
        as(f.tech!, false, (c) => reports.submitReport(c, { kind: "hmis_meds", month: ym })),
      ),
    ).toMatch(/Only the in-charge/);
    expect(
      await refusal(
        pg.query(
          `UPDATE public.pharmacy_reports SET status = 'submitted', submitted_by = $2, submitted_at = now(), snapshot = '{}'
            WHERE hospital_id = $1 AND kind = 'hmis_meds'`,
          [f.h, f.tech],
        ),
      ),
    ).toMatch(/in-charge|not_in_charge/);
    await as(f.head!, true, (c) => reports.submitReport(c, { kind: "hmis_meds", month: ym }));
    const saved = (await reportsRead.savedReports(lane.db, f.h!, ym)).find(
      (r) => r.kind === "hmis_meds",
    )!;
    expect(saved.status).toBe("submitted");
    expect(
      (saved.snapshot as { rows: { productId: string }[] }).rows.some(
        (r) => r.productId === f.amox,
      ),
    ).toBe(true);
    // Frozen: nothing changes or deletes a submitted report.
    expect(
      await refusal(
        pg.query(
          `UPDATE public.pharmacy_reports SET remarks = '{}' WHERE hospital_id = $1 AND kind = 'hmis_meds'`,
          [f.h],
        ),
      ),
    ).not.toBe("accepted");
    expect(
      await refusal(pg.query(`DELETE FROM public.pharmacy_reports WHERE hospital_id = $1`, [f.h])),
    ).not.toBe("accepted");

    // An open morphine case blocks the CD return, named in the report.
    await pg.query(
      `INSERT INTO public.pharmacy_cases (hospital_id, source_type, medicine_id, location_id, qty, what, severity, due_at, created_by)
       VALUES ($1, 'manual', 'fx_morphine', $2, -1, 'Fixture shortfall', 'high', now() + interval '1 day', $3)`,
      [f.h, f.ward, f.head],
    );
    await as(f.tech!, false, (c) =>
      reports.checkReport(c, { kind: "cd_return", month: ym, remarks: {} }),
    );
    expect(
      await refusal(
        as(f.head!, true, (c) => reports.submitReport(c, { kind: "cd_return", month: ym })),
      ),
    ).toMatch(/Resolve the items/);
    const cdIssues = (await reportsRead.reportFigures(lane.db, f.h!, ym)).cases;
    expect(cdIssues.map((x) => [x.product, x.controlled])).toEqual([["Morphine injection", true]]);
  });
});
