/**
 * Pharmacy Phase 2, Step 2 (gate-a-proposal, prompt §6.1, §6.2, §7): migrations 0180–0181 on the PGlite lane.
 *
 * - S2: the RLS probe table, every new table × every actor in §7 (pharmacy, other hospital, ward nurse in
 *   charge, nurse on the ward, cart head, prescriber, lab, admin, superadmin without break-glass, clients).
 * - S3: no UPDATE or DELETE on an immutable table, the service role included; the guarded tables change only
 *   as their rule says (recall close, delivery count, order line close, write-off disposal, pack retire).
 * - The ledger guards: SL-13 pairs at commit, SL-14 blocked batches, below zero, LC-1 point locations, go-live.
 * - Permission map v3 and private.pharmacy_location_right.
 *
 * Runs with EMR_PGLITE=1 (tests/emr-db/_pglite.ts). Every product, batch, person and quantity is a fixture.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Actor, Lane, Pg, PgQueryable } from "./_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import {
  authUser,
  bootEmpty,
  bootLane,
  department,
  hospital,
  laneOn,
  migrate,
  patient,
  probe,
  staff,
  superadmin,
} from "./_pglite";

const one = async <T = Record<string, unknown>>(pg: PgQueryable, sql: string, p?: unknown[]) =>
  (await pg.query<T>(sql, p)).rows[0] as T;
const id = async (pg: PgQueryable, sql: string, p?: unknown[]) =>
  (await one<{ id: string }>(pg, sql, p)).id;

/** Every table 0180–0181 created. */
const TABLES = [
  "pharmacy_locations",
  "pharmacy_location_golive",
  "pharmacy_counterparties",
  "pharmacy_product_locations",
  "pharmacy_recalls",
  "pharmacy_cost_corrections",
  "pharmacy_orders",
  "pharmacy_order_lines",
  "pharmacy_deliveries",
  "pharmacy_delivery_lines",
  "pharmacy_requisitions",
  "pharmacy_requisition_lines",
  "pharmacy_issues",
  "pharmacy_issue_confirmations",
  "pharmacy_location_packs",
  "pharmacy_cart_checks",
  "pharmacy_write_offs",
  "pharmacy_recall_events",
  "pharmacy_recall_ward_notices",
  "pharmacy_periods",
  "pharmacy_period_snapshots",
  "pharmacy_period_difference_reasons",
] as const;

/** Tables with no update or delete at all, for every role (S3). */
const APPEND_ONLY = [
  "pharmacy_stock_movements",
  "pharmacy_period_snapshots",
  "pharmacy_periods",
  "pharmacy_recall_events",
  "pharmacy_issue_confirmations",
  "pharmacy_issues",
  "pharmacy_location_golive",
  "pharmacy_cost_corrections",
] as const;

/** The key a probe reads back: the id, or the primary key where there is no id. */
const keyOf = (t: string) =>
  t === "pharmacy_product_locations"
    ? "product_id::text || '/' || location_id::text"
    : t === "pharmacy_period_snapshots"
      ? "period_id::text"
      : "id::text";

/** Where a fixture row sits, for the tables a ward's or cart's people may read. */
type Place = "W" | "W2" | "W3" | "cart";

describe.skipIf(!laneOn)("Pharmacy Phase 2 data layer (0180–0181)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;
  const rows: Record<string, { key: string; place?: Place }[]> = {};
  const add = (t: string, key: string, place?: Place) => (rows[t] ??= []).push({ key, place });

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    const s = Date.now();
    for (const h of ["A", "B"]) {
      f[`h${h}`] = await hospital(pg, `Pharm2 ${h}`);
      f[`pharmDept${h}`] = await id(
        pg,
        `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
         VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
        [f[`h${h}`], `pharmacy-${h.toLowerCase()}-${s}`],
      );
      f[`point${h}`] = await unit(f[`h${h}`]!, `Outpatient pharmacy ${h}`, f[`pharmDept${h}`]);
      await pg.query(
        `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves) VALUES ($1, $2, 'window')`,
        [f[`point${h}`], f[`h${h}`]],
      );
    }
    const { hA } = f;
    f.storeDept = await unit(hA!, "Main store", f.pharmDeptA);
    f.wardDept = await department(pg, hA!, "Medicine");
    f.ward3Dept = await department(pg, hA!, "Surgery");
    f.cartDept = await department(pg, hA!, "Emergency");
    const clinic = await department(pg, hA!, "Clinic");

    const person = async (k: string, hospitalId: string, departmentId: string, cadre: string) =>
      (f[k] = (await staff(pg, { hospitalId, departmentId, cadre })).userId);
    await person("pharmacist", hA!, f.pointA!, "PHARMACIST");
    await person("tech", hA!, f.pointA!, "PHARMACY_TECH");
    await person("pharmacistB", f.hB!, f.pointB!, "PHARMACIST");
    await person("nurseInCharge", hA!, f.wardDept, "NURSE");
    await person("nurseOther", hA!, f.wardDept, "NURSE");
    await person("nurseW3", hA!, f.ward3Dept, "NURSE");
    await person("nurseElse", hA!, clinic, "NURSE");
    await person("cartHead", hA!, f.cartDept, "NURSE");
    await person("doctor", hA!, clinic, "MEDICAL_OFFICER");
    await person("lab", hA!, clinic, "LAB_TECHNOLOGIST");
    f.admin = await authUser(pg, "hospital-admin");
    await pg.query(
      `INSERT INTO public.user_roles (user_id, role, hospital_id) VALUES ($1, 'hospital_admin', $2)`,
      [f.admin, hA],
    );
    f.superadmin = await superadmin(pg);
    f.patient = await patient(pg);
    await seed();
  }, 180_000);

  async function unit(hospitalId: string, name: string, parentId?: string) {
    return id(
      pg,
      `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
       VALUES ($1, $2, $3, $4, 'support') RETURNING id`,
      [hospitalId, parentId ?? null, name, `u-${Math.random().toString(36).slice(2, 10)}`],
    );
  }

  async function ward(departmentId: string, name: string, db: PgQueryable = pg) {
    return id(
      db,
      `INSERT INTO public.hospital_wards (hospital_id, department_id, name, slug) VALUES ($1, $2, $3, $4) RETURNING id`,
      [f.hA, departmentId, name, `w-${Math.random().toString(36).slice(2, 10)}`],
    );
  }

  async function location(
    kind: string,
    o: { department?: string; ward?: string; cart?: string; anyNurse?: boolean; name: string },
  ) {
    return id(
      pg,
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, ward_id, crash_cart_id, name,
         ward_supply_model, any_nurse_confirms)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $2 = 'ward' THEN 'stocked' END, $7) RETURNING id`,
      [
        f.hA,
        kind,
        o.department ?? null,
        o.ward ?? null,
        o.cart ?? null,
        o.name,
        o.anyNurse ?? false,
      ],
    );
  }

  async function batchAt(
    place: string,
    number: string,
    expiry = "2099-12-31",
    db: PgQueryable = pg,
    point = false,
  ) {
    return id(
      db,
      `INSERT INTO public.pharmacy_batches (hospital_id, location_id, dispensing_point_id, product_id, batch_number,
         expiry, first_batch_number, first_expiry, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $5, $6, $7) RETURNING id`,
      [f.hA, place, point ? place : null, f.product, number, expiry, f.tech],
    );
  }

  const SOURCE: Record<string, string> = {
    received: "delivery",
    issued: "issue",
    received_from_issue: "issue",
    quarantined_out: "quarantine",
    quarantined_in: "quarantine",
    written_off: "write_off",
    returned_to_supplier: "supplier_return",
    lent: "loan",
    transfer_out: "transfer",
    supplied: "supply",
  };

  async function mv(
    db: PgQueryable,
    batchId: string,
    place: string,
    kind: string,
    quantity: number,
    o: {
      pair?: string;
      sourceId?: string;
      downtime?: boolean;
      counterparty?: boolean;
      unitCost?: number;
      point?: boolean;
    } = {},
  ) {
    return id(
      db,
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, dispensing_point_id, batch_id, kind,
         quantity, effective_at, actor_user_id, source_kind, source_id, downtime, pair_id, counterparty_id, unit_cost)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [
        f.hA,
        place,
        o.point ? place : null,
        batchId,
        kind,
        quantity,
        f.tech,
        SOURCE[kind] ?? "adjustment",
        o.sourceId ?? null,
        o.downtime ?? false,
        o.pair ?? null,
        o.counterparty ? f.supplier : null,
        o.unitCost ?? null,
      ],
    );
  }

  /** An issue's two legs (SL-13), store → place, on one batch number. */
  async function issuePair(
    db: PgQueryable,
    from: string,
    fromBatch: string,
    to: string,
    toBatch: string,
    n: number,
    issueId?: string,
  ) {
    const pair = (await one<{ p: string }>(db, `SELECT gen_random_uuid()::text AS p`)).p;
    await mv(db, fromBatch, from, "issued", -n, { pair, sourceId: issueId });
    return mv(db, toBatch, to, "received_from_issue", n, { pair, sourceId: issueId });
  }

  /** One row in every new table at hospital A, written as the owner (the server's path). */
  async function seed() {
    const { hA, pharmacist, tech } = f;
    // Places.
    f.wardW = await ward(f.wardDept!, "Ward W");
    f.wardW2 = await ward(f.wardDept!, "Ward W2");
    f.wardW3 = await ward(f.ward3Dept!, "Ward W3");
    f.crashCart = await id(
      pg,
      `INSERT INTO public.crash_carts (hospital_id, department_id, label) VALUES ($1, $2, 'Fixture cart') RETURNING id`,
      [hA, f.cartDept],
    );
    f.store = await location("store", { department: f.storeDept, name: "Main store" });
    f.quar = await location("quarantine", { department: f.storeDept, name: "Quarantine" });
    f.W = await location("ward", { ward: f.wardW, name: "Ward W" });
    f.W2 = await location("ward", { ward: f.wardW2, name: "Ward W2" });
    f.W3 = await location("ward", { ward: f.wardW3, anyNurse: true, name: "Ward W3" });
    f.cart = await location("cart", {
      cart: f.crashCart,
      department: f.cartDept,
      name: "Fixture cart",
    });
    add("pharmacy_locations", f.pointA!);
    add("pharmacy_locations", f.store);
    add("pharmacy_locations", f.quar);
    add("pharmacy_locations", f.W, "W");
    add("pharmacy_locations", f.W2, "W2");
    add("pharmacy_locations", f.W3, "W3");
    add("pharmacy_locations", f.cart, "cart");
    await pg.query(
      `INSERT INTO public.ward_in_charge_assignments (hospital_id, ward_id, nurse_user_id, starts_at)
       VALUES ($1, $2, $3, now() - interval '1 day')`,
      [hA, f.wardW, f.nurseInCharge],
    );
    await pg.query(
      `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at)
       VALUES ($1, $2, $3, now() - interval '1 day')`,
      [hA, f.cartDept, f.cartHead],
    );

    // Reference rows.
    f.attest = await id(
      pg,
      `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
       VALUES ($1, $2, $3, 'witness', 'write_off', 'passed') RETURNING id`,
      [hA, pharmacist, tech],
    );
    f.product = await id(
      pg,
      `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, strength, issue_unit, created_by)
       VALUES ($1, 'fixture_tablet_a', 'Fixture tablet A 28s', '[S1]', 'tablet', $2) RETURNING id`,
      [hA, pharmacist],
    );
    f.productB = await id(
      pg,
      `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
       VALUES ($1, 'fixture_tablet_b', 'Fixture tablet B', 'tablet', $2) RETURNING id`,
      [hA, pharmacist],
    );
    f.supplier = await id(
      pg,
      `INSERT INTO public.pharmacy_counterparties (hospital_id, kind, name, created_by)
       VALUES ($1, 'supplier', 'Fixture supplier', $2) RETURNING id`,
      [hA, pharmacist],
    );
    add("pharmacy_counterparties", f.supplier);
    for (const [product, loc] of [
      [f.product, f.store],
      [f.product, f.W],
      [f.productB, f.store],
    ] as const) {
      await pg.query(
        `INSERT INTO public.pharmacy_product_locations (product_id, location_id, hospital_id) VALUES ($1, $2, $3)`,
        [product, loc, hA],
      );
      add("pharmacy_product_locations", `${product}/${loc}`, loc === f.W ? "W" : undefined);
    }
    await pg.query(
      `INSERT INTO public.pharmacy_location_golive (hospital_id, location_id, action, conditions, requested_by, approved_by)
       VALUES ($1, $2, 'on', '{}', $3, $4)`,
      [hA, f.store, f.admin, pharmacist],
    );
    add(
      "pharmacy_location_golive",
      (
        await one<{ id: string }>(
          pg,
          `SELECT id FROM public.pharmacy_location_golive WHERE location_id = $1`,
          [f.store],
        )
      ).id,
    );

    // The ledger: a receipt at the store, issues to W and W2, a ward count at each and a cart count.
    f.bS = await batchAt(f.store, "ST-1");
    f.bW = await batchAt(f.W, "ST-1");
    f.bW2 = await batchAt(f.W2, "ST-1");
    f.recv = await mv(pg, f.bS, f.store, "received", 50, { unitCost: 120 });
    await pg.query(
      `INSERT INTO public.pharmacy_cost_corrections (hospital_id, movement_id, old_cost, new_cost, reason, actor_user_id)
       VALUES ($1, $2, 120, 110, 'Mistyped at receipt', $3)`,
      [hA, f.recv, pharmacist],
    );
    add(
      "pharmacy_cost_corrections",
      (
        await one<{ id: string }>(
          pg,
          `SELECT id FROM public.pharmacy_cost_corrections WHERE movement_id = $1`,
          [f.recv],
        )
      ).id,
    );

    for (const [k, place] of [
      ["W", "W"],
      ["W2", "W2"],
      ["W3", "W3"],
    ] as const) {
      const req = await id(
        pg,
        `INSERT INTO public.pharmacy_requisitions (hospital_id, requesting_location_id, issuing_location_id, raised_by, state)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [hA, f[k], f.store, f.nurseInCharge, k === "W3" ? "raised" : "issued"],
      );
      f[`req${k}`] = req;
      add("pharmacy_requisitions", req, place);
      add(
        "pharmacy_requisition_lines",
        await id(
          pg,
          `INSERT INTO public.pharmacy_requisition_lines (requisition_id, product_id, quantity_asked, quantity_issued)
           VALUES ($1, $2, 10, $3) RETURNING id`,
          [req, f.product, k === "W3" ? null : 10],
        ),
        place,
      );
    }
    for (const [k, n] of [
      ["W", 10],
      ["W2", 5],
    ] as const) {
      const issue = await id(
        pg,
        `INSERT INTO public.pharmacy_issues (hospital_id, kind, from_location_id, to_location_id, requisition_id, issued_by)
         VALUES ($1, 'issue', $2, $3, $4, $5) RETURNING id`,
        [hA, f.store, f[k], f[`req${k}`], tech],
      );
      add("pharmacy_issues", issue, k);
      f[`mv${k}`] = await pg.transaction((tx) =>
        issuePair(tx, f.store!, f.bS!, f[k]!, f[`b${k}`]!, n, issue),
      );
      add(
        "pharmacy_issue_confirmations",
        await id(
          pg,
          `INSERT INTO public.pharmacy_issue_confirmations (issue_id, hospital_id, confirmed_by) VALUES ($1, $2, $3)
           RETURNING id`,
          [issue, hA, f.nurseInCharge],
        ),
        k,
      );
      const count = await id(
        pg,
        `INSERT INTO public.pharmacy_counts (hospital_id, location_id, scope, counted_by)
         VALUES ($1, $2, 'ward', $3) RETURNING id`,
        [hA, f[k], f.nurseInCharge],
      );
      f[`count${k}`] = count;
      await pg.query(
        `INSERT INTO public.pharmacy_count_lines (count_id, batch_id, counted_quantity, recorded_balance)
         VALUES ($1, $2, $3, $3)`,
        [count, f[`b${k}`], n],
      );
    }
    f.countCart = await id(
      pg,
      `INSERT INTO public.pharmacy_counts (hospital_id, location_id, scope, counted_by)
       VALUES ($1, $2, 'cart', $3) RETURNING id`,
      [hA, f.cart, f.cartHead],
    );
    add(
      "pharmacy_cart_checks",
      await id(
        pg,
        `INSERT INTO public.pharmacy_cart_checks (hospital_id, location_id, count_id, seal_number, checked_by, confirmed_by)
         VALUES ($1, $2, $3, 'SEAL-0001', $4, $5) RETURNING id`,
        [hA, f.cart, f.countCart, f.cartHead, f.nurseOther],
      ),
      "cart",
    );

    // Signed and draft packs.
    for (const [loc, kind, status, place] of [
      [f.W, "ward_levels", "signed", "W"],
      [f.W2, "ward_levels", "draft", "W2"],
      [f.cart, "cart_list", "signed", "cart"],
    ] as const) {
      const pack = await id(
        pg,
        `INSERT INTO public.pharmacy_location_packs (hospital_id, location_id, kind, version, content, status, authored_by,
           first_signer, signed_at, exception_text)
         VALUES ($1, $2, $3, 1, '{"levels":{}}', $4, $5, CASE WHEN $4 = 'signed' THEN $5::uuid END,
                 CASE WHEN $4 = 'signed' THEN now() END,
                 CASE WHEN $4 = 'signed' THEN 'CSO signs alone' END) RETURNING id`,
        [hA, loc, kind, status, pharmacist],
      );
      f[`pack${place}`] = pack;
      add("pharmacy_location_packs", pack, place);
    }

    // Write-off, recall, notices, contacts.
    f.writeOff = await id(
      pg,
      `INSERT INTO public.pharmacy_write_offs (hospital_id, location_id, register_number, reason, witness_attestation_id,
         actor_user_id) VALUES ($1, $2, 'WO-0001', 'expired', $3, $4) RETURNING id`,
      [hA, f.quar, f.attest, pharmacist],
    );
    add("pharmacy_write_offs", f.writeOff);
    for (const k of ["W", "W2"] as const) {
      const recall = await id(
        pg,
        `INSERT INTO public.pharmacy_recalls (hospital_id, product_id, batch_number, source, notice_ref, notice_date,
           stated_class, level, instructions, started_by)
         VALUES ($1, $2, $3, 'supplier', 'FX-NOTICE', current_date, 'not_stated', 'Fixture level',
                 'Fixture instructions', $4) RETURNING id`,
        [hA, f.product, `RC-${k}`, pharmacist],
      );
      f[`recall${k}`] = recall;
      add("pharmacy_recalls", recall, k);
      add(
        "pharmacy_recall_ward_notices",
        await id(
          pg,
          `INSERT INTO public.pharmacy_recall_ward_notices (recall_id, hospital_id, location_id, posted_by)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [recall, hA, f[k], pharmacist],
        ),
        k,
      );
    }
    add(
      "pharmacy_recall_events",
      await id(
        pg,
        `INSERT INTO public.pharmacy_recall_events (recall_id, hospital_id, patient_user_id, list, outcome, actor_user_id)
         VALUES ($1, $2, $3, 'exact', 'could_not_reach', $4) RETURNING id`,
        [f.recallW, hA, f.patient, pharmacist],
      ),
    );

    // An order (saved) and a delivery (received against it).
    f.order = await id(
      pg,
      `INSERT INTO public.pharmacy_orders (hospital_id, counterparty_id, kind, state, cut_at, created_by, saved_at, saved_by)
       VALUES ($1, $2, 'cycle', 'open', now(), $3, now(), $3) RETURNING id`,
      [hA, f.supplier, pharmacist],
    );
    add("pharmacy_orders", f.order);
    f.orderLine = await id(
      pg,
      `INSERT INTO public.pharmacy_order_lines (order_id, medicine_id, product_id, inputs, proposed_units, chosen_units)
       VALUES ($1, 'fixture_tablet_a', $2, '{"fixture":true}', 100, 100) RETURNING id`,
      [f.order, f.product],
    );
    add("pharmacy_order_lines", f.orderLine);
    const d = await delivery(pg, "DN-0001");
    await pg.query(
      `UPDATE public.pharmacy_deliveries SET state = 'received', finished_by = $2, finished_at = now() WHERE id = $1`,
      [d.delivery, tech],
    );
    f.delivery = d.delivery;
    f.deliveryLine = d.line;
    add("pharmacy_deliveries", d.delivery);
    add("pharmacy_delivery_lines", d.line);

    // A closed month at the store.
    f.period = await id(
      pg,
      `INSERT INTO public.pharmacy_periods (hospital_id, location_id, month, closed_by, approved_by, approval_attestation_id)
       VALUES ($1, $2, '2026-09-01', $3, $4, $5) RETURNING id`,
      [hA, f.store, pharmacist, tech, f.attest],
    );
    add("pharmacy_periods", f.period);
    await pg.query(
      `INSERT INTO public.pharmacy_period_snapshots (period_id, hospital_id, content, sha256)
       VALUES ($1, $2, '{"lines":[]}', repeat('b', 64))`,
      [f.period, hA],
    );
    add("pharmacy_period_snapshots", f.period);
    add(
      "pharmacy_period_difference_reasons",
      await id(
        pg,
        `INSERT INTO public.pharmacy_period_difference_reasons (hospital_id, location_id, month, product_id, kind,
           reason_code, actor_user_id) VALUES ($1, $2, '2026-09-01', $3, 'difference', 'not_found', $4) RETURNING id`,
        [hA, f.store, f.product, pharmacist],
      ),
    );
  }

  /** A delivery being counted, with one line. */
  async function delivery(db: PgQueryable, note: string) {
    const deliveryId = await id(
      db,
      `INSERT INTO public.pharmacy_deliveries (hospital_id, location_id, supplier_id, note_number, order_id, arrived_at,
         counted_by) VALUES ($1, $2, $3, $4, $5, now(), $6) RETURNING id`,
      [f.hA, f.store, f.supplier, note, f.order, f.tech],
    );
    const line = await id(
      db,
      `INSERT INTO public.pharmacy_delivery_lines (delivery_id, line_no, product_id, order_line_id, note_quantity,
         accepted_quantity, batch_number, expiry, unit_cost)
       VALUES ($1, 1, $2, $3, 10, 10, 'DL-1', '2099-01-01', 100) RETURNING id`,
      [deliveryId, f.product, f.orderLine],
    );
    return { delivery: deliveryId, line };
  }

  const reader = (userId: string | undefined, hospitalId = f.hA): Actor => ({
    userId: userId ?? null,
    role: "medsync_clinical_reader",
    hospitalId,
  });

  /** The fixture keys of `table` an actor reads. */
  const seen = async (actor: Actor, table: string): Promise<string[]> => {
    const r = await probe(pg, actor, `SELECT ${keyOf(table)} AS k FROM public.${table}`);
    if (!r.ok) throw new Error(r.error);
    const mine = new Set((rows[table] ?? []).map((x) => x.key));
    return r.rows
      .map((x) => x.k as string)
      .filter((k) => mine.has(k))
      .sort();
  };
  const expected = (table: string, places: Place[]) =>
    (rows[table] ?? [])
      .filter((x) => x.place && places.includes(x.place))
      .map((x) => x.key)
      .sort();

  /** Runs `fn` in a transaction to commit, then rolls back: "ran", or the error. */
  const attempt = (fn: (tx: PgQueryable) => Promise<unknown>, role?: "service_role") =>
    pg
      .transaction(async (tx) => {
        if (role) await tx.exec(`SET LOCAL ROLE ${role}`);
        await fn(tx);
        await tx.exec("SET CONSTRAINTS ALL IMMEDIATE");
        await tx.rollback();
        return "ran";
      })
      .catch((e: Error) => e.message);

  /* ─── S2: RLS probes ──────────────────────────────────────────────── */

  it("every new table has a fixture row", () => {
    expect(TABLES.filter((t) => !rows[t]?.length)).toEqual([]);
  });

  it.each(TABLES)("%s: the pharmacy of the hospital reads every row", async (t) => {
    const all = (rows[t] ?? []).map((x) => x.key).sort();
    expect(await seen(reader(f.pharmacist), t)).toEqual(all);
    expect(await seen(reader(f.tech), t)).toEqual(all);
  });

  it.each(TABLES)(
    "%s: another hospital, the prescriber, lab, admin, superadmin and an anonymous reader read nothing",
    async (t) => {
      const actors: Actor[] = [
        reader(f.pharmacistB, f.hB),
        reader(f.pharmacistB, f.hA),
        reader(f.pharmacist, f.hB),
        reader(f.doctor),
        reader(f.lab),
        reader(f.nurseElse),
        reader(f.admin),
        reader(f.superadmin),
        reader(f.patient),
        reader(undefined),
      ];
      for (const a of actors) expect(await seen(a, t), `${a.userId}@${a.hospitalId}`).toEqual([]);
    },
  );

  it.each(TABLES)(
    "%s: a ward's or cart's people read only their own location's rows, never another's or a patient list",
    async (t) => {
      // W's in-charge: W only. A nurse on W's unit not in charge: nothing (W does not allow any nurse).
      // A nurse on W3's unit, which allows any nurse: W3 only. The cart's unit head: the cart only.
      expect(await seen(reader(f.nurseInCharge), t)).toEqual(expected(t, ["W"]));
      expect(await seen(reader(f.nurseOther), t)).toEqual([]);
      expect(await seen(reader(f.nurseW3), t)).toEqual(expected(t, ["W3"]));
      expect(await seen(reader(f.cartHead), t)).toEqual(expected(t, ["cart"]));
      expect(await seen(reader(f.nurseInCharge, f.hB), t)).toEqual([]);
    },
  );

  it.each(TABLES)(
    "%s: no client reads or writes it, and the reader role never writes",
    async (t) => {
      const k = keyOf(t).startsWith("id")
        ? "id"
        : t === "pharmacy_period_snapshots"
          ? "period_id"
          : "hospital_id";
      const writes = [
        `INSERT INTO public.${t} DEFAULT VALUES`,
        `UPDATE public.${t} SET ${k} = ${k}`,
        `DELETE FROM public.${t}`,
      ];
      for (const role of ["anon", "authenticated"] as const) {
        const actor: Actor = { userId: role === "anon" ? null : f.pharmacist!, role };
        for (const sql of [`SELECT 1 FROM public.${t} LIMIT 1`, ...writes]) {
          const r = await probe(pg, actor, sql);
          expect(r.ok ? "allowed" : r.error, `${role}: ${sql}`).toMatch(/permission denied/);
        }
      }
      for (const sql of writes) {
        const r = await probe(pg, reader(f.pharmacist), sql);
        expect(r.ok ? "allowed" : r.error, sql).toMatch(/permission denied/);
      }
    },
  );

  it("a ward's people read its counts, batches and movements; nothing of another place", async () => {
    const ids = async (actor: Actor, sql: string) => {
      const r = await probe(pg, actor, sql);
      if (!r.ok) throw new Error(r.error);
      return r.rows.map((x) => x.k as string).sort();
    };
    const look = (actor: Actor) =>
      Promise.all([
        ids(actor, `SELECT id::text AS k FROM public.pharmacy_counts`),
        ids(actor, `SELECT DISTINCT count_id::text AS k FROM public.pharmacy_count_lines`),
        ids(actor, `SELECT id::text AS k FROM public.pharmacy_batches`),
        ids(actor, `SELECT id::text AS k FROM public.pharmacy_stock_movements`),
      ]);
    expect(await look(reader(f.nurseInCharge))).toEqual([[f.countW], [f.countW], [f.bW], [f.mvW]]);
    expect(await look(reader(f.cartHead))).toEqual([[f.countCart], [], [], []]);
    for (const a of [f.nurseOther, f.nurseW3, f.doctor, f.lab, f.superadmin]) {
      expect(await look(reader(a))).toEqual([[], [], [], []]);
    }
  });

  // 0180 pharmacy_product_locations_people lets the ward's people see the placements this policy looks up.
  it("a ward's people read the products placed at their location, and no other", async () => {
    const r = await probe(
      pg,
      reader(f.nurseInCharge),
      `SELECT id::text AS k FROM public.pharmacy_products`,
    );
    expect(r.ok && r.rows.map((x) => x.k)).toEqual([f.product]);
    const other = await probe(
      pg,
      reader(f.nurseOther),
      `SELECT id::text AS k FROM public.pharmacy_products`,
    );
    expect(other.ok && other.rows).toEqual([]);
  });

  /* ─── S3: immutable tables ────────────────────────────────────────── */

  it.each(APPEND_ONLY)(
    "%s: UPDATE and DELETE are refused for the owner and for the service role",
    async (t) => {
      for (const sql of [
        `UPDATE public.${t} SET hospital_id = hospital_id`,
        `DELETE FROM public.${t}`,
      ]) {
        expect(await attempt((tx) => tx.query(sql))).toMatch(/append-only/);
        expect(await attempt((tx) => tx.query(sql), "service_role")).toMatch(
          /append-only|permission denied/,
        );
      }
    },
  );

  it("a write-off takes its disposal once and then never changes; nothing else about it changes", async () => {
    const dispose = (tx: PgQueryable) =>
      tx.query(
        `UPDATE public.pharmacy_write_offs SET disposal_reference = 'DISP-0001', disposal_on = current_date,
           disposal_recorded_by = $2 WHERE id = $1`,
        [f.writeOff, f.pharmacist],
      );
    for (const role of [undefined, "service_role"] as const) {
      expect(await attempt(dispose, role)).toBe("ran");
      expect(
        await attempt(async (tx) => {
          await dispose(tx);
          await tx.query(
            `UPDATE public.pharmacy_write_offs SET disposal_on = current_date - 1 WHERE id = $1`,
            [f.writeOff],
          );
        }, role),
      ).toMatch(/never changes once its disposal is recorded/);
      expect(
        await attempt(
          (tx) =>
            tx.query(`UPDATE public.pharmacy_write_offs SET note = 'Changed later' WHERE id = $1`, [
              f.writeOff,
            ]),
          role,
        ),
      ).toMatch(/only the disposal reference is added later/);
      expect(
        await attempt(
          (tx) => tx.query(`DELETE FROM public.pharmacy_write_offs WHERE id = $1`, [f.writeOff]),
          role,
        ),
      ).toMatch(/never changes/);
    }
  });

  it("an open recall changes only by approval or close; a closed recall never changes", async () => {
    const close = (tx: PgQueryable) =>
      tx.query(
        `UPDATE public.pharmacy_recalls SET closed_at = now(), closed_by = $2, returned_quantity = 0,
           destroyed_quantity = 0 WHERE id = $1`,
        [f.recallW2, f.pharmacist],
      );
    expect(await attempt(close)).toBe("ran");
    expect(
      await attempt((tx) =>
        tx.query(`UPDATE public.pharmacy_recalls SET level = 'Changed level' WHERE id = $1`, [
          f.recallW2,
        ]),
      ),
    ).toMatch(/only the approval and the close change a recall/);
    for (const role of [undefined, "service_role"] as const) {
      expect(
        await attempt(async (tx) => {
          await close(tx);
          await tx.query(
            `UPDATE public.pharmacy_recalls SET close_note = 'Later note' WHERE id = $1`,
            [f.recallW2],
          );
        }, role),
      ).toMatch(/closed recall never changes/);
    }
    expect(
      await attempt((tx) =>
        tx.query(`DELETE FROM public.pharmacy_recalls WHERE id = $1`, [f.recallW2]),
      ),
    ).toMatch(/closed recall never changes/);
  });

  it("a received or abandoned delivery and its lines never change; a delivery being counted does", async () => {
    for (const role of [undefined, "service_role"] as const) {
      for (const sql of [
        `UPDATE public.pharmacy_deliveries SET deliverer_name = 'Someone else' WHERE id = $1`,
        `DELETE FROM public.pharmacy_deliveries WHERE id = $1`,
      ]) {
        expect(await attempt((tx) => tx.query(sql, [f.delivery]), role)).toMatch(
          /finished delivery never changes/,
        );
      }
      for (const sql of [
        `UPDATE public.pharmacy_delivery_lines SET accepted_quantity = 9 WHERE id = $1`,
        `DELETE FROM public.pharmacy_delivery_lines WHERE id = $1`,
      ]) {
        expect(await attempt((tx) => tx.query(sql, [f.deliveryLine]), role)).toMatch(
          /the delivery is finished/,
        );
      }
      expect(
        await attempt(
          (tx) =>
            tx.query(
              `INSERT INTO public.pharmacy_delivery_lines (delivery_id, line_no, product_id) VALUES ($1, 2, $2)`,
              [f.delivery, f.product],
            ),
          role,
        ),
      ).toMatch(/the delivery is finished/);
    }
    const abandoned = await attempt(async (tx) => {
      const d = await delivery(tx, "DN-ABANDON");
      await tx.query(
        `UPDATE public.pharmacy_delivery_lines SET accepted_quantity = 8 WHERE id = $1`,
        [d.line],
      );
      await tx.query(
        `UPDATE public.pharmacy_deliveries SET state = 'abandoned', abandon_reason = 'Note did not match',
           finished_by = $2, finished_at = now() WHERE id = $1`,
        [d.delivery, f.tech],
      );
      await tx.query(
        `UPDATE public.pharmacy_delivery_lines SET accepted_quantity = 7 WHERE id = $1`,
        [d.line],
      );
    });
    expect(abandoned).toMatch(/the delivery is finished/);
  });

  it("a saved order's lines change only by closing, once; a draft's lines change freely", async () => {
    const closeLine = (tx: PgQueryable) =>
      tx.query(
        `UPDATE public.pharmacy_order_lines SET closed_at = now(), closed_by = $2, close_reason = 'received' WHERE id = $1`,
        [f.orderLine, f.pharmacist],
      );
    expect(await attempt(closeLine)).toBe("ran");
    for (const role of [undefined, "service_role"] as const) {
      expect(
        await attempt(
          (tx) =>
            tx.query(`UPDATE public.pharmacy_order_lines SET chosen_units = 90 WHERE id = $1`, [
              f.orderLine,
            ]),
          role,
        ),
      ).toMatch(/changes only by closing/);
      expect(
        await attempt(async (tx) => {
          await closeLine(tx);
          await tx.query(
            `UPDATE public.pharmacy_order_lines SET close_note = 'Reopened' WHERE id = $1`,
            [f.orderLine],
          );
        }, role),
      ).toMatch(/closed, never removed or reopened/);
      expect(
        await attempt(
          (tx) => tx.query(`DELETE FROM public.pharmacy_order_lines WHERE id = $1`, [f.orderLine]),
          role,
        ),
      ).toMatch(/closed, never removed or reopened/);
      expect(
        await attempt(
          (tx) => tx.query(`UPDATE public.pharmacy_orders SET budget = 1 WHERE id = $1`, [f.order]),
          role,
        ),
      ).toMatch(/changes only by closing/);
    }
    const draft = await attempt(async (tx) => {
      const o = await id(
        tx,
        `INSERT INTO public.pharmacy_orders (hospital_id, kind, cut_at, created_by) VALUES ($1, 'emergency', now(), $2)
         RETURNING id`,
        [f.hA, f.pharmacist],
      );
      const l = await id(
        tx,
        `INSERT INTO public.pharmacy_order_lines (order_id, medicine_id, product_id, inputs, chosen_units)
         VALUES ($1, 'fixture_tablet_a', $2, '{}', 5) RETURNING id`,
        [o, f.product],
      );
      await tx.query(`UPDATE public.pharmacy_order_lines SET chosen_units = 6 WHERE id = $1`, [l]);
      await tx.query(`DELETE FROM public.pharmacy_order_lines WHERE id = $1`, [l]);
      await tx.query(`DELETE FROM public.pharmacy_orders WHERE id = $1`, [o]);
    });
    expect(draft).toBe("ran");
  });

  it("a signed location pack never changes and is retired, never deleted", async () => {
    for (const role of [undefined, "service_role"] as const) {
      expect(
        await attempt(
          (tx) =>
            tx.query(
              `UPDATE public.pharmacy_location_packs SET content = '{"levels":{"x":1}}' WHERE id = $1`,
              [f.packW],
            ),
          role,
        ),
      ).toMatch(/signed pack never changes/);
      expect(
        await attempt(
          (tx) => tx.query(`DELETE FROM public.pharmacy_location_packs WHERE id = $1`, [f.packW]),
          role,
        ),
      ).toMatch(/retired, never deleted/);
      expect(
        await attempt(
          (tx) =>
            tx.query(
              `UPDATE public.pharmacy_location_packs SET status = 'retired', retired_at = now(), version = 2 WHERE id = $1`,
              [f.packW],
            ),
          role,
        ),
      ).toMatch(/signed pack never changes/);
    }
    const retired = await attempt(async (tx) => {
      await tx.query(
        `UPDATE public.pharmacy_location_packs SET status = 'retired', retired_at = now() WHERE id = $1`,
        [f.packW],
      );
      await tx.query(`UPDATE public.pharmacy_location_packs SET status = 'signed' WHERE id = $1`, [
        f.packW,
      ]);
    });
    expect(retired).toMatch(/signed pack never changes/);
    expect(
      await attempt((tx) =>
        tx.query(
          `UPDATE public.pharmacy_location_packs SET status = 'retired', retired_at = now() WHERE id = $1`,
          [f.packW],
        ),
      ),
    ).toBe("ran");
  });

  /* ─── Locations (LC-1) and going live (GL2-1) ─────────────────────── */

  it("every dispensing point has a location of the same id, a point made after 0180 included (LC-1)", async () => {
    const { n } = await one<{ n: number }>(
      pg,
      `SELECT count(*)::int AS n FROM public.pharmacy_dispensing_points p
         LEFT JOIN public.pharmacy_locations l ON l.id = p.department_id AND l.department_id = p.department_id
              AND l.kind = 'dispensing_point' AND l.hospital_id = p.hospital_id
        WHERE l.id IS NULL`,
    );
    expect(n).toBe(0);
    const { k } = await one<{ k: string }>(
      pg,
      `SELECT kind AS k FROM public.pharmacy_locations WHERE id = $1`,
      [f.pointA],
    );
    expect(k).toBe("dispensing_point");
  });

  it("0180 copies a point that existed before it under its own id (LC-1 backfill)", async () => {
    const old = await bootEmpty();
    try {
      await migrate(old, { upTo: "0179" });
      const h = await hospital(old, "Before 0180");
      const d = await department(old, h, "Old pharmacy");
      await old.query(
        `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves) VALUES ($1, $2, 'all')`,
        [d, h],
      );
      await migrate(old, { from: "0180" });
      const row = await one<{
        kind: string;
        hospital_id: string;
        department_id: string;
        live_at: string | null;
      }>(
        old,
        `SELECT kind, hospital_id, department_id, live_at FROM public.pharmacy_locations WHERE id = $1`,
        [d],
      );
      expect(row).toEqual({
        kind: "dispensing_point",
        hospital_id: h,
        department_id: d,
        live_at: null,
      });
    } finally {
      await (old as unknown as { close(): Promise<void> }).close();
    }
  }, 180_000);

  it("a location goes live only through a two-person go-live row, and what it is never changes", async () => {
    expect(
      await attempt((tx) =>
        tx.query(`UPDATE public.pharmacy_locations SET live_at = now() WHERE id = $1`, [f.W]),
      ),
    ).toMatch(/only through the go-live record/);
    expect(
      await attempt((tx) =>
        tx.query(`UPDATE public.pharmacy_locations SET switched_off_at = now() WHERE id = $1`, [
          f.store,
        ]),
      ),
    ).toMatch(/only through the go-live record/);
    expect(
      await attempt((tx) =>
        tx.query(
          `INSERT INTO public.pharmacy_location_golive (hospital_id, location_id, action, conditions, requested_by, approved_by)
           VALUES ($1, $2, 'on', '{}', $3, $3)`,
          [f.hA, f.W, f.admin],
        ),
      ),
    ).toMatch(/plg_second_person/);
    expect(
      await attempt((tx) =>
        tx.query(
          `INSERT INTO public.pharmacy_location_golive (hospital_id, location_id, action, conditions, requested_by, approved_by)
           VALUES ($1, $2, 'off', '{}', $3, $4)`,
          [f.hA, f.W, f.admin, f.pharmacist],
        ),
      ),
    ).toMatch(/plg_off_reason/);
    const live = await pg.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO public.pharmacy_location_golive (hospital_id, location_id, action, conditions, requested_by, approved_by)
         VALUES ($1, $2, 'on', '{}', $3, $4)`,
        [f.hA, f.W, f.admin, f.pharmacist],
      );
      const r = await one<{ live: boolean }>(
        tx,
        `SELECT live_at IS NOT NULL AND switched_off_at IS NULL AS live FROM public.pharmacy_locations WHERE id = $1`,
        [f.W],
      );
      await tx.rollback();
      return r.live;
    });
    expect(live).toBe(true);
    const { live: storeLive } = await one<{ live: boolean }>(
      pg,
      `SELECT live_at IS NOT NULL AS live FROM public.pharmacy_locations WHERE id = $1`,
      [f.store],
    );
    expect(storeLive).toBe(true);
    expect(
      await attempt((tx) =>
        tx.query(`UPDATE public.pharmacy_locations SET kind = 'store' WHERE id = $1`, [f.quar]),
      ),
    ).toMatch(/what a location is never changes/);
    expect(
      await attempt((tx) =>
        tx.query(`DELETE FROM public.pharmacy_locations WHERE id = $1`, [f.W2]),
      ),
    ).toMatch(/archived, never deleted/);
  });

  /* ─── SL-13: pairs at commit ──────────────────────────────────────── */

  it("an issued leg without its received_from_issue does not commit; both legs do (SL-13)", async () => {
    const pair = "11111111-2222-4333-8444-555555555555";
    expect(await attempt((tx) => mv(tx, f.bS!, f.store!, "issued", -1, { pair }))).toMatch(
      /issued without its other leg \(SL-13\)/,
    );
    expect(
      await attempt(async (tx) => {
        await mv(tx, f.bS!, f.store!, "issued", -2, { pair });
        await mv(tx, f.bW!, f.W!, "received_from_issue", 1, { pair });
      }),
    ).toMatch(/without its other leg \(SL-13\)/);
    expect(await attempt((tx) => mv(tx, f.bS!, f.store!, "issued", -1))).toMatch(/psm_pairs/);
    expect(await attempt((tx) => issuePair(tx, f.store!, f.bS!, f.W!, f.bW!, 2))).toBe("ran");
  });

  /* ─── SL-14: blocked batches; SL-4 below zero ─────────────────────── */

  it("an expired batch takes no issue, loan, transfer or supply; a back-entered one does (SL-14)", async () => {
    const outs: [string, (tx: PgQueryable, b: string) => Promise<unknown>][] = [
      ["issued", (tx, b) => mv(tx, b, f.store!, "issued", -1, { pair: f.recv })],
      ["lent", (tx, b) => mv(tx, b, f.store!, "lent", -1, { counterparty: true })],
      ["transfer_out", (tx, b) => mv(tx, b, f.store!, "transfer_out", -1)],
    ];
    for (const [kind, out] of outs) {
      const r = await attempt(async (tx) => {
        const b = await batchAt(f.store!, "EXP-1", "2020-01-01", tx);
        await mv(tx, b, f.store!, "received", 5);
        await out(tx, b);
      });
      expect(r, kind).toMatch(/batch EXP-1 expired on 2020-01-01/);
    }
    const supplied = await attempt(async (tx) => {
      const b = await batchAt(f.pointA!, "EXP-P", "2020-01-01", tx, true);
      await mv(tx, b, f.pointA!, "received", 5, { point: true });
      await mv(tx, b, f.pointA!, "supplied", -1, { point: true });
    });
    expect(supplied).toMatch(/batch EXP-P expired on 2020-01-01/);
    const backEntered = await attempt(async (tx) => {
      const b = await batchAt(f.store!, "EXP-DT", "2020-01-01", tx);
      const w = await batchAt(f.W!, "EXP-DT", "2020-01-01", tx);
      await mv(tx, b, f.store!, "received", 5);
      const pair = (await one<{ p: string }>(tx, `SELECT gen_random_uuid()::text AS p`)).p;
      await mv(tx, b, f.store!, "issued", -1, { pair, downtime: true });
      await mv(tx, w, f.W!, "received_from_issue", 1, { pair, downtime: true });
    });
    expect(backEntered).toBe("ran");
  });

  it("a batch at a quarantine location takes no issue or transfer, and is written off only from there (SL-14)", async () => {
    for (const kind of ["issued", "transfer_out"]) {
      const r = await attempt(async (tx) => {
        const b = await batchAt(f.quar!, "Q-1", "2099-01-01", tx);
        await mv(tx, b, f.quar!, "received", 5);
        await mv(tx, b, f.quar!, kind, -1, kind === "issued" ? { pair: f.recv } : {});
      });
      expect(r, kind).toMatch(/batch Q-1 is in quarantine/);
    }
    const writtenOff = await attempt(async (tx) => {
      const b = await batchAt(f.quar!, "Q-2", "2020-01-01", tx);
      await mv(tx, b, f.quar!, "received", 5);
      await mv(tx, b, f.quar!, "written_off", -3);
      await mv(tx, b, f.quar!, "returned_to_supplier", -2, { counterparty: true });
    });
    expect(writtenOff).toBe("ran");
    for (const [kind, o] of [
      ["written_off", {}],
      ["returned_to_supplier", { counterparty: true }],
    ] as const) {
      expect(await attempt((tx) => mv(tx, f.bS!, f.store!, kind, -1, o)), kind).toMatch(
        /from quarantine only/,
      );
    }
  });

  it("a batch under an open recall, by its number now or an earlier corrected one, leaves only into quarantine (SL-14, RC-1)", async () => {
    const byNumber = await attempt(async (tx) => {
      const b = await batchAt(f.store!, "RCL-1", "2099-01-01", tx);
      await mv(tx, b, f.store!, "received", 5);
      await recall(tx, "rcl-1");
      await mv(tx, b, f.store!, "transfer_out", -1);
    });
    expect(byNumber).toMatch(/batch RCL-1 is recalled/);
    // First recorded COR-A, corrected to COR-B, then to COR-C: only the correction row remembers COR-B.
    const byCorrection = await attempt(async (tx) => {
      const b = await batchAt(f.store!, "COR-A", "2099-01-01", tx);
      await mv(tx, b, f.store!, "received", 5);
      for (const [from, to] of [
        ["COR-A", "COR-B"],
        ["COR-B", "COR-C"],
      ]) {
        await tx.query(
          `INSERT INTO public.pharmacy_batch_corrections (batch_id, hospital_id, old_batch_number, new_batch_number,
             old_expiry, new_expiry, actor_user_id, reason)
           VALUES ($1, $2, $3, $4, '2099-01-01', '2099-01-01', $5, 'Number mistyped at receipt')`,
          [b, f.hA, from, to, f.pharmacist],
        );
        await tx.query(`UPDATE public.pharmacy_batches SET batch_number = $2 WHERE id = $1`, [
          b,
          to,
        ]);
      }
      await recall(tx, "COR-B");
      await mv(tx, b, f.store!, "issued", -1, { pair: f.recv });
    });
    expect(byCorrection).toMatch(/batch COR-C is recalled/);
    const quarantined = await attempt(async (tx) => {
      const b = await batchAt(f.store!, "RCL-2", "2099-01-01", tx);
      const q = await batchAt(f.quar!, "RCL-2", "2099-01-01", tx);
      await mv(tx, b, f.store!, "received", 5);
      await recall(tx, "RCL-2");
      const pair = (await one<{ p: string }>(tx, `SELECT gen_random_uuid()::text AS p`)).p;
      await mv(tx, b, f.store!, "quarantined_out", -5, { pair });
      await mv(tx, q, f.quar!, "quarantined_in", 5, { pair });
      await mv(tx, q, f.quar!, "written_off", -5);
    });
    expect(quarantined).toBe("ran");
  });

  async function recall(tx: PgQueryable, batchNumber: string) {
    await tx.query(
      `INSERT INTO public.pharmacy_recalls (hospital_id, product_id, batch_number, source, notice_ref, notice_date,
         stated_class, level, instructions, started_by)
       VALUES ($1, $2, $3, 'nda', 'FX-NDA', current_date, 'not_stated', 'Fixture level', 'Fixture instructions', $4)`,
      [f.hA, f.product, batchNumber, f.pharmacist],
    );
  }

  it("a live out-movement still cannot take a batch below zero (SL-4)", async () => {
    const r = await attempt(async (tx) => {
      const b = await batchAt(f.store!, "LOW-1", "2099-01-01", tx);
      await mv(tx, b, f.store!, "received", 3);
      await mv(tx, b, f.store!, "issued", -4, { pair: f.recv });
    });
    expect(r).toMatch(/batch LOW-1 holds 3/);
  });

  /* ─── Permission map v3 and location rights ───────────────────────── */

  it("private.pharmacy_cadre_permissions equals permission map v3; both pharmacy cadres hold pharmacy.store", async () => {
    const map = JSON.parse(
      readFileSync(resolve(process.cwd(), "data/pharmacy/permission-map.v3.json"), "utf8"),
    ) as { cadres: Record<string, string[]> };
    for (const cadre of [
      ...Object.keys(map.cadres),
      "NURSE",
      "MEDICAL_OFFICER",
      "LAB_TECHNOLOGIST",
    ]) {
      const { p } = await one<{ p: string[] }>(
        pg,
        `SELECT private.pharmacy_cadre_permissions($1) AS p`,
        [cadre],
      );
      expect(new Set(p), cadre).toEqual(new Set(map.cadres[cadre] ?? []));
      expect(p.includes("pharmacy.store"), cadre).toBe(
        ["PHARMACIST", "PHARMACY_TECH"].includes(cadre),
      );
    }
  });

  it("pharmacy.manage comes with heading a store unit under Pharmacy, for pharmacy cadres only", async () => {
    const r = await pg.transaction(async (tx) => {
      const can = async (u: string) =>
        (
          await one<{ c: boolean }>(
            tx,
            `SELECT private.pharmacy_can_user($1, $2, 'pharmacy.manage') AS c`,
            [u, f.hA],
          )
        ).c;
      const head = (dept: string, u: string) =>
        tx.query(
          `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at)
           VALUES ($1, $2, $3, now() - interval '1 day')`,
          [f.hA, dept, u],
        );
      const before = await can(f.tech!);
      await head(f.storeDept!, f.tech!);
      const storeHead = await can(f.tech!);
      const office = await id(
        tx,
        `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
         VALUES ($1, $2, 'Pharmacy office', 'pharmacy-office-fixture', 'support') RETURNING id`,
        [f.hA, f.pharmDeptA],
      );
      await head(office, f.pharmacist!);
      const officeHead = await can(f.pharmacist!);
      await tx.query(`UPDATE public.department_heads SET acting = true WHERE department_id = $1`, [
        f.storeDept,
      ]);
      await head(f.storeDept!, f.nurseOther!);
      const nurseHead = await can(f.nurseOther!);
      await tx.rollback();
      return [before, storeHead, officeHead, nurseHead];
    });
    expect(r).toEqual([false, true, false, false]);
  });

  it("private.pharmacy_location_right gives ward and cart rights from hub assignments only", async () => {
    const right = async (tx: PgQueryable, u: string | null, loc: string, r: string) =>
      (
        await one<{ ok: boolean }>(tx, `SELECT private.pharmacy_location_right($1, $2, $3) AS ok`, [
          u,
          loc,
          r,
        ])
      ).ok;
    const cases: [string, string | null, string, string, boolean][] = [
      ["in-charge acts on W", f.nurseInCharge!, f.W!, "ward_act", true],
      ["in-charge reads W", f.nurseInCharge!, f.W!, "ward_read", true],
      ["in-charge confirms at W", f.nurseInCharge!, f.W!, "ward_confirm", true],
      ["in-charge of W, not W2", f.nurseInCharge!, f.W2!, "ward_read", false],
      ["in-charge of W confirms no cart", f.nurseInCharge!, f.cart!, "cart_confirm", false],
      ["nurse on W's unit, not in charge", f.nurseOther!, f.W!, "ward_read", false],
      ["nurse on W's unit confirms nothing", f.nurseOther!, f.W!, "ward_confirm", false],
      ["nurse on W3's unit reads W3", f.nurseW3!, f.W3!, "ward_read", true],
      ["nurse on W3's unit confirms at W3", f.nurseW3!, f.W3!, "ward_confirm", true],
      ["nurse on W3's unit does not act", f.nurseW3!, f.W3!, "ward_act", false],
      ["nurse elsewhere, W3", f.nurseElse!, f.W3!, "ward_read", false],
      ["cart's unit head confirms", f.cartHead!, f.cart!, "cart_confirm", true],
      ["cart's unit head, no ward right", f.cartHead!, f.cart!, "ward_read", false],
      ["pharmacist, no ward right", f.pharmacist!, f.W!, "ward_act", false],
      ["pharmacist, no cart right", f.pharmacist!, f.cart!, "cart_confirm", false],
      ["doctor, nothing", f.doctor!, f.W3!, "ward_read", false],
      ["no one", null, f.W!, "ward_act", false],
      ["an unknown right", f.nurseInCharge!, f.W!, "anything", false],
    ];
    for (const [label, u, loc, r, want] of cases)
      expect(await right(pg, u, loc, r), label).toBe(want);

    const later = await pg.transaction(async (tx) => {
      // The in-charge of a ward in the cart's unit confirms its checks.
      const w = await ward(f.cartDept!, "Emergency ward", tx);
      await tx.query(
        `INSERT INTO public.ward_in_charge_assignments (hospital_id, ward_id, nurse_user_id, starts_at)
         VALUES ($1, $2, $3, now() - interval '1 hour')`,
        [f.hA, w, f.nurseElse],
      );
      const unitInCharge = await right(tx, f.nurseElse!, f.cart!, "cart_confirm");
      // An ended assignment and an archived location give nothing.
      await tx.query(
        `UPDATE public.ward_in_charge_assignments SET ends_at = now() - interval '1 second' WHERE ward_id = $1`,
        [f.wardW],
      );
      await tx.query(`UPDATE public.pharmacy_locations SET archived_at = now() WHERE id = $1`, [
        f.W3,
      ]);
      const ended = await right(tx, f.nurseInCharge!, f.W!, "ward_act");
      const archived = await right(tx, f.nurseW3!, f.W3!, "ward_read");
      await tx.rollback();
      return [unitInCharge, ended, archived];
    });
    expect(later).toEqual([true, false, false]);
  });
});
