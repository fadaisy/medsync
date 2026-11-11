/**
 * Pharmacy rework, Controls on the PGlite lane (TECH-SPEC §7 tests 5 and 6; PRD §10 scenarios 5–7), every migration
 * replayed, driving lib/pharmacy/{cd,handover,cases}/store.ts with the lane's database. Every person, place, medicine
 * and quantity is a fixture. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { Who } from "@/lib/pharmacy/cd/store";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { authUser, bootLane, department, hospital, laneOn, staff } from "./_pglite";

vi.mock("server-only", () => ({}));

const cd = await import("@/lib/pharmacy/cd/store");
const cdRead = await import("@/lib/pharmacy/cd/read");
const cdDerive = await import("@/lib/pharmacy/cd/derive");
const ho = await import("@/lib/pharmacy/handover/store");
const hoDerive = await import("@/lib/pharmacy/handover/derive");
const cases = await import("@/lib/pharmacy/cases/store");

const HOUR = 3_600_000;
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

describe.skipIf(!laneOn)("Pharmacy rework: Controls (tests 5–6, scenarios 5–7)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;

  const as = <T>(userId: string, fn: (w: Who) => Promise<T>, now = new Date()) =>
    lane.db.transaction((tx) => fn({ tx, userId, hospitalId: f.h!, now }));
  const approval = (actor: string, witness: string) =>
    id(
      pg,
      `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome, attested_at)
       VALUES ($1, $2, $3, 'witness', 'fixture', 'passed', now()) RETURNING id`,
      [f.h, actor, witness],
    );
  const roster = (user: string, place: string | null, role: string, shift: string) =>
    pg.query(
      `INSERT INTO public.pharmacy_duty_roster (hospital_id, user_id, location_id, role, shift, date_from, date_to, created_by)
       VALUES ($1, $2, $3, $4, $5, current_date - 2, current_date + 2, $2)`,
      [f.h, user, place, role, shift],
    );
  const product = (medicine: string, name: string, controlled: boolean) =>
    id(
      pg,
      `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by, controlled_class)
       VALUES ($1, $2, $3, 'ampoule', $4, $5) RETURNING id`,
      [f.h, medicine, name, f.incharge, controlled ? "narcotic" : null],
    );
  const stock = async (productId: string, place: string, qty: number, hoursAgo = 48) => {
    const b = await id(
      pg,
      `INSERT INTO public.pharmacy_batches (hospital_id, location_id, product_id, batch_number, expiry, first_batch_number,
         first_expiry, created_by)
       VALUES ($1, $2, $3, $4, '2099-12-31', $4, '2099-12-31', $5) RETURNING id`,
      [f.h, place, productId, `B-${randomUUID().slice(0, 6)}`, f.incharge],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at,
         recorded_at, actor_user_id, source_kind)
       VALUES ($1, $2, $3, 'received', $4, now() - make_interval(hours => $5), now() - make_interval(hours => $5), $6, 'delivery')`,
      [f.h, place, b, qty, hoursAgo, f.incharge],
    );
    return b;
  };
  const one = async <T>(q: string, p?: unknown[]) => (await pg.query<T>(q, p)).rows[0]!;

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    f.h = await hospital(pg, "Rework controls");
    for (const k of ["incharge", "tech", "nightTech", "nurse", "nurse2", "prescriber"])
      f[k] = await authUser(pg, k);
    const pharmacy = await department(pg, f.h, "Pharmacy");
    const paeds = await department(pg, f.h, "Paediatrics");
    f.store = await id(
      pg,
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, name) VALUES ($1, 'store', $2, 'Main store') RETURNING id`,
      [f.h, pharmacy],
    );
    f.opd = await id(
      pg,
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, name) VALUES ($1, 'store', $2, 'OPD dispensary') RETURNING id`,
      [f.h, await department(pg, f.h, "OPD")],
    );
    const ward = await id(
      pg,
      `INSERT INTO public.hospital_wards (hospital_id, department_id, name, slug) VALUES ($1, $2, 'Paediatrics', $3) RETURNING id`,
      [f.h, paeds, `peds-${randomUUID().slice(0, 6)}`],
    );
    f.peds = await id(
      pg,
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, ward_id, department_id, name, ward_supply_model, live_at) VALUES ($1, 'ward', $2, $3, 'Paediatrics', 'stocked', now()) RETURNING id`,
      [f.h, ward, paeds],
    );
    await roster(f.incharge!, null, "in_charge", "call");
    await roster(f.tech!, f.opd!, "technician", "call");
    await roster(f.nightTech!, f.opd!, "technician", "night");
    await roster(f.nurse2!, f.peds!, "second_nurse", "call");
    await pg.query(
      `INSERT INTO public.pharmacy_cd_prescribers (hospital_id, user_id, department, created_by) VALUES ($1, $2, 'Paediatrics', $3)`,
      [f.h, f.prescriber, f.incharge],
    );
    f.morphine = await product("fx_morphine", "Morphine injection 10 mg/mL", true);
    f.diazepam = await product("fx_diazepam", "Diazepam injection 10 mg/2 mL", true);
    f.oxytocin = await product("fx_oxytocin", "Oxytocin injection", false);
  }, 180_000);

  it("scenario 5: a ward nurse records morphine 5 mg IV, 5 mg residue discarded, witnessed; the register drops by 1", async () => {
    await stock(f.morphine!, f.peds!, 10);
    const dose = (witness: { attestationId: string }) =>
      as(f.nurse!, (w) =>
        cd.recordDose(w, {
          clientKey: randomUUID(),
          locationId: f.peds!,
          medicineId: "fx_morphine",
          patientUserId: null,
          patientLabel: "Fixture patient 1",
          bed: "Cot 2",
          prescriberUserId: f.prescriber!,
          doseMg: 5,
          route: "IV",
          residueDisposed: true,
          witness,
        }),
      );
    // A witness who is not on duty at the ward is refused by the ledger guard.
    const offDuty = await approval(f.nurse!, f.nightTech!);
    expect(await refusal(dose({ attestationId: offDuty }))).toMatch(/not on duty/);
    const onDuty = await approval(f.nurse!, f.nurse2!);
    const r = await dose({ attestationId: onDuty });
    expect(r.units).toBe(1);
    const row = await one<{ residue_mg: string; disposed: boolean }>(
      `SELECT residue_mg, residue_disposed AS disposed FROM public.pharmacy_cd_doses WHERE id = $1`,
      [r.id],
    );
    expect(Number(row.residue_mg)).toBe(5);
    expect(row.disposed).toBe(true);
    const data = await cdRead.loadCd(lane.db, f.h!);
    const reg = cdDerive
      .cdRegisters(data.moves)
      .find((x) => x.medicineId === "fx_morphine" && x.placeId === f.peds);
    expect(reg?.balance).toBe(9);
    expect(data.moves.find((m) => m.dose?.id === r.id)?.witness).not.toBeUndefined();
  });

  it("test 5: a check 1 short at Paediatrics opens a High 24 h case; a late entry inside the window fixes it; sign-off needs findings", async () => {
    await stock(f.diazepam!, f.peds!, 5, 30);
    // An earlier check that matched starts the window.
    const earlier = await id(
      pg,
      `INSERT INTO public.pharmacy_cd_checks (hospital_id, location_id, checked_by, paper_witness_name, created_at)
       VALUES ($1, $2, $3, 'Fixture paper witness', now() - interval '10 hours') RETURNING id`,
      [f.h, f.peds, f.nurse],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_cd_check_lines (check_id, hospital_id, medicine_id, expected, counted) VALUES ($1, $2, 'fx_diazepam', 5, 5)`,
      [earlier, f.h],
    );
    const checkWitness = await approval(f.nurse!, f.nurse2!);
    const check = await as(f.nurse!, async (w) =>
      cd.cdBalanceCheck(w, {
        clientKey: randomUUID(),
        locationId: f.peds!,
        counts: [{ medicineId: "fx_diazepam", counted: 4 }],
        witness: { attestationId: checkWitness },
      }),
    );
    expect(check.mismatches).toBe(1);
    const c = await one<{ id: string; severity: string; hours: number; qty: number }>(
      `SELECT id, severity, qty, extract(epoch FROM due_at - created_at) / 3600 AS hours FROM public.pharmacy_cases
        WHERE source_type = 'cd_check' AND source_id = $1`,
      [check.id],
    );
    expect(c).toMatchObject({ severity: "high", qty: -1 });
    expect(Number(c.hours)).toBe(24);

    // Findings before the number is fixed are refused; a time outside the window is refused.
    await as(f.tech!, (w) => cases.takeCase(w, { caseId: c.id }));
    expect(
      await refusal(
        as(f.tech!, (w) =>
          cases.submitFindings(w, {
            caseId: c.id,
            cause: "Given, not recorded",
            actions: ["Late entry made"],
            prevent: ["Extra daily count"],
          }),
        ),
      ),
    ).toMatch(/fix the number/);
    const late = async (at: Date) => {
      const attestationId = await approval(f.nurse!, f.nurse2!);
      return as(f.nurse!, async (w) =>
        cd.resolveCdCheck(w, {
          checkId: check.id,
          medicineId: "fx_diazepam",
          how: "late_entry",
          note: null,
          incidentRef: null,
          attestationId,
          late: {
            clientKey: randomUUID(),
            patientUserId: null,
            patientLabel: "Fixture patient 2",
            bed: null,
            prescriberUserId: f.prescriber!,
            givenByUserId: f.nurse2!,
            doseMg: 5,
            route: "Rectal",
            residueDisposed: true,
            at,
          },
        }),
      );
    };
    expect(await refusal(late(new Date(Date.now() - 20 * HOUR)))).toMatch(/inside the window/);
    await late(new Date(Date.now() - 3 * HOUR));
    const mv = await one<{ kind: string; late: boolean; inside: boolean }>(
      `SELECT m.kind, m.late, m.effective_at > c0.created_at AND m.effective_at < c1.created_at AS inside
         FROM public.pharmacy_stock_movements m
         JOIN public.pharmacy_cd_doses d ON d.id = m.source_id AND d.late_entry
         JOIN public.pharmacy_cd_checks c0 ON c0.id = $1
         JOIN public.pharmacy_cd_checks c1 ON c1.id = $2`,
      [earlier, check.id],
    );
    expect(mv).toEqual({ kind: "ward_used", late: true, inside: true });
    expect(
      (
        await one<{ fixed: boolean }>(
          `SELECT fixed_at IS NOT NULL AS fixed FROM public.pharmacy_cases WHERE id = $1`,
          [c.id],
        )
      ).fixed,
    ).toBe(true);

    // Sign-off: not before submission, never by a non-in-charge; the in-charge signs off the owner's findings.
    expect(await refusal(as(f.incharge!, (w) => cases.signOffCase(w, { caseId: c.id })))).toMatch(
      /pcs_signed|sign-off needs/,
    );
    await as(f.tech!, (w) =>
      cases.submitFindings(w, {
        caseId: c.id,
        cause: "Given, not recorded",
        actions: ["Late entry made"],
        prevent: ["Extra daily count"],
      }),
    );
    expect(await refusal(as(f.tech!, (w) => cases.signOffCase(w, { caseId: c.id })))).toMatch(
      /only the in-charge/,
    );
    await as(f.incharge!, (w) => cases.signOffCase(w, { caseId: c.id }));
    const done = await one<{ closed: boolean; self: boolean }>(
      `SELECT signed_off_at IS NOT NULL AS closed, self_signed AS self FROM public.pharmacy_cases WHERE id = $1`,
      [c.id],
    );
    expect(done).toEqual({ closed: true, self: false });
    const kinds = (
      await pg.query<{ kind: string }>(
        `SELECT kind FROM public.pharmacy_case_events WHERE case_id = $1 ORDER BY created_at, kind`,
        [c.id],
      )
    ).rows.map((r) => r.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(["opened", "taken", "fixed", "submitted", "signed_off"]),
    );
    await expect(
      pg.query(`DELETE FROM public.pharmacy_case_events WHERE case_id = $1`, [c.id]),
    ).rejects.toThrow(/append-only/);
  });

  it("test 6 and scenario 7: own station only; a 17:00 handover with a controlled line writes a balance check once accepted", async () => {
    await stock(f.morphine!, f.opd!, 6);
    await stock(f.morphine!, f.store!, 20);
    const now = Date.now();
    const slot = hoDerive
      .slotsBetween(now - 24 * HOUR, now + 24 * HOUR)
      .find((s) => hoDerive.localHour(s) === 17)!;
    const input = (locationId: string, toUserId = f.nightTech!) => ({
      clientKey: randomUUID(),
      locationId,
      toUserId,
      slotAt: new Date(slot),
      counts: [
        { medicineId: "fx_morphine", counted: locationId === f.opd ? 6 : 20, highRisk: false },
      ],
      keys: true as const,
      sealNo: null,
      sealNew: false,
      items: ["2 patients owed medicine"],
      notes: null,
    });
    // The app refuses another station; so does the database, even when the app is bypassed.
    expect(
      await refusal(
        as(f.tech!, (w) => ho.handOverStation({ ...w, station: f.opd! }, input(f.store!))),
      ),
    ).toMatch(/station you are working at/);
    expect(
      await refusal(
        as(f.tech!, (w) =>
          ho.handOverStation({ ...w, station: f.store! }, input(f.store!, f.incharge!)),
        ),
      ),
    ).toMatch(/only your own station/);
    // The in-charge may hand over any station.
    await as(f.incharge!, (w) => ho.handOverStation({ ...w, station: null }, input(f.opd!)));

    const h = await as(f.tech!, (w) =>
      ho.handOverStation({ ...w, station: f.opd! }, input(f.opd!)),
    );
    expect(
      await pg
        .query(`SELECT 1 FROM public.pharmacy_cd_checks WHERE shift_handover_id = $1`, [h.id])
        .then((r) => r.rows.length),
    ).toBe(0);
    expect(await refusal(as(f.tech!, (w) => ho.acceptHandover(w, { handoverId: h.id })))).toMatch(
      /not waiting for you/,
    );
    await as(f.nightTech!, (w) => ho.acceptHandover(w, { handoverId: h.id }));
    const check = await one<{ n: number; expected: number; counted: number }>(
      `SELECT count(*)::int AS n, max(l.expected) AS expected, max(l.counted) AS counted
         FROM public.pharmacy_cd_checks c JOIN public.pharmacy_cd_check_lines l ON l.check_id = c.id
        WHERE c.shift_handover_id = $1`,
      [h.id],
    );
    expect(check).toEqual({ n: 1, expected: 6, counted: 6 });
    // The check counts as the place's last check.
    const data = await cdRead.loadCd(lane.db, f.h!);
    expect(cdDerive.lastCheck(data.checks, f.opd!)?.handover).toBe(true);
    await expect(
      pg.query(`UPDATE public.pharmacy_shift_handovers SET notes = 'changed' WHERE id = $1`, [
        h.id,
      ]),
    ).rejects.toThrow(/accepted once/);
  });

  it("test 6: a missed slot is flagged 2 h after it, and only the in-charge sees another station's miss", async () => {
    const places = [
      { id: "opd", name: "OPD", kind: "store" },
      { id: "w3", name: "Ward 3", kind: "ward" },
    ];
    const now = Date.now();
    const s8 = hoDerive
      .slotsBetween(now - 30 * HOUR, now)
      .find((s) => hoDerive.localHour(s) === 8)!;
    const handover = (placeId: string, slot: number) => ({
      id: `${placeId}${slot}`,
      placeId,
      slotAt: new Date(slot),
      at: new Date(slot),
      acceptedAt: new Date(slot),
      from: "a",
      to: "b",
      toUserId: "b",
      keys: true,
      seal: null,
      sealNew: false,
      items: 0,
      lines: [],
    });
    const all = hoDerive.slotsBetween(now - 40 * HOUR, now + HOUR);
    const opdDone = all.map((s) => handover("opd", s));
    const w3Done = all.filter((s) => s !== s8).map((s) => handover("w3", s));
    const at = (t: number) =>
      hoDerive.hoFlags({ places, handovers: [...opdDone, ...w3Done], misses: [], now: t });
    expect(at(s8 + HOUR).filter((x) => x.k === "miss")).toEqual([]);
    const flags = at(s8 + 2 * HOUR + 60_000);
    expect(flags.filter((x) => x.k === "miss").map((x) => x.placeId)).toEqual(["w3"]);
    expect(hoDerive.hoMine(flags, false, "opd").filter((x) => x.k === "miss")).toEqual([]);
    expect(hoDerive.hoMine(flags, true, "opd").filter((x) => x.k === "miss")).toHaveLength(1);
  });

  it("the dev seed runs once, and the reads and Today see its case, flags and handover", async () => {
    const h = await hospital(pg, "Rework controls seed");
    const dept = await department(pg, h, "Medicine");
    await staff(pg, { hospitalId: h, departmentId: dept, cadre: "PHARMACIST" });
    const b = await staff(pg, { hospitalId: h, departmentId: dept, cadre: "NURSE" });
    await pg.query(
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, name) VALUES ($1, 'store', $2, 'Seed store')`,
      [h, dept],
    );
    const ward = await id(
      pg,
      `INSERT INTO public.hospital_wards (hospital_id, department_id, name, slug) VALUES ($1, $2, 'Ward 3', $3) RETURNING id`,
      [h, dept, `w3-${randomUUID().slice(0, 6)}`],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, ward_id, department_id, name, ward_supply_model, live_at) VALUES ($1, 'ward', $2, $3, 'Ward 3', 'stocked', now())`,
      [h, ward, dept],
    );
    const { seedControls } = await import("@/scripts/seed-pharmacy-dev/controls");
    const r = await seedControls(lane.db, h);
    expect(r).toMatchObject({ doses: 4, cases: 2 });
    expect(await seedControls(lane.db, h)).toEqual({ skipped: "already seeded" });

    const data = await cdRead.loadCd(lane.db, h);
    const flags = cdDerive.cdFlags({ ...data, now: new Date() });
    expect(flags.map((x) => x.k).sort()).toEqual(["disc", "res"]);
    expect(data.checks).toHaveLength(2);
    const caseRows = await (await import("@/lib/pharmacy/cases/read")).loadCases(lane.db, h);
    expect(caseRows.map((c) => [c.sourceType, c.severity, !!c.signedOffAt]).sort()).toEqual([
      ["cd_check", "high", false],
      ["manual", "high", true],
    ]);
    const { controlsTodayItems } = await import("@/lib/pharmacy/cd/today");
    const items = await controlsTodayItems(
      { hospitalId: h, userId: b.userId, station: null },
      lane.db,
    );
    expect(items.map((i) => i.kind)).toContain("case");
    expect(items.map((i) => i.kind)).toContain("cd");
    const detail = await (
      await import("@/lib/pharmacy/cases/read")
    ).caseDetail(lane.db, h, caseRows.find((c) => c.sourceType === "cd_check")!.id);
    expect(detail.events.map((e) => e.kind)).toEqual(["opened", "assigned"]);
    const hos = await (await import("@/lib/pharmacy/handover/read")).loadHandovers(lane.db, h);
    expect(hos.handovers[0]?.acceptedAt).not.toBeNull();
    const draft = await (
      await import("@/lib/pharmacy/handover/read")
    ).handoverDraft(lane.db, h, hos.handovers[0]!.placeId, new Date());
    expect(draft.items.map((i) => [i.medicineId, i.expected])).toEqual([
      ["proto_diaz", 20],
      ["proto_morph", 20],
    ]);
    expect(draft.people.map((p) => p.userId)).toContain(b.userId);
  });
});
