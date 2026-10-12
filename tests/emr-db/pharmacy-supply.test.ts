/**
 * Pharmacy Phase 1, Step 6: hand-over and supply on the PGlite lane, every migration replayed. Drives
 * lib/pharmacy/supply/store.ts through `runPharmacyWrite` (the action's own path, Section 8) and reads
 * back through lib/pharmacy/supply/read.ts. Scenarios S35–S55 of
 * docs/pharmacy/phase-1/PROMPT-PHARMACY-PHASE-1.md §9, Step 6 (S56's viewports are the harness's).
 * The true two-connection race of S43 is tests/rls/pharmacy-races.test.ts; here it runs in sequence.
 * Every medicine, batch, quantity, date of birth and phone is a fixture (Law 8).
 */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Lane, Pg } from "./_pglite";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { encrypt, generateKey } from "@/lib/encryption";
import { PHARMACY_MAP_V2, pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import { labelFor } from "@/lib/pharmacy/print/label";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { bootLane, department, encounter, hospital, laneOn, patient, staff } from "./_pglite";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

const review = await import("@/lib/pharmacy/review/store");
const reviewRead = await import("@/lib/pharmacy/review/read");
const stock = await import("@/lib/pharmacy/stock/store");
const store = await import("@/lib/pharmacy/supply/store");
const read = await import("@/lib/pharmacy/supply/read");

const DAY = 86_400_000;
const DOB = "1988-07-01";
const DOB2 = "1975-02-14";
const PHONE = "0700000000";

describe.skipIf(!laneOn)("pharmacy hand-over and supply (Step 6, S35–S55)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;
  const timings: number[] = [];

  const one = async <T = { id: string }>(q: string, p?: unknown[]) =>
    (await pg.query<T>(q, p)).rows[0] as T;
  const n = async (q: string, p?: unknown[]) => (await one<{ n: number }>(q, p)).n;

  const actor = (userId: string, cadre: string, pointId = f.pointA!): PharmacyActor => ({
    userId,
    hospitalId: f.h!,
    cadreCode: cadre,
    cadreName: cadre === "PHARMACIST" ? "Pharmacist" : "Pharmacy technician",
    pointId,
    access: pharmacyDispensingAccess(cadre, PHARMACY_MAP_V2),
  });
  const pharmacist = (point?: string) => actor(f.pharmacist!, "PHARMACIST", point);
  const tech = () => actor(f.tech!, "PHARMACY_TECH");
  const head = () => actor(f.head!, "PHARMACY_TECH");

  const run = <I, R extends { id: string }>(
    a: PharmacyActor,
    schema: z.ZodType<I>,
    need: PharmacyNeed,
    write: (ctx: PharmacyCtx, input: I) => Promise<R>,
    raw: Record<string, unknown>,
    now?: Date,
  ) =>
    runPharmacyWrite(schema, { clientKey: randomUUID(), ...raw }, a, need, write, {
      database: lane.db,
      ...(now ? { now } : {}),
    });

  let lineNo = 0;
  const place = async (
    lines: {
      drug?: string;
      controlled?: boolean;
      edits?: unknown[];
      dose?: string;
      strength?: string;
    }[],
    o: { encounterId?: string; createdAt?: Date; patient?: string } = {},
  ) => {
    const placement = randomUUID();
    const ids: string[] = [];
    for (const [i, l] of lines.entries()) {
      lineNo += 1;
      ids.push(
        (
          await one(
            `INSERT INTO public.prescriptions
               (hospital_id, encounter_id, patient_user_id, prescriber_user_id, prescriber_cadre, drug_id, drug_name,
                concentration, dose, route, frequency, is_emergency, state, placement_id, placement_line, created_at,
                updated_at, check_answers, controlled, regimen_id, edits)
             VALUES ($1, $2, $3, $4, 'MEDICAL_OFFICER', $5, $6, $7, $8, 'oral', '[fixture frequency]', false, 'active',
                     $9, $10, $11, $11, '[]'::jsonb, $12, 'fixture_regimen', $13::jsonb)
             RETURNING id`,
            [
              f.h,
              o.encounterId ?? f.window,
              o.patient ?? f.patient,
              f.doctor,
              l.drug ?? "fixture_a",
              `Fixture medicine ${lineNo}`,
              l.strength ?? null,
              l.dose ?? "[fixture dose]",
              placement,
              i + 1,
              (o.createdAt ?? new Date()).toISOString(),
              l.controlled ?? false,
              JSON.stringify(l.edits ?? []),
            ],
          )
        ).id,
      );
    }
    return ids;
  };

  const product = async (medicine: string, name: string, strength: string | null = null) => {
    const id = (
      await one(
        `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, strength, issue_unit, created_by)
         VALUES ($1, $2, $3, $4, 'tablet', $5) RETURNING id`,
        [f.h, medicine, name, strength, f.pharmacist],
      )
    ).id;
    for (const p of [f.pointA, f.pointB])
      await pg.query(
        `INSERT INTO public.pharmacy_product_points (product_id, dispensing_point_id, hospital_id) VALUES ($1, $2, $3)`,
        [id, p, f.h],
      );
    return id;
  };
  let batchNo = 0;
  const batch = async (
    productId: string,
    qty: number,
    expiry = "2099-03-31",
    point = f.pointA!,
  ) => {
    batchNo += 1;
    const no = `FX-${String(batchNo).padStart(3, "0")}`;
    const id = (
      await one(
        `INSERT INTO public.pharmacy_batches (hospital_id, dispensing_point_id, product_id, batch_number, expiry,
           first_batch_number, first_expiry, created_by)
         VALUES ($1, $2, $3, $4, $5, $4, $5, $6) RETURNING id`,
        [f.h, point, productId, no, expiry, f.pharmacist],
      )
    ).id;
    await pg.query(
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, batch_id, kind, quantity,
         effective_at, actor_user_id, source_kind) VALUES ($1, $2, $3, 'received', $4, now() - interval '50 days', $5, 'delivery')`,
      [f.h, point, id, qty, f.pharmacist],
    );
    return { id, no };
  };
  const bal = (batchId: string) =>
    n(
      `SELECT coalesce(sum(quantity), 0)::int AS n FROM public.pharmacy_stock_movements WHERE batch_id = $1`,
      [batchId],
    );

  /** Stage one decision per line (saveLineDecisions, as the review screen does). */
  const stage = (decisions: Record<string, unknown>[], a = pharmacist(), now?: Date) =>
    run(
      a,
      review.DecisionsInput,
      review.DISPENSE_NEED,
      review.saveLineDecisions,
      { decisions },
      now,
    );
  const identify = (
    a: PharmacyActor,
    clientKey: string,
    lineId: string,
    typed = "01/07/1988",
    now?: Date,
  ) =>
    run(
      a,
      store.IdentifierInput,
      store.DISPENSE_LIVE,
      store.checkSecondIdentifier,
      {
        clientKey,
        lineId,
        kind: "date_of_birth",
        typed,
      },
      now,
    );
  const planLine = (lineId: string, productId: string, rows: [string, number][], extra = {}) => ({
    lineId,
    productId,
    rows: rows.map(([batchId, quantity]) => ({ batchId, quantity })),
    strengthConfirmed: true,
    ...extra,
  });
  const handover = async (
    a: PharmacyActor,
    lines: Record<string, unknown>[],
    o: { clientKey?: string; identify?: boolean; raw?: Record<string, unknown>; now?: Date } = {},
  ) => {
    const clientKey = o.clientKey ?? randomUUID();
    if (o.identify !== false)
      await identify(a, clientKey, String(lines[0]!.lineId), "01/07/1988", o.now);
    const t0 = performance.now();
    const r = await runPharmacyWrite(
      store.HandoverInput,
      {
        clientKey,
        lines,
        collector: { kind: "patient" },
        identity: { route: "two_identifiers", nameAttested: true },
        payment: { status: "paid" },
        ...o.raw,
      },
      a,
      store.DISPENSE_LIVE,
      store.recordHandover,
      { database: lane.db, ...(o.now ? { now: o.now } : {}) },
    );
    if (r.ok) timings.push(performance.now() - t0);
    return r;
  };
  const statusOf = async (lineId: string) =>
    (await reviewRead.getReviewOfLine(f.h!, lineId, f.pointA!, lane.db))!.lines.find(
      (l) => l.id === lineId,
    )!.status;
  const counts = async () => ({
    handovers: await n(`SELECT count(*)::int AS n FROM public.pharmacy_handovers`),
    supplies: await n(`SELECT count(*)::int AS n FROM public.pharmacy_supplies`),
    movements: await n(`SELECT count(*)::int AS n FROM public.pharmacy_stock_movements`),
    events: await n(`SELECT count(*)::int AS n FROM public.pharmacy_line_events`),
  });

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    pg = lane.pg;
    held.db = lane.db;
    f.h = await hospital(pg, "Supply");
    f.pharm = (
      await one(
        `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
         VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
        [f.h, `ph-${Date.now()}`],
      )
    ).id;
    for (const p of ["A", "B"]) {
      f[`point${p}`] = (
        await one(
          `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
           VALUES ($1, $2, $3, $4, 'support') RETURNING id`,
          [f.h, f.pharm, `Fixture point ${p}`, `pt-${p}-${Date.now()}`],
        )
      ).id;
      await pg.query(
        `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves, live_at, phone)
         VALUES ($1, $2, 'window', now() - interval '40 days', '+256 700 000000')`,
        [f[`point${p}`], f.h],
      );
    }
    const clinic = await department(pg, f.h, "Clinic");
    f.pharmacist = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pharm, cadre: "PHARMACIST" })
    ).userId;
    f.tech = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pointA!, cadre: "PHARMACY_TECH" })
    ).userId;
    f.head = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pointA!, cadre: "PHARMACY_TECH" })
    ).userId;
    await pg.query(
      `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at)
       VALUES ($1, $2, $3, now() - interval '1 day')`,
      [f.h, f.pointA, f.head],
    );
    f.doctor = (
      await staff(pg, { hospitalId: f.h, departmentId: clinic, cadre: "MEDICAL_OFFICER" })
    ).userId;
    f.doctor2 = (
      await staff(pg, { hospitalId: f.h, departmentId: clinic, cadre: "MEDICAL_OFFICER" })
    ).userId;
    f.nurse = (await staff(pg, { hospitalId: f.h, departmentId: clinic, cadre: "NURSE" })).userId;
    await pg.query(
      `INSERT INTO public.clinical_cosign_policies (hospital_id, cadre_code, action_kind, requirement)
       VALUES ($1, 'MEDICAL_OFFICER', 'prescription_routine', 'allowed') ON CONFLICT DO NOTHING`,
      [f.h],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_hospital_settings (hospital_id, updated_by) VALUES ($1, $2)`,
      [f.h, f.pharmacist],
    );
    // A signed lane rule: plain prescriptions are standard; a changed pre-set dose is pharmacist-first.
    await pg.query(
      `INSERT INTO public.pharmacy_signed_sets (hospital_id, kind, version, content, sha256, status, authored_by,
         first_signer, second_signer, signed_at)
       VALUES ($1, 'lane_rule', 1, $2::jsonb, repeat('b', 64), 'signed', $3, $3, $4, now())`,
      [
        f.h,
        JSON.stringify({ reasons: [{ code: "preset_dose_changed", on: true }] }),
        f.pharmacist,
        f.doctor,
      ],
    );
    for (const [k, dob, hmac] of [
      ["patient", DOB, null],
      ["patient2", DOB2, null],
    ] as const) {
      f[k] = await patient(pg);
      await pg.query(
        `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type,
           phone_encrypted, phone_hmac, district_id)
         VALUES ($1, $2, $3, 'female', $4, 'none', $5, $6, (SELECT id FROM public.districts LIMIT 1))`,
        [f[k], encrypt("Fixture"), encrypt("Patient"), dob, encrypt(PHONE), hmac],
      );
    }
    f.window = await encounter(pg, {
      hospitalId: f.h,
      patientUserId: f.patient!,
      clinicianUserId: f.doctor!,
      departmentId: clinic,
    });
    await pg.query(`UPDATE public.encounters SET disposition = 'home' WHERE id = $1`, [f.window]);
    f.window2 = await encounter(pg, {
      hospitalId: f.h,
      patientUserId: f.patient2!,
      clinicianUserId: f.doctor!,
      departmentId: clinic,
    });
    await pg.query(`UPDATE public.encounters SET disposition = 'home' WHERE id = $1`, [f.window2]);
    f.ward = await encounter(pg, {
      hospitalId: f.h,
      patientUserId: f.patient!,
      clinicianUserId: f.doctor!,
    });
    await pg.query(`UPDATE public.encounters SET encounter_type = 'inpatient' WHERE id = $1`, [
      f.ward,
    ]);
  }, 180_000);

  it("S35: three lines on the shelf, one hand-over in one transaction; each batch down by exactly its quantity", async () => {
    const meds = ["fixture_s35a", "fixture_s35b", "fixture_s35c"];
    const prods = await Promise.all(meds.map((m, i) => product(m, `Fixture ${i} 100s`)));
    const batches = await Promise.all(prods.map((p) => batch(p, 100)));
    const ids = await place(meds.map((drug) => ({ drug })));
    const qty = [14, 28, 7];
    expect(
      (await stage(ids.map((lineId, i) => ({ lineId, kind: "full", quantity: qty[i] })))).ok,
    ).toBe(true);
    const before = await counts();
    const r = await handover(
      tech(),
      ids.map((id, i) => planLine(id, prods[i]!, [[batches[i]!.id, qty[i]!]])),
    );
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    const after = await counts();
    expect(after.handovers - before.handovers).toBe(1);
    expect(after.supplies - before.supplies).toBe(3);
    expect(after.movements - before.movements).toBe(3);
    for (const [i, b] of batches.entries()) expect(await bal(b.id)).toBe(100 - qty[i]!);
    const supplied = (
      await pg.query<{ batch_number: string; expiry: string; quantity: number }>(
        `SELECT b.batch_number, b.expiry::text, s.quantity FROM public.pharmacy_supplies s
           JOIN public.pharmacy_batches b ON b.id = s.batch_id WHERE s.handover_id = $1 ORDER BY s.quantity`,
        [r.id],
      )
    ).rows;
    expect(supplied.map((s) => s.quantity)).toEqual([7, 14, 28]);
    for (const s of supplied)
      expect(s).toMatchObject({
        batch_number: expect.stringMatching(/^FX-/),
        expiry: "2099-03-31",
      });
    for (const id of ids)
      expect(await statusOf(id)).toMatchObject({ kind: "closed", outcome: "supplied" });
    expect(r.data!.lines.map((l) => l.kind)).toEqual(["supplied", "supplied", "supplied"]);
    // eslint-disable-next-line no-console -- the budget is reported, not asserted on PGlite
    console.info(
      `[S35] recordHandover, 3 lines: ${timings.at(-1)!.toFixed(1)} ms (PGlite, in-process)`,
    );
  });

  it("S36: the name alone is refused; a wrong date of birth is logged without its value; five close; another way passes", async () => {
    const p = await product("fixture_s36", "Fixture S36");
    const b = await batch(p, 50);
    const [line] = await place([{ drug: "fixture_s36" }], {
      patient: f.patient2,
      encounterId: f.window2,
    });
    await stage([{ lineId: line, kind: "full", quantity: 5 }]);
    const key = randomUUID();
    const responses: unknown[] = [];
    const nameOnly = await handover(tech(), [planLine(line!, p, [[b.id, 5]])], {
      clientKey: key,
      identify: false,
    });
    responses.push(nameOnly);
    expect(nameOnly).toMatchObject({ ok: false, code: "conflict" });
    if (!nameOnly.ok) expect(nameOnly.error).toContain("Two identifiers are needed");

    for (let i = 1; i <= 5; i++) {
      const wrong = await identify(tech(), key, line!, "02/07/1990");
      responses.push(wrong);
      expect(wrong).toMatchObject({ ok: true, data: { result: "mismatch", attemptsLeft: 5 - i } });
    }
    const rows = (
      await pg.query(`SELECT * FROM public.pharmacy_identity_attempts WHERE patient_user_id = $1`, [
        f.patient2,
      ])
    ).rows;
    expect(rows.filter((r) => (r as { outcome: string }).outcome === "mismatch")).toHaveLength(5);
    expect(rows.filter((r) => (r as { outcome: string }).outcome === "closed")).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/1990|1975|02\/07/);
    // Closed: even the right date is not compared.
    const closed = await identify(tech(), key, line!, "14/02/1975");
    responses.push(closed);
    expect(closed).toMatchObject({ ok: true, data: { result: "closed", attemptsLeft: 0 } });

    const another = await handover(tech(), [planLine(line!, p, [[b.id, 5]])], {
      clientKey: key,
      identify: false,
      raw: {
        identity: {
          route: "identified_another_way",
          nameAttested: true,
          how: "known",
          note: "Fixture: known to the ward.",
        },
      },
    });
    responses.push(another);
    expect(another).toMatchObject({ ok: true });
    const listed = await read.getSupplied(f.h!, f.pointA!, localDate(new Date()), lane.db);
    responses.push(listed);
    const mine = listed.rows.filter((r) => r.identifiedAnotherWay);
    expect(mine.map((r) => r.identifiedAnotherWay)).toContain("Known to staff");
    expect(mine.length).toBe(
      await n(
        `SELECT count(*)::int AS n FROM public.pharmacy_handovers WHERE identity_route = 'identified_another_way'`,
      ),
    );
    // The pharmacy in charge reopens the typed check; a technician cannot.
    expect(
      (
        await run(
          tech(),
          store.ReopenInput,
          { permission: "pharmacy.manage", point: "live" },
          store.reopenTypedCheck,
          { lineId: line },
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await run(
          head(),
          store.ReopenInput,
          { permission: "pharmacy.manage", point: "live" },
          store.reopenTypedCheck,
          { lineId: line },
        )
      ).ok,
    ).toBe(true);
    const right = await identify(tech(), randomUUID(), line!, " 14-02-1975 ");
    responses.push(right);
    expect(right).toMatchObject({ ok: true, data: { result: "match" } });
    // A phone with no blind index is matched by the fallback (decrypt and compare).
    const phone = await run(
      tech(),
      store.IdentifierInput,
      store.DISPENSE_LIVE,
      store.checkSecondIdentifier,
      {
        clientKey: randomUUID(),
        lineId: line,
        kind: "phone",
        typed: "+256 700 000 000",
      },
    );
    responses.push(phone);
    expect(phone).toMatchObject({ ok: true, data: { result: "match" } });
    // Neither stored value reaches any response or read.
    const review = await reviewRead.getReviewOfLine(f.h!, line!, f.pointA!, lane.db);
    const [, key2] = [null, review!.key];
    responses.push(
      review,
      await read.getHandover(f.h!, key2, { id: f.pointA!, labelMode: "printed" }, null, lane.db),
    );
    const all = JSON.stringify(responses);
    for (const v of [DOB2, "1975", "14/02", PHONE, "700000000"]) expect(all).not.toContain(v);
  });

  it("S37: someone else collects; their name and relationship are stored", async () => {
    const p = await product("fixture_s37", "Fixture S37");
    const b = await batch(p, 20);
    const [line] = await place([{ drug: "fixture_s37" }]);
    await stage([{ lineId: line, kind: "full", quantity: 4 }]);
    const r = await handover(tech(), [planLine(line!, p, [[b.id, 4]])], {
      raw: {
        collector: { kind: "representative", name: "Fixture Relative", relationship: "Sister" },
      },
    });
    expect(r.ok).toBe(true);
    const row = await one<{
      collector: string;
      collector_name: string;
      collector_relationship: string;
    }>(
      `SELECT collector, collector_name, collector_relationship FROM public.pharmacy_handovers WHERE id = $1`,
      [r.ok ? r.id : null],
    );
    expect(row).toEqual({
      collector: "representative",
      collector_name: "Fixture Relative",
      collector_relationship: "Sister",
    });
  });

  it("S38: the first batch holds less: split in expiry order — two supplies, two movements, two labels", async () => {
    const p = await product("fixture_s38", "Fixture S38");
    const first = await batch(p, 5, "2098-01-31");
    const second = await batch(p, 50, "2099-06-30");
    const [line] = await place([{ drug: "fixture_s38" }]);
    await stage([{ lineId: line, kind: "full", quantity: 12 }]);
    const staged = (await reviewRead.getReviewOfLine(f.h!, line!, f.pointA!, lane.db))!.lines[0]!
      .staged!;
    expect(staged.batches).toEqual([
      { batchId: first.id, quantity: 5 },
      { batchId: second.id, quantity: 7 },
    ]);
    const r = await handover(tech(), [
      planLine(line!, p, [
        [first.id, 5],
        [second.id, 7],
      ]),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      await n(`SELECT count(*)::int AS n FROM public.pharmacy_supplies WHERE handover_id = $1`, [
        r.id,
      ]),
    ).toBe(2);
    expect(
      await n(
        `SELECT count(*)::int AS n FROM public.pharmacy_stock_movements m JOIN public.pharmacy_supplies s
           ON s.id = m.source_id WHERE s.handover_id = $1 AND m.kind = 'supplied'`,
        [r.id],
      ),
    ).toBe(2);
    const src = (await read.getLabelSource(f.h!, r.id, lane.db))!;
    expect(src.supplies.map((s) => [s.batchNumber, s.quantity])).toEqual([
      [first.no, 5],
      [second.no, 7],
    ]);
    expect(await bal(first.id)).toBe(0);
    expect(await bal(second.id)).toBe(43);
  });

  it("S39: a batch that is not first to expire needs a reason", async () => {
    const p = await product("fixture_s39", "Fixture S39");
    const first = await batch(p, 30, "2098-01-31");
    const later = await batch(p, 30, "2099-06-30");
    const [line] = await place([{ drug: "fixture_s39" }]);
    const noReason = await stage([
      {
        lineId: line,
        kind: "full",
        quantity: 10,
        productId: p,
        batches: [{ batchId: later.id, quantity: 10 }],
      },
    ]);
    expect(noReason).toMatchObject({ ok: false });
    if (!noReason.ok) expect(noReason.error).toContain("needs a reason");
    expect(
      (
        await stage([
          {
            lineId: line,
            kind: "full",
            quantity: 10,
            productId: p,
            batches: [{ batchId: later.id, quantity: 10 }],
            batchChoiceReason: "first_unfit",
          },
        ])
      ).ok,
    ).toBe(true);
    const refused = await handover(tech(), [planLine(line!, p, [[later.id, 10]])]);
    expect(refused).toMatchObject({ ok: false });
    if (!refused.ok)
      expect(refused.error).toContain("a batch that is not first to expire needs a reason");
    const ok = await handover(tech(), [
      planLine(line!, p, [[later.id, 10]], { batchChoiceReason: "first_unfit" }),
    ]);
    expect(ok.ok).toBe(true);
    expect(await bal(first.id)).toBe(30);
    expect(await bal(later.id)).toBe(20);
    expect(
      (
        await one<{ r: string }>(
          `SELECT batch_choice_reason AS r FROM public.pharmacy_supplies WHERE prescription_id = $1`,
          [line],
        )
      ).r,
    ).toBe("first_unfit");
  });

  it("S40: part supply, the rest owed; Supply now of part keeps it owed; of the rest closes it; more is refused", async () => {
    const p = await product("fixture_s40", "Fixture S40");
    const b = await batch(p, 100);
    const [line] = await place([{ drug: "fixture_s40" }]);
    await stage([
      {
        lineId: line,
        kind: "part",
        quantity: 10,
        notSupplied: 18,
        rest: "owed",
        reasonCode: "out_point",
      },
    ]);
    const rest = (q: number) => ({
      outcome: "owed",
      quantityNotSupplied: q,
      reasonCode: "out_point",
    });
    expect(
      (await handover(tech(), [planLine(line!, p, [[b.id, 10]], { rest: rest(18) })])).ok,
    ).toBe(true);
    const open = async () =>
      (await reviewRead.getOpenLines(f.h!, lane.db, f.pointA!)).rows.find((r) => r.lineId === line);
    expect(await open()).toMatchObject({
      outcome: "owed",
      supplied: 10,
      notSupplied: 18,
      onShelfHere: true,
    });
    // Supply now, part of what is owed.
    expect((await handover(tech(), [planLine(line!, p, [[b.id, 8]], { rest: rest(10) })])).ok).toBe(
      true,
    );
    expect(await open()).toMatchObject({ outcome: "owed", supplied: 18, notSupplied: 10 });
    const over = await handover(tech(), [planLine(line!, p, [[b.id, 12]])]);
    expect(over).toMatchObject({ ok: false });
    if (!over.ok) expect(over.error).toContain("only 10 left to supply");
    expect((await handover(tech(), [planLine(line!, p, [[b.id, 10]])])).ok).toBe(true);
    expect(await open()).toBeUndefined();
    expect(await statusOf(line!)).toMatchObject({ kind: "closed", outcome: "supplied" });
    expect(await bal(b.id)).toBe(72);
  });

  it("S41: a part supply with the rest bought outside prints the slip for the rest", async () => {
    const p = await product("fixture_s41", "Fixture S41");
    const b = await batch(p, 100);
    const [line] = await place([{ drug: "fixture_s41" }]);
    await stage([
      {
        lineId: line,
        kind: "part",
        quantity: 6,
        notSupplied: 22,
        rest: "buying_outside",
        reasonCode: "out_point",
      },
    ]);
    const r = await handover(tech(), [
      planLine(line!, p, [[b.id, 6]], {
        rest: { outcome: "buying_outside", quantityNotSupplied: 22, reasonCode: "out_point" },
      }),
    ]);
    expect(r.ok && r.data!.lines[0]!.kind).toBe("buying_outside");
    const slip = await run(tech(), review.LineInput, review.DISPENSE_NEED, review.printSlip, {
      lineId: line,
    });
    expect(slip.ok).toBe(true);
    if (!slip.ok) return;
    const printed = await reviewRead.getSlip(
      f.h!,
      slip.id,
      async () => ({ name: "Fixture Patient", medsyncNumber: "MS-FIXTURE", sexAndAge: "F · 38 y" }),
      lane.db,
    );
    expect(printed?.result.ok).toBe(true);
    if (printed?.result.ok) expect(printed.result.slip.lines[0]!.quantity).toContain("22");
  });

  it("S42: another user takes the batch down between ready and hand-over: refused with its figure; nothing written", async () => {
    const p = await product("fixture_s42", "Fixture S42");
    const b = await batch(p, 12);
    const [line] = await place([{ drug: "fixture_s42" }]);
    await stage([{ lineId: line, kind: "full", quantity: 10 }]);
    const adj = await run(tech(), stock.AdjustInput, stock.STOCK_NEED, stock.adjustStock, {
      batchId: b.id,
      quantity: -5,
      reasonCode: "damaged",
    });
    expect(adj.ok).toBe(true);
    const key = randomUUID();
    await identify(tech(), key, line!);
    const before = await counts();
    const r = await handover(tech(), [planLine(line!, p, [[b.id, 10]])], {
      clientKey: key,
      identify: false,
    });
    expect(r).toMatchObject({
      ok: false,
      code: "conflict",
      error: `Batch ${b.no} now holds 7. Choose again.`,
    });
    expect(await counts()).toEqual(before);
    expect(await bal(b.id)).toBe(7);
  });

  it("S43: two points, the same line, one after the other: the second is told where and when", async () => {
    const p = await product("fixture_s43", "Fixture S43");
    const a = await batch(p, 20);
    const bb = await batch(p, 20, "2099-03-31", f.pointB);
    const [line] = await place([{ drug: "fixture_s43" }]);
    await stage([{ lineId: line, kind: "full", quantity: 5 }]);
    expect((await handover(tech(), [planLine(line!, p, [[a.id, 5]])])).ok).toBe(true);
    const second = await handover(pharmacist(f.pointB), [planLine(line!, p, [[bb.id, 5]])]);
    expect(second).toMatchObject({ ok: false });
    if (!second.ok)
      expect(second.error).toMatch(
        /^Fixture medicine \d+ was already supplied at Fixture point A, \d\d:\d\d\.$/,
      );
    expect(await bal(bb.id)).toBe(20);
  });

  it("S44: the prescriber changes a staged standard line: 'Review it again', nothing written", async () => {
    const p = await product("fixture_s44", "Fixture S44");
    const b = await batch(p, 20);
    const [line] = await place([{ drug: "fixture_s44" }]);
    await stage([{ lineId: line, kind: "full", quantity: 5 }]);
    const [next] = await place([{ drug: "fixture_s44" }]);
    await pg.query(
      `UPDATE public.prescriptions SET state = 'cancelled', updated_at = now() WHERE id = $1`,
      [line],
    );
    await pg.query(
      `INSERT INTO public.prescription_cancellations (prescription_id, hospital_id, patient_user_id, reason_code,
         replaced_by_prescription_id, actor_user_id) VALUES ($1, $2, $3, 'changed', $4, $5)`,
      [line, f.h, f.patient, next, f.doctor],
    );
    const key = randomUUID();
    await identify(tech(), key, line!);
    const before = await counts();
    const r = await handover(tech(), [planLine(line!, p, [[b.id, 5]])], {
      clientKey: key,
      identify: false,
    });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok)
      expect(r.error).toMatch(/was changed by the prescriber at \d\d:\d\d\. Review it again\./);
    expect(await counts()).toEqual(before);
  });

  it("S45: a double tap writes one hand-over", async () => {
    const p = await product("fixture_s45", "Fixture S45");
    const b = await batch(p, 20);
    const [line] = await place([{ drug: "fixture_s45" }]);
    await stage([{ lineId: line, kind: "full", quantity: 5 }]);
    const key = randomUUID();
    const plan = [planLine(line!, p, [[b.id, 5]])];
    const [x, y] = [
      await handover(tech(), plan, { clientKey: key }),
      await handover(tech(), plan, { clientKey: key, identify: false }),
    ];
    expect(x.ok && y.ok && x.id === y.id).toBe(true);
    expect(
      await n(`SELECT count(*)::int AS n FROM public.pharmacy_handovers WHERE client_key = $1`, [
        key,
      ]),
    ).toBe(1);
    expect(await bal(b.id)).toBe(15);
  });

  it("S46: a forged hand-over of a prescription awaiting co-signature is refused", async () => {
    const p = await product("fixture_s46", "Fixture S46");
    const b = await batch(p, 20);
    const [line] = await place([{ drug: "fixture_s46" }]);
    await pg.query(
      `INSERT INTO public.clinical_cosign_requests (hospital_id, patient_user_id, requested_by_user_id,
         requested_by_affiliation_id, requested_by_cadre_code, action_kind, action_payload, state)
       VALUES ($1, $2, $3, (SELECT id FROM public.staff_affiliations WHERE user_id = $3 LIMIT 1), 'MEDICAL_OFFICER',
               'prescription_routine', $4::jsonb, 'pending_review')`,
      [f.h, f.patient, f.doctor, JSON.stringify({ prescriptionId: line, encounterId: f.window })],
    );
    const before = await counts();
    const r = await handover(tech(), [planLine(line!, p, [[b.id, 5]])]);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("A senior has not signed this prescription.");
    expect((await counts()).supplies).toBe(before.supplies);
  });

  it("S47: labels one per batch, directions byte for byte; by hand, the tick is recorded and nothing prints", async () => {
    const p = await product("fixture_s47", "Fixture S47");
    const b1 = await batch(p, 3, "2098-01-31");
    const b2 = await batch(p, 30, "2099-06-30");
    const dose = "1  tablet\u00a0 with food ,0,5 ";
    const [line] = await place([{ drug: "fixture_s47", dose }]);
    await stage([{ lineId: line, kind: "full", quantity: 8 }]);
    const r = await handover(tech(), [
      planLine(line!, p, [
        [b1.id, 3],
        [b2.id, 5],
      ]),
    ]);
    if (!r.ok) throw new Error(r.error);
    const src = (await read.getLabelSource(f.h!, r.id, lane.db))!;
    const labels = src.supplies.map((s) =>
      labelFor({
        supply: {
          patientName: "Fixture Patient",
          medicine: s.product,
          quantity: s.quantity,
          issueUnit: s.unit,
          batchNumber: s.batchNumber,
          expiry: s.expiry,
          suppliedAt: src.suppliedAt,
          pharmacistLine: s.pharmacistLine,
        },
        line: { directions: s.directions, structured: null },
        point: { name: src.pointName },
        hospital: src.hospital,
        signed: null,
      }),
    );
    expect(labels).toHaveLength(2);
    for (const l of labels)
      expect(l.find((x) => x.key === "directions")!.text).toBe(
        `${dose} · oral · [fixture frequency]`,
      );
    expect(labels[0]!.find((x) => x.key === "batch_expiry")!.text).toBe(
      `Batch ${b1.no} · Expiry 2098-01-31`,
    );
    expect(labels[1]!.find((x) => x.key === "batch_expiry")!.text).toBe(
      `Batch ${b2.no} · Expiry 2099-06-30`,
    );
    expect(labels[0]!.find((x) => x.key === "supplier")!.text).toMatch(/^Fixture point A, Supply /);
    const logged = await run(tech(), store.PrintInput, store.DISPENSE_LIVE, store.printLabels, {
      handoverId: r.id,
    });
    expect(logged.ok).toBe(true);
    expect(
      await one(
        `SELECT kind, copies, outcome FROM public.pharmacy_print_events WHERE ref_id = $1`,
        [r.id],
      ),
    ).toEqual({ kind: "label", copies: 2, outcome: "printed" });
    // A point where labels are written by hand.
    await pg.query(
      `UPDATE public.pharmacy_dispensing_points SET label_mode = 'by_hand' WHERE department_id = $1`,
      [f.pointB],
    );
    const bB = await batch(p, 10, "2099-03-31", f.pointB);
    const [line2] = await place([{ drug: "fixture_s47" }]);
    await stage([{ lineId: line2, kind: "full", quantity: 2 }], pharmacist(f.pointB));
    const noTick = await handover(pharmacist(f.pointB), [planLine(line2!, p, [[bB.id, 2]])]);
    expect(noTick).toMatchObject({ ok: false });
    if (!noTick.ok)
      expect(noTick.error).toContain("Tick that the label is written on each envelope.");
    const ticked = await handover(pharmacist(f.pointB), [planLine(line2!, p, [[bB.id, 2]])], {
      raw: { labelsWrittenAttested: true },
    });
    if (!ticked.ok) throw new Error(ticked.error);
    expect(
      await one(
        `SELECT label_mode, labels_written_attested FROM public.pharmacy_handovers WHERE id = $1`,
        [ticked.id],
      ),
    ).toEqual({ label_mode: "by_hand", labels_written_attested: true });
    expect(
      await n(`SELECT count(*)::int AS n FROM public.pharmacy_print_events WHERE ref_id = $1`, [
        ticked.id,
      ]),
    ).toBe(0);
    await pg.query(
      `UPDATE public.pharmacy_dispensing_points SET label_mode = 'printed' WHERE department_id = $1`,
      [f.pointB],
    );
  });

  it("S48: another pack of the same strength by a technician; a different strength is refused (W4: none signed)", async () => {
    const same = await product("fixture_s48", "Fixture S48 56s", "10 mg");
    const other = await product("fixture_s48", "Fixture S48 20 mg", "20 mg");
    const bs = await batch(same, 20);
    const bo = await batch(other, 20);
    const [line] = await place([{ drug: "fixture_s48", strength: "10 MG" }]);
    await stage([{ lineId: line, kind: "full", quantity: 4, productId: same }]);
    expect(
      (await handover(tech(), [planLine(line!, same, [[bs.id, 4]], { strengthConfirmed: false })]))
        .ok,
    ).toBe(true);
    const [line2] = await place([{ drug: "fixture_s48", strength: "10 mg" }]);
    await stage([{ lineId: line2, kind: "full", quantity: 4, productId: other }]);
    for (const who of [tech(), pharmacist()]) {
      const r = await handover(who, [planLine(line2!, other, [[bo.id, 4]])]);
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.error).toContain("no strength change is signed at this hospital");
    }
    expect(await bal(bo.id)).toBe(20);
  });

  it("S49: no structured quantity — the decision opens empty and a quantity is required; nothing is pre-filled", async () => {
    const [line] = await place([{ drug: "fixture_s49", dose: "2 tablets for 14 days (28)" }]);
    const rv = (await reviewRead.getReviewOfLine(f.h!, line!, f.pointA!, lane.db))!.lines[0]!;
    expect(rv.staged).toBeNull();
    const r = await stage([{ lineId: line, kind: "full" }]);
    expect(r).toMatchObject({ ok: false, code: "invalid" });
  });

  it("S50: payment required — Not recorded is refused, Emergency passes; a status set on review shows in the queue", async () => {
    await pg.query(
      `UPDATE public.pharmacy_hospital_settings SET payment_status_required = true WHERE hospital_id = $1`,
      [f.h],
    );
    const p = await product("fixture_s50", "Fixture S50");
    const b = await batch(p, 20);
    const [line] = await place([{ drug: "fixture_s50" }]);
    await stage([{ lineId: line, kind: "full", quantity: 5 }]);
    const key = randomUUID();
    await identify(tech(), key, line!);
    const refused = await handover(tech(), [planLine(line!, p, [[b.id, 5]])], {
      clientKey: key,
      identify: false,
      raw: { payment: { status: "not_recorded" } },
    });
    expect(refused).toMatchObject({ ok: false });
    if (!refused.ok)
      expect(refused.error).toContain("Record the payment status before the hand-over.");
    const [line2] = await place([{ drug: "fixture_s50" }]);
    expect(
      (
        await run(tech(), review.PaymentInput, review.DISPENSE_NEED, review.setPaymentStatus, {
          lineId: line2,
          status: "insured",
          detail: "Fixture scheme",
        })
      ).ok,
    ).toBe(true);
    const row = (await reviewRead.getReviewQueue(f.h!, f.pointA!, lane.db)).rows.find(
      (x) => x.firstLineId === line2,
    );
    expect(row?.payment).toBe("insured");
    const ok = await handover(tech(), [planLine(line!, p, [[b.id, 5]])], {
      clientKey: key,
      identify: false,
      raw: { payment: { status: "emergency" } },
    });
    expect(ok.ok).toBe(true);
    expect(
      (
        await one<{ s: string }>(
          `SELECT payment_status AS s FROM public.pharmacy_handovers WHERE client_key = $1`,
          [key],
        )
      ).s,
    ).toBe("emergency");
    await pg.query(
      `UPDATE public.pharmacy_hospital_settings SET payment_status_required = false WHERE hospital_id = $1`,
      [f.h],
    );
  });

  it("S51: reversed the same day — fit back to the batch, not fit written off; the line goes back; next day, no Reverse", async () => {
    const p = await product("fixture_s51", "Fixture S51");
    const b = await batch(p, 40);
    const [fit, unfit] = await place([{ drug: "fixture_s51" }, { drug: "fixture_s51" }]);
    await stage([
      { lineId: fit, kind: "full", quantity: 10 },
      { lineId: unfit, kind: "full", quantity: 6 },
    ]);
    const r = await handover(tech(), [
      planLine(fit!, p, [[b.id, 10]]),
      planLine(unfit!, p, [[b.id, 6]]),
    ]);
    if (!r.ok) throw new Error(r.error);
    expect(await bal(b.id)).toBe(24);
    const refusedTech = await run(
      tech(),
      store.ReverseInput,
      store.REVERSE_NEED,
      store.reverseSupply,
      {
        handoverId: r.id,
        lineId: fit,
        reasonCode: "handed_back",
        packFit: true,
      },
    );
    expect(refusedTech).toMatchObject({ ok: false, code: "forbidden" });
    const back = await run(
      pharmacist(),
      store.ReverseInput,
      store.REVERSE_NEED,
      store.reverseSupply,
      {
        handoverId: r.id,
        lineId: fit,
        reasonCode: "handed_back",
        packFit: true,
      },
    );
    expect(back.ok).toBe(true);
    expect(await bal(b.id)).toBe(34);
    const shelfBefore = await bal(b.id);
    const off = await run(
      pharmacist(),
      store.ReverseInput,
      store.REVERSE_NEED,
      store.reverseSupply,
      {
        handoverId: r.id,
        lineId: unfit,
        reasonCode: "entered_in_error",
        packFit: false,
      },
    );
    expect(off.ok).toBe(true);
    expect(await bal(b.id)).toBe(shelfBefore);
    expect(
      (
        await pg.query<{ kind: string; quantity: number }>(
          `SELECT m.kind, m.quantity FROM public.pharmacy_stock_movements m JOIN public.pharmacy_supply_reversals r
           ON r.id = m.source_id WHERE r.id = $1 ORDER BY m.kind DESC`,
          [off.ok ? off.id : null],
        )
      ).rows,
    ).toEqual([
      { kind: "reversed", quantity: 6 },
      { kind: "adjusted", quantity: -6 },
    ]);
    for (const id of [fit, unfit])
      expect(await statusOf(id!)).toEqual({ kind: "stage", stage: "ready" });
    expect(
      await n(`SELECT count(*)::int AS n FROM public.pharmacy_supplies WHERE handover_id = $1`, [
        r.id,
      ]),
    ).toBe(2);
    const told = await one<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM realtime.messages WHERE topic = 'user:' || $1 ORDER BY id DESC LIMIT 1`,
      [f.doctor],
    );
    expect(told.payload.kind).toBe("supply_reversed");
    const today = await read.getSupplied(f.h!, f.pointA!, localDate(new Date()), lane.db);
    const listed = today.rows.find((x) => x.handoverId === r.id)!;
    expect(listed.lines.every((l) => l.reversed?.reason)).toBe(true);
    // The next day Reverse is not offered, and a forged one is refused.
    const p2 = await product("fixture_s51b", "Fixture S51b");
    const b2 = await batch(p2, 10);
    const [l2] = await place([{ drug: "fixture_s51b" }]);
    await stage([{ lineId: l2, kind: "full", quantity: 2 }]);
    const r2 = await handover(tech(), [planLine(l2!, p2, [[b2.id, 2]])]);
    if (!r2.ok) throw new Error(r2.error);
    const tomorrow = new Date(Date.now() + DAY);
    const nextDay = await read.getSupplied(
      f.h!,
      f.pointA!,
      localDate(new Date()),
      lane.db,
      tomorrow,
    );
    expect(nextDay.rows.find((x) => x.handoverId === r2.id)?.reversible).toBe(false);
    const late = await run(
      pharmacist(),
      store.ReverseInput,
      store.REVERSE_NEED,
      store.reverseSupply,
      {
        handoverId: r2.id,
        lineId: l2,
        reasonCode: "handed_back",
        packFit: true,
      },
      tomorrow,
    );
    expect(late).toMatchObject({ ok: false });
    if (!late.ok)
      expect(late.error).toBe("A supply can be reversed only on the day it was recorded.");
  });

  it("S52: the in-charge marks a three-day-old supply recorded in error; no stock moves; the line can be supplied again", async () => {
    const p = await product("fixture_s52", "Fixture S52");
    const b = await batch(p, 30);
    const then = new Date(Date.now() - 3 * DAY);
    const [line] = await place([{ drug: "fixture_s52" }], {
      createdAt: new Date(then.getTime() - 3_600_000),
    });
    await stage(
      [{ lineId: line, kind: "full", quantity: 5 }],
      pharmacist(),
      new Date(then.getTime() - 60_000),
    );
    const r = await handover(tech(), [planLine(line!, p, [[b.id, 5]])], { now: then });
    if (!r.ok) throw new Error(r.error);
    const moved = await counts();
    expect(
      (
        await run(pharmacist(), store.CorrectInput, store.MANAGE_NEED, store.correctSupplyRecord, {
          handoverId: r.id,
          lineId: line,
          reasonCode: "wrong_patient",
          note: "Fixture: wrong patient.",
        })
      ).ok,
    ).toBe(false);
    const c = await run(head(), store.CorrectInput, store.MANAGE_NEED, store.correctSupplyRecord, {
      handoverId: r.id,
      lineId: line,
      reasonCode: "wrong_patient",
      note: "Fixture: wrong patient.",
    });
    expect(c.ok).toBe(true);
    expect((await counts()).movements).toBe(moved.movements);
    expect(await bal(b.id)).toBe(25);
    expect(
      await n(`SELECT count(*)::int AS n FROM public.pharmacy_supplies WHERE handover_id = $1`, [
        r.id,
      ]),
    ).toBe(1);
    expect(await statusOf(line!)).toEqual({ kind: "stage", stage: "ready" });
    const told = await one<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM realtime.messages WHERE topic = 'user:' || $1 ORDER BY id DESC LIMIT 1`,
      [f.doctor],
    );
    expect(told.payload.kind).toBe("supply_corrected");
    expect((await handover(tech(), [planLine(line!, p, [[b.id, 5]])])).ok).toBe(true);
  });

  it("S53: Supplied today lists every hand-over; its count equals the day's hand-over records", async () => {
    const day = localDate(new Date());
    const listed = await read.getSupplied(f.h!, f.pointA!, day, lane.db);
    const records = await n(
      `SELECT count(*)::int AS n FROM public.pharmacy_handovers
        WHERE dispensing_point_id = $1 AND supplied_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Kampala') AT TIME ZONE 'Africa/Kampala'`,
      [f.pointA],
    );
    expect(listed.rows.length).toBe(records);
    expect(records).toBeGreaterThan(5);
    const times = listed.rows.map((r) => r.at);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it("S54: setting off, a technician cannot supply pharmacist-first; on, with a reason it goes to look-back; controlled is refused", async () => {
    const p = await product("fixture_s54", "Fixture S54");
    const b = await batch(p, 30);
    const edits = [{ field: "dose", from: "a", to: "b" }];
    const [line] = await place([{ drug: "fixture_s54", edits }]);
    const off = await handover(tech(), [planLine(line!, p, [[b.id, 5]])]);
    expect(off).toMatchObject({ ok: false });
    if (!off.ok) expect(off.error).toContain("Waiting for a pharmacist");
    await pg.query(
      `INSERT INTO public.pharmacy_legal_answers (question, answer, source_ref, given_by, given_on, recorded_by)
       VALUES (1, 'Fixture interim answer', 'Fixture source', 'Fixture adviser', current_date, $1)`,
      [f.pharmacist],
    );
    await pg.query(
      `UPDATE public.pharmacy_hospital_settings SET supply_without_pharmacist = true,
         supply_without_pharmacist_requested_by = $2, supply_without_pharmacist_approved_by = $3 WHERE hospital_id = $1`,
      [f.h, f.pharmacist, f.head],
    );
    expect(
      (
        await run(
          tech(),
          review.WithoutReviewInput,
          review.DISPENSE_NEED,
          review.recordSupplyWithoutReview,
          { lineId: line, reasonCode: "no_pharmacist" },
        )
      ).ok,
    ).toBe(true);
    expect((await stage([{ lineId: line, kind: "full", quantity: 5 }], tech())).ok).toBe(true);
    const r = await handover(tech(), [planLine(line!, p, [[b.id, 5]])]);
    if (!r.ok) throw new Error(r.error);
    const waiting = await read.getLookBack(f.h!, lane.db);
    const mine = waiting.find((w) => w.medicine.startsWith("Fixture medicine"));
    expect(mine?.reasons).toEqual(["supplied_without_review"]);
    expect(
      (
        await run(tech(), review.LookBackInput, review.LOOK_BACK_NEED, review.recordLookBack, {
          supplyId: mine!.supplyId,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await run(
          pharmacist(),
          review.LookBackInput,
          review.LOOK_BACK_NEED,
          review.recordLookBack,
          { supplyId: mine!.supplyId, note: "Fixture: fine." },
        )
      ).ok,
    ).toBe(true);
    expect((await read.getLookBack(f.h!, lane.db)).some((w) => w.supplyId === mine!.supplyId)).toBe(
      false,
    );
    // A controlled line is still refused.
    const [cd] = await place([{ drug: "fixture_s54", controlled: true }]);
    const cdWithout = await run(
      tech(),
      review.WithoutReviewInput,
      review.DISPENSE_NEED,
      review.recordSupplyWithoutReview,
      { lineId: cd, reasonCode: "no_pharmacist" },
    );
    expect(cdWithout).toMatchObject({ ok: false });
    const cdHandover = await handover(pharmacist(), [planLine(cd!, p, [[b.id, 1]])]);
    expect(cdHandover).toMatchObject({ ok: false });
    if (!cdHandover.ok)
      expect(cdHandover.error).toBe(
        "Supply this on paper as you do today. MedSync does not record controlled supplies yet.",
      );
    await pg.query(
      `UPDATE public.pharmacy_hospital_settings SET supply_without_pharmacist = false WHERE hospital_id = $1`,
      [f.h],
    );
  });

  it("S55: individual inpatient supply on — a ward prescription goes to a named member of ward staff", async () => {
    await pg.query(
      `UPDATE public.pharmacy_hospital_settings SET individual_inpatient_supply = true WHERE hospital_id = $1`,
      [f.h],
    );
    const p = await product("fixture_s55", "Fixture S55");
    const b = await batch(p, 30);
    const [line] = await place([{ drug: "fixture_s55" }], { encounterId: f.ward });
    expect((await stage([{ lineId: line, kind: "full", quantity: 6 }])).ok).toBe(true);
    const ward = {
      collector: { kind: "ward_staff", userId: f.nurse },
      identity: { route: "ward_staff" },
    };
    const outsider = await handover(tech(), [planLine(line!, p, [[b.id, 6]])], {
      identify: false,
      raw: { ...ward, collector: { kind: "ward_staff", userId: f.patient2 } },
    });
    expect(outsider).toMatchObject({ ok: false });
    const r = await handover(tech(), [planLine(line!, p, [[b.id, 6]])], {
      identify: false,
      raw: ward,
    });
    if (!r.ok) throw new Error(r.error);
    expect(
      await one(
        `SELECT collector, collector_user_id, identity_route FROM public.pharmacy_handovers WHERE id = $1`,
        [r.id],
      ),
    ).toEqual({
      collector: "ward_staff",
      collector_user_id: f.nurse,
      identity_route: "ward_staff",
    });
    const data = await read.getHandover(
      f.h!,
      (await reviewRead.getReviewOfLine(f.h!, line!, f.pointA!, lane.db))!.key,
      { id: f.pointA!, labelMode: "printed" },
      null,
      lane.db,
    );
    expect(data?.wardStaff.some((s) => s.userId === f.nurse)).toBe(true);
    await pg.query(
      `UPDATE public.pharmacy_hospital_settings SET individual_inpatient_supply = false WHERE hospital_id = $1`,
      [f.h],
    );
  });

  it("Law 2 and the budget: no supply write touches a prescription; recordHandover timings reported", async () => {
    expect(
      await n(
        `SELECT count(*)::int AS n FROM public.audit_log WHERE table_name = 'prescriptions' AND actor_id IN ($1, $2, $3)`,
        [f.pharmacist, f.tech, f.head],
      ),
    ).toBe(0);
    const sorted = [...timings].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
    // eslint-disable-next-line no-console -- the budget is reported, not asserted on PGlite
    console.info(
      `[recordHandover] n=${sorted.length} median=${sorted[Math.floor(sorted.length / 2)]!.toFixed(1)} ms p95=${p95.toFixed(1)} ms (PGlite)`,
    );
    expect(sorted.length).toBeGreaterThan(10);
  });
});
