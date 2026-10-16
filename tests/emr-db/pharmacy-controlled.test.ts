/**
 * Pharmacy Phase 1, Step 7: controlled drugs on the PGlite lane, every migration replayed. Drives
 * lib/auth/attest.ts and lib/pharmacy/controlled-store.ts through `runPharmacyWrite` (the actions' own
 * path, Section 8) with the witness's password-and-code check injected (the throwaway Supabase client is
 * the only part not run here), and reads back through lib/pharmacy/controlled-read.ts and
 * lib/pharmacy/supply/read.ts. Scenarios S57–S66 of PROMPT-PHARMACY-PHASE-1.md §9 Step 7, and the
 * attestation rules of D-PH1-42 / H5. Every medicine, batch, quantity and person is a fixture (Law 8).
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Lane, Pg } from "./_pglite";
import type { Verifier } from "@/lib/auth/attest";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { encrypt, generateKey } from "@/lib/encryption";
import { PHARMACY_MAP_V2, pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import { attestationsFor, READY_COPY } from "@/lib/pharmacy/controlled";
import { REGISTER_COPY, registerSlipFor } from "@/lib/pharmacy/print/register";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { bootLane, department, encounter, hospital, laneOn, patient, staff } from "./_pglite";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

const attest = await import("@/lib/auth/attest");
const cd = await import("@/lib/pharmacy/controlled-store");
const cdRead = await import("@/lib/pharmacy/controlled-read");
const review = await import("@/lib/pharmacy/review/store");
const reviewRead = await import("@/lib/pharmacy/review/read");
const stock = await import("@/lib/pharmacy/stock/store");
const supply = await import("@/lib/pharmacy/supply/store");
const supplyRead = await import("@/lib/pharmacy/supply/read");

const DOB = "1988-07-01";
const SECRET_PASSWORD = "fixture-witness-password-7731";
const SECRET_CODE = "482913";
const MORPHINE = "morphine"; // flagged controlled at prescribing (the catalogue's draft flag)
const SIGNED = "fixture_signed_cd"; // signed controlled here; prescribing does not flag it
const OTHER = "fixture_other";

describe.skipIf(!laneOn)("controlled drugs (Step 7, S57–S66)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;

  const one = async <T = { id: string }>(q: string, p?: unknown[]) =>
    (await pg.query<T>(q, p)).rows[0] as T;
  const n = async (q: string, p?: unknown[]) => Number((await one<{ n: number }>(q, p)).n);

  const actor = (userId: string, cadre: string, pointId = f.pointA!): PharmacyActor => ({
    userId,
    hospitalId: f.h!,
    cadreCode: cadre,
    cadreName: cadre === "PHARMACIST" ? "Pharmacist" : "Pharmacy technician",
    pointId,
    access: pharmacyDispensingAccess(cadre, PHARMACY_MAP_V2),
  });
  const pharmacist = () => actor(f.pharmacist!, "PHARMACIST");
  const tech = () => actor(f.tech!, "PHARMACY_TECH");
  const head = () => actor(f.head!, "PHARMACY_TECH");

  const run = <I, R extends { id: string }>(
    a: PharmacyActor,
    schema: z.ZodType<I>,
    need: PharmacyNeed,
    write: (ctx: PharmacyCtx, input: I) => Promise<R>,
    raw: Record<string, unknown>,
  ) =>
    runPharmacyWrite(schema, { clientKey: randomUUID(), ...raw }, a, need, write, {
      database: lane.db,
    });

  /** The injected check: whose password and code these are (null when wrong). */
  const as =
    (userId: string | null): Verifier =>
    async () =>
      userId ? { userId } : null;
  const witness = async (
    a: PharmacyActor,
    witnessUserId: string,
    verify = as(witnessUserId),
    now?: Date,
  ) =>
    runPharmacyWrite(
      cd.AttestInput,
      {
        clientKey: randomUUID(),
        witnessUserId,
        password: SECRET_PASSWORD,
        code: SECRET_CODE,
        action: "controlled_supply",
      },
      a,
      cd.CONTROLLED_NEED,
      (ctx, i) => cd.attestWitness(ctx, i, verify),
      { database: lane.db, ...(now ? { now } : {}) },
    );
  const witnessId = async (a = pharmacist(), w = f.tech!) => {
    const r = await witness(a, w);
    if (!r.ok || !r.data?.ok) throw new Error(`witness: ${JSON.stringify(r)}`);
    return r.id;
  };

  let lineNo = 0;
  const place = async (
    lines: { drug: string; controlled?: boolean }[],
    o: { createdAt?: Date } = {},
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
                dose, route, frequency, is_emergency, state, placement_id, placement_line, created_at, updated_at,
                check_answers, controlled, regimen_id, edits)
             VALUES ($1, $2, $3, $4, 'MEDICAL_OFFICER', $5, $6, '[fixture dose]', 'oral', '[fixture frequency]', false,
                     'active', $7, $8, $9, $9, '[]'::jsonb, $10, 'fixture_regimen', '[]'::jsonb)
             RETURNING id`,
            [
              f.h,
              f.window,
              f.patient,
              f.doctor,
              l.drug,
              `Fixture medicine ${lineNo}`,
              placement,
              i + 1,
              (o.createdAt ?? new Date()).toISOString(),
              l.controlled ?? false,
            ],
          )
        ).id,
      );
    }
    return ids;
  };

  const product = async (medicine: string, name: string) => {
    const id = (
      await one(
        `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
         VALUES ($1, $2, $3, 'ampoule', $4) RETURNING id`,
        [f.h, medicine, name, f.pharmacist],
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
  const batch = async (productId: string, qty: number, expiry = "2099-03-31") => {
    batchNo += 1;
    const no = `FX-CD-${String(batchNo).padStart(3, "0")}`;
    const id = (
      await one(
        `INSERT INTO public.pharmacy_batches (hospital_id, dispensing_point_id, product_id, batch_number, expiry,
           first_batch_number, first_expiry, created_by)
         VALUES ($1, $2, $3, $4, $5, $4, $5, $6) RETURNING id`,
        [f.h, f.pointA, productId, no, expiry, f.pharmacist],
      )
    ).id;
    await pg.query(
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, batch_id, kind, quantity,
         effective_at, actor_user_id, source_kind) VALUES ($1, $2, $3, 'received', $4, now() - interval '50 days', $5, 'delivery')`,
      [f.h, f.pointA, id, qty, f.pharmacist],
    );
    return { id, no };
  };
  const bal = (batchId: string) =>
    n(
      `SELECT coalesce(sum(quantity), 0)::int AS n FROM public.pharmacy_stock_movements WHERE batch_id = $1`,
      [batchId],
    );
  const counts = async () => ({
    handovers: await n(`SELECT count(*)::int AS n FROM public.pharmacy_handovers`),
    supplies: await n(`SELECT count(*)::int AS n FROM public.pharmacy_supplies`),
    movements: await n(`SELECT count(*)::int AS n FROM public.pharmacy_stock_movements`),
    entries: await n(`SELECT count(*)::int AS n FROM public.pharmacy_controlled_entries`),
  });

  /** A pharmacist accepts every line and stages one full decision per line (5.3, CD-2). */
  const ready = async (lines: { id: string; quantity: number }[]) => {
    for (const l of lines) {
      const r = await run(pharmacist(), review.LineInput, review.REVIEW_NEED, review.acceptLine, {
        lineId: l.id,
      });
      if (!r.ok)
        await run(pharmacist(), review.LineInput, review.REVIEW_NEED, review.acceptRemainingLines, {
          lineId: l.id,
        });
    }
    const staged = await run(
      pharmacist(),
      review.DecisionsInput,
      review.DISPENSE_NEED,
      review.saveLineDecisions,
      {
        decisions: lines.map((l) => ({ lineId: l.id, kind: "full", quantity: l.quantity })),
      },
    );
    if (!staged.ok) throw new Error(`stage: ${staged.error}`);
  };
  const identify = (a: PharmacyActor, clientKey: string, lineId: string) =>
    run(a, supply.IdentifierInput, supply.DISPENSE_LIVE, supply.checkSecondIdentifier, {
      clientKey,
      lineId,
      kind: "date_of_birth",
      typed: "01/07/1988",
    });
  const count = (
    a: PharmacyActor,
    witnessAttestationId: string,
    medicineId: string,
    lines: [string, number][],
    o: { scope?: "controlled_supply" | "controlled_shift"; clientKey?: string } = {},
  ) =>
    runPharmacyWrite(
      cd.ControlledCountInput,
      {
        clientKey: o.clientKey ?? randomUUID(),
        medicineId,
        scope: o.scope ?? "controlled_supply",
        witnessAttestationId,
        lines: lines.map(([batchId, counted]) => ({ batchId, counted })),
      },
      a,
      cd.CONTROLLED_NEED,
      cd.recordControlledCount,
      { database: lane.db },
    );
  const planLine = (lineId: string, productId: string, rows: [string, number][]) => ({
    lineId,
    productId,
    rows: rows.map(([batchId, quantity]) => ({ batchId, quantity })),
    strengthConfirmed: true,
  });
  const controlledSupply = async (
    a: PharmacyActor,
    lines: Record<string, unknown>[],
    extra: Record<string, unknown>,
    clientKey = randomUUID(),
  ) => {
    await identify(a, clientKey, String(lines[0]!.lineId));
    return runPharmacyWrite(
      cd.ControlledSupplyInput,
      {
        clientKey,
        lines,
        collector: { kind: "patient" },
        identity: { route: "two_identifiers", nameAttested: true },
        payment: { status: "paid" },
        paperPrescriptionAttested: true,
        registerAttested: true,
        ...extra,
      },
      a,
      cd.CONTROLLED_LIVE,
      cd.recordControlledSupply,
      { database: lane.db },
    );
  };

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    pg = lane.pg;
    held.db = lane.db;
    f.h = await hospital(pg, "Controlled");
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
          [f.h, f.pharm, `Fixture point ${p}`, `cpt-${p}-${Date.now()}`],
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
    for (const k of ["tech", "tech2", "head"])
      f[k] = (
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
    await pg.query(
      `INSERT INTO public.clinical_cosign_policies (hospital_id, cadre_code, action_kind, requirement)
       VALUES ($1, 'MEDICAL_OFFICER', 'prescription_routine', 'allowed') ON CONFLICT DO NOTHING`,
      [f.h],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_hospital_settings (hospital_id, updated_by) VALUES ($1, $2)`,
      [f.h, f.pharmacist],
    );
    for (const [kind, content] of [
      ["lane_rule", { reasons: [{ code: "preset_dose_changed", on: true }] }],
      // D-PH1-28: the reviewer's decision per stocked medicine; one is signed controlled.
      ["controlled_classes", { [SIGNED]: "Fixture class B", [OTHER]: "not_controlled" }],
    ] as const)
      await pg.query(
        `INSERT INTO public.pharmacy_signed_sets (hospital_id, kind, version, content, sha256, status, authored_by,
           first_signer, second_signer, signed_at)
         VALUES ($1, $2, 1, $3::jsonb, repeat('c', 64), 'signed', $4, $4, $5, now())`,
        [f.h, kind, JSON.stringify(content), f.pharmacist, f.doctor],
      );
    f.patient = await patient(pg);
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type,
         phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', $4, 'none', $5, (SELECT id FROM public.districts LIMIT 1))`,
      [f.patient, encrypt("Fixture"), encrypt("Patient"), DOB, encrypt("0700000000")],
    );
    f.window = await encounter(pg, {
      hospitalId: f.h,
      patientUserId: f.patient!,
      clinicianUserId: f.doctor!,
      departmentId: clinic,
    });
    await pg.query(`UPDATE public.encounters SET disposition = 'home' WHERE id = $1`, [f.window]);
    f.morphine = await product(MORPHINE, "Fixture injection D");
    f.other = await product(OTHER, "Fixture tablet O");
    f.signedProduct = await product(SIGNED, "Fixture injection S");
  }, 180_000);

  /* ─── The attestation (D-PH1-42, H5) ─────────────────────────────────── */

  it("D-PH1-42: a passed attestation names the witness, the method and the time; it holds no secret", async () => {
    const r = await witness(pharmacist(), f.tech!);
    expect(r).toMatchObject({ ok: true, data: { ok: true, cadre: "Pharmacy technician" } });
    const row = await one<Record<string, unknown>>(
      `SELECT * FROM public.pharmacy_attestations WHERE id = $1`,
      [r.ok ? r.id : null],
    );
    expect(row).toMatchObject({
      attester_user_id: f.tech,
      actor_user_id: f.pharmacist,
      purpose: "witness",
      method: "password+totp",
      outcome: "passed",
    });
    expect(row.attested_at).toBeTruthy();
    expect(JSON.stringify(r)).not.toContain(SECRET_PASSWORD);
    expect(JSON.stringify(r)).not.toContain(SECRET_CODE);
  });

  it("H5: five failures lock that witness for an hour; a locked try is recorded without checking", async () => {
    const logs: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
      }),
    );
    const checked = vi.fn(as(f.tech2!));
    for (let i = 0; i < 5; i++) {
      const r = await witness(pharmacist(), f.tech2!, as(null));
      expect(r).toMatchObject({ ok: true, data: { ok: false } });
      if (r.ok) expect(r.data?.words).toBe(attest.ATTEST_COPY.failed);
    }
    const sixth = await witness(pharmacist(), f.tech2!, checked);
    expect(sixth).toMatchObject({
      ok: true,
      data: { ok: false, words: attest.ATTEST_COPY.locked },
    });
    expect(checked).not.toHaveBeenCalled();
    const rows = (
      await pg.query<Record<string, unknown>>(
        `SELECT * FROM public.pharmacy_attestations WHERE attester_user_id = $1 ORDER BY attested_at`,
        [f.tech2],
      )
    ).rows;
    expect(rows.map((r) => r.outcome)).toEqual([
      "failed",
      "failed",
      "failed",
      "failed",
      "failed",
      "locked",
    ]);
    // No secret in any row, the audit trail or a log.
    const audit = (
      await pg.query(`SELECT * FROM public.audit_log WHERE table_name = 'pharmacy_attestations'`)
    ).rows;
    for (const blob of [JSON.stringify(rows), JSON.stringify(audit), logs.join("\n")]) {
      expect(blob).not.toContain(SECRET_PASSWORD);
      expect(blob).not.toContain(SECRET_CODE);
    }
    // An hour later the lock has passed.
    const after = await witness(
      pharmacist(),
      f.tech2!,
      checked,
      new Date(Date.now() + 61 * 60_000),
    );
    expect(after).toMatchObject({ ok: true, data: { ok: true } });
    expect(checked).toHaveBeenCalledOnce();
    for (const s of spies) s.mockRestore();
  });

  it("CD-2: a passed attestation older than 30 minutes no longer stands, here and at the database", async () => {
    const old = (
      await one(
        `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome, attested_at)
         VALUES ($1, $2, $3, 'witness', 'controlled_count', 'passed', now() - interval '31 minutes') RETURNING id`,
        [f.h, f.pharmacist, f.tech],
      )
    ).id;
    const oldProduct = await product("fixture_old", "Fixture old");
    const b = await batch(oldProduct, 3);
    const r = await count(pharmacist(), old, "fixture_old", [[b.id, 3]]);
    expect(r).toMatchObject({ ok: false, error: READY_COPY.witness });
    await expect(
      pg.query(
        `INSERT INTO public.pharmacy_controlled_entries (hospital_id, dispensing_point_id, medicine_id, kind,
           witness_attestation_id, actor_user_id) VALUES ($1, $2, $3, 'count', $4, $5)`,
        [f.h, f.pointA, MORPHINE, old, f.pharmacist],
      ),
    ).rejects.toThrow(/does not stand/);
  });

  /* ─── The scenarios ───────────────────────────────────────────────────── */

  it("S58: the supplier as their own witness is refused; a witness proved with the supplier's factor is refused", async () => {
    const self = await witness(pharmacist(), f.pharmacist!);
    expect(self).toMatchObject({ ok: true, data: { ok: false, words: attest.ATTEST_COPY.self } });
    const viaSupplier = await witness(pharmacist(), f.tech!, as(f.pharmacist!));
    expect(viaSupplier).toMatchObject({
      ok: true,
      data: { ok: false, words: attest.ATTEST_COPY.failed },
    });
    // Neither stands for a count.
    const b = await batch(f.signedProduct!, 4);
    for (const r of [self, viaSupplier]) {
      const refused = await count(pharmacist(), r.ok ? r.id : randomUUID(), SIGNED, [[b.id, 4]]);
      expect(refused).toMatchObject({ ok: false, error: READY_COPY.witness });
    }
    expect(
      await n(
        `SELECT count(*)::int AS n FROM public.pharmacy_attestations WHERE actor_user_id = $1 AND attester_user_id IS NULL`,
        [f.pharmacist],
      ),
    ).toBeGreaterThan(0);
  });

  it("S59 S64: witness first; the count is committed before the figure; a difference with both people; the supply proceeds from the count, in one transaction with the other line", async () => {
    const b1 = await batch(f.morphine!, 10, "2098-01-31");
    const b2 = await batch(f.morphine!, 5, "2099-01-31");
    const ob = await batch(f.other!, 50);
    const [cdLine, otherLine] = await place([
      { drug: MORPHINE, controlled: true },
      { drug: OTHER },
    ]);
    await ready([
      { id: cdLine!, quantity: 2 },
      { id: otherLine!, quantity: 7 },
    ]);
    // The screen gets the cupboard without its figures (CD-3).
    const key = (await reviewRead.getReviewOfLine(f.h!, cdLine!, f.pointA!, lane.db))!.key;
    const view = await supplyRead.getHandover(
      f.h!,
      key,
      { id: f.pointA!, labelMode: "printed" },
      null,
      lane.db,
    );
    expect(view?.controlled?.classLabel).toBe("Controlled drug");
    expect(view?.controlled?.medicines[0]?.batches.map((b) => b.id)).toEqual(
      expect.arrayContaining([b1.id, b2.id]),
    );
    expect(
      view?.lines.find((l) => l.lineId === cdLine)?.stock.batches.every((b) => b.balance === 0),
    ).toBe(true);

    // Without the witness, nothing can be counted.
    expect(await count(pharmacist(), randomUUID(), MORPHINE, [[b1.id, 9]])).toMatchObject({
      ok: false,
      error: READY_COPY.witness,
    });
    const w = await witnessId();
    const countKey = randomUUID();
    const c = await count(
      pharmacist(),
      w,
      MORPHINE,
      [
        [b1.id, 9],
        [b2.id, 5],
      ],
      { clientKey: countKey },
    );
    if (!c.ok) throw new Error(c.error);
    expect(c.data!.lines.find((l) => l.batchId === b1.id)).toMatchObject({
      counted: 9,
      recorded: 10,
    });
    expect(c.data!.differences).toBe(1);
    // The typed figures stand in the record; retyping the same count returns them unchanged.
    const again = await count(
      pharmacist(),
      w,
      MORPHINE,
      [
        [b1.id, 10],
        [b2.id, 5],
      ],
      {
        clientKey: countKey,
      },
    );
    expect(again.ok && again.data!.lines.find((l) => l.batchId === b1.id)?.counted).toBe(9);
    expect(
      await n(
        `SELECT count(*)::int AS n FROM public.pharmacy_count_lines WHERE count_id = $1 AND batch_id = $2`,
        [countKey, b1.id],
      ),
    ).toBe(1);
    expect(
      await one(`SELECT scope, witness_attestation_id FROM public.pharmacy_counts WHERE id = $1`, [
        countKey,
      ]),
    ).toEqual({ scope: "controlled_supply", witness_attestation_id: w });
    // The difference: both figures, the supplier and the witness; a witnessed correction to 9.
    const diff = await one<Record<string, unknown>>(
      `SELECT d.*, m.quantity AS corrected, m.witness_attestation_id AS mw FROM public.pharmacy_controlled_differences d
         JOIN public.pharmacy_stock_movements m ON m.id = d.correction_movement_id WHERE d.count_id = $1`,
      [countKey],
    );
    expect(diff).toMatchObject({
      counted_quantity: 9,
      recorded_balance: 10,
      supplier_user_id: f.pharmacist,
      witness_attestation_id: w,
      corrected: -1,
      mw: w,
    });
    expect(await bal(b1.id)).toBe(9);
    const listed = await cdRead.getControlledRegister(f.h!, f.pointA!, MORPHINE, null, lane.db);
    expect(listed.differences.map((d) => d.id)).toContain(diff.id);

    // S64: the hand-over, controlled and other line, once. A wrong agreed balance writes nothing at all.
    const lines = [
      planLine(cdLine!, f.morphine!, [[b1.id, 2]]),
      planLine(otherLine!, f.other!, [[ob.id, 7]]),
    ];
    const before = await counts();
    const wrong = await controlledSupply(pharmacist(), lines, {
      witnessAttestationId: w,
      agreedBalances: [{ medicineId: MORPHINE, balance: 13 }],
    });
    expect(wrong).toMatchObject({ ok: false });
    expect(await counts()).toEqual(before);
    const r = await controlledSupply(pharmacist(), lines, {
      witnessAttestationId: w,
      agreedBalances: [{ medicineId: MORPHINE, balance: 12 }],
    });
    if (!r.ok) throw new Error(r.error);
    const after = await counts();
    expect(after.handovers - before.handovers).toBe(1);
    expect(after.supplies - before.supplies).toBe(2);
    expect(after.movements - before.movements).toBe(2);
    expect(after.entries - before.entries).toBe(1);
    expect(await bal(b1.id)).toBe(7);
    expect(await bal(ob.id)).toBe(43);
    const entry = await one<Record<string, unknown>>(
      `SELECT * FROM public.pharmacy_controlled_entries WHERE id = $1`,
      [r.data!.entryIds[0]],
    );
    expect(entry).toMatchObject({
      kind: "supply",
      handover_id: r.id,
      count_id: countKey,
      witness_attestation_id: w,
      paper_prescription_attested: true,
      register_attested: true,
      witness_agreed_balance: 12,
      medicine_id: MORPHINE,
    });
    expect(
      await one(
        `SELECT witness_attestation_id FROM public.pharmacy_stock_movements WHERE id = $1`,
        [entry.movement_id],
      ),
    ).toEqual({ witness_attestation_id: w });
    // A second count is a second event.
    const second = await count(pharmacist(), w, MORPHINE, [
      [b1.id, 7],
      [b2.id, 5],
    ]);
    expect(second.ok).toBe(true);
    expect(
      await n(
        `SELECT count(*)::int AS n FROM public.pharmacy_counts WHERE medicine_id = $1 AND scope = 'controlled_supply'`,
        [MORPHINE],
      ),
    ).toBeGreaterThanOrEqual(2);

    // The pharmacy in charge closes the difference with a note; nobody else can.
    const closeAs = (a: PharmacyActor) =>
      runPharmacyWrite(
        cd.CloseDifferenceInput,
        { differenceId: diff.id, note: "Fixture: ampoule found broken in the bin." },
        a,
        cd.CLOSE_NEED,
        cd.closeControlledDifference,
        { database: lane.db },
      );
    expect(await closeAs(pharmacist())).toMatchObject({ ok: false, code: "forbidden" });
    expect((await closeAs(head())).ok).toBe(true);
    expect(
      (await cdRead.getControlledRegister(f.h!, f.pointA!, MORPHINE, null, lane.db)).differences,
    ).toEqual([]);
    f.handover = r.id;
    f.entry = r.data!.entryIds[0]!;
    f.b1 = b1.id;
    f.b2 = b2.id;
  });

  it("S57: without the count, either paper attestation, or the witness, a controlled supply is refused, each separately", async () => {
    const b = await batch(f.signedProduct!, 6, "2097-01-31"); // first to expire
    const [line] = await place([{ drug: SIGNED }]);
    await ready([{ id: line!, quantity: 1 }]);
    const lines = [planLine(line!, f.signedProduct!, [[b.id, 1]])];
    const before = await counts();
    const w = await witnessId();
    const agreed = { agreedBalances: [{ medicineId: SIGNED, balance: 9 }] };
    // No count.
    expect(
      await controlledSupply(pharmacist(), lines, { witnessAttestationId: w, ...agreed }),
    ).toMatchObject({ ok: false, error: READY_COPY.count });
    const all = (
      await pg.query<{ id: string }>(
        `SELECT b.id FROM public.pharmacy_batches b WHERE b.product_id = $1 AND b.dispensing_point_id = $2`,
        [f.signedProduct, f.pointA],
      )
    ).rows.map((r) => r.id);
    const balances = await Promise.all(all.map(bal));
    const c = await count(
      pharmacist(),
      w,
      SIGNED,
      all.map((id, i) => [id, balances[i]!] as [string, number]),
    );
    if (!c.ok) throw new Error(c.error);
    // No paper prescription attestation; no register attestation; no witness.
    expect(
      await controlledSupply(pharmacist(), lines, {
        witnessAttestationId: w,
        paperPrescriptionAttested: false,
        ...agreed,
      }),
    ).toMatchObject({ ok: false, error: READY_COPY.paperPrescription });
    expect(
      await controlledSupply(pharmacist(), lines, {
        witnessAttestationId: w,
        registerAttested: false,
        ...agreed,
      }),
    ).toMatchObject({ ok: false, error: READY_COPY.paperRegister });
    expect(
      await controlledSupply(pharmacist(), lines, {
        witnessAttestationId: randomUUID(),
        ...agreed,
      }),
    ).toMatchObject({ ok: false, error: READY_COPY.witness });
    expect(
      await controlledSupply(pharmacist(), lines, {
        witnessAttestationId: w,
        agreedBalances: [],
      }),
    ).toMatchObject({ ok: false, error: READY_COPY.witnessAgreement });
    expect(await counts()).toMatchObject({
      handovers: before.handovers,
      supplies: before.supplies,
    });
    // With all of them it records (the balance the witness agreed: everything counted, less one).
    const total = balances.reduce((a, x) => a + x, 0);
    const ok = await controlledSupply(pharmacist(), lines, {
      witnessAttestationId: w,
      agreedBalances: [{ medicineId: SIGNED, balance: total - 1 }],
    });
    expect(ok.ok ? "recorded" : ok.error).toBe("recorded");
  });

  it("S60: a controlled prescription is never in the standard lane and its rest is never bought outside", async () => {
    const [line] = await place([{ drug: MORPHINE, controlled: true }]);
    const data = await reviewRead.getReviewOfLine(f.h!, line!, f.pointA!, lane.db);
    expect(data?.lane).toBe("pharmacist_first");
    expect(data?.laneReasons).toContain("controlled");
    await run(pharmacist(), review.LineInput, review.REVIEW_NEED, review.acceptLine, {
      lineId: line,
    });
    const outside = await run(
      pharmacist(),
      review.DecisionsInput,
      review.DISPENSE_NEED,
      review.saveLineDecisions,
      {
        decisions: [
          { lineId: line, kind: "part", quantity: 1, notSupplied: 1, rest: "buying_outside" },
        ],
      },
    );
    expect(outside).toMatchObject({ ok: false });
    if (!outside.ok)
      expect(outside.error).toMatch(/controlled drug cannot be sent to another pharmacy/);
    const without = await run(
      tech(),
      review.WithoutReviewInput,
      review.DISPENSE_NEED,
      review.recordSupplyWithoutReview,
      { lineId: line, reasonCode: "no_pharmacist" },
    );
    expect(without).toMatchObject({ ok: false });
  });

  it("S61: flagged with no signed class says 'Controlled drug' and takes the full path; a medicine signed controlled, not flagged, takes it too", async () => {
    for (const [drug, controlled, label, productId] of [
      [MORPHINE, true, "Controlled drug", f.morphine!],
      [SIGNED, false, "Fixture class B", f.signedProduct!],
    ] as const) {
      const [line] = await place([{ drug, controlled }]);
      const data = await reviewRead.getReviewOfLine(f.h!, line!, f.pointA!, lane.db);
      expect(data?.lane).toBe("pharmacist_first");
      await ready([{ id: line!, quantity: 1 }]);
      const view = await supplyRead.getHandover(
        f.h!,
        data!.key,
        { id: f.pointA!, labelMode: "printed" },
        null,
        lane.db,
      );
      expect(view?.controlled?.classLabel).toBe(label);
      // The plain hand-over refuses it: it goes through the controlled supply.
      const clientKey = randomUUID();
      await identify(pharmacist(), clientKey, line!);
      const b = view!.lines[0]!.stock.batches.find((x) => !x.expired && x.productId === productId)!;
      const plain = await runPharmacyWrite(
        supply.HandoverInput,
        {
          clientKey,
          lines: [planLine(line!, productId, [[b.id, 1]])],
          collector: { kind: "patient" },
          identity: { route: "two_identifiers", nameAttested: true },
          payment: { status: "paid" },
        },
        pharmacist(),
        supply.DISPENSE_LIVE,
        supply.recordHandover,
        { database: lane.db },
      );
      expect(plain).toMatchObject({ ok: false });
      if (!plain.ok) expect(plain.error).toContain("Use the controlled supply.");
    }
  });

  it("S62: a witnessed receipt, shift count and transfer are recorded, each refused without a witness; the balance equals the ledger at every row", async () => {
    const receive = {
      productId: f.morphine!,
      batchNumber: "FX-CD-RCV",
      expiry: "2099-06",
      quantity: 20,
      from: "main_store",
    };
    // Without a witness: the plain stock path and a witness that does not stand are both refused.
    const plain = await run(
      pharmacist(),
      stock.ReceiveInput,
      stock.STOCK_NEED,
      stock.receiveStock,
      receive,
    );
    expect(plain).toMatchObject({ ok: false });
    const noWitness = await run(
      pharmacist(),
      cd.ReceiveControlledInput,
      stock.STOCK_NEED,
      cd.receiveControlled,
      { ...receive, witnessAttestationId: randomUUID() },
    );
    expect(noWitness).toMatchObject({ ok: false, error: READY_COPY.witness });
    const w = await witnessId();
    const received = await run(
      pharmacist(),
      cd.ReceiveControlledInput,
      stock.STOCK_NEED,
      cd.receiveControlled,
      { ...receive, witnessAttestationId: w },
    );
    if (!received.ok) throw new Error(received.error);
    expect(
      await one(
        `SELECT e.kind, m.witness_attestation_id FROM public.pharmacy_controlled_entries e
           JOIN public.pharmacy_stock_movements m ON m.id = e.movement_id WHERE e.movement_id = $1`,
        [received.id],
      ),
    ).toEqual({ kind: "receipt", witness_attestation_id: w });
    const rcv = await one(
      `SELECT batch_id AS id FROM public.pharmacy_stock_movements WHERE id = $1`,
      [received.id],
    );

    // Shift count: refused without a witness, recorded with one.
    const batches = (
      await pg.query<{ id: string }>(
        `SELECT id FROM public.pharmacy_batches WHERE product_id = $1 AND dispensing_point_id = $2`,
        [f.morphine, f.pointA],
      )
    ).rows.map((r) => r.id);
    const countable = await Promise.all(
      batches.map(async (id) => [id, await bal(id)] as [string, number]),
    );
    expect(
      await count(pharmacist(), randomUUID(), MORPHINE, countable, { scope: "controlled_shift" }),
    ).toMatchObject({ ok: false, error: READY_COPY.witness });
    const shift = await count(pharmacist(), w, MORPHINE, countable, { scope: "controlled_shift" });
    if (!shift.ok) throw new Error(shift.error);
    expect(shift.data!.differences).toBe(0);

    // Transfer: refused on the plain path, witnessed on the controlled one, an entry at each end.
    const transfer = { batchId: rcv.id, quantity: 4, toPointId: f.pointB! };
    expect(
      await run(pharmacist(), stock.TransferInput, stock.STOCK_NEED, stock.transferStock, transfer),
    ).toMatchObject({ ok: false });
    const sent = await run(
      pharmacist(),
      cd.TransferControlledInput,
      stock.STOCK_NEED,
      cd.transferControlled,
      { ...transfer, witnessAttestationId: w },
    );
    if (!sent.ok) throw new Error(sent.error);
    expect(
      await n(
        `SELECT count(*)::int AS n FROM public.pharmacy_controlled_entries WHERE kind = 'transfer' AND witness_attestation_id = $1`,
        [w],
      ),
    ).toBe(2);
    // A technician holds no pharmacy.controlled: the witnessed path refuses them (CD-5).
    expect(
      await run(tech(), cd.ReceiveControlledInput, stock.STOCK_NEED, cd.receiveControlled, {
        ...receive,
        batchNumber: "FX-CD-T",
        witnessAttestationId: w,
      }),
    ).toMatchObject({ ok: false, code: "forbidden" });

    // CD-6: every row's balance is the ledger's at that time.
    const reg = await cdRead.getControlledRegister(
      f.h!,
      f.pointA!,
      MORPHINE,
      { from: "2000-01-01", to: "2100-01-01" },
      lane.db,
    );
    expect(reg.rows.length).toBeGreaterThan(5);
    expect(reg.rows.some((r) => r.what === "count" && r.witness === "Pharmacy technician")).toBe(
      true,
    );
    const lastAt = new Map<string, number>();
    reg.rows.forEach((r, i) => lastAt.set(r.at, i));
    for (const [at, i] of lastAt) {
      const ledger = await n(
        `SELECT coalesce(sum(m.quantity), 0)::int AS n FROM public.pharmacy_stock_movements m
           JOIN public.pharmacy_batches b ON b.id = m.batch_id JOIN public.pharmacy_products p ON p.id = b.product_id
          WHERE p.medicine_id = $1 AND m.dispensing_point_id = $2
            AND date_trunc('milliseconds', m.effective_at) <= $3`,
        [MORPHINE, f.pointA, at],
      );
      expect(reg.rows[i]!.balance, at).toBe(ledger);
    }
    expect(reg.balance).toBe(
      await n(
        `SELECT coalesce(sum(m.quantity), 0)::int AS n FROM public.pharmacy_stock_movements m
           JOIN public.pharmacy_batches b ON b.id = m.batch_id JOIN public.pharmacy_products p ON p.id = b.product_id
          WHERE p.medicine_id = $1 AND m.dispensing_point_id = $2`,
        [MORPHINE, f.pointA],
      ),
    );
  });

  it("S63: a technician cannot supply a controlled line, and can witness one if the list says so", async () => {
    const r = await runPharmacyWrite(
      cd.ControlledSupplyInput,
      {
        clientKey: randomUUID(),
        lines: [planLine(randomUUID(), f.morphine!, [[f.b1!, 1]])],
        collector: { kind: "patient" },
        identity: { route: "two_identifiers", nameAttested: true },
        payment: { status: "paid" },
        witnessAttestationId: randomUUID(),
        paperPrescriptionAttested: true,
        registerAttested: true,
        agreedBalances: [],
      },
      tech(),
      cd.CONTROLLED_LIVE,
      cd.recordControlledSupply,
      { database: lane.db },
    );
    expect(r).toMatchObject({ ok: false, code: "forbidden" });
    // Under the proposed list (any holder of pharmacy.dispense) a technician witnesses.
    const list = await cdRead.witnessCandidates(lane.db, f.h!, f.pharmacist!);
    expect(list.map((x) => x.userId)).toEqual(expect.arrayContaining([f.tech, f.head]));
    expect(list.map((x) => x.userId)).not.toContain(f.pharmacist);
    expect(list.find((x) => x.userId === f.tech)?.cadre).toBe("Pharmacy technician");
  });

  it("S65: changed since printing shows the caution, and the first attestation is that the paper matches", async () => {
    const [line] = await place([{ drug: MORPHINE, controlled: true }]);
    await pg.query(
      `INSERT INTO public.prescription_print_events (prescription_id, hospital_id, patient_user_id, printed_by, printed_at)
       VALUES ($1, $2, $3, $4, now() - interval '1 hour')`,
      [line, f.h, f.patient, f.doctor],
    );
    await ready([{ id: line!, quantity: 1 }]);
    const key = (await reviewRead.getReviewOfLine(f.h!, line!, f.pointA!, lane.db))!.key;
    const view = await supplyRead.getHandover(
      f.h!,
      key,
      { id: f.pointA!, labelMode: "printed" },
      null,
      lane.db,
    );
    expect(view?.controlled?.changedSincePrinting).toBe(true);
    const words = attestationsFor({ changedSincePrinting: true });
    expect(words.caution).toBe(
      "Changed since printing. The paper the patient carries is out of date.",
    );
    expect(words.attestations[0]).toBe(
      "The signed prescription is here, matches what is on this screen, and will be kept.",
    );
  });

  it("S66: the register slip prints under its heading and the print is logged; no screen says the paper is not needed", async () => {
    const e = await cdRead.getRegisterEntry(f.h!, f.entry!, lane.db);
    expect(e).toMatchObject({ quantity: 2, balanceAfter: 12, witness: "Pharmacy technician" });
    const slip = registerSlipFor({
      ...e!,
      patient: { name: "Fixture Patient", medsyncNumber: "FX-1" },
    });
    expect(slip.heading).toBe("Copy for the controlled drugs register. This is not the register.");
    expect(slip.heading).toBe(REGISTER_COPY.heading);
    const printed = await run(
      pharmacist(),
      cd.PrintRegisterInput,
      cd.CONTROLLED_NEED,
      cd.printRegisterEntry,
      { entryId: f.entry },
    );
    if (!printed.ok) throw new Error(printed.error);
    expect(
      await one(
        `SELECT kind, ref_id, actor_user_id FROM public.pharmacy_print_events WHERE id = $1`,
        [printed.id],
      ),
    ).toEqual({ kind: "register_entry", ref_id: f.entry, actor_user_id: f.pharmacist });
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((x) => {
        const p = join(d, x);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    for (const file of [
      ...walk("app/pharmacy/controlled"),
      "app/pharmacy/_components/controlled-blocks.tsx",
      "app/pharmacy/prescriptions/[key]/handover/_components/handover-screen.tsx",
      "content/pharmacy-controlled.ts",
      "lib/pharmacy/controlled-store.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(
        /no longer (needed|required)|instead of the (paper|register)|replaces the (paper|register|prescription)|\bis the (controlled drugs )?register\b/i,
      );
    }
  });

  it("DT-8: a back-entered controlled supply is listed until confirmed against the register with a witness", async () => {
    const back = (
      await one(
        `INSERT INTO public.pharmacy_controlled_entries (hospital_id, dispensing_point_id, medicine_id, kind,
           witness_name_as_written, register_attested, actor_user_id, actor_cadre)
         VALUES ($1, $2, $3, 'back_entered_supply', 'Fixture witness as written', true, $4, 'Pharmacist') RETURNING id`,
        [f.h, f.pointA, MORPHINE, f.pharmacist],
      )
    ).id;
    const listed = async () =>
      (await cdRead.getControlledRegister(f.h!, f.pointA!, null, null, lane.db)).backEntered.map(
        (b) => b.id,
      );
    expect(await listed()).toContain(back);
    expect(
      await run(
        pharmacist(),
        cd.ConfirmBackEntryInput,
        cd.CONTROLLED_NEED,
        cd.confirmBackEnteredControlledSupply,
        {
          entryId: back,
          witnessAttestationId: randomUUID(),
        },
      ),
    ).toMatchObject({ ok: false, error: READY_COPY.witness });
    const w = await witnessId();
    const ok = await run(
      pharmacist(),
      cd.ConfirmBackEntryInput,
      cd.CONTROLLED_NEED,
      cd.confirmBackEnteredControlledSupply,
      { entryId: back, witnessAttestationId: w },
    );
    expect(ok.ok).toBe(true);
    expect(await listed()).not.toContain(back);
  });

  it("PA2-6: with a signed witness list that does not include them, a technician cannot witness", async () => {
    await pg.query(
      `INSERT INTO public.pharmacy_signed_sets (hospital_id, kind, version, content, sha256, status, authored_by,
         first_signer, second_signer, signed_at)
       VALUES ($1, 'witness_list', 1, '{"permissions":["pharmacy.review"]}'::jsonb, repeat('d', 64), 'signed', $2, $2, $3, now())`,
      [f.h, f.pharmacist, f.doctor],
    );
    expect(
      (await cdRead.witnessCandidates(lane.db, f.h!, f.pharmacist!)).map((x) => x.userId),
    ).not.toContain(f.tech);
    expect(await witness(pharmacist(), f.tech!)).toMatchObject({ ok: false, code: "forbidden" });
  });
});
